import { useQuery } from '@tanstack/react-query';
import { ErrorCode } from '@taskflow/shared';
import { Link2Off, Loader2, MailCheck, MailX, Settings2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';

import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { IconArt } from '@/components/common/icon-art';
import { AuthLayout } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

import { notificationsApi } from '../api';
import { NOTIFICATION_META } from '../lib/notification-meta';

const SETTINGS_HREF = '/profile?tab=notifications';

function ManageButton({ variant = 'default' }: { variant?: 'default' | 'outline' }) {
  return (
    <Button asChild variant={variant}>
      <Link to={SETTINGS_HREF}>
        <Settings2 aria-hidden="true" />
        Manage notifications
      </Link>
    </Button>
  );
}

function InvalidLink() {
  return (
    <EmptyState
      icon={Link2Off}
      tint="var(--danger)"
      size="sm"
      headingLevel="h1"
      title="This unsubscribe link is invalid or has expired"
      description="You can still turn emails on or off in your notification settings."
      action={<ManageButton />}
    />
  );
}

/**
 * `/unsubscribe?token=…` from a notification email: turns that kind of email off as soon as the
 * page opens (no sign-in needed; the signed token is the credential).
 */
export function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() ?? '';
  const usable = token.length >= 16 && token.length <= 512;

  const result = useQuery({
    queryKey: queryKeys.notifications.unsubscribe(token),
    queryFn: () => notificationsApi.unsubscribe(token),
    enabled: usable,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  let content;
  if (!usable) {
    content = <InvalidLink />;
  } else if (result.isPending) {
    content = (
      <div role="status" className="flex items-center gap-3 py-10 text-[15px] font-semibold">
        <Loader2 aria-hidden="true" className="size-5 animate-spin text-primary" />
        Updating your email settings…
      </div>
    );
  } else if (result.isError) {
    const invalid =
      isApiError(result.error, ErrorCode.BAD_REQUEST) ||
      isApiError(result.error, ErrorCode.VALIDATION_ERROR) ||
      isApiError(result.error, ErrorCode.NOT_FOUND);
    content = invalid ? (
      <InvalidLink />
    ) : (
      <ErrorState
        title="We couldn't update your email settings"
        error={result.error}
        retrying={result.isFetching}
        onRetry={() => void result.refetch()}
      />
    );
  } else {
    const noun = NOTIFICATION_META[result.data.type].emailNoun;
    content = (
      <EmptyState
        icon={MailCheck}
        tint="var(--status-done)"
        size="sm"
        headingLevel="h1"
        title="You're unsubscribed"
        description={
          <>
            You won&apos;t get {noun} emails at <strong>{result.data.email}</strong> anymore. In-app
            notifications aren&apos;t affected.
          </>
        }
        action={<ManageButton variant="outline" />}
      />
    );
  }

  return (
    <AuthLayout
      heading="Your inbox, your rules."
      text="Choose which TaskFlow emails you get. Reminders and alerts can still show up in the app."
      visual={<IconArt icon={MailX} size="lg" onBrand />}
      visualPlacement="center"
    >
      <title>Email settings · TaskFlow</title>
      <meta name="referrer" content="no-referrer" />
      {content}
    </AuthLayout>
  );
}
