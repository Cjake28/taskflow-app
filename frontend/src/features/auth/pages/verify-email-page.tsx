import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ErrorCode } from '@taskflow/shared';
import { Clock, Link2Off, LoaderCircle, MailCheck } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { IconArt } from '@/components/common/icon-art';
import { AuthLayout } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { ApiError, getErrorMessage } from '@/lib/api-client';

import { authApi } from '../api';
import { authKeys } from '../hooks';
import { useAuth } from '../use-auth';

type LinkProblem = 'expired' | 'invalid';

function linkProblemOf(error: unknown): LinkProblem | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === ErrorCode.VERIFICATION_TOKEN_EXPIRED) return 'expired';
  if (
    error.code === ErrorCode.INVALID_VERIFICATION_TOKEN ||
    error.code === ErrorCode.VALIDATION_ERROR
  ) {
    return 'invalid';
  }
  return null;
}

/** "Send a new link" when signed in; otherwise the user logs in first (resending needs a session). */
function NewLinkAction() {
  const { status } = useAuth();
  const resend = useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: () => toast.success('A new confirmation link is on its way. Check your inbox.'),
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (status !== 'authenticated') {
    return (
      <Button asChild>
        <Link to="/login?redirect=%2Fprofile">Log in to get a new link</Link>
      </Button>
    );
  }
  return (
    <Button loading={resend.isPending} onClick={() => resend.mutate()}>
      Send a new link
    </Button>
  );
}

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { status, user, updateUser } = useAuth();
  // Read once, then strip it from the address bar (and so from history and referrers).
  const [token] = useState(() => searchParams.get('token')?.trim() ?? '');

  useEffect(() => {
    if (searchParams.has('token')) void navigate('/verify-email', { replace: true });
  }, [navigate, searchParams]);

  const verify = useQuery({
    queryKey: authKeys.verifyEmail(token),
    queryFn: async () => {
      await authApi.verifyEmail(token);
      return true;
    },
    enabled: token !== '',
    // The token is single-use: never repeat the request.
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (verify.isSuccess && user && !user.emailVerified)
      updateUser({ ...user, emailVerified: true });
  }, [verify.isSuccess, user, updateUser]);

  const problem: LinkProblem | null = token === '' ? 'invalid' : linkProblemOf(verify.error);

  let content;
  if (problem) {
    const expired = problem === 'expired';
    content = (
      <EmptyState
        icon={expired ? Clock : Link2Off}
        tint="var(--danger)"
        size="sm"
        title={expired ? 'This link has expired' : 'This link is invalid or has already been used'}
        description={
          expired
            ? 'Confirmation links are valid for 24 hours.'
            : 'Use the most recent confirmation email we sent you.'
        }
        action={<NewLinkAction />}
      />
    );
  } else if (verify.isPending) {
    content = (
      <div
        role="status"
        className="flex items-center gap-3 rounded-card bg-card px-6 py-8 text-sm font-semibold text-muted-foreground shadow-card"
      >
        <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
        Confirming your email…
      </div>
    );
  } else if (verify.isError) {
    content = (
      <ErrorState
        title="We couldn't confirm your email"
        error={verify.error}
        onRetry={() => void verify.refetch()}
        retrying={verify.isFetching}
      />
    );
  } else {
    content = (
      <EmptyState
        icon={MailCheck}
        tint="var(--status-done)"
        size="sm"
        sparkles
        title="Email confirmed"
        description="Thanks! Your email address is confirmed."
        action={
          <Button asChild>
            <Link to={status === 'authenticated' ? '/dashboard' : '/login'}>
              {status === 'authenticated' ? 'Go to dashboard' : 'Log in'}
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <AuthLayout
      heading="Confirm your email."
      text="Confirming your address makes sure password reset links and account notices reach you."
      visual={<IconArt icon={MailCheck} size="lg" onBrand sparkles />}
      visualPlacement="center"
    >
      <title>Confirm email · TaskFlow</title>
      <meta name="referrer" content="no-referrer" />
      {content}
    </AuthLayout>
  );
}
