import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from '../src/schemas/auth';

const valid = {
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  username: 'juan',
  email: 'juan@example.com',
  password: 'Str0ng!Passw0rd',
  confirmPassword: 'Str0ng!Passw0rd',
};

const fieldsWithErrors = (input: unknown) => {
  const result = registerSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

describe('registerSchema', () => {
  it('accepts valid input and normalises email and username', () => {
    const parsed = registerSchema.parse({
      ...valid,
      email: '  Juan@Example.COM ',
      username: ' Juan ',
    });
    expect(parsed.email).toBe('juan@example.com');
    expect(parsed.username).toBe('juan');
  });

  it('trims names', () => {
    expect(registerSchema.parse({ ...valid, firstName: '  Juan  ' }).firstName).toBe('Juan');
  });

  it('requires every field', () => {
    expect(fieldsWithErrors({})).toEqual(
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

  it('reports mismatched passwords on confirmPassword', () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: 'Different!1' });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['confirmPassword'], message: 'Passwords do not match' }),
      ]),
    );
  });

  it('enforces the password policy', () => {
    const result = registerSchema.safeParse({
      ...valid,
      password: 'weakpass',
      confirmPassword: 'weakpass',
    });
    expect(result.error?.issues.map((i) => i.message)).toEqual(
      expect.arrayContaining([
        'Password must include an uppercase letter',
        'Password must include a number',
        'Password must include a symbol',
      ]),
    );
  });

  it('rejects a password containing the username', () => {
    const result = registerSchema.safeParse({
      ...valid,
      password: 'Juan!2026x',
      confirmPassword: 'Juan!2026x',
    });
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ['password'] })]),
    );
  });

  it('rejects invalid usernames', () => {
    for (const username of ['ab', '.juan', 'juan.', 'juan cruz', 'juan-cruz']) {
      expect(fieldsWithErrors({ ...valid, username })).toContain('username');
    }
  });

  it('rejects unknown fields', () => {
    expect(registerSchema.safeParse({ ...valid, role: 'admin' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('normalises the identifier and defaults rememberMe to false', () => {
    expect(loginSchema.parse({ identifier: '  Maria@Example.com ', password: 'x' })).toEqual({
      identifier: 'maria@example.com',
      password: 'x',
      rememberMe: false,
    });
  });
});
