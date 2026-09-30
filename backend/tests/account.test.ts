import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setCookies } from './setup/cookies';
import { createUser, DEFAULT_PASSWORD } from './setup/factories';
import { createHarness, type Harness } from './setup/harness';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

async function signIn(
  overrides: Parameters<typeof createUser>[1] = {},
  userAgent = CHROME_WINDOWS,
) {
  const { user, password } = await createUser(h.container.prisma, overrides);
  const session = await h.container.sessions.create(user.id, {
    persistent: false,
    userAgent,
    ip: '::ffff:127.0.0.1',
  });
  return { user, password, session, cookie: `tf_access=${session.access.token}` };
}

describe('PATCH /api/v1/users/me', () => {
  it('updates names', async () => {
    const { cookie } = await signIn();
    const res = await h
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send({ firstName: '  Maria ', lastName: 'Santos' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ firstName: 'Maria', lastName: 'Santos' });
  });

  it('requires at least one field and rejects unknown fields', async () => {
    const { cookie } = await signIn();
    expect((await h.patch('/api/v1/users/me').set('Cookie', cookie).send({})).status).toBe(400);
    const unknown = await h
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send({ firstName: 'A', passwordHash: 'x' });
    expect(unknown.body.error.details).toContainEqual({
      field: 'passwordHash',
      message: 'Unknown field',
    });
  });

  it('keeps usernames unique, ignoring case', async () => {
    await createUser(h.container.prisma, { username: 'taken' });
    const { cookie, user } = await signIn({ username: 'mine' });

    const conflict = await h
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send({ username: 'TAKEN' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('USERNAME_TAKEN');

    const unchanged = await h
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send({ username: user.username, firstName: 'Same' });
    expect(unchanged.status).toBe(200);
  });

  it('requires the current password to change the email', async () => {
    const { cookie } = await signIn({ email: 'old@example.com' });

    const missing = await h
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send({ email: 'new@example.com' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details).toContainEqual({
      field: 'currentPassword',
      message: 'Enter your current password to change your email',
    });

    const wrong = await h
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send({ email: 'new@example.com', currentPassword: 'Wrong!Passw0rd' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('INVALID_CURRENT_PASSWORD');

    const ok = await h
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send({ email: 'New@Example.com', currentPassword: DEFAULT_PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.data.email).toBe('new@example.com');
  });

  it('rejects an email that belongs to someone else', async () => {
    await createUser(h.container.prisma, { email: 'someone@example.com' });
    const { cookie } = await signIn();
    const res = await h
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send({ email: 'someone@example.com', currentPassword: DEFAULT_PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('asks OAuth-only users to set a password before changing the email', async () => {
    const { cookie } = await signIn({ password: null });
    const res = await h
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send({ email: 'new@example.com', currentPassword: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PASSWORD_NOT_SET');
  });
});

describe('PATCH /api/v1/users/me/password', () => {
  const NEW = 'Fresh!Passw0rd9';

  it('changes the password, keeps this session and signs out the others', async () => {
    const { user, cookie, password } = await signIn({ username: 'changer' });
    const other = await h.container.sessions.create(user.id, {
      persistent: false,
      userAgent: SAFARI_IPHONE,
      ip: '10.0.0.2',
    });

    const res = await h
      .patch('/api/v1/users/me/password')
      .set('Cookie', cookie)
      .send({ currentPassword: password, newPassword: NEW, confirmPassword: NEW });
    expect(res.status).toBe(204);

    expect((await h.get('/api/v1/users/me').set('Cookie', cookie)).status).toBe(200);
    const otherMe = await h
      .get('/api/v1/users/me')
      .set('Cookie', `tf_access=${other.access.token}`);
    expect(otherMe.status).toBe(401);

    const oldLogin = await h.post('/api/v1/auth/login').send({ identifier: 'changer', password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await h
      .post('/api/v1/auth/login')
      .send({ identifier: 'changer', password: NEW });
    expect(newLogin.status).toBe(200);
    expect(h.mail.sent.map((m) => m.subject)).toContain('Your TaskFlow password was changed');
  });

  it('rejects a wrong current password with 400, never 401', async () => {
    const { cookie } = await signIn();
    const res = await h
      .patch('/api/v1/users/me/password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'Wrong!Passw0rd', newPassword: NEW, confirmPassword: NEW });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
  });

  it('rejects reusing the current password', async () => {
    const { cookie, password } = await signIn();
    const res = await h.patch('/api/v1/users/me/password').set('Cookie', cookie).send({
      currentPassword: password,
      newPassword: password,
      confirmPassword: password,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({
      field: 'newPassword',
      message: 'Choose a password different from your current one',
    });
  });

  it('lets OAuth-only users set a first password without a current one', async () => {
    const { cookie, user } = await signIn({ password: null, username: 'oauthuser' });
    const res = await h
      .patch('/api/v1/users/me/password')
      .set('Cookie', cookie)
      .send({ newPassword: NEW, confirmPassword: NEW });
    expect(res.status).toBe(204);
    const me = await h.get('/api/v1/users/me').set('Cookie', cookie);
    expect(me.body.data).toMatchObject({ id: user.id, hasPassword: true });
  });
});

describe('sessions', () => {
  it('lists active sessions with friendly device names and the current flag', async () => {
    const { user, cookie, session } = await signIn();
    await h.container.sessions.create(user.id, {
      persistent: false,
      userAgent: SAFARI_IPHONE,
      ip: '203.0.113.9',
    });

    const res = await h.get('/api/v1/users/me/sessions').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const current = res.body.data.find((s: { current: boolean }) => s.current);
    expect(current).toMatchObject({
      id: session.sessionId,
      device: 'Chrome on Windows',
      ipAddress: '127.0.0.1',
    });
    const other = res.body.data.find((s: { current: boolean }) => !s.current);
    expect(other).toMatchObject({ device: 'Safari on iOS', ipAddress: '203.0.113.9' });
  });

  it('revokes another device', async () => {
    const { user, cookie } = await signIn();
    const other = await h.container.sessions.create(user.id, {
      persistent: false,
      userAgent: SAFARI_IPHONE,
      ip: '203.0.113.9',
    });

    const res = await h.del(`/api/v1/users/me/sessions/${other.sessionId}`).set('Cookie', cookie);
    expect(res.status).toBe(204);
    const otherMe = await h
      .get('/api/v1/users/me')
      .set('Cookie', `tf_access=${other.access.token}`);
    expect(otherMe.status).toBe(401);
  });

  it("returns 404 for another user's session and 400 for a malformed id", async () => {
    const { cookie } = await signIn();
    const stranger = await signIn();

    const foreign = await h
      .del(`/api/v1/users/me/sessions/${stranger.session.sessionId}`)
      .set('Cookie', cookie);
    expect(foreign.status).toBe(404);
    expect((await h.get('/api/v1/users/me').set('Cookie', stranger.cookie)).status).toBe(200);

    const random = await h.del(`/api/v1/users/me/sessions/${randomUUID()}`).set('Cookie', cookie);
    expect(random.status).toBe(404);

    const malformed = await h.del('/api/v1/users/me/sessions/not-a-uuid').set('Cookie', cookie);
    expect(malformed.status).toBe(400);
  });

  it('clears cookies when the current session revokes itself', async () => {
    const { cookie, session } = await signIn();
    const res = await h.del(`/api/v1/users/me/sessions/${session.sessionId}`).set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect(setCookies(res).tf_access?.attributes).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});
