import { createHash } from 'node:crypto';
import { SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { HibpPasswordChecker } from '../src/common/security/password-breach';
import { createLogger } from '../src/common/utils/logger';
import { hashPassword, verifyAgainstDummyHash, verifyPassword } from '../src/common/utils/password';
import {
  AccessTokenService,
  generateSecret,
  safeEqualHex,
  sha256Hex,
} from '../src/common/utils/tokens';
import { TestClock } from './setup/clock';

const silentLogger = createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });

describe('password hashing', () => {
  it('hashes with argon2id and verifies', async () => {
    const hash = await hashPassword('Str0ng!Passw0rd');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'Str0ng!Passw0rd')).toBe(true);
    expect(await verifyPassword(hash, 'Wrong!Passw0rd')).toBe(false);
  });

  it('dummy verification always fails', async () => {
    expect(await verifyAgainstDummyHash('anything')).toBe(false);
  });
});

describe('random secrets and hashing', () => {
  it('generates 32-byte url-safe secrets', () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateSecret()).not.toBe(secret);
  });

  it('hashes deterministically and compares in constant time', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
    expect(sha256Hex('abc')).toHaveLength(64);
    expect(safeEqualHex(sha256Hex('abc'), sha256Hex('abc'))).toBe(true);
    expect(safeEqualHex(sha256Hex('abc'), sha256Hex('abd'))).toBe(false);
    expect(safeEqualHex('ab', 'abcd')).toBe(false);
  });
});

describe('AccessTokenService', () => {
  const secret = 's'.repeat(32);

  it('round-trips the user and session ids', async () => {
    const clock = new TestClock();
    const tokens = new AccessTokenService(secret, 15, clock);
    const { token, expiresAt } = await tokens.sign({ userId: 'user-1', sessionId: 'session-1' });
    expect(expiresAt.getTime() - clock.now().getTime()).toBe(15 * 60_000);
    await expect(tokens.verify(token)).resolves.toEqual({
      userId: 'user-1',
      sessionId: 'session-1',
    });
  });

  it('reports TOKEN_EXPIRED after the lifetime passes', async () => {
    const clock = new TestClock();
    const tokens = new AccessTokenService(secret, 15, clock);
    const { token } = await tokens.sign({ userId: 'u', sessionId: 's' });
    clock.advance(16 * 60_000);
    await expect(tokens.verify(token)).rejects.toMatchObject({
      status: 401,
      code: 'TOKEN_EXPIRED',
    });
  });

  it('rejects tokens signed with another secret', async () => {
    const clock = new TestClock();
    const other = new AccessTokenService('o'.repeat(32), 15, clock);
    const { token } = await other.sign({ userId: 'u', sessionId: 's' });
    await expect(new AccessTokenService(secret, 15, clock).verify(token)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects tokens that use a different algorithm', async () => {
    const token = await new SignJWT({ sid: 's' })
      .setProtectedHeader({ alg: 'HS512' })
      .setSubject('u')
      .setIssuer('taskflow-api')
      .setAudience('taskflow-web')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('k'.repeat(64)));
    await expect(
      new AccessTokenService(secret, 15, new TestClock()).verify(token),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

describe('HibpPasswordChecker', () => {
  const sha1 = createHash('sha1').update('password123').digest('hex').toUpperCase();

  it('flags a password that appears in the range response', async () => {
    const fetchFn = vi.fn(
      async () => new Response(`${sha1.slice(5)}:42\r\n0000000000000000000000000000000000A:0\r\n`),
    );
    const checker = new HibpPasswordChecker(silentLogger, fetchFn as unknown as typeof fetch);
    expect(await checker.isBreached('password123')).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      `https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`,
      expect.objectContaining({ headers: expect.objectContaining({ 'Add-Padding': 'true' }) }),
    );
  });

  it('ignores padding entries with a zero count', async () => {
    const fetchFn = vi.fn(async () => new Response(`${sha1.slice(5)}:0\r\n`));
    const checker = new HibpPasswordChecker(silentLogger, fetchFn as unknown as typeof fetch);
    expect(await checker.isBreached('password123')).toBe(false);
  });

  it('fails open when the API is unreachable', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const checker = new HibpPasswordChecker(silentLogger, fetchFn as unknown as typeof fetch);
    expect(await checker.isBreached('password123')).toBe(false);
  });
});
