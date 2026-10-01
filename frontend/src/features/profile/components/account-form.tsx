import { useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ErrorCode,
  FIELD_LIMITS,
  emailSchema,
  nameSchema,
  usernameSchema,
  type UserDto,
} from '@taskflow/shared';
import { AtSign, LockKeyhole, Mail } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';

import { Alert } from '@/components/common/alert';
import { FormField } from '@/components/common/form-field';
import { PasswordInput } from '@/components/common/password-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/use-auth';
import { isApiError } from '@/lib/api-client';
import { ROOT_SERVER_ERROR, applyServerErrors } from '@/lib/form-errors';

import { profileApi } from '../api';
import {
  buildProfileUpdate,
  isEmailChange,
  profileFormValues,
  type ProfileFormValues,
} from '../lib/profile-diff';
import { profileTabHref } from '../lib/profile-tabs';
import { ProfileCard } from './profile-card';

/** Shared field rules, plus "current password is required when the email changes". */
function accountSchema(user: Pick<UserDto, 'email' | 'hasPassword'>) {
  return z
    .object({
      firstName: nameSchema('First name', FIELD_LIMITS.firstName.max),
      lastName: nameSchema('Last name', FIELD_LIMITS.lastName.max),
      username: usernameSchema,
      email: emailSchema,
      currentPassword: z.string().max(FIELD_LIMITS.password.max),
    })
    .superRefine((data, ctx) => {
      if (user.hasPassword && data.email !== user.email && !data.currentPassword) {
        ctx.addIssue({
          code: 'custom',
          path: ['currentPassword'],
          message: 'Enter your current password to change your email',
        });
      }
    });
}

const CONFLICT_FIELDS = {
  [ErrorCode.USERNAME_TAKEN]: 'username',
  [ErrorCode.EMAIL_TAKEN]: 'email',
  [ErrorCode.INVALID_CURRENT_PASSWORD]: 'currentPassword',
};

/** Personal information: only changed fields are sent; the password is asked for email changes. */
export function AccountForm({ user }: { user: UserDto }) {
  const { updateUser } = useAuth();
  const schema = useMemo(() => accountSchema(user), [user]);
  const form = useForm({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: profileFormValues(user),
  });
  const { errors, isSubmitting } = form.formState;

  const watched = useWatch({ control: form.control });
  // The shared username/email schemas pre-process their input, so RHF types those values loosely.
  const text = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback);
  const current: ProfileFormValues = {
    firstName: text(watched.firstName, user.firstName),
    lastName: text(watched.lastName, user.lastName),
    username: text(watched.username, user.username),
    email: text(watched.email, user.email),
    currentPassword: text(watched.currentPassword, ''),
  };
  const changes = buildProfileUpdate(user, current);
  const emailChanging = isEmailChange(user, current.email);
  const needsPassword = emailChanging && user.hasPassword;

  const onSubmit = form.handleSubmit(async (values) => {
    const update = buildProfileUpdate(user, values);
    if (!update) return;
    try {
      const updated = await profileApi.update(update);
      updateUser(updated);
      form.reset(profileFormValues(updated));
      if (update.email) {
        toast.success('Email updated', {
          description: `We sent a confirmation link to ${updated.email}.`,
        });
      } else {
        toast.success('Profile updated');
      }
    } catch (error) {
      if (isApiError(error, ErrorCode.PASSWORD_NOT_SET)) {
        form.setError(ROOT_SERVER_ERROR, {
          type: error.code,
          message: 'Set a password in Security before changing your email.',
        });
        return;
      }
      applyServerErrors(form, error, { codeFields: CONFLICT_FIELDS });
    }
  });

  return (
    <ProfileCard title="Personal information" description="This is how you appear in TaskFlow.">
      <form
        noValidate
        onSubmit={onSubmit}
        aria-label="Personal information"
        className="flex flex-col gap-4"
      >
        {errors.root?.server ? (
          <Alert
            variant={errors.root.server.type === ErrorCode.RATE_LIMITED ? 'warning' : 'danger'}
          >
            {errors.root.server.message}
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
          <FormField label="First name" error={errors.firstName?.message}>
            <Input autoComplete="given-name" {...form.register('firstName')} />
          </FormField>
          <FormField label="Last name" error={errors.lastName?.message}>
            <Input autoComplete="family-name" {...form.register('lastName')} />
          </FormField>
        </div>

        <FormField
          label="Username"
          error={errors.username?.message}
          hint="3–30 characters: letters, numbers, dots and underscores."
        >
          <Input
            startIcon={<AtSign />}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            {...form.register('username')}
          />
        </FormField>

        <FormField
          label="Email"
          error={errors.email?.message}
          hint={
            user.hasPassword ? undefined : (
              <>
                You signed up with Google or GitHub.{' '}
                <Link
                  to={profileTabHref('security')}
                  className="rounded-sm font-bold text-primary hover:underline"
                >
                  Set a password
                </Link>{' '}
                to change your email.
              </>
            )
          }
        >
          <Input
            type="email"
            startIcon={<Mail />}
            endSlot={
              user.hasPassword ? undefined : (
                <LockKeyhole aria-hidden="true" className="mr-2 size-4 text-muted-foreground" />
              )
            }
            autoComplete="email"
            spellCheck={false}
            readOnly={!user.hasPassword}
            wrapperClassName={user.hasPassword ? undefined : 'opacity-75'}
            {...form.register('email')}
          />
        </FormField>

        {needsPassword ? (
          <FormField
            label="Current password"
            labelHint="Required to change your email"
            error={errors.currentPassword?.message}
            className="animate-in duration-200 fade-in-0 slide-in-from-top-1"
          >
            <PasswordInput
              autoComplete="current-password"
              placeholder="Enter your current password"
              {...form.register('currentPassword')}
            />
          </FormField>
        ) : null}

        <div className="mt-1 flex flex-wrap items-center justify-end gap-2.5">
          {changes ? (
            <p
              className="mr-auto text-[12.5px] font-semibold text-muted-foreground"
              aria-live="polite"
            >
              Unsaved changes
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            disabled={!changes || isSubmitting}
            onClick={() => form.reset(profileFormValues(user))}
          >
            Discard
          </Button>
          <Button type="submit" disabled={!changes} loading={isSubmitting}>
            Save changes
          </Button>
        </div>
      </form>
    </ProfileCard>
  );
}
