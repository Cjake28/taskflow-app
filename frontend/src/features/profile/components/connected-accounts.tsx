import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ErrorCode,
  OAUTH_PROVIDER_LABELS,
  OAUTH_PROVIDERS,
  type LinkedAccountDto,
  type OAuthProviderId,
  type UserDto,
} from '@taskflow/shared';
import { format, isThisYear } from 'date-fns';
import { Check, Info, KeyRound, Link2, Link2Off, PlugZap } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { Alert } from '@/components/common/alert';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/use-auth';
import { CardError } from '@/features/dashboard/components/dashboard-card';
import { ApiError, getErrorMessage, isApiError, refreshSession } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

import { oauthLinkUrl, profileApi } from '../api';
import { useEnabledProviders, useLinkedAccounts } from '../hooks';
import { profileTabHref } from '../lib/profile-tabs';
import { ProfileCard } from './profile-card';
import { ProviderLogo } from './provider-logo';

const rowClass = 'flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-[18px] bg-fill p-4';
const logoClass =
  'grid size-[46px] shrink-0 place-items-center rounded-[14px] bg-card text-foreground shadow-card [&_svg]:size-[22px]';

function ActiveTag() {
  return (
    <span className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[color-mix(in_oklab,var(--status-done)_85%,var(--foreground))]">
      <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
      Active
    </span>
  );
}

function connectedLine(account: LinkedAccountDto): string {
  const connectedAt = new Date(account.connectedAt);
  const since = format(connectedAt, isThisYear(connectedAt) ? 'MMM d' : 'MMM d, yyyy');
  return account.email ? `${account.email} · connected ${since}` : `Connected ${since}`;
}

interface ProviderRowProps {
  provider: OAuthProviderId;
  account: LinkedAccountDto | undefined;
  enabled: boolean;
  /** Disconnecting would leave no way to sign in. */
  isLastMethod: boolean;
  connecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

function ProviderRow({
  provider,
  account,
  enabled,
  isLastMethod,
  connecting,
  onConnect,
  onDisconnect,
}: ProviderRowProps) {
  const name = OAUTH_PROVIDER_LABELS[provider];
  const noteId = `last-method-${provider}`;
  return (
    <li className={rowClass}>
      <span aria-hidden="true" className={logoClass}>
        <ProviderLogo provider={provider} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{name}</p>
        <p className="text-[12.5px] [overflow-wrap:anywhere] text-muted-foreground">
          {account ? connectedLine(account) : 'Not connected'}
        </p>
        {account && isLastMethod ? (
          <p id={noteId} className="mt-1 text-[12px] font-semibold text-muted-foreground">
            Your only sign-in method. Set a password before disconnecting.
          </p>
        ) : null}
      </div>
      {account ? (
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={isLastMethod}
          aria-label={`Disconnect ${name}`}
          aria-describedby={isLastMethod ? noteId : undefined}
          onClick={onDisconnect}
        >
          Disconnect
        </Button>
      ) : enabled ? (
        <Button
          size="sm"
          className="ml-auto"
          aria-label={`Connect ${name}`}
          loading={connecting}
          onClick={onConnect}
        >
          {!connecting && <Link2 aria-hidden="true" />}
          Connect
        </Button>
      ) : null}
    </li>
  );
}

function PasswordRow({ hasPassword }: { hasPassword: boolean }) {
  return (
    <li className={rowClass}>
      <span aria-hidden="true" className={logoClass}>
        <KeyRound />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">Password</p>
        <p className="text-[12.5px] text-muted-foreground">
          {hasPassword
            ? 'Log in with your email or username'
            : 'Not set · add one to also log in with your email'}
        </p>
      </div>
      {hasPassword ? (
        <ActiveTag />
      ) : (
        <Button asChild size="sm" className="ml-auto">
          <Link to={profileTabHref('security')}>Set password</Link>
        </Button>
      )}
    </li>
  );
}

/** Google / GitHub connect and disconnect, plus the password as a sign-in method. */
export function ConnectedAccounts({ user }: { user: UserDto }) {
  const accounts = useLinkedAccounts();
  const providers = useEnabledProviders();
  const queryClient = useQueryClient();
  const { clearSession } = useAuth();
  const [connecting, setConnecting] = useState<OAuthProviderId | null>(null);
  const [disconnecting, setDisconnecting] = useState<OAuthProviderId | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const connect = async (provider: OAuthProviderId) => {
    setConnecting(provider);
    try {
      // The start route reads the access cookie, so make sure it is fresh before leaving.
      await refreshSession();
      window.location.assign(oauthLinkUrl(provider));
    } catch (error) {
      setConnecting(null);
      if (error instanceof ApiError && error.status === 401) {
        clearSession('expired');
        return;
      }
      toast.error(`Couldn't connect ${OAUTH_PROVIDER_LABELS[provider]}`, {
        description: getErrorMessage(error),
      });
    }
  };

  const disconnect = async (provider: OAuthProviderId) => {
    const name = OAUTH_PROVIDER_LABELS[provider];
    try {
      await profileApi.unlink(provider);
    } catch (error) {
      if (isApiError(error, ErrorCode.CANNOT_UNLINK_LAST_METHOD)) {
        toast.error(`You can't disconnect ${name} yet`, {
          description: "It's your only way to sign in. Set a password first.",
        });
      } else {
        toast.error(`Couldn't disconnect ${name}`, { description: getErrorMessage(error) });
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.account.linkedAccounts() });
      throw error;
    }
    toast.success(`${name} disconnected`, {
      description: `You can no longer log in with ${name}.`,
    });
    await queryClient.invalidateQueries({ queryKey: queryKeys.account.linkedAccounts() });
  };

  const loading = accounts.isPending || providers.isPending;
  const linked = new Map(accounts.data?.providers.map((account) => [account.provider, account]));
  const enabled = providers.data ?? [];
  const visible = OAUTH_PROVIDERS.filter((id) => enabled.includes(id) || linked.has(id));
  const hasPassword = accounts.data?.hasPassword ?? user.hasPassword;
  const methodCount = (hasPassword ? 1 : 0) + linked.size;
  const disconnectingName = disconnecting ? OAUTH_PROVIDER_LABELS[disconnecting] : '';

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <ProfileCard
        title="Sign-in methods"
        description="Connect an account to log in with one click."
      >
        {loading ? (
          <div aria-hidden="true" className="flex flex-col gap-3">
            {[0, 1].map((index) => (
              <Skeleton key={index} className="h-[78px] rounded-[18px]" />
            ))}
          </div>
        ) : accounts.isError ? (
          <CardError
            what="your connected accounts"
            error={accounts.error}
            onRetry={() => void accounts.refetch()}
            retrying={accounts.isFetching}
          />
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Sign-in methods">
            {visible.map((provider) => (
              <ProviderRow
                key={provider}
                provider={provider}
                account={linked.get(provider)}
                enabled={enabled.includes(provider)}
                isLastMethod={linked.has(provider) && methodCount <= 1}
                connecting={connecting === provider}
                onConnect={() => void connect(provider)}
                onDisconnect={() => {
                  setDisconnecting(provider);
                  setConfirmOpen(true);
                }}
              />
            ))}
            {visible.length === 0 ? (
              <li className="flex items-start gap-3 rounded-[18px] border-[1.5px] border-dashed border-border p-4">
                <span className="grid size-[46px] shrink-0 place-items-center rounded-[14px] bg-fill text-muted-foreground">
                  <PlugZap aria-hidden="true" className="size-[21px]" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold">Social sign-in isn&apos;t set up</p>
                  <p className="mt-0.5 text-[12.5px] leading-normal text-muted-foreground">
                    Google and GitHub sign-in aren&apos;t configured on this server, so there&apos;s
                    nothing to connect yet.
                  </p>
                </div>
              </li>
            ) : null}
            <PasswordRow hasPassword={hasPassword} />
          </ul>
        )}
      </ProfileCard>

      {/* Linking tips only make sense when a provider can be connected. */}
      {loading || visible.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-5">
          <Alert variant="info" icon={Info} title="You can't disconnect your last sign-in method.">
            If you only use Google or GitHub, set a password first. Then you can disconnect it.
          </Alert>
          <ProfileCard title="How connecting works">
            <ol className="flex flex-col gap-3.5 text-[13.5px]">
              {[
                ['Choose Connect', "You'll go to Google or GitHub to approve access."],
                ['Approve the request', 'We only read your name, email and profile photo.'],
                ['Come back here', 'From then on you can log in with either method.'],
              ].map(([title, text], index) => (
                <li key={title} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full [--tint:var(--primary)] bg-tint-soft text-xs font-extrabold text-primary tabular-nums">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-bold">{title}</p>
                    <p className="text-[13px] text-muted-foreground">{text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </ProfileCard>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        icon={Link2Off}
        title={`Disconnect ${disconnectingName}?`}
        description={`You won't be able to log in with ${disconnectingName} anymore. You can connect it again at any time.`}
        confirmLabel="Disconnect"
        onConfirm={() => (disconnecting ? disconnect(disconnecting) : undefined)}
      />
    </div>
  );
}
