import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setCookies } from './setup/cookies';
import { createHarness, type Harness } from './setup/harness';
import { lastCodeFor, registerAndVerify } from './setup/signup';

const URL_REGISTER = '/api/v1/auth/register';
const valid = {
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  username: 'juan',
  email: 'juan@example.com',
  password: 'Str0ng!Passw0rd',
  confirmPassword: 'Str0ng!Passw0rd',
};

describe('POST /api/v1/auth/register', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });
  beforeEach(() => h.reset());
  afterAll(() => h.close());

  it('emails a code and creates nothing until the code is confirmed', async () => {
    const res = await h.post(URL_REGISTER).send(valid);

    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ email: 'juan@example.com' });
    expect(res.body.data.registrationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(res.body.data.expiresAt)).toBeGreaterThan(h.clock.now().getTime());
    expect(setCookies(res).tf_access).toBeUndefined();
    expect(await h.container.prisma.user.count()).toBe(0);

    const [email] = h.mail.sent;
    expect(email).toMatchObject({ to: 'juan@example.com' });
    expect(email?.subject).toMatch(/^\d{6} is your TaskFlow verification code$/);
    expect(JSON.stringify(await h.container.redis.keys('tf:signup:*'))).not.toContain(
      lastCodeFor(h, 'juan@example.com'),
    );
  });

  it('creates the account, signs the user in and stores only a hash after the code', async () => {
    const res = await registerAndVerify(h, valid);

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      username: 'juan',
      email: 'juan@example.com',
      hasPassword: true,
      emailVerified: true,
      avatarUrl: null,
    });
    expect(Date.parse(res.body.data.accessTokenExpiresAt)).toBeGreaterThan(h.clock.now().getTime());
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');

    const cookies = setCookies(res);
    expect(cookies.tf_access?.attributes).toMatch(/HttpOnly/i);
    expect(cookies.tf_access?.attributes).toMatch(/SameSite=Lax/i);
    expect(cookies.tf_refresh?.attributes).toMatch(/Path=\/api\/v1\/auth/);
    expect(cookies.tf_refresh?.attributes).not.toMatch(/Max-Age|Expires/i);

    const row = await h.container.prisma.user.findUniqueOrThrow({
      where: { email: 'juan@example.com' },
      omit: { passwordHash: false },
    });
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row.passwordHash).not.toContain(valid.password);
    expect(row.emailVerifiedAt).not.toBeNull();
  });

  it('normalises email and username before saving', async () => {
    const res = await registerAndVerify(h, {
      ...valid,
      email: '  Juan@Example.COM ',
      username: 'Juan',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email: 'juan@example.com', username: 'juan' });
  });

  it('rejects an email that differs only by case', async () => {
    await registerAndVerify(h, valid);
    const res = await h
      .post(URL_REGISTER)
      .send({ ...valid, username: 'other', email: 'JUAN@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
    expect(res.body.error.details).toEqual([
      { field: 'email', message: 'Email is already registered' },
    ]);
  });

  it('reports a duplicate username and email together', async () => {
    await registerAndVerify(h, valid);
    const res = await h.post(URL_REGISTER).send(valid);

    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual([
      { field: 'email', message: 'Email is already registered' },
      { field: 'username', message: 'Username is already taken' },
    ]);
  });

  it('returns field errors for missing fields', async () => {
    const res = await h.post(URL_REGISTER).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(
      expect.arrayContaining([
        'firstName',
        'lastName',
        'username',
        'email',
        'password',
        'confirmPassword',
      ]),
    );
  });

  it('requires matching passwords', async () => {
    const res = await h.post(URL_REGISTER).send({ ...valid, confirmPassword: 'Other!Passw0rd' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({
      field: 'confirmPassword',
      message: 'Passwords do not match',
    });
  });

  it('rejects unknown fields such as a role', async () => {
    const res = await h.post(URL_REGISTER).send({ ...valid, role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({ field: 'role', message: 'Unknown field' });
  });
});

describe('POST /api/v1/auth/register with the breached-password check', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness({
      breachChecker: { isBreached: async (password) => password === valid.password },
    });
  });
  beforeEach(() => h.reset());
  afterAll(() => h.close());

  it('rejects a password found in a data breach', async () => {
    const res = await h.post(URL_REGISTER).send(valid);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      {
        field: 'password',
        message: 'This password has appeared in a data breach. Choose a different one.',
      },
    ]);
    expect(await h.container.prisma.user.count()).toBe(0);
  });
});
