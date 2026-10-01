import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ErrorCode,
  FIELD_LIMITS,
  nameSchema,
  usernameSchema,
  type UserDto,
} from '@taskflow/shared';
import { AtSign, LockKeyhole, Mail, MailCheck, MailWarning } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';

import { Alert } from '@/components/common/alert';
import { FormField } from '@/components/common/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/use-auth';
import { applyServerErrors } from '@/lib/form-errors';

import { profileApi } from '../api';
import { usePendingEmailChange } from '../hooks';
import { buildProfileUpdate, profileFormValues, type ProfileFormValues } from '../lib/profile-diff';
import { profileTabHref } from '../lib/profile-tabs';
import { ChangeEmailDialog } from './change-email-dialog';
import { ProfileCard } from './profile-card';

const accountSchema = z.object({
  firstName: nameSchema('First name', FIELD_LIMITS.firstName.max),
  lastName: nameSchema('Last name', FIELD_LIMITS.lastName.max),
  username: usernameSchema,
});

const CONFLICT_FIELDS = { [ErrorCode.USERNAME_TAKEN]: 'username' };

/** The email, with its own confirmed change flow (a code is sent to the new address). */
function EmailRow({ user }: { user: UserDto }) {
  const pending = usePendingEmailChange();
  const [open, setOpen] = useState(false);
  const waiting = pending.data ?? null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-bold">Email</span>
      <div className="flex min-h-12 items-center gap-2.5 rounded-input bg-fill px-3.5">
        <Mail aria-hidden="true" className="size-[18px] shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 text-sm wrap-anywhere">{user.email}</span>
        {user.emailVerified ? (
          <MailCheck
            aria-label="Verified"
            className="size-4 shrink-0 text-[color-mix(in_oklab,var(--status-done)_85%,var(--foreground))]"
          />
        ) : null}
        {user.hasPassword ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="-mr-1.5 h-8"
            aria-label="Change email"
            onClick={() => setOpen(true)}
          >
            Change
          </Button>
        ) : (
          <LockKeyhole aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        )}
      </div>
      {user.hasPassword ? null : (
        <p className="text-[12.5px] text-muted-foreground">
          You signed up with Google or GitHub.{' '}
          <Link
            to={profileTabHref('security')}
            className="rounded-sm font-bold text-primary hover:underline"
          >
            Set a password
          </Link>{' '}
          to change your email.
        </p>
      )}
      {waiting ? (
        <Alert variant="info" icon={MailWarning}>
          <span>
            Waiting for the code sent to{' '}
            <span className="font-extrabold wrap-anywhere">{waiting.email}</span>.{' '}
          </span>
          <button
            type="button"
            className="cursor-pointer rounded-sm font-extrabold underline-offset-2 hover:underline"
            onClick={() => setOpen(true)}
          >
            Enter code
          </button>
        </Alert>
      ) : null}
      <ChangeEmailDialog user={user} open={open} onOpenChange={setOpen} pending={waiting} />
    </div>
  );
}

/** Personal information: only changed fields are sent. */
export function AccountForm({ user }: { user: UserDto }) {
  const { updateUser } = useAuth();
  const form = useForm({
    resolver: zodResolver(accountSchema),
    mode: 'onTouched',
    defaultValues: profileFormValues(user),
  });
  const { errors, isSubmitting } = form.formState;

  const watched = useWatch({ control: form.control });
  // The shared username schema pre-processes its input, so RHF types the value loosely.
  const text = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback);
  const current: ProfileFormValues = {
    firstName: text(watched.firstName, user.firstName),
    lastName: text(watched.lastName, user.lastName),
    username: text(watched.username, user.username),
  };
  const changes = buildProfileUpdate(user, current);

  const onSubmit = form.handleSubmit(async (values) => {
    const update = buildProfileUpdate(user, values);
    if (!update) return;
    try {
      const updated = await profileApi.update(update);
      updateUser(updated);
      form.reset(profileFormValues(updated));
      toast.success('Profile updated');
    } catch (error) {
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

        <EmailRow user={user} />

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
