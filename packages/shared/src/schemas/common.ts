import { z } from 'zod';
import { FIELD_LIMITS } from '../rules/fields';
import { USERNAME_PATTERN } from '../rules/username';

export const normalizeIdentifier = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export const nameSchema = (label: string, max: number) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, { error: `${label} is required`, abort: true })
    .max(max, `${label} must be at most ${max} characters`);

export const emailSchema = z.preprocess(
  normalizeIdentifier,
  z
    .string({ error: 'Email is required' })
    .min(1, { error: 'Email is required', abort: true })
    .max(FIELD_LIMITS.email.max, `Email must be at most ${FIELD_LIMITS.email.max} characters`)
    .pipe(z.email({ error: 'Enter a valid email address' })),
);

export const usernameSchema = z.preprocess(
  normalizeIdentifier,
  z
    .string({ error: 'Username is required' })
    .min(1, { error: 'Username is required', abort: true })
    .min(FIELD_LIMITS.username.min, {
      error: `Username must be at least ${FIELD_LIMITS.username.min} characters`,
      abort: true,
    })
    .max(FIELD_LIMITS.username.max, {
      error: `Username must be at most ${FIELD_LIMITS.username.max} characters`,
      abort: true,
    })
    .regex(
      USERNAME_PATTERN,
      'Use letters, numbers, dots or underscores, starting and ending with a letter or number',
    ),
);

export const passwordSchema = z
  .string({ error: 'Password is required' })
  .min(1, { error: 'Password is required', abort: true })
  .min(
    FIELD_LIMITS.password.min,
    `Password must be at least ${FIELD_LIMITS.password.min} characters`,
  )
  .max(
    FIELD_LIMITS.password.max,
    `Password must be at most ${FIELD_LIMITS.password.max} characters`,
  )
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/\d/, 'Password must include a number')
  .regex(/[^A-Za-z0-9]/, 'Password must include a symbol');
