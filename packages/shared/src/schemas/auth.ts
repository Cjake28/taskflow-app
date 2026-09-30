import { z } from 'zod';
import { FIELD_LIMITS } from '../rules/fields';
import { containsPersonalInfo } from '../rules/password-policy';
import {
  emailSchema,
  nameSchema,
  normalizeIdentifier,
  passwordSchema,
  usernameSchema,
} from './common';

export const confirmPasswordSchema = z
  .string({ error: 'Please confirm your password' })
  .min(1, 'Please confirm your password');

export const registerSchema = z
  .strictObject({
    firstName: nameSchema('First name', FIELD_LIMITS.firstName.max),
    lastName: nameSchema('Last name', FIELD_LIMITS.lastName.max),
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: confirmPasswordSchema,
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      });
    }
    if (containsPersonalInfo(data.password, { username: data.username, email: data.email })) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'Password must not contain your username or email',
      });
    }
  });

export type RegisterInput = z.input<typeof registerSchema>;
export type RegisterData = z.output<typeof registerSchema>;

export const loginSchema = z.strictObject({
  identifier: z.preprocess(
    normalizeIdentifier,
    z
      .string({ error: 'Enter your email or username' })
      .min(1, 'Enter your email or username')
      .max(FIELD_LIMITS.email.max),
  ),
  password: z
    .string({ error: 'Enter your password' })
    .min(1, 'Enter your password')
    .max(FIELD_LIMITS.password.max),
  rememberMe: z.boolean().default(false),
});

export type LoginInput = z.input<typeof loginSchema>;
export type LoginData = z.output<typeof loginSchema>;

export const forgotPasswordSchema = z.strictObject({ email: emailSchema });

export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;
export type ForgotPasswordData = z.output<typeof forgotPasswordSchema>;

const resetTokenSchema = z
  .string({ error: 'Reset token is required' })
  .min(1, 'Reset token is required')
  .max(256, 'Reset token is invalid');

export const verifyResetTokenSchema = z.strictObject({ token: resetTokenSchema });

export type VerifyResetTokenData = z.output<typeof verifyResetTokenSchema>;

export const resetPasswordSchema = z
  .strictObject({
    token: resetTokenSchema,
    password: passwordSchema,
    confirmPassword: confirmPasswordSchema,
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      });
    }
  });

export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
export type ResetPasswordData = z.output<typeof resetPasswordSchema>;

const verificationTokenSchema = z
  .string({ error: 'Verification token is required' })
  .min(1, 'Verification token is required')
  .max(256, 'Verification token is invalid');

export const verifyEmailSchema = z.strictObject({ token: verificationTokenSchema });

export type VerifyEmailData = z.output<typeof verifyEmailSchema>;

export const FORGOT_PASSWORD_MESSAGE =
  'If an account with that email exists, password reset instructions have been sent.';
