import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setCookies } from './setup/cookies';
import { createUser, DEFAULT_PASSWORD } from './setup/factories';
import { resetTokenFrom } from './setup/fakes';
import { createHarness, type Harness } from './setup/harness';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const HOUR = 60 * 60 * 1000;

async function register() {
  const res = await h.post('/api/v1/auth/register').send({
    firstName: 'Maria',
    lastName: 'Santos',
    username: 'maria',
    email: 'maria@example.com',
    password: DEFAULT_PASSWORD,
    confirmPassword: DEFAULT_PASSWORD,
  });
  expect(res.status).toBe(201);
  return { res, cookie: `tf_access=${setCookies(res).tf_access!.value}` };
}

const verificationEmails = () =>
  h.mail.sent.filter((message) => message.subject === 'Confirm your email for TaskFlow');

describe('email verification', () => {
  it('sends a confirmation link on registration and verifies the address once', async () => {
    const { res, cookie } = await register();
    expect(res.body.data.user.emailVerified).toBe(false);

    const [email] = verificationEmails();
    expect(email?.to).toBe('maria@example.com');
    expect(email?.text).toContain('http://localhost:5173/verify-email?token=');
    const token = resetTokenFrom(email);

    // No session needed: the link may be opened in another browser.
    expect((await h.post('/api/v1/auth/verify-email').send({ token })).status).toBe(204);
    const me = await h.get('/api/v1/users/me').set('Cookie', cookie);
    expect(me.body.data.emailVerified).toBe(true);

    const reused = await h.post('/api/v1/auth/verify-email').send({ token });
    expect(reused.status).toBe(400);
    expect(reused.body.error.code).toBe('INVALID_VERIFICATION_TOKEN');
  });

  it('rejects expired, unknown and password-reset tokens', async () => {
    await register();
    const token = resetTokenFrom(verificationEmails()[0]);

    const unknown = await h.post('/api/v1/auth/verify-email').send({ token: 'nope' });
    expect(unknown.body.error.code).toBe('INVALID_VERIFICATION_TOKEN');

    await h.post('/api/v1/auth/forgot-password').send({ email: 'maria@example.com' });
    const resetToken = resetTokenFrom(h.mail.sent.at(-1));
    const wrongType = await h.post('/api/v1/auth/verify-email').send({ token: resetToken });
    expect(wrongType.body.error.code).toBe('INVALID_VERIFICATION_TOKEN');

    h.clock.advance(25 * HOUR);
    const expired = await h.post('/api/v1/auth/verify-email').send({ token });
    expect(expired.status).toBe(400);
    expect(expired.body.error.code).toBe('VERIFICATION_TOKEN_EXPIRED');
  });

  it('resends a fresh link and invalidates the previous one', async () => {
    const { cookie } = await register();
    const first = resetTokenFrom(verificationEmails()[0]);

    expect((await h.post('/api/v1/auth/verify-email/resend').set('Cookie', cookie)).status).toBe(
      204,
    );
    const second = resetTokenFrom(verificationEmails()[1]);
    expect(second).not.toBe(first);

    const old = await h.post('/api/v1/auth/verify-email').send({ token: first });
    expect(old.body.error.code).toBe('INVALID_VERIFICATION_TOKEN');
    expect((await h.post('/api/v1/auth/verify-email').send({ token: second })).status).toBe(204);

    // Already verified: resending is a no-op.
    h.mail.clear();
    await h.post('/api/v1/auth/verify-email/resend').set('Cookie', cookie);
    expect(verificationEmails()).toHaveLength(0);
  });

  it('requires a session to resend', async () => {
    expect((await h.post('/api/v1/auth/verify-email/resend')).status).toBe(401);
  });

  it('asks to confirm again after the email changes', async () => {
    const { user } = await createUser(h.container.prisma, { email: 'old@example.com' });
    await h.container.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });
    const session = await h.container.sessions.create(user.id, {
      persistent: false,
      userAgent: 'vitest',
      ip: '127.0.0.1',
    });
    const cookie = `tf_access=${session.access.token}`;

    const res = await h
      .patch('/api/v1/users/me')
      .set('Cookie', cookie)
      .send({ email: 'new@example.com', currentPassword: DEFAULT_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: 'new@example.com', emailVerified: false });
    expect(verificationEmails().at(-1)?.to).toBe('new@example.com');
  });
});
