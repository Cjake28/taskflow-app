import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setCookies } from './setup/cookies';
import { createUser } from './setup/factories';
import { createHarness, type Harness } from './setup/harness';

const URL_LOGIN = '/api/v1/auth/login';
let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

describe('POST /api/v1/auth/login', () => {
  it('logs in with the email or the username, ignoring case and spaces', async () => {
    const { user, password } = await createUser(h.container.prisma, {
      username: 'maria',
      email: 'maria@example.com',
    });

    for (const identifier of ['maria@example.com', '  MARIA@Example.com ', 'Maria']) {
      const res = await h.post(URL_LOGIN).send({ identifier, password });
      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe(user.id);
      expect(setCookies(res).tf_access?.value).toBeTruthy();
    }
  });

  it('returns the same error for a wrong password and an unknown account', async () => {
    await createUser(h.container.prisma, { username: 'pedro' });

    const wrongPassword = await h
      .post(URL_LOGIN)
      .send({ identifier: 'pedro', password: 'Wrong!Passw0rd' });
    const unknownUser = await h
      .post(URL_LOGIN)
      .send({ identifier: 'nobody', password: 'Wrong!Passw0rd' });

    for (const res of [wrongPassword, unknownUser]) {
      expect(res.status).toBe(401);
      expect(res.body.error).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email/username or password.',
      });
    }
  });

  it('rejects accounts that have no password (OAuth-only)', async () => {
    await createUser(h.container.prisma, { username: 'oauthonly', password: null });
    const res = await h.post(URL_LOGIN).send({ identifier: 'oauthonly', password: 'Any!Passw0rd' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('issues a persistent refresh cookie only with remember me', async () => {
    const { password } = await createUser(h.container.prisma, { username: 'ana' });

    const remembered = await h
      .post(URL_LOGIN)
      .send({ identifier: 'ana', password, rememberMe: true });
    expect(setCookies(remembered).tf_refresh?.attributes).toMatch(/Max-Age=\d+/i);

    const browserSession = await h.post(URL_LOGIN).send({ identifier: 'ana', password });
    expect(setCookies(browserSession).tf_refresh?.attributes).not.toMatch(/Max-Age|Expires/i);
  });

  it('locks an identifier+IP pair after five failures but not other IPs', async () => {
    const { password } = await createUser(h.container.prisma, { username: 'lock' });
    const attacker = '203.0.113.5';

    for (let i = 0; i < 5; i += 1) {
      const res = await h
        .post(URL_LOGIN)
        .set('X-Forwarded-For', attacker)
        .send({ identifier: 'lock', password: 'Wrong!Passw0rd' });
      expect(res.status).toBe(401);
    }

    const blocked = await h
      .post(URL_LOGIN)
      .set('X-Forwarded-For', attacker)
      .send({ identifier: 'lock', password });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    const victim = await h
      .post(URL_LOGIN)
      .set('X-Forwarded-For', '198.51.100.7')
      .send({ identifier: 'lock', password });
    expect(victim.status).toBe(200);
  });

  it('resets the failure count after a successful login', async () => {
    const { password } = await createUser(h.container.prisma, { username: 'reset' });
    const ip = '192.0.2.10';
    const attempt = (pw: string) =>
      h.post(URL_LOGIN).set('X-Forwarded-For', ip).send({ identifier: 'reset', password: pw });

    for (let i = 0; i < 4; i += 1) await attempt('Wrong!Passw0rd');
    expect((await attempt(password as string)).status).toBe(200);
    for (let i = 0; i < 4; i += 1) await attempt('Wrong!Passw0rd');
    expect((await attempt(password as string)).status).toBe(200);
  });
});
