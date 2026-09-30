import type { ReactNode } from 'react';
import type { DashboardStats } from '@taskflow/shared';
import { Plus } from 'lucide-react';
import { Link } from 'react-router';

import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/use-auth';

import { AgendaCard } from '../components/agenda-card';
import { CompletionCard, CompletionCardSkeleton } from '../components/completion-card';
import { DueSoon } from '../components/due-soon';
import { FirstRun } from '../components/first-run';
import { PriorityBreakdown } from '../components/priority-breakdown';
import { RecentActivity } from '../components/recent-activity';
import { StatTiles, StatTilesSkeleton } from '../components/stat-tiles';
import { useDashboardStats } from '../hooks';
import { NEW_TASK_HREF } from '../lib/links';

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function headline(stats: DashboardStats | undefined): ReactNode {
  if (!stats) return 'Welcome back';
  if (stats.total === 0) return "Let's plan your first task";
  const open = stats.byStatus.TODO + stats.byStatus.IN_PROGRESS;
  if (open === 0) return "You're all caught up 🎉";
  return (
    <>
      You have{' '}
      <span className="text-primary">
        {open} open {open === 1 ? 'task' : 'tasks'}
      </span>
    </>
  );
}

/*
 * Layout: at xl the approved two columns, insights (370px) on the left and the agenda on the right.
 * The agenda column comes first in the DOM so phones and tablets (where the column wrappers use
 * `display: contents` and the cards join one grid) show it first, and reading and focus order
 * follow the visual order there. At xl both wrappers are placed explicitly in row 1.
 */
const gridClass =
  'grid gap-5 md:grid-cols-2 xl:grid-cols-[minmax(300px,370px)_minmax(0,1fr)] xl:items-start';
const mainColumnClass =
  'contents xl:col-start-2 xl:row-start-1 xl:flex xl:min-w-0 xl:flex-col xl:gap-5';
const insightsColumnClass =
  'contents xl:col-start-1 xl:row-start-1 xl:flex xl:min-w-0 xl:flex-col xl:gap-5';

function DashboardContent({ stats }: { stats: DashboardStats }) {
  return (
    <>
      <StatTiles stats={stats} />
      <div className={gridClass}>
        <div className={mainColumnClass}>
          <AgendaCard className="md:col-span-2" />
          <DueSoon className="md:col-span-2" />
        </div>
        <div className={insightsColumnClass}>
          <CompletionCard stats={stats} />
          <PriorityBreakdown stats={stats} />
          <RecentActivity className="md:col-span-2" />
        </div>
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading your dashboard" className="flex flex-col gap-5">
      <StatTilesSkeleton />
      <div className={gridClass}>
        <div className={mainColumnClass}>
          <Skeleton className="h-[420px] rounded-card md:col-span-2" />
        </div>
        <div className={insightsColumnClass}>
          <CompletionCardSkeleton />
          <Skeleton className="h-[196px] rounded-card" />
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const user = useCurrentUser();
  const stats = useDashboardStats();

  return (
    <>
      <title>Dashboard · TaskFlow</title>
      <PageHeader
        eyebrow={`${greeting()}, ${user.firstName} 👋`}
        title={headline(stats.data)}
        actions={
          // The first-run card carries its own call to action.
          stats.data?.total === 0 ? null : (
            <Button asChild className="hidden sm:inline-flex">
              <Link to={NEW_TASK_HREF}>
                <Plus aria-hidden="true" />
                New task
              </Link>
            </Button>
          )
        }
      />

      {stats.isPending ? (
        <DashboardSkeleton />
      ) : stats.isError ? (
        <ErrorState
          title="Couldn't load your dashboard"
          error={stats.error}
          onRetry={() => void stats.refetch()}
          retrying={stats.isFetching}
        />
      ) : stats.data.total === 0 ? (
        <FirstRun />
      ) : (
        <DashboardContent stats={stats.data} />
      )}
    </>
  );
}
