import { FIELD_LIMITS } from './fields';

export type PasswordRuleId = 'length' | 'upper' | 'lower' | 'number' | 'symbol';

export interface PasswordRule {
  id: PasswordRuleId;
  label: string;
  test: (value: string) => boolean;
}

export interface PasswordCheckResult {
  id: PasswordRuleId;
  label: string;
  passed: boolean;
}

export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'length',
    label: `${FIELD_LIMITS.password.min}+ characters`,
    test: (value) => value.length >= FIELD_LIMITS.password.min,
  },
  { id: 'upper', label: 'An uppercase letter', test: (value) => /[A-Z]/.test(value) },
  { id: 'lower', label: 'A lowercase letter', test: (value) => /[a-z]/.test(value) },
  { id: 'number', label: 'A number', test: (value) => /\d/.test(value) },
  { id: 'symbol', label: 'A symbol', test: (value) => /[^A-Za-z0-9]/.test(value) },
];

export const PASSWORD_STRENGTH_LABELS: Record<PasswordStrength, string> = {
  0: '',
  1: 'Weak',
  2: 'Fair',
  3: 'Good',
  4: 'Strong',
};

export function checkPassword(value: string): PasswordCheckResult[] {
  return PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    passed: rule.test(value),
  }));
}

/** Strength-meter score: satisfied rules minus one, plus one for 12+ characters, clamped to 1–4. */
export function passwordStrength(value: string): PasswordStrength {
  if (value.length === 0) return 0;
  const passed = checkPassword(value).filter((rule) => rule.passed).length;
  const lengthBonus = value.length >= 12 ? 1 : 0;
  return Math.min(4, Math.max(1, passed - 1 + lengthBonus)) as PasswordStrength;
}

export function containsPersonalInfo(
  password: string,
  identity: { username?: string; email?: string },
): boolean {
  const lowered = password.toLowerCase();
  const parts = [identity.username, identity.email?.split('@')[0]]
    .filter((part): part is string => typeof part === 'string' && part.length >= 3)
    .map((part) => part.toLowerCase());
  return parts.some((part) => lowered.includes(part));
}
