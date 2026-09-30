import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ErrorCode, resetPasswordSchema } from '@taskflow/shared';
import { ArrowLeft, Clock, KeyRound, Link2Off, LoaderCircle } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { Alert } from '@/components/common/alert';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { FormField } from '@/components/common/form-field';
import { IconArt } from '@/components/common/icon-art';
import { PasswordInput } from '@/components/common/password-input';
import { PasswordStrength } from '@/components/common/password-strength';
import { AuthHeading, AuthLayout } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { ApiError, isApiError } from '@/lib/api-client';
import { applyServerErrors } from '@/lib/form-errors';

import { authApi } from '../api';
import { authKeys } from '../hooks';
import { useAuth } from '../use-auth';

type LinkProblem = 'expired' | 'invalid';

function linkProblemOf(error: unknown): LinkProblem | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === ErrorCode.RESET_TOKEN_EXPIRED) return 'expired';
  if (error.code === ErrorCode.INVALID_RESET_TOKEN || error.code === ErrorCode.VALIDATION_ERROR) {
    return 'invalid';
  }
  return null;
}

function LinkProblemState({ problem }: { problem: LinkProblem }) {
  const expired = problem === 'expired';
  return (
    <EmptyState
      icon={expired ? Clock : Link2Off}
      tint="var(--danger)"
      size="sm"
      headingLevel="h2"
      title={expired ? 'This link has expired' : 'This link is invalid or has already been used'}
      description={
        expired
          ? 'Reset links are valid for 30 minutes and can only be used once.'
          : 'Request a new link and use the most recent email we send you.'
      }
      action={
        <Button asChild>
          <Link to="/forgot-password">{expired ? 'Send a new link' : 'Request a new link'}</Link>
        </Button>
      }
    />
  );
}

function ResetForm({
  token,
  onLinkProblem,
}: {
  token: string;
  onLinkProblem: (problem: LinkProblem) => void;
}) {
  const navigate = useNavigate();
  const { status, clearSession } = useAuth();
  const form = useForm({
    // The token rides along as an unregistered value so the shared schema validates the whole body.
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onTouched',
    defaultValues: { token, password: '', confirmPassword: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const password = useWatch({ control: form.control, name: 'password' });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await authApi.resetPassword(values);
      // Every session was revoked server-side; drop any local one too.
      if (status === 'authenticated') clearSession('logout');
      await navigate('/login?reset=success', { replace: true });
    } catch (error) {
      const problem = linkProblemOf(error);
      if (problem && !(isApiError(error, ErrorCode.VALIDATION_ERROR) && error.details.length > 0)) {
        onLinkProblem(problem);
        return;
      }
      applyServerErrors(form, error);
    }
  });

  return (
    <>
      <AuthHeading
        title="Set a new password"
        subtitle="Make it strong. You'll use it to log in from now on."
      />
      <form
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
        aria-label="Set a new password"
      >
        {errors.root?.server ? <Alert variant="danger">{errors.root.server.message}</Alert> : null}

        <FormField
          label="New password"
          error={errors.password?.message}
          describedBy="reset-password-strength"
          after={<PasswordStrength id="reset-password-strength" password={password} />}
        >
          <PasswordInput autoComplete="new-password" autoFocus {...form.register('password')} />
        </FormField>

        <FormField label="Confirm new password" error={errors.confirmPassword?.message}>
          <PasswordInput autoComplete="new-password" {...form.register('confirmPassword')} />
        </FormField>

        <Button type="submit" size="lg" className="mt-1 w-full" loading={isSubmitting}>
          Reset password
        </Button>
      </form>
    </>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // Read once, then strip it from the address bar (and so from history and referrers).
  const [token] = useState(() => searchParams.get('token')?.trim() ?? '');
  const [submitProblem, setSubmitProblem] = useState<LinkProblem | null>(null);

  useEffect(() => {
    if (searchParams.has('token')) void navigate('/reset-password', { replace: true });
  }, [navigate, searchParams]);

  const verify = useQuery({
    queryKey: authKeys.resetToken(token),
    queryFn: async () => {
      await authApi.verifyResetToken(token);
      return true;
    },
    enabled: token !== '',
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const problem: LinkProblem | null =
    submitProblem ?? (token === '' ? 'invalid' : linkProblemOf(verify.error));

  let content;
  if (problem) {
    content = <LinkProblemState problem={problem} />;
  } else if (verify.isPending) {
    content = (
      <div
        role="status"
        className="flex items-center gap-3 rounded-card bg-card px-6 py-8 text-sm font-semibold text-muted-foreground shadow-card"
      >
        <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
        Checking your reset link…
      </div>
    );
  } else if (verify.isError) {
    content = (
      <ErrorState
        title="We couldn't check this link"
        error={verify.error}
        onRetry={() => void verify.refetch()}
        retrying={verify.isFetching}
      />
    );
  } else {
    content = <ResetForm token={token} onLinkProblem={setSubmitProblem} />;
  }

  return (
    <AuthLayout
      heading="Choose a new password."
      text="Once it's reset, every device signed in to your account is logged out, including anyone who shouldn't be there."
      visual={<IconArt icon={KeyRound} size="lg" onBrand sparkles />}
      visualPlacement="center"
    >
      <title>Reset password · TaskFlow</title>
      <meta name="referrer" content="no-referrer" />
      <Link
        to="/login"
        className="mb-6 inline-flex items-center gap-1.5 rounded-md text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to login
      </Link>
      {content}
    </AuthLayout>
  );
}
