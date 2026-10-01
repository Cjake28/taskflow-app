import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorCode, type SessionDto } from '@taskflow/shared';
import { Check, LogOut, Monitor, MonitorX, ShieldCheck, Smartphone, Tablet } from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/use-auth';
import { CardError } from '@/features/dashboard/components/dashboard-card';
import { formatTimestamp } from '@/features/activity/relative-time';
import { getErrorMessage, isApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

import { profileApi } from '../api';
import { useSessions } from '../hooks';
import { deviceKind, lastActiveLabel, sortSessions } from '../lib/sessions';
import { ProfileCard } from './profile-card';

const DEVICE_ICONS = { desktop: Monitor, phone: Smartphone, tablet: Tablet } as const;

function SessionRow({
  session,
  now,
  onRevoke,
}: {
  session: SessionDto;
  now: Date;
  onRevoke: (session: SessionDto) => void;
}) {
  const Icon = DEVICE_ICONS[deviceKind(session.device)];
  return (
    <li className="flex items-center gap-3.5 border-t border-border py-3.5 first:border-t-0 first:pt-0 last:pb-0">
      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-fill text-foreground [&_svg]:size-[19px]"
      >
        <Icon />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-bold">
          <span className="truncate">{session.device}</span>
          {session.current ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-[color-mix(in_oklab,var(--status-done)_85%,var(--foreground))]">
              <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
              This device
            </span>
          ) : null}
        </p>
        <p
          className="text-[12.5px] text-muted-foreground"
          title={`Signed in ${formatTimestamp(session.createdAt)}`}
        >
          {session.ipAddress ? `IP ${session.ipAddress} · ` : ''}
          {lastActiveLabel(session, now)}
        </p>
      </div>
      <Button
        variant={session.current ? 'ghost' : 'outline'}
        size="sm"
        onClick={() => onRevoke(session)}
        aria-label={
          session.current ? 'Sign out of this device' : `Revoke ${session.device} session`
        }
      >
        {session.current ? 'Sign out' : 'Revoke'}
      </Button>
    </li>
  );
}

/** Active sessions with per-device revoke and "sign out other devices" (spec §7.6). */
export function SessionsCard() {
  const query = useSessions();
  const queryClient = useQueryClient();
  const { clearSession } = useAuth();
  // The target outlives the dialog's open state so its copy doesn't change while it animates out.
  const [target, setTarget] = useState<SessionDto | null>(null);
  const [confirmTarget, setConfirmTarget] = useState(false);
  const [confirmOthers, setConfirmOthers] = useState(false);
  const now = new Date();

  const sessions = sortSessions(query.data ?? []);
  const others = sessions.filter((session) => !session.current);
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.account.sessions() });

  const revoke = async (session: SessionDto) => {
    try {
      await profileApi.revokeSession(session.id);
    } catch (error) {
      if (isApiError(error, ErrorCode.NOT_FOUND)) {
        toast.info('That session had already ended');
        await refresh();
        return;
      }
      toast.error("Couldn't revoke the session", { description: getErrorMessage(error) });
      throw error;
    }
    if (session.current) {
      // The API revoked this session and cleared the cookies; finish the sign-out locally.
      clearSession('logout');
      return;
    }
    toast.success('Session revoked', { description: `${session.device} was signed out.` });
    await refresh();
  };

  const revokeOthers = async () => {
    const results = await Promise.allSettled(
      others.map((session) => profileApi.revokeSession(session.id)),
    );
    await refresh();
    const failed = results.filter(
      (result) => result.status === 'rejected' && !isApiError(result.reason, ErrorCode.NOT_FOUND),
    );
    if (failed.length > 0) {
      toast.error("Some devices couldn't be signed out", {
        description: 'Please try again.',
      });
      throw new Error('Revoking other sessions failed');
    }
    toast.success(
      others.length === 1
        ? 'Signed out of 1 other device'
        : `Signed out of ${others.length} other devices`,
    );
  };

  return (
    <ProfileCard title="Active sessions" description="Devices currently signed in to your account.">
      {query.isPending ? (
        <ul aria-hidden="true">
          {[0, 1].map((index) => (
            <li key={index} className="flex items-center gap-3.5 py-3">
              <Skeleton className="size-11 rounded-[14px]" />
              <div className="flex-1">
                <Skeleton className="h-3.5 w-2/5" />
                <Skeleton className="mt-2 h-3 w-3/5" />
              </div>
            </li>
          ))}
        </ul>
      ) : query.isError ? (
        <CardError
          what="your sessions"
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <>
          <ul aria-label="Signed-in devices">
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                now={now}
                onRevoke={(picked) => {
                  setTarget(picked);
                  setConfirmTarget(true);
                }}
              />
            ))}
          </ul>
          {others.length > 0 ? (
            <Button
              variant="destructive-soft"
              className="mt-5 w-full"
              onClick={() => setConfirmOthers(true)}
            >
              <LogOut aria-hidden="true" />
              Log out of all other devices
            </Button>
          ) : (
            <p className="mt-5 flex items-center justify-center gap-2 rounded-tile bg-fill px-4 py-3 text-center text-[13px] font-semibold text-muted-foreground">
              <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
              You&apos;re only signed in on this device.
            </p>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmTarget}
        onOpenChange={setConfirmTarget}
        icon={target?.current ? LogOut : MonitorX}
        title={
          target?.current
            ? 'Sign out of this device?'
            : `Revoke ${target?.device ?? 'this session'}?`
        }
        description={
          target?.current
            ? "You'll be signed out here and taken back to the login page."
            : 'That device will be signed out right away and will need to log in again.'
        }
        confirmLabel={target?.current ? 'Sign out' : 'Revoke session'}
        onConfirm={() => (target ? revoke(target) : undefined)}
      />
      <ConfirmDialog
        open={confirmOthers}
        onOpenChange={setConfirmOthers}
        icon={LogOut}
        title="Log out of all other devices?"
        description={`${others.length === 1 ? '1 other device' : `${others.length} other devices`} will be signed out right away. You'll stay signed in here.`}
        confirmLabel="Log out others"
        onConfirm={revokeOthers}
      />
    </ProfileCard>
  );
}
