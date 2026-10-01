import type { ReactNode } from 'react';
import { OAUTH_PROVIDER_LABELS, type UserDto } from '@taskflow/shared';
import { CalendarDays, KeyRound, MailCheck, MailWarning, ShieldAlert } from 'lucide-react';

import { cn } from '@/lib/utils';

import { useLinkedAccounts } from '../hooks';
import { memberSince } from '../lib/member-since';
import { AvatarUploader } from './avatar-uploader';
import { ProviderLogo } from './provider-logo';

type BadgeTone = 'neutral' | 'success' | 'warning';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-card text-foreground shadow-[inset_0_0_0_1px_var(--border)]',
  success: '[--tint:var(--status-done)] bg-tint-soft text-tint',
  warning: '[--tint:var(--status-progress)] bg-tint-soft text-tint',
};

function Badge({
  icon,
  children,
  tone = 'neutral',
}: {
  icon: ReactNode;
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <li
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0',
        TONES[tone],
      )}
    >
      {icon}
      {children}
    </li>
  );
}

/** Avatar (change/remove), name, handle, email and sign-in badges. */
export function ProfileHeader({ user }: { user: UserDto }) {
  const accounts = useLinkedAccounts();
  const since = memberSince(user.createdAt);

  return (
    <header className="flex flex-col items-center gap-4 text-center sm:flex-row sm:gap-5 sm:text-left">
      <AvatarUploader user={user} />
      <div className="min-w-0">
        <h1 className="text-[22px] leading-tight font-extrabold tracking-[-0.02em] break-words sm:text-[26px]">
          {user.firstName} {user.lastName}
        </h1>
        <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground sm:justify-start">
          <span>@{user.username}</span>
          <span aria-hidden="true">·</span>
          <span className="break-all">{user.email}</span>
        </p>
        <ul
          aria-label="Account status"
          className="mt-2.5 flex flex-wrap justify-center gap-1.5 sm:justify-start"
        >
          {user.emailVerified ? (
            <Badge tone="success" icon={<MailCheck aria-hidden="true" />}>
              Email verified
            </Badge>
          ) : (
            <Badge tone="warning" icon={<MailWarning aria-hidden="true" />}>
              Email not verified
            </Badge>
          )}
          {user.hasPassword ? (
            <Badge icon={<KeyRound aria-hidden="true" />}>Password set</Badge>
          ) : (
            <Badge tone="warning" icon={<ShieldAlert aria-hidden="true" />}>
              No password yet
            </Badge>
          )}
          {accounts.data?.providers.map((account) => (
            <Badge key={account.provider} icon={<ProviderLogo provider={account.provider} />}>
              {OAUTH_PROVIDER_LABELS[account.provider]} connected
            </Badge>
          ))}
          {since ? (
            <Badge icon={<CalendarDays aria-hidden="true" />}>Member since {since}</Badge>
          ) : null}
        </ul>
      </div>
    </header>
  );
}
