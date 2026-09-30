import supertest from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser } from './setup/factories';
import { createHarness, TEST_ORIGIN, type Harness } from './setup/harness';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

async function signIn() {
  const { user } = await createUser(h.container.prisma);
  const session = await h.container.sessions.create(user.id, {
    persistent: false,
    userAgent: 'vitest',
    ip: '127.0.0.1',
  });
  return { user, session, cookie: `tf_access=${session.access.token}` };
}

describe('GET /api/v1/users/me', () => {
  it('rejects requests without a session cookie', async () => {
    const res = await h.get('/api/v1/users/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the current user without secrets', async () => {
    const { user, cookie } = await signIn();
    const res = await h.get('/api/v1/users/me').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      email: user.email,
      avatarUrl: null,
      hasPassword: true,
      createdAt: user.createdAt.toISOString(),
    });
    expect(JSON.stringify(res.body)).not.toContain('argon2');
  });

  it('reports TOKEN_EXPIRED once the access token is older than 15 minutes', async () => {
    const { cookie } = await signIn();
    h.clock.advance(16 * 60_000);
    const res = await h.get('/api/v1/users/me').set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects a revoked session even before the token expires', async () => {
    const { session, cookie } = await signIn();
    await h.container.sessions.revoke(session.sessionId);
    const res = await h.get('/api/v1/users/me').set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('origin verification', () => {
  it('blocks state-changing requests without an allowed Origin', async () => {
    const agent = supertest(h.app);
    const missing = await agent.post('/api/v1/health');
    expect(missing.status).toBe(403);
    expect(missing.body.error).toMatchObject({
      code: 'FORBIDDEN',
      message: 'Request origin not allowed',
    });

    const foreign = await agent.post('/api/v1/health').set('Origin', 'https://evil.example');
    expect(foreign.status).toBe(403);
  });

  it('accepts a matching Referer when Origin is absent', async () => {
    const res = await supertest(h.app)
      .post('/api/v1/health')
      .set('Referer', `${TEST_ORIGIN}/tasks`);
    expect(res.status).toBe(404);
  });

  it('allows the frontend origin and never checks safe methods', async () => {
    expect((await h.post('/api/v1/health')).status).toBe(404);
    expect((await supertest(h.app).get('/api/v1/health')).status).toBe(200);
  });
});
