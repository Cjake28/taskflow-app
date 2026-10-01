import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ErrorCode, forgotPasswordSchema } from '@taskflow/shared';
import { ArrowLeft, Clock, Mail, MailCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { Alert } from '@/components/common/alert';
import { FormField } from '@/components/common/form-field';
import { IconArt } from '@/components/common/icon-art';
import { AuthHeading, AuthLayout } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isApiError } from '@/lib/api-client';
import { applyServerErrors, ROOT_SERVER_ERROR } from '@/lib/form-errors';

import { authApi } from '../api';

function BackToLogin() {
  return (
    <Link
      to="/login"
      className="mb-6 inline-flex items-center gap-1.5 rounded-md text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to login
    </Link>
  );
}

/** Confirmation with identical wording for every address (no account enumeration, spec §8.2). */
function CheckYourEmail({ email, onReset }: { email: string; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-card bg-card px-6 py-9 text-center shadow-card">
      <IconArt icon={MailCheck} tint="var(--status-done)" size="sm" className="mb-4" />
      <h1 className="text-xl font-extrabold">Check your email</h1>
      <p role="status" className="mt-2 max-w-[320px] text-sm leading-relaxed text-muted-foreground">
        If an account exists for <b className="font-bold wrap-anywhere text-foreground">{email}</b>,
        we&apos;ve sent reset instructions. The link expires in 30 minutes.
      </p>
      <div className="mt-6 flex w-full flex-col gap-2.5">
        <Button asChild size="lg">
          <Link to="/login">Back to login</Link>
        </Button>
        <Button variant="ghost" onClick={onReset}>
          Use a different email
        </Button>
      </div>
      <p className="mt-5 text-[12.5px] leading-relaxed text-muted-foreground">
        Nothing after a few minutes? Check your spam folder, then try again.
      </p>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const serverError = errors.root?.server;

  const onSubmit = form.handleSubmit(async ({ email }) => {
    try {
      await authApi.forgotPassword(email);
      setSentTo(email);
    } catch (error) {
      if (isApiError(error, ErrorCode.NOT_FOUND)) {
        form.setError(ROOT_SERVER_ERROR, {
          type: ErrorCode.NOT_FOUND,
          message: "Password reset isn't available right now. Please try again later.",
        });
        return;
      }
      applyServerErrors(form, error);
    }
  });

  return (
    <AuthLayout
      heading="Locked out? It happens."
      text="We'll email you a secure link to set a new password. It works once and expires in 30 minutes."
      visual={<IconArt icon={Mail} size="lg" onBrand sparkles />}
      visualPlacement="center"
    >
      <title>Forgot password · TaskFlow</title>
      <BackToLogin />

      {sentTo ? (
        <CheckYourEmail
          email={sentTo}
          onReset={() => {
            setSentTo(null);
            form.reset({ email: '' });
          }}
        />
      ) : (
        <>
          <AuthHeading
            title="Forgot your password?"
            subtitle="Enter the email you signed up with and we'll send you a reset link."
          />
          <form
            noValidate
            onSubmit={onSubmit}
            className="flex flex-col gap-4"
            aria-label="Request a password reset link"
          >
            {serverError ? (
              <Alert
                variant={serverError.type === ErrorCode.RATE_LIMITED ? 'warning' : 'danger'}
                icon={serverError.type === ErrorCode.RATE_LIMITED ? Clock : undefined}
              >
                {serverError.message}
              </Alert>
            ) : null}

            <FormField label="Email" error={errors.email?.message}>
              <Input
                type="email"
                startIcon={<Mail />}
                autoComplete="email"
                spellCheck={false}
                placeholder="you@example.com"
                {...form.register('email')}
              />
            </FormField>

            <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
              Send reset link
            </Button>

            <p className="mt-1 text-center text-sm text-muted-foreground">
              Remembered it?{' '}
              <Link to="/login" className="rounded-sm font-bold text-primary hover:underline">
                Log in
              </Link>
            </p>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
