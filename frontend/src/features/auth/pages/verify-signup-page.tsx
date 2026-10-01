import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ErrorCode, SIGNUP_OTP_LENGTH } from '@taskflow/shared';
import { ArrowLeft, Clock, MailCheck, ShieldAlert } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';

import { Alert } from '@/components/common/alert';
import { EmptyState } from '@/components/common/empty-state';
import { IconArt } from '@/components/common/icon-art';
import { OtpInput, type OtpInputHandle } from '@/components/common/otp-input';
import { AuthHeading, AuthLayout } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { getErrorMessage, isApiError } from '@/lib/api-client';

import { authApi } from '../api';
import {
  clearPendingSignup,
  loadPendingSignup,
  savePendingSignup,
  type PendingSignup,
} from '../pending-signup';
import { sanitizeRedirect, withRedirect } from '../redirect';
import { useAuth } from '../use-auth';

/** Seconds until `iso`, never negative. */
function secondsUntil(iso: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000));
}

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

type Problem = 'expired' | 'locked';

/** Sign-up step 2: the code emailed in step 1 creates the account. */
export function VerifySignupPage() {
  const { verifyRegistration } = useAuth();
  const [searchParams] = useSearchParams();
  const redirect = sanitizeRedirect(searchParams.get('redirect'));
  const [pending, setPending] = useState<PendingSignup | null>(() => loadPendingSignup());
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const now = useNow();
  const otpRef = useRef<OtpInputHandle>(null);

  // The boxes are disabled while checking; give focus back so the user can retype at once.
  useEffect(() => {
    if (error && !submitting) otpRef.current?.focus();
  }, [error, submitting]);

  if (!pending) return <Navigate to={withRedirect('/register', redirect)} replace />;

  const resendIn = secondsUntil(pending.resendAvailableAt, now);
  const codeExpired = secondsUntil(pending.expiresAt, now) === 0;
  const restartHref = withRedirect('/register', redirect);

  const submit = async (value: string) => {
    if (submitting || value.length !== SIGNUP_OTP_LENGTH) return;
    setSubmitting(true);
    setError(null);
    try {
      await verifyRegistration(pending.registrationId, value);
      clearPendingSignup();
      toast.success(`Welcome to TaskFlow, ${pending.firstName}!`, {
        description: 'Your email is confirmed and your account is ready.',
      });
      // The public-only guard now sends the signed-in user on to the app.
    } catch (err) {
      setCode('');
      if (isApiError(err, ErrorCode.OTP_EXPIRED)) setProblem('expired');
      else if (isApiError(err, ErrorCode.OTP_ATTEMPTS_EXCEEDED)) {
        clearPendingSignup();
        setProblem('locked');
      } else setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    try {
      const next = await authApi.resendRegistrationCode(pending.registrationId);
      const updated = { ...pending, ...next };
      savePendingSignup(updated);
      setPending(updated);
      setProblem(null);
      setCode('');
      toast.success('New code sent', { description: `Check ${pending.email}.` });
    } catch (err) {
      if (
        isApiError(err, ErrorCode.OTP_EXPIRED) ||
        isApiError(err, ErrorCode.OTP_ATTEMPTS_EXCEEDED)
      ) {
        clearPendingSignup();
        setProblem('locked');
      } else setError(getErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit(code);
  };

  let content;
  if (problem === 'locked') {
    content = (
      <EmptyState
        icon={ShieldAlert}
        tint="var(--danger)"
        size="sm"
        title="This sign-up was cancelled"
        description="Too many incorrect codes or too much time passed. Your details were not saved, so please start again."
        action={
          <Button asChild>
            <Link to={restartHref}>Start again</Link>
          </Button>
        }
      />
    );
  } else {
    const showExpired = problem === 'expired' || codeExpired;
    content = (
      <>
        <AuthHeading
          title="Check your email"
          subtitle={
            <>
              We sent a {SIGNUP_OTP_LENGTH}-digit code to{' '}
              <span className="font-bold wrap-anywhere text-foreground">{pending.email}</span>.
              Enter it to create your account.
            </>
          }
        />
        <form
          noValidate
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
          aria-label="Confirm your email"
        >
          {showExpired ? (
            <Alert variant="warning" icon={Clock}>
              This code has expired. Send yourself a new one below.
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="danger" id="signup-code-error">
              {error}
            </Alert>
          ) : null}

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
            disabled={submitting || showExpired}
            describedBy={error ? 'signup-code-error' : undefined}
            autoFocus
          />

          <Button
            type="submit"
            size="lg"
            className="mt-1 w-full"
            loading={submitting}
            disabled={code.length !== SIGNUP_OTP_LENGTH || showExpired}
          >
            Verify and create account
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Didn&apos;t get it? Check your spam folder or{' '}
            {resendIn > 0 ? (
              <span className="font-semibold tabular-nums">
                resend in {Math.floor(resendIn / 60)}:{String(resendIn % 60).padStart(2, '0')}
              </span>
            ) : (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 align-baseline text-sm font-bold"
                loading={resending}
                onClick={() => void resend()}
              >
                send a new code
              </Button>
            )}
          </p>
        </form>
      </>
    );
  }

  return (
    <AuthLayout
      heading="One last step."
      text="Confirming your email keeps your account yours, and makes sure password reset links reach you."
      visual={<IconArt icon={MailCheck} size="lg" onBrand />}
      visualPlacement="center"
    >
      <title>Confirm your email · TaskFlow</title>
      <Link
        to={restartHref}
        className="mb-6 inline-flex items-center gap-1.5 rounded-md text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Use a different email
      </Link>
      {content}
    </AuthLayout>
  );
}
