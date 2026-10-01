import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setCookies } from './setup/cookies';
import { createHarness, type Harness } from './setup/harness';
import { lastCodeFor, registerAndVerify } from './setup/signup';

const REGISTER = '/api/v1/auth/register';
const VERIFY = '/api/v1/auth/register/verify';
const RESEND = '/api/v1/auth/register/resend';
const MINUTE = 60_000;

const details = (overrides: Record<string, string> = {}) => ({
  firstName: 'Maria',
  lastName: 'Santos',
  username: 'maria',
  email: 'maria@example.com',
  password: 'Str0ng!Passw0rd',
  confirmPassword: 'Str0ng!Passw0rd',
  ...overrides,
});

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

async function start(overrides: Record<string, string> = {}) {
  const res = await h.post(REGISTER).send(details(overrides));
  expect(res.status).toBe(202);
  return res.body.data as { registrationId: string; email: string; resendAvailableAt: string };
}

/** A 6-digit code that is guaranteed to differ from the real one. */
const wrongCode = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

describe('sign-up with an emailed code', () => {
  it('rejects a wrong code and says how many attempts are left', async () => {
    const { registrationId, email } = await start();
    const res = await h
      .post(VERIFY)
      .send({ registrationId, code: wrongCode(lastCodeFor(h, email)) });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'INVALID_OTP',
      message: 'That code is incorrect. 4 attempts left.',
    });
    expect(await h.container.prisma.user.count()).toBe(0);
  });

  it('cancels the sign-up after five wrong codes, even if the right one follows', async () => {
    const { registrationId, email } = await start();
    const code = lastCodeFor(h, email);
    for (let i = 0; i < 4; i += 1) {
      await h.post(VERIFY).send({ registrationId, code: wrongCode(code) });
    }
    const fifth = await h.post(VERIFY).send({ registrationId, code: wrongCode(code) });
    expect(fifth.body.error.code).toBe('OTP_ATTEMPTS_EXCEEDED');

    const afterwards = await h.post(VERIFY).send({ registrationId, code });
    expect(afterwards.body.error.code).toBe('OTP_EXPIRED');
    expect(await h.container.prisma.user.count()).toBe(0);
  });

  it('expires codes after 10 minutes', async () => {
    const { registrationId, email } = await start();
    const code = lastCodeFor(h, email);
    h.clock.advance(10 * MINUTE + 1);

    const res = await h.post(VERIFY).send({ registrationId, code });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OTP_EXPIRED');
  });

  it('uses each code once', async () => {
    const { registrationId, email } = await start();
    const code = lastCodeFor(h, email);
    expect((await h.post(VERIFY).send({ registrationId, code })).status).toBe(201);
    const again = await h.post(VERIFY).send({ registrationId, code });
    expect(again.body.error.code).toBe('OTP_EXPIRED');
    expect(await h.container.prisma.user.count()).toBe(1);
  });

  it('resends a new code after the cooldown and retires the old one', async () => {
    const { registrationId, email } = await start();
    const first = lastCodeFor(h, email);

    const tooSoon = await h.post(RESEND).send({ registrationId });
    expect(tooSoon.status).toBe(429);
    expect(Number(tooSoon.headers['retry-after'])).toBeGreaterThan(0);

    h.clock.advance(61_000);
    const resent = await h.post(RESEND).send({ registrationId });
    expect(resent.status).toBe(200);
    const second = lastCodeFor(h, email);

    if (second !== first) {
      const old = await h.post(VERIFY).send({ registrationId, code: first });
      expect(old.body.error.code).toBe('INVALID_OTP');
    }
    const res = await h.post(VERIFY).send({ registrationId, code: second });
    expect(res.status).toBe(201);
    expect(setCookies(res).tf_access?.value).toBeTruthy();
  });

  it('replaces an earlier pending sign-up for the same email', async () => {
    const first = await start();
    const second = await start({ username: 'maria2' });

    const stale = await h
      .post(VERIFY)
      .send({ registrationId: first.registrationId, code: '000000' });
    expect(stale.body.error.code).toBe('OTP_EXPIRED');
    const res = await h
      .post(VERIFY)
      .send({ registrationId: second.registrationId, code: lastCodeFor(h, second.email) });
    expect(res.status).toBe(201);
    expect(res.body.data.user.username).toBe('maria2');
  });

  it('reports a username taken while the code was pending', async () => {
    const { registrationId, email } = await start();
    await registerAndVerify(h, details({ email: 'someone@example.com' }));

    const res = await h.post(VERIFY).send({ registrationId, code: lastCodeFor(h, email) });
    expect(res.status).toBe(409);
    expect(res.body.error.details).toContainEqual({
      field: 'username',
      message: 'Username is already taken',
    });
  });

  it('validates the request bodies', async () => {
    const bad = await h.post(VERIFY).send({ registrationId: 'nope', code: '12ab' });
    expect(bad.status).toBe(400);
    const fields = (bad.body.error.details as Array<{ field: string }>).map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['registrationId', 'code']));

    const unknown = await h
      .post(RESEND)
      .send({ registrationId: '01999999-0000-7000-8000-000000000000' });
    expect(unknown.body.error.code).toBe('OTP_EXPIRED');
  });
});
