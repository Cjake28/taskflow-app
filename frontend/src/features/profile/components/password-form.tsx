import { useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  ErrorCode,
  changePasswordSchema,
  containsPersonalInfo,
  type ChangePasswordInput,
  type UserDto,
} from '@taskflow/shared';
import { Check } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { Alert } from '@/components/common/alert';
import { FormField } from '@/components/common/form-field';
import { PasswordInput } from '@/components/common/password-input';
import { PasswordStrength } from '@/components/common/password-strength';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/use-auth';
import { applyServerErrors } from '@/lib/form-errors';
import { queryKeys } from '@/lib/query-keys';

import { profileApi } from '../api';
import { ProfileCard } from './profile-card';

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' };
/* Without a current-password value, a server error about it becomes a visible form-level error. */
const EMPTY_FIRST = { newPassword: '', confirmPassword: '' };

/**
 * The shared schema, plus two rules that depend on the account: the current password is
 * required once a password exists, and the new one must not contain the username or email.
 */
function passwordSchema(user: Pick<UserDto, 'hasPassword' | 'username' | 'email'>) {
  return changePasswordSchema.superRefine((data, ctx) => {
    if (user.hasPassword && !data.currentPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['currentPassword'],
        message: 'Enter your current password',
      });
    }
    if (containsPersonalInfo(data.newPassword, user)) {
      ctx.addIssue({
        code: 'custom',
        path: ['newPassword'],
        message: 'Password must not contain your username or email',
      });
    }
  });
}

/** Change password, or set a first one for accounts created with Google or GitHub. */
export function PasswordForm({ user }: { user: UserDto }) {
  const { updateUser } = useAuth();
  const queryClient = useQueryClient();
  const settingFirst = !user.hasPassword;
  const schema = useMemo(() => passwordSchema(user), [user]);
  const empty: ChangePasswordInput = settingFirst ? EMPTY_FIRST : EMPTY;
  const form = useForm({ resolver: zodResolver(schema), mode: 'onTouched', defaultValues: empty });
  const { errors, isSubmitting } = form.formState;
  const [newPassword, confirmPassword] = useWatch({
    control: form.control,
    name: ['newPassword', 'confirmPassword'],
  });
  const confirmed = Boolean(confirmPassword) && confirmPassword === newPassword;

  const onSubmit = form.handleSubmit(async (values) => {
    const body: ChangePasswordInput = {
      newPassword: values.newPassword,
      confirmPassword: values.confirmPassword,
      ...(settingFirst ? {} : { currentPassword: values.currentPassword }),
    };
    try {
      await profileApi.changePassword(body);
      form.reset(empty);
      if (settingFirst) {
        updateUser({ ...user, hasPassword: true });
        toast.success('Password set', {
          description: 'You can now log in with your email or username too.',
        });
      } else {
        toast.success('Password updated', {
          description: "Other devices were signed out. You're still signed in here.",
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.account.sessions() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.account.linkedAccounts() }),
      ]);
    } catch (error) {
      applyServerErrors(form, error, {
        codeFields: { [ErrorCode.INVALID_CURRENT_PASSWORD]: 'currentPassword' },
      });
    }
  });

  return (
    <ProfileCard
      title={settingFirst ? 'Set a password' : 'Change password'}
      description={
        settingFirst
          ? 'Add a password to also log in with your email or username, and to change your email.'
          : "Other devices will be signed out. You'll stay signed in here."
      }
    >
      <form
        noValidate
        onSubmit={onSubmit}
        aria-label={settingFirst ? 'Set a password' : 'Change password'}
        className="flex flex-col gap-4"
      >
        {errors.root?.server ? (
          <Alert
            variant={errors.root.server.type === ErrorCode.RATE_LIMITED ? 'warning' : 'danger'}
          >
            {errors.root.server.message}
          </Alert>
        ) : null}

        {settingFirst ? null : (
          <FormField label="Current password" error={errors.currentPassword?.message}>
            <PasswordInput autoComplete="current-password" {...form.register('currentPassword')} />
          </FormField>
        )}

        <FormField
          label="New password"
          error={errors.newPassword?.message}
          describedBy="profile-password-strength"
          after={<PasswordStrength id="profile-password-strength" password={newPassword ?? ''} />}
        >
          <PasswordInput autoComplete="new-password" {...form.register('newPassword')} />
        </FormField>

        <FormField
          label="Confirm new password"
          error={errors.confirmPassword?.message}
          after={
            confirmed && !errors.confirmPassword ? (
              <p className="mt-[7px] flex items-center gap-1.5 text-[12.5px] font-semibold text-[color-mix(in_oklab,var(--status-done)_85%,var(--foreground))]">
                <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                Passwords match
              </p>
            ) : null
          }
        >
          <PasswordInput
            autoComplete="new-password"
            wrapperClassName={
              confirmed && !errors.confirmPassword
                ? 'border-[color-mix(in_oklab,var(--status-done)_60%,transparent)]'
                : undefined
            }
            {...form.register('confirmPassword')}
          />
        </FormField>

        <div className="mt-1 flex justify-end">
          <Button type="submit" loading={isSubmitting}>
            {settingFirst ? 'Set password' : 'Update password'}
          </Button>
        </div>
      </form>
    </ProfileCard>
  );
}
