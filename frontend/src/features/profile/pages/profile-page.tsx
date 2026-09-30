import { useState } from 'react';
import { format } from 'date-fns';
import { LogOut, Palette, UserCog } from 'lucide-react';

import { Avatar } from '@/components/common/avatar';
import { EmptyState } from '@/components/common/empty-state';
import { ThemeSwitcher } from '@/components/common/theme-switcher';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useAuth, useCurrentUser } from '@/features/auth/use-auth';

function memberSince(createdAt: string): string | null {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : format(date, 'MMMM yyyy');
}

/**
 * Placeholder profile: identity, theme and log out (the only place phones reach them).
 * The Account / Security / Connected accounts tabs arrive with the users API.
 */
export function ProfilePage() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const since = memberSince(user.createdAt);

  return (
    <>
      <title>Profile · TaskFlow</title>
      <PageHeader title="Profile" />

      <section className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <Avatar user={user} size="xl" className="shadow-[0_16px_28px_-14px_rgb(242_139_34/0.8)]" />
        <div className="min-w-0">
          <h2 className="text-[22px] font-extrabold sm:text-[26px]">
            {user.firstName} {user.lastName}
          </h2>
          <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground sm:justify-start">
            <span>@{user.username}</span>
            <span aria-hidden="true">·</span>
            <span className="break-all">{user.email}</span>
          </p>
          {since ? (
            <p className="mt-1 text-[13px] text-muted-foreground">Member since {since}</p>
          ) : null}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section
          className="rounded-card bg-card p-[22px] shadow-card"
          aria-labelledby="appearance-title"
        >
          <div className="mb-1.5 flex items-center gap-2.5">
            <span className="grid size-[34px] place-items-center rounded-[11px] [--tint:var(--primary)] bg-tint-soft text-primary">
              <Palette className="size-[17px]" aria-hidden="true" />
            </span>
            <h3 id="appearance-title" className="text-base font-extrabold">
              Appearance
            </h3>
          </div>
          <p className="mb-4 text-[13.5px] text-muted-foreground">
            Auto follows your device&apos;s light or dark setting.
          </p>
          <ThemeSwitcher />
        </section>

        <section
          className="rounded-card bg-card p-[22px] shadow-card"
          aria-labelledby="session-title"
        >
          <div className="mb-1.5 flex items-center gap-2.5">
            <span className="grid size-[34px] place-items-center rounded-[11px] [--tint:var(--danger)] bg-tint-soft text-danger">
              <LogOut className="size-[17px]" aria-hidden="true" />
            </span>
            <h3 id="session-title" className="text-base font-extrabold">
              Session
            </h3>
          </div>
          <p className="mb-4 text-[13.5px] text-muted-foreground">
            Sign out of TaskFlow on this device. Other open tabs sign out too.
          </p>
          <Button
            variant="destructive-soft"
            loading={loggingOut}
            onClick={() => {
              setLoggingOut(true);
              void logout();
            }}
          >
            {!loggingOut && <LogOut aria-hidden="true" />}
            Log out
          </Button>
        </section>
      </div>

      <EmptyState
        icon={UserCog}
        tint="var(--status-done)"
        size="sm"
        title="More settings are coming soon"
        description="Edit your details, change your password, manage active sessions and connected accounts."
      />
    </>
  );
}
