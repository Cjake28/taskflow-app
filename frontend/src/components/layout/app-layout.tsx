import { Outlet } from 'react-router';

import { useTimeZoneAutoSync } from '@/features/notifications/hooks';
import { TasksHotkeys } from '@/features/tasks/components/tasks-hotkeys';

import { MobileHeader, MobileTabBar } from './mobile-nav';
import { Sidebar } from './sidebar';

/**
 * Authenticated shell. Desktop (≥1024px): floating sidebar + content.
 * Phones and tablets: compact header + bottom tab bar.
 */
export function AppLayout() {
  useTimeZoneAutoSync();
  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-card px-4 py-2 font-bold shadow-pop focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Sidebar className="hidden lg:flex" />
      <div className="flex min-w-0 flex-col">
        <MobileHeader className="lg:hidden" />
        <main
          id="main"
          tabIndex={-1}
          className="flex flex-1 flex-col gap-5 px-4 pt-5 pb-[calc(7rem+env(safe-area-inset-bottom))] outline-none sm:px-6 lg:px-[34px] lg:pt-[30px] lg:pb-[34px]"
        >
          <Outlet />
        </main>
      </div>
      <MobileTabBar className="lg:hidden" />
      <TasksHotkeys />
    </div>
  );
}
