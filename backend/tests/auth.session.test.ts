import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SESSION_GRACE_MS } from '../src/modules/auth/sessions.service';
import { cookieHeader, setCookies } from './setup/cookies';
import { createHarness, type Harness } from './setup/harness';

const REFRESH = '/api/v1/auth/refresh';
const LOGOUT = '/api/v1/auth/logout';
let h: Harness;
let counter = 0;

beforeAll(async () => {
  h = await createHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

async function register() {
  counter += 1;
  const res = await h.post('/api/v1/auth/register').send({
    firstName: 'Test',
    lastName: 'User',
    username: `session${counter}`,
    email: `session${counter}@example.com`,
    password: 'Str0ng!Passw0rd',
    confirmPassword: 'Str0ng!Passw0rd',
  });
  const cookies = setCookies(res);
  return {
    username: `session${counter}`,
    access: cookies.tf_access?.value as string,
    refresh: cookies.tf_refresh?.value as string,
  };
}

const me = (access: string) => h.get('/api/v1/users/me').set('Cookie', `tf_access=${access}`);

describe('POST /api/v1/auth/refresh', () => {
  it('rejects a missing cookie and clears auth cookies', async () => {
    const res = await h.post(REFRESH);
    expect(res.status).toBe(401);
    expect(setCookies(res).tf_access?.attributes).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('rotates the refresh token and returns the session payload', async () => {
    const { username, refresh } = await register();
    const res = await h.post(REFRESH).set('Cookie', `tf_refresh=${refresh}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.username).toBe(username);
    expect(typeof res.body.data.accessTokenExpiresAt).toBe('string');
    const cookies = setCookies(res);
    expect(cookies.tf_refresh?.value).toBeTruthy();
    expect(cookies.tf_refresh?.value).not.toBe(refresh);
    expect(cookies.tf_access?.value).toBeTruthy();
  });

  it('keeps two tabs refreshing at the same moment logged in', async () => {
    const { refresh } = await register();
    const [first, second] = await Promise.all([
      h.post(REFRESH).set('Cookie', `tf_refresh=${refresh}`),
      h.post(REFRESH).set('Cookie', `tf_refresh=${refresh}`),
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);

    const graceResponse = [first, second].find((res) => !setCookies(res).tf_refresh);
    expect(graceResponse).toBeDefined();
    expect(setCookies(graceResponse!).tf_access?.value).toBeTruthy();
  });

  it('treats reuse after the grace window as theft and revokes the session', async () => {
    const { refresh } = await register();
    const rotated = await h.post(REFRESH).set('Cookie', `tf_refresh=${refresh}`);
    const newAccess = setCookies(rotated).tf_access?.value as string;

    h.clock.advance(SESSION_GRACE_MS + 1_000);
    const reused = await h.post(REFRESH).set('Cookie', `tf_refresh=${refresh}`);
    expect(reused.status).toBe(401);

    expect((await me(newAccess)).status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes the session on the server immediately', async () => {
    const { access, refresh } = await register();
    const res = await h
      .post(LOGOUT)
      .set('Cookie', cookieHeader({ tf_access: access, tf_refresh: refresh }));

    expect(res.status).toBe(204);
    expect(setCookies(res).tf_refresh?.attributes).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await me(access)).status).toBe(401);
    expect((await h.post(REFRESH).set('Cookie', `tf_refresh=${refresh}`)).status).toBe(401);
  });

  it('still revokes the session when the access token has already expired', async () => {
    const { access, refresh } = await register();
    h.clock.advance(20 * 60_000);

    const res = await h
      .post(LOGOUT)
      .set('Cookie', cookieHeader({ tf_access: access, tf_refresh: refresh }));
    expect(res.status).toBe(204);
    const session = await h.container.prisma.session.findFirstOrThrow();
    expect(session.revokedAt).not.toBeNull();
  });

  it('succeeds without any cookies', async () => {
    expect((await h.post(LOGOUT)).status).toBe(204);
  });
});

describe('POST /api/v1/auth/logout-all', () => {
  it('signs out every device', async () => {
    const first = await register();
    const login = await h
      .post('/api/v1/auth/login')
      .send({ identifier: first.username, password: 'Str0ng!Passw0rd' });
    const secondAccess = setCookies(login).tf_access?.value as string;

    const res = await h.post('/api/v1/auth/logout-all').set('Cookie', `tf_access=${first.access}`);
    expect(res.status).toBe(204);
    expect((await me(first.access)).status).toBe(401);
    expect((await me(secondAccess)).status).toBe(401);
  });

  it('requires authentication', async () => {
    expect((await h.post('/api/v1/auth/logout-all')).status).toBe(401);
  });
});
