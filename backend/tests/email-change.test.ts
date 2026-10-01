import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser, DEFAULT_PASSWORD } from './setup/factories';
import { createHarness, type Harness } from './setup/harness';
import { lastCodeFor } from './setup/signup';

const START = '/api/v1/users/me/email';
const VERIFY = '/api/v1/users/me/email/verify';
const RESEND = '/api/v1/users/me/email/resend';
const MINUTE = 60_000;

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

async function signIn(overrides: Parameters<typeof createUser>[1] = {}) {
  const { user } = await createUser(h.container.prisma, {
    email: 'old@example.com',
    ...overrides,
  });
  const session = await h.container.sessions.create(user.id, {
    persistent: false,
    userAgent: 'vitest',
    ip: '127.0.0.1',
  });
  return { user, cookie: `tf_access=${session.access.token}` };
}

const wrongCode = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

async function startChange(cookie: string, email = 'new@example.com') {
  const res = await h
    .post(START)
    .set('Cookie', cookie)
    .send({ email, currentPassword: DEFAULT_PASSWORD });
  expect(res.status).toBe(202);
  return res;
}

async function emailOf(userId: string) {
  const user = await h.container.prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, emailVerifiedAt: true },
  });
  return user;
}

describe('changing the email with a code sent to the new address', () => {
  it('sends the code to the new address and changes nothing until it is confirmed', async () => {
    const { user, cookie } = await signIn();
    const res = await startChange(cookie, 'New@Example.com');

    expect(res.body.data).toMatchObject({ email: 'new@example.com' });
    expect(h.mail.sent.map((message) => message.to)).toEqual(['new@example.com']);
    expect((await emailOf(user.id)).email).toBe('old@example.com');

    const pending = await h.get(START).set('Cookie', cookie);
    expect(pending.body.data).toMatchObject({ email: 'new@example.com' });
  });

  it('switches the email, marks it verified and tells the old address', async () => {
    const { user, cookie } = await signIn();
    await startChange(cookie);

    const res = await h
      .post(VERIFY)
      .set('Cookie', cookie)
      .send({ code: lastCodeFor(h, 'new@example.com') });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: 'new@example.com', emailVerified: true });

    const stored = await emailOf(user.id);
    expect(stored.email).toBe('new@example.com');
    expect(stored.emailVerifiedAt).not.toBeNull();

    const notice = h.mail.sent.find((message) => message.to === 'old@example.com');
    expect(notice?.subject).toBe('Your TaskFlow email was changed');
    expect(notice?.text).toContain('new@example.com');

    expect((await h.get(START).set('Cookie', cookie)).body.data).toBeNull();
    // The new address now signs in.
    const login = await h
      .post('/api/v1/auth/login')
      .send({ identifier: 'new@example.com', password: DEFAULT_PASSWORD });
    expect(login.status).toBe(200);
  });

  it('requires the current password', async () => {
    const { cookie } = await signIn();
    const missing = await h.post(START).set('Cookie', cookie).send({ email: 'new@example.com' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details).toContainEqual({
      field: 'currentPassword',
      message: 'Enter your current password to change your email',
    });

    const wrong = await h
      .post(START)
      .set('Cookie', cookie)
      .send({ email: 'new@example.com', currentPassword: 'Wrong!Passw0rd' });
    expect(wrong.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    expect(h.mail.sent).toHaveLength(0);
  });

  it('rejects the current email and addresses that belong to someone else', async () => {
    await createUser(h.container.prisma, { email: 'taken@example.com' });
    const { cookie } = await signIn();

    const same = await h
      .post(START)
      .set('Cookie', cookie)
      .send({ email: 'old@example.com', currentPassword: DEFAULT_PASSWORD });
    expect(same.body.error.details).toContainEqual({
      field: 'email',
      message: 'This is already your email',
    });

    const taken = await h
      .post(START)
      .set('Cookie', cookie)
      .send({ email: 'taken@example.com', currentPassword: DEFAULT_PASSWORD });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('asks OAuth-only users to set a password first', async () => {
    const { cookie } = await signIn({ password: null });
    const res = await h
      .post(START)
      .set('Cookie', cookie)
      .send({ email: 'new@example.com', currentPassword: 'x' });
    expect(res.body.error.code).toBe('PASSWORD_NOT_SET');
  });

  it('limits wrong codes and cancels the change after five', async () => {
    const { user, cookie } = await signIn();
    await startChange(cookie);
    const code = lastCodeFor(h, 'new@example.com');

    const first = await h
      .post(VERIFY)
      .set('Cookie', cookie)
      .send({ code: wrongCode(code) });
    expect(first.body.error).toMatchObject({
      code: 'INVALID_OTP',
      message: 'That code is incorrect. 4 attempts left.',
    });
    for (let i = 0; i < 3; i += 1) {
      await h
        .post(VERIFY)
        .set('Cookie', cookie)
        .send({ code: wrongCode(code) });
    }
    const fifth = await h
      .post(VERIFY)
      .set('Cookie', cookie)
      .send({ code: wrongCode(code) });
    expect(fifth.body.error.code).toBe('OTP_ATTEMPTS_EXCEEDED');

    const late = await h.post(VERIFY).set('Cookie', cookie).send({ code });
    expect(late.body.error.code).toBe('OTP_EXPIRED');
    expect((await emailOf(user.id)).email).toBe('old@example.com');
  });

  it('expires codes after 10 minutes', async () => {
    const { cookie, user } = await signIn();
    await startChange(cookie);
    const code = lastCodeFor(h, 'new@example.com');
    h.clock.advance(10 * MINUTE + 1);

    // The access token is short-lived too; sign in again before verifying.
    const session = await h.container.sessions.create(user.id, {
      persistent: false,
      userAgent: 'vitest',
      ip: '127.0.0.1',
    });
    const res = await h
      .post(VERIFY)
      .set('Cookie', `tf_access=${session.access.token}`)
      .send({ code });
    expect(res.body.error.code).toBe('OTP_EXPIRED');
  });

  it('resends after the cooldown and retires the previous code', async () => {
    const { cookie } = await signIn();
    await startChange(cookie);
    const first = lastCodeFor(h, 'new@example.com');

    const tooSoon = await h.post(RESEND).set('Cookie', cookie);
    expect(tooSoon.status).toBe(429);

    h.clock.advance(61_000);
    expect((await h.post(RESEND).set('Cookie', cookie)).status).toBe(200);
    const second = lastCodeFor(h, 'new@example.com');
    if (second !== first) {
      const old = await h.post(VERIFY).set('Cookie', cookie).send({ code: first });
      expect(old.body.error.code).toBe('INVALID_OTP');
    }
    expect((await h.post(VERIFY).set('Cookie', cookie).send({ code: second })).status).toBe(200);
  });

  it('can be cancelled', async () => {
    const { cookie } = await signIn();
    await startChange(cookie);
    expect((await h.del(START).set('Cookie', cookie)).status).toBe(204);
    const res = await h
      .post(VERIFY)
      .set('Cookie', cookie)
      .send({ code: lastCodeFor(h, 'new@example.com') });
    expect(res.body.error.code).toBe('OTP_EXPIRED');
  });

  it('reports an address registered by someone else while the code was pending', async () => {
    const { cookie } = await signIn();
    await startChange(cookie);
    await createUser(h.container.prisma, { email: 'new@example.com' });

    const res = await h
      .post(VERIFY)
      .set('Cookie', cookie)
      .send({ code: lastCodeFor(h, 'new@example.com') });
    expect(res.status).toBe(409);
  });

  it('requires a session', async () => {
    expect((await h.post(START).send({ email: 'x@example.com' })).status).toBe(401);
    expect((await h.get(START)).status).toBe(401);
  });
});
