import { z } from 'zod';
import { FIELD_LIMITS } from '../rules/fields';
import { confirmPasswordSchema } from './auth';
import { emailSchema, nameSchema, passwordSchema, usernameSchema } from './common';

const currentPasswordSchema = z
  .string({ error: 'Enter your current password' })
  .max(FIELD_LIMITS.password.max);

export const updateProfileSchema = z
  .strictObject({
    firstName: nameSchema('First name', FIELD_LIMITS.firstName.max).optional(),
    lastName: nameSchema('Last name', FIELD_LIMITS.lastName.max).optional(),
    username: usernameSchema.optional(),
    email: emailSchema.optional(),
    currentPassword: currentPasswordSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const { currentPassword: _ignored, ...fields } = data;
    if (Object.values(fields).every((value) => value === undefined)) {
      ctx.addIssue({ code: 'custom', path: [], message: 'Provide at least one field to update' });
    }
  });

export type UpdateProfileInput = z.input<typeof updateProfileSchema>;
export type UpdateProfileData = z.output<typeof updateProfileSchema>;

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
