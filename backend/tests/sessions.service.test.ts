import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/common/utils/tokens';
import { SESSION_GRACE_MS } from '../src/modules/auth/sessions.service';
import { createUser } from './setup/factories';
import { createHarness, type Harness } from './setup/harness';

let h: Harness;
const meta = { userAgent: 'vitest', ip: '127.0.0.1' };
const DAY = 86_400_000;

beforeAll(async () => {
  h = await createHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

async function newSession(persistent = false) {
  const { user } = await createUser(h.container.prisma);
  const issued = await h.container.sessions.create(user.id, { persistent, ...meta });
  return { user, issued };
}

describe('SessionsService.create', () => {
  it('stores only a hash of the refresh secret', async () => {
    const { issued } = await newSession();
    const [sessionId, secret] = issued.refresh.token.split('.');
    expect(sessionId).toBe(issued.sessionId);

    const row = await h.container.prisma.session.findUniqueOrThrow({
      where: { id: issued.sessionId },
    });
    expect(row.refreshTokenHash).toBe(sha256Hex(secret as string));
    expect(row.refreshTokenHash).not.toContain(secret as string);
  });

  it('expires after 7 days, or 30 days with remember me', async () => {
    const now = h.clock.now().getTime();
    const normal = await newSession(false);
    const remembered = await newSession(true);
    expect(normal.issued.refresh.expiresAt.getTime() - now).toBe(7 * DAY);
    expect(remembered.issued.refresh.expiresAt.getTime() - now).toBe(30 * DAY);
    expect(remembered.issued.persistent).toBe(true);
  });

  it('issues an access token bound to the session', async () => {
    const { user, issued } = await newSession();
    await expect(h.container.accessTokens.verify(issued.access.token)).resolves.toEqual({
      userId: user.id,
      sessionId: issued.sessionId,
    });
  });
});

describe('SessionsService.refresh', () => {
  it('rotates the refresh token and remembers the previous hash', async () => {
    const { issued } = await newSession();
    const result = await h.container.sessions.refresh(issued.refresh.token, meta);
    if (result.kind !== 'rotated') throw new Error('expected rotation');

    expect(result.refresh.token).not.toBe(issued.refresh.token);
    const row = await h.container.prisma.session.findUniqueOrThrow({
      where: { id: issued.sessionId },
    });
    expect(row.previousTokenHash).toBe(sha256Hex(issued.refresh.token.split('.')[1] as string));
  });

  it('accepts the previous token during the grace window', async () => {
    const { issued } = await newSession();
    await h.container.sessions.refresh(issued.refresh.token, meta);
    h.clock.advance(10_000);

    const again = await h.container.sessions.refresh(issued.refresh.token, meta);
    expect(again.kind).toBe('grace');
    expect(await h.container.sessions.isActive(issued.sessionId)).toBe(true);
  });

  it('handles two simultaneous refreshes of the same token', async () => {
    const { issued } = await newSession();
    const results = await Promise.all([
      h.container.sessions.refresh(issued.refresh.token, meta),
      h.container.sessions.refresh(issued.refresh.token, meta),
    ]);
    expect(results.map((r) => r.kind).sort()).toEqual(['grace', 'rotated']);
    expect(await h.container.sessions.isActive(issued.sessionId)).toBe(true);
  });

  it('revokes the session when an old token is reused after the grace window', async () => {
    const { issued } = await newSession();
    await h.container.sessions.refresh(issued.refresh.token, meta);
    h.clock.advance(SESSION_GRACE_MS + 1_000);

    await expect(h.container.sessions.refresh(issued.refresh.token, meta)).rejects.toMatchObject({
      status: 401,
    });
    expect(await h.container.sessions.isActive(issued.sessionId)).toBe(false);
  });

  it('rejects malformed, unknown and expired tokens', async () => {
    await expect(h.container.sessions.refresh('garbage', meta)).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      h.container.sessions.refresh(`${randomUUID()}.${'a'.repeat(43)}`, meta),
    ).rejects.toMatchObject({ status: 401 });

    const { issued } = await newSession();
    h.clock.advance(8 * DAY);
    await expect(h.container.sessions.refresh(issued.refresh.token, meta)).rejects.toMatchObject({
      status: 401,
    });
  });
});

describe('SessionsService.isActive and revocation', () => {
  it('keeps sessions valid when the Redis cache is flushed', async () => {
    const { issued } = await newSession();
    expect(await h.container.sessions.isActive(issued.sessionId)).toBe(true);
    await h.container.redis.flushdb();
    expect(await h.container.sessions.isActive(issued.sessionId)).toBe(true);
  });

  it('reflects revocation immediately even when the session was cached', async () => {
    const { issued } = await newSession();
    expect(await h.container.sessions.isActive(issued.sessionId)).toBe(true);
    await h.container.sessions.revoke(issued.sessionId);
    expect(await h.container.sessions.isActive(issued.sessionId)).toBe(false);
  });

  it('revokes every session except the current one', async () => {
    const { user, issued: current } = await newSession();
    const other = await h.container.sessions.create(user.id, { persistent: false, ...meta });

    await h.container.sessions.revokeAllForUser(user.id, { exceptSessionId: current.sessionId });
    expect(await h.container.sessions.isActive(current.sessionId)).toBe(true);
    expect(await h.container.sessions.isActive(other.sessionId)).toBe(false);
  });

  it('finds a session id only for a matching refresh token', async () => {
    const { issued } = await newSession();
    expect(await h.container.sessions.findSessionIdByRefreshToken(issued.refresh.token)).toBe(
      issued.sessionId,
    );
    expect(
      await h.container.sessions.findSessionIdByRefreshToken(
        `${issued.sessionId}.${'b'.repeat(43)}`,
      ),
    ).toBeNull();
  });
});
