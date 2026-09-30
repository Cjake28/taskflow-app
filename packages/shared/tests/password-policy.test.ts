import { describe, expect, it } from 'vitest';
import {
  checkPassword,
  containsPersonalInfo,
  passwordStrength,
} from '../src/rules/password-policy';

describe('checkPassword', () => {
  it('reports each rule', () => {
    const result = checkPassword('abc');
    expect(result.map((r) => [r.id, r.passed])).toEqual([
      ['length', false],
      ['upper', false],
      ['lower', true],
      ['number', false],
      ['symbol', false],
    ]);
  });

  it('passes every rule for a strong password', () => {
    expect(checkPassword('Str0ng!Passw0rd').every((r) => r.passed)).toBe(true);
  });
});

describe('passwordStrength', () => {
  it('returns 0 for an empty value', () => {
    expect(passwordStrength('')).toBe(0);
  });

  it('grows with the number of satisfied rules', () => {
    expect(passwordStrength('abc')).toBe(1);
    expect(passwordStrength('abcdefgh1')).toBe(2);
    expect(passwordStrength('Abcdefgh1')).toBe(3);
    expect(passwordStrength('Abcdefg1!')).toBe(4);
  });
});

describe('containsPersonalInfo', () => {
  it('detects the username or the email local part, case-insensitively', () => {
    expect(containsPersonalInfo('MyJuan!2026', { username: 'juan' })).toBe(true);
    expect(containsPersonalInfo('X-DELACRUZ-9', { email: 'delacruz@example.com' })).toBe(true);
  });

  it('ignores identity parts shorter than three characters', () => {
    expect(containsPersonalInfo('Abcdef1!', { username: 'ab' })).toBe(false);
  });
});
