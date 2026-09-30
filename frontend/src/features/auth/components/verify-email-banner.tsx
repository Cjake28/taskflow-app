import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MailWarning, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/api-client';

import { authApi } from '../api';
import { useCurrentUser } from '../use-auth';

const dismissKey = (userId: string) => `tf-verify-banner-dismissed:${userId}`;

function wasDismissed(userId: string): boolean {
  try {
    return sessionStorage.getItem(dismissKey(userId)) === '1';
  } catch {
    return false;
  }
}

/** Reminder for unverified email addresses; dismissible for the browser session. */
export function VerifyEmailBanner() {
  const user = useCurrentUser();
  const [dismissed, setDismissed] = useState(() => wasDismissed(user.id));
  const resend = useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: () => toast.success(`We sent a new link to ${user.email}.`),
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (user.emailVerified || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(dismissKey(user.id), '1');
    } catch {
      // Storage unavailable: the banner simply comes back on reload.
    }
  };

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card bg-[color-mix(in_oklab,var(--status-progress)_12%,var(--card))] px-4 py-3 text-[13.5px] font-semibold shadow-card"
    >
      <MailWarning className="size-5 shrink-0 text-status-progress" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        Confirm your email address. We sent a link to{' '}
        <span className="font-extrabold break-all">{user.email}</span>.
      </p>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="outline"
          loading={resend.isPending}
          onClick={() => resend.mutate()}
        >
          Resend link
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={dismiss}>
          <X />
        </Button>
      </div>
    </div>
  );
}
