import type { ReactNode } from 'react';
import { OAUTH_PROVIDER_LABELS, type UserDto } from '@taskflow/shared';
import {
  AtSign,
  CalendarDays,
  CircleCheck,
  Info,
  KeyRound,
  ListTodo,
  MailCheck,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';

import { Alert } from '@/components/common/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardStats } from '@/features/dashboard/hooks';

import { useLinkedAccounts } from '../hooks';
import { memberSince } from '../lib/member-since';
import { profileTabHref } from '../lib/profile-tabs';
import { ProfileCard } from './profile-card';

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[50px] items-center justify-between gap-3 border-t border-border py-3 text-sm first:border-t-0 first:pt-1">
      <dt className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
        <Icon aria-hidden="true" className="size-[15px]" />
        {label}
      </dt>
      <dd className="min-w-0 text-right font-bold break-words">{children}</dd>
    </div>
  );
}

export function AccountOverview({ user }: { user: UserDto }) {
  const accounts = useLinkedAccounts();
  const stats = useDashboardStats();

  const methods = [
    ...(user.hasPassword ? ['Password'] : []),
    ...(accounts.data?.providers.map((account) => OAUTH_PROVIDER_LABELS[account.provider]) ?? []),
  ];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <ProfileCard title="Account overview">
        <dl className="flex flex-col">
          <Row icon={AtSign} label="Username">
            @{user.username}
          </Row>
          <Row icon={MailCheck} label="Email">
            {user.emailVerified ? (
              <span className="inline-flex items-center gap-1.5 text-[color-mix(in_oklab,var(--status-done)_85%,var(--foreground))]">
                <CircleCheck aria-hidden="true" className="size-4" />
                Verified
              </span>
            ) : (
              <span className="text-[color-mix(in_oklab,var(--status-progress)_85%,var(--foreground))]">
                Not verified
              </span>
            )}
          </Row>
          <Row icon={CalendarDays} label="Member since">
            {memberSince(user.createdAt, 'MMM d, yyyy') ?? '—'}
          </Row>
          <Row icon={KeyRound} label="Sign-in methods">
            {accounts.isPending ? (
              <Skeleton className="ml-auto h-4 w-28" />
            ) : methods.length > 0 ? (
              methods.join(' · ')
            ) : (
              '—'
            )}
          </Row>
          <Row icon={ListTodo} label="Total tasks">
            {stats.data ? (
              <Link
                to="/tasks"
                aria-label={`${stats.data.total} ${stats.data.total === 1 ? 'task' : 'tasks'}, view all`}
                className="rounded-sm text-primary hover:underline"
              >
                {stats.data.total}
              </Link>
            ) : (
              <Skeleton className="ml-auto h-4 w-8" />
            )}
          </Row>
        </dl>
      </ProfileCard>

      {user.hasPassword ? (
        <Alert variant="info" icon={Info} title="Changing your email?">
          We&apos;ll ask for your current password, then email a 6-digit code to the new address.
          Your email only changes once you enter that code, and we let the old address know.
        </Alert>
      ) : (
        <Alert
          variant="warning"
          role="status"
          icon={ShieldAlert}
          title="You haven't set a password yet"
        >
          <p>
            You signed in with Google or GitHub. Set a password to change your email or to log in
            with it.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-2.5">
            <Link to={profileTabHref('security')}>
              <KeyRound aria-hidden="true" />
              Set a password
            </Link>
          </Button>
        </Alert>
      )}
    </div>
  );
}
