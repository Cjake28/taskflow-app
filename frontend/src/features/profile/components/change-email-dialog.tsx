import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  ErrorCode,
  FIELD_LIMITS,
  SIGNUP_OTP_LENGTH,
  emailSchema,
  type PendingEmailChangeDto,
  type UserDto,
} from '@taskflow/shared';
import { ArrowLeft, Mail, MailCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { Alert } from '@/components/common/alert';
import { FormField } from '@/components/common/form-field';
import { OtpInput, type OtpInputHandle } from '@/components/common/otp-input';
import { PasswordInput } from '@/components/common/password-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth/use-auth';
import { getErrorMessage, isApiError } from '@/lib/api-client';
import { applyServerErrors } from '@/lib/form-errors';
import { queryKeys } from '@/lib/query-keys';

import { profileApi } from '../api';

function requestSchema(currentEmail: string) {
  return z
    .object({
      email: emailSchema,
      currentPassword: z
        .string()
        .min(1, 'Enter your current password to change your email')
        .max(FIELD_LIMITS.password.max),
    })
    .refine((data) => data.email !== currentEmail, {
      path: ['email'],
      message: 'This is already your email',
    });
}

function useCountdown(until: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  return until ? Math.max(0, Math.ceil((Date.parse(until) - now) / 1000)) : 0;
}

/** Step 1: new address + current password. */
function RequestStep({
  user,
  onSent,
}: {
  user: UserDto;
  onSent: (pending: PendingEmailChangeDto) => void;
}) {
  const form = useForm({
    resolver: zodResolver(requestSchema(user.email)),
    mode: 'onTouched',
    defaultValues: { email: '', currentPassword: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      onSent(await profileApi.startEmailChange(values));
    } catch (error) {
      applyServerErrors(form, error, {
        codeFields: {
          [ErrorCode.EMAIL_TAKEN]: 'email',
          [ErrorCode.INVALID_CURRENT_PASSWORD]: 'currentPassword',
        },
      });
    }
  });

  return (
    <form
      noValidate
      // The dialog is portalled out of the Account form, but React still bubbles events
      // through the component tree; keep this submit from reaching the outer form.
      onSubmit={(event) => {
        event.stopPropagation();
        void onSubmit(event);
      }}
      aria-label="New email"
      className="flex flex-col gap-4"
    >
      {errors.root?.server ? <Alert variant="danger">{errors.root.server.message}</Alert> : null}
      <FormField label="New email" error={errors.email?.message}>
        <Input
          type="email"
          startIcon={<Mail />}
          autoComplete="email"
          spellCheck={false}
          autoFocus
          placeholder="you@example.com"
          {...form.register('email')}
        />
      </FormField>
      <FormField
        label="Current password"
        labelHint="To confirm it's you"
        error={errors.currentPassword?.message}
      >
        <PasswordInput autoComplete="current-password" {...form.register('currentPassword')} />
      </FormField>
      <DialogFooter>
        <Button type="submit" loading={isSubmitting}>
          Send code
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Step 2: the code sent to the new address. */
function CodeStep({
  pending,
  onPendingChange,
  onBack,
  onDone,
}: {
  pending: PendingEmailChangeDto;
  onPendingChange: (pending: PendingEmailChangeDto) => void;
  onBack: () => void;
  onDone: (user: UserDto) => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const otpRef = useRef<OtpInputHandle>(null);
  const resendIn = useCountdown(pending.resendAvailableAt);

  useEffect(() => {
    if (error && !submitting) otpRef.current?.focus();
  }, [error, submitting]);

  const submit = async (value: string) => {
    if (submitting || value.length !== SIGNUP_OTP_LENGTH) return;
    setSubmitting(true);
    setError(null);
    try {
      onDone(await profileApi.verifyEmailChange(value));
    } catch (err) {
      setCode('');
      if (
        isApiError(err, ErrorCode.OTP_EXPIRED) ||
        isApiError(err, ErrorCode.OTP_ATTEMPTS_EXCEEDED)
      ) {
        setCancelled(true);
      }
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    try {
      onPendingChange(await profileApi.resendEmailChange());
      setCancelled(false);
      setCode('');
      toast.success('New code sent', { description: `Check ${pending.email}.` });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <Alert variant={cancelled ? 'warning' : 'danger'} id="email-change-code-error">
          {error}
        </Alert>
      ) : null}
      {cancelled ? (
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Start again
        </Button>
      ) : (
        <>
          <OtpInput
            ref={otpRef}
            label="Verification code"
            value={code}
            onChange={(value) => {
              setCode(value);
              if (error) setError(null);
            }}
            onComplete={(value) => void submit(value)}
            invalid={error !== null}
            disabled={submitting}
            describedBy={error ? 'email-change-code-error' : undefined}
            autoFocus
          />
          <p className="text-center text-sm text-muted-foreground">
            Didn&apos;t get it?{' '}
            {resendIn > 0 ? (
              <span className="font-semibold tabular-nums">
                Resend in {Math.floor(resendIn / 60)}:{String(resendIn % 60).padStart(2, '0')}
              </span>
            ) : (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 align-baseline text-sm font-bold"
                loading={resending}
                onClick={() => void resend()}
              >
                Send a new code
              </Button>
            )}
          </p>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onBack} disabled={submitting}>
              Use a different email
            </Button>
            <Button
              type="button"
              loading={submitting}
              disabled={code.length !== SIGNUP_OTP_LENGTH}
              onClick={() => void submit(code)}
            >
              <MailCheck aria-hidden="true" />
              Confirm email
            </Button>
          </DialogFooter>
        </>
      )}
    </div>
  );
}

export interface ChangeEmailDialogProps {
  user: UserDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A change already waiting for its code: the dialog opens on the code step. */
  pending: PendingEmailChangeDto | null;
}

/** Dialog content mounts on every open, so its state starts from what the server has pending. */
function ChangeEmailBody({
  user,
  pending,
  onClose,
}: {
  user: UserDto;
  pending: PendingEmailChangeDto | null;
  onClose: () => void;
}) {
  const { updateUser } = useAuth();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState<PendingEmailChangeDto | null>(pending);

  const setPending = (next: PendingEmailChangeDto | null) => {
    setCurrent(next);
    queryClient.setQueryData(queryKeys.account.emailChange(), next);
  };

  const backToRequest = () => {
    setPending(null);
    void profileApi.cancelEmailChange().catch(() => undefined);
  };

  const done = (updated: UserDto) => {
    updateUser(updated);
    setPending(null);
    onClose();
    toast.success('Email changed', {
      description: `You'll now sign in with ${updated.email}. We let your old address know.`,
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{current ? 'Check your new inbox' : 'Change your email'}</DialogTitle>
        <DialogDescription>
          {current ? (
            <>
              We sent a {SIGNUP_OTP_LENGTH}-digit code to{' '}
              <span className="font-bold wrap-anywhere text-foreground">{current.email}</span>. Your
              email changes once you enter it.
            </>
          ) : (
            <>
              We&apos;ll send a code to the new address to make sure it&apos;s yours. Until then you
              keep using <span className="font-bold text-foreground">{user.email}</span>.
            </>
          )}
        </DialogDescription>
      </DialogHeader>
      {current ? (
        <CodeStep
          pending={current}
          onPendingChange={setPending}
          onBack={backToRequest}
          onDone={done}
        />
      ) : (
        <RequestStep user={user} onSent={setPending} />
      )}
    </>
  );
}

export interface ChangeEmailDialogProps {
  user: UserDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A change already waiting for its code: the dialog opens on the code step. */
  pending: PendingEmailChangeDto | null;
}

/**
 * Two steps: the new address and current password, then the code sent to that address.
 * The email only changes once the code is confirmed.
 */
export function ChangeEmailDialog({ user, open, onOpenChange, pending }: ChangeEmailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <ChangeEmailBody user={user} pending={pending} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
