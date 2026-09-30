import { useState } from 'react';
import { LayoutDashboard, ListTodo, LogOut, UserRound, type LucideIcon } from 'lucide-react';
import { Link, NavLink } from 'react-router';

import { Avatar } from '@/components/common/avatar';
import { Logo } from '@/components/common/logo';
import { useCurrentUser, useAuth } from '@/features/auth/use-auth';
import { useOpenTaskCount } from '@/features/dashboard/hooks';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

const itemClass =
  'flex items-center gap-3 rounded-full px-3.5 py-[11px] text-sm font-semibold transition-colors focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none [&_svg]:size-[18px] [&_svg]:shrink-0';

/** Floating white sidebar (desktop): logo, primary navigation, user card and a labelled Log out. */
export function Sidebar({ className }: { className?: string }) {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  // Same query as the dashboard stats, so the count updates whenever task data is invalidated.
  const openCount = useOpenTaskCount();

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
  };

  return (
    <aside
      className={cn(
        'sticky top-4 m-4 flex h-[calc(100dvh-2rem)] flex-col gap-1.5 rounded-card bg-card px-4 py-[22px] shadow-card',
        className,
      )}
    >
      <Link to="/dashboard" className="mb-5 rounded-xl px-2 py-1" aria-label="TaskFlow home">
        <Logo />
      </Link>

      <nav aria-label="Main" className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                itemClass,
                isActive
                  ? '[--tint:var(--primary)] bg-tint-soft text-primary'
                  : 'text-muted-foreground hover:bg-fill hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon aria-hidden="true" />
                {label}
                {to === '/tasks' && openCount ? (
                  <span
                    className={cn(
                      'ml-auto min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums',
                      isActive ? 'bg-card text-primary' : 'bg-fill text-muted-foreground',
                    )}
                  >
                    {openCount}
                    <span className="sr-only"> open</span>
                  </span>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <Link
          to="/profile"
          className="flex items-center gap-2.5 rounded-tile bg-fill p-2.5 transition-colors hover:bg-[color-mix(in_oklab,var(--fill),var(--foreground)_4%)] focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <Avatar user={user} />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-bold">
              {user.firstName} {user.lastName}
            </span>
            <span className="block truncate text-xs text-muted-foreground">@{user.username}</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
          className={cn(
            itemClass,
            'cursor-pointer text-muted-foreground hover:bg-[color-mix(in_oklab,var(--danger)_9%,var(--card))] hover:text-danger disabled:cursor-default disabled:opacity-60',
          )}
        >
          <LogOut aria-hidden="true" />
          {loggingOut ? 'Logging out…' : 'Log out'}
        </button>
      </div>
    </aside>
  );
}
