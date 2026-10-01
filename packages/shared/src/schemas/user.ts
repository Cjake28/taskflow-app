import { z } from 'zod';
import { FIELD_LIMITS } from '../rules/fields';
import { confirmPasswordSchema, otpCodeSchema } from './auth';
import { emailSchema, nameSchema, passwordSchema, usernameSchema } from './common';

const currentPasswordSchema = z
  .string({ error: 'Enter your current password' })
  .max(FIELD_LIMITS.password.max);

/** Names and username. The email has its own confirmed flow (`changeEmailSchema`). */
export const updateProfileSchema = z
  .strictObject({
    firstName: nameSchema('First name', FIELD_LIMITS.firstName.max).optional(),
    lastName: nameSchema('Last name', FIELD_LIMITS.lastName.max).optional(),
    username: usernameSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (Object.values(data).every((value) => value === undefined)) {
      ctx.addIssue({ code: 'custom', path: [], message: 'Provide at least one field to update' });
    }
  });

export type UpdateProfileInput = z.input<typeof updateProfileSchema>;
export type UpdateProfileData = z.output<typeof updateProfileSchema>;

/** Step 1 of an email change: a code is sent to the new address; nothing changes yet. */
export const changeEmailSchema = z.strictObject({
  email: emailSchema,
  /** Required when the account has a password. */
  currentPassword: currentPasswordSchema.optional(),
});

export type ChangeEmailInput = z.input<typeof changeEmailSchema>;
export type ChangeEmailData = z.output<typeof changeEmailSchema>;

/** Step 2: the code from the new inbox switches the email. */
export const verifyEmailChangeSchema = z.strictObject({ code: otpCodeSchema });

export type VerifyEmailChangeData = z.output<typeof verifyEmailChangeSchema>;

export const changePasswordSchema = z
  .strictObject({
    /** Omitted when the account has no password yet (signed up with Google or GitHub). */
    currentPassword: currentPasswordSchema.optional(),
    newPassword: passwordSchema,
    confirmPassword: confirmPasswordSchema,
  })
  .superRefine((data, ctx) => {
    if (data.newPassword !== data.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      });
    }
  });

export type ChangePasswordInput = z.input<typeof changePasswordSchema>;
export type ChangePasswordData = z.output<typeof changePasswordSchema>;

export const idParamSchema = z.object({ id: z.uuid('Invalid id') });
