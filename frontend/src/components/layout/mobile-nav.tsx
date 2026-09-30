import {
  Columns3,
  LayoutDashboard,
  ListTodo,
  Plus,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { Link, useLocation } from 'react-router';

import { Avatar } from '@/components/common/avatar';
import { Logo } from '@/components/common/logo';
import { useCurrentUser } from '@/features/auth/use-auth';
import { cn } from '@/lib/utils';

/** Compact header for phones: logo + avatar (navigation lives in the bottom bar). */
export function MobileHeader({ className }: { className?: string }) {
  const user = useCurrentUser();
  return (
    <header className={cn('flex items-center justify-between px-4 pt-4 sm:px-6', className)}>
      <Link to="/dashboard" aria-label="TaskFlow home" className="rounded-xl">
        <Logo />
      </Link>
      <Link to="/profile" aria-label="Your profile" className="rounded-2xl">
        <Avatar user={user} size="lg" />
      </Link>
    </header>
  );
}

interface TabItem {
  to: string;
  label: string;
  icon: LucideIcon;
  isActive: (pathname: string, view: string | null) => boolean;
}

const TABS: [TabItem, TabItem, TabItem, TabItem] = [
  {
    to: '/dashboard',
    label: 'Home',
    icon: LayoutDashboard,
    isActive: (pathname) => pathname.startsWith('/dashboard'),
  },
  {
    to: '/tasks',
    label: 'Tasks',
    icon: ListTodo,
    isActive: (pathname, view) => pathname.startsWith('/tasks') && view !== 'board',
  },
  {
    to: '/tasks?view=board',
    label: 'Board',
    icon: Columns3,
    isActive: (pathname, view) => pathname === '/tasks' && view === 'board',
  },
  {
    to: '/profile',
    label: 'Profile',
    icon: UserRound,
    isActive: (pathname) => pathname.startsWith('/profile'),
  },
];

function Tab({ item, active }: { item: TabItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-w-14 flex-col items-center gap-1 rounded-xl px-1 py-1 text-[11px] font-semibold transition-colors',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon aria-hidden="true" className="size-[22px]" strokeWidth={active ? 2.3 : 2} />
      {item.label}
    </Link>
  );
}

/** Bottom tab bar for phones: Home, Tasks, +, Board, Profile (spec §14.9). */
export function MobileTabBar({ className }: { className?: string }) {
  const { pathname, search } = useLocation();
  const view = new URLSearchParams(search).get('view');
  const [home, tasks, board, profile] = TABS;

  return (
    <nav
      aria-label="Main"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border bg-card px-3 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
        className,
      )}
    >
      <Tab item={home} active={home.isActive(pathname, view)} />
      <Tab item={tasks} active={tasks.isActive(pathname, view)} />
      <Link
        to="/tasks?new=1"
        aria-label="New task"
        className="-mt-[26px] grid size-[54px] place-items-center rounded-full bg-brand-gradient text-white shadow-glow transition-transform active:scale-95"
      >
        <Plus aria-hidden="true" className="size-6" strokeWidth={2.4} />
      </Link>
      <Tab item={board} active={board.isActive(pathname, view)} />
      <Tab item={profile} active={profile.isActive(pathname, view)} />
    </nav>
  );
}
