import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser } from './setup/factories';
import { resetTokenFrom } from './setup/fakes';
import { createHarness, type Harness } from './setup/harness';

const FORGOT = '/api/v1/auth/forgot-password';
const VERIFY = '/api/v1/auth/reset-password/verify';
const RESET = '/api/v1/auth/reset-password';
const NEW_PASSWORD = 'N3w!Secure#Pass';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

async function requestResetToken(email: string): Promise<string> {
  await h.post(FORGOT).send({ email });
  return resetTokenFrom(h.mail.sent.at(-1));
}

describe('POST /api/v1/auth/forgot-password', () => {
  it('responds identically for registered and unknown emails', async () => {
    await createUser(h.container.prisma, { email: 'known@example.com' });

    const known = await h.post(FORGOT).send({ email: 'known@example.com' });
    const unknown = await h.post(FORGOT).send({ email: 'nobody@example.com' });

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    expect(known.body.data.message).toBe(
      'If an account with that email exists, password reset instructions have been sent.',
    );
    expect(h.mail.sent).toHaveLength(1);
    expect(h.mail.sent[0]?.to).toBe('known@example.com');
  });

  it('emails a link to the frontend reset page, matching the email case-insensitively', async () => {
    await createUser(h.container.prisma, { email: 'resetme@example.com' });
    const token = await requestResetToken('  ResetMe@Example.com ');

    const message = h.mail.sent[0];
    expect(message?.subject).toBe('Reset your TaskFlow password');
    expect(message?.html).toContain(`/reset-password?token=${token}`);
    expect(message?.text).toContain('expires in 30 minutes');
  });

  it('stores only a hash of the reset token', async () => {
    await createUser(h.container.prisma, { email: 'hash@example.com' });
    const token = await requestResetToken('hash@example.com');
    const row = await h.container.prisma.verificationToken.findFirstOrThrow();
    expect(row.tokenHash).toHaveLength(64);
    expect(row.tokenHash).not.toContain(token);
  });

  it('silently stops sending after three requests per email per hour', async () => {
    await createUser(h.container.prisma, { email: 'flood@example.com' });
    for (let i = 0; i < 4; i += 1) {
      const res = await h.post(FORGOT).send({ email: 'flood@example.com' });
      expect(res.status).toBe(202);
    }
    expect(h.mail.sent).toHaveLength(3);
  });

  it('escapes user-supplied names in the email', async () => {
    await createUser(h.container.prisma, {
      email: 'xss@example.com',
      firstName: '<script>alert(1)</script>',
    });
    await h.post(FORGOT).send({ email: 'xss@example.com' });
    const html = h.mail.sent[0]?.html ?? '';
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('validates the email format', async () => {
    const res = await h.post(FORGOT).send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({
      field: 'email',
      message: 'Enter a valid email address',
    });
  });
});

describe('reset password', () => {
  it('verifies a fresh link and resets the password exactly once', async () => {
    await createUser(h.container.prisma, { email: 'once@example.com' });
    const token = await requestResetToken('once@example.com');

    expect((await h.post(VERIFY).send({ token })).status).toBe(204);
    const res = await h
      .post(RESET)
      .send({ token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    expect(res.status).toBe(204);

    const again = await h
      .post(RESET)
      .send({ token, password: 'An0ther!Secure', confirmPassword: 'An0ther!Secure' });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_RESET_TOKEN');
    expect((await h.post(VERIFY).send({ token })).body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('makes the old password stop working and signs out every session', async () => {
    const { user, password } = await createUser(h.container.prisma, { username: 'rotate' });
    const session = await h.container.sessions.create(user.id, {
      persistent: false,
      userAgent: 'vitest',
      ip: '127.0.0.1',
    });
    const token = await requestResetToken(user.email);

    await h.post(RESET).send({ token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

    const oldLogin = await h.post('/api/v1/auth/login').send({ identifier: 'rotate', password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await h
      .post('/api/v1/auth/login')
      .send({ identifier: 'rotate', password: NEW_PASSWORD });
    expect(newLogin.status).toBe(200);

    const me = await h.get('/api/v1/users/me').set('Cookie', `tf_access=${session.access.token}`);
    expect(me.status).toBe(401);
    expect(h.mail.sent.map((m) => m.subject)).toContain('Your TaskFlow password was changed');
  });

  it('rejects expired links', async () => {
    await createUser(h.container.prisma, { email: 'late@example.com' });
    const token = await requestResetToken('late@example.com');
    h.clock.advance(31 * 60_000);

    const verify = await h.post(VERIFY).send({ token });
    expect(verify.status).toBe(400);
    expect(verify.body.error.code).toBe('RESET_TOKEN_EXPIRED');

    const reset = await h
      .post(RESET)
      .send({ token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    expect(reset.body.error.code).toBe('RESET_TOKEN_EXPIRED');
  });

  it('rejects unknown tokens', async () => {
    const res = await h.post(VERIFY).send({ token: 'x'.repeat(43) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('invalidates older links when a new one is requested', async () => {
    await createUser(h.container.prisma, { email: 'twice@example.com' });
    const first = await requestResetToken('twice@example.com');
    const second = await requestResetToken('twice@example.com');

    expect((await h.post(VERIFY).send({ token: first })).body.error.code).toBe(
      'INVALID_RESET_TOKEN',
    );
    expect((await h.post(VERIFY).send({ token: second })).status).toBe(204);
  });

  it('lets only one of two simultaneous resets with the same link succeed', async () => {
    await createUser(h.container.prisma, { email: 'race@example.com' });
    const token = await requestResetToken('race@example.com');

    const results = await Promise.all([
      h.post(RESET).send({ token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
      h.post(RESET).send({ token, password: 'Other!Secure9', confirmPassword: 'Other!Secure9' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 400]);
  });

  it('validates the new password', async () => {
    await createUser(h.container.prisma, { username: 'rules', email: 'rules@example.com' });
    const token = await requestResetToken('rules@example.com');

    const mismatch = await h
      .post(RESET)
      .send({ token, password: NEW_PASSWORD, confirmPassword: 'Different!1' });
    expect(mismatch.body.error.details).toContainEqual({
      field: 'confirmPassword',
      message: 'Passwords do not match',
    });

    const weak = await h.post(RESET).send({ token, password: 'weak', confirmPassword: 'weak' });
    expect(weak.status).toBe(400);

    const personal = await h
      .post(RESET)
      .send({ token, password: 'Rules!2026x', confirmPassword: 'Rules!2026x' });
    expect(personal.body.error.details).toEqual([
      { field: 'password', message: 'Password must not contain your username or email' },
    ]);
  });
});
