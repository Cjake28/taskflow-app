import type { CSSProperties } from 'react';
import type { TaskDto } from '@taskflow/shared';
import { CalendarDays, ChevronRight, PartyPopper, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';

import { EmptyState } from '@/components/common/empty-state';
import { PriorityIndicator } from '@/components/common/priority-indicator';
import { StatusBadge } from '@/components/common/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { STATUS_META } from '@/lib/task-meta';
import { cn } from '@/lib/utils';

import { useDueSoon } from '../hooks';
import { dueSoonLabel } from '../lib/due-soon';
import { OPEN_TASKS_HREF, taskHref } from '../lib/links';
import { CardError, DashboardCard } from './dashboard-card';

/*
 * Phones get a horizontal, snapping carousel (approved mobile mockup);
 * larger screens an auto-filling grid.
 */
const listClass =
  'flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain [scrollbar-width:none] max-sm:-mx-[18px] max-sm:scroll-px-[18px] max-sm:px-[18px] max-sm:pb-1 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] sm:gap-3.5 sm:overflow-visible';
const itemClass = 'w-[218px] shrink-0 snap-start sm:w-auto';

function DueCard({ task, now }: { task: TaskDto; now: Date }) {
  const label = dueSoonLabel(task, now);
  const WhenIcon = label.overdue ? TriangleAlert : CalendarDays;
  return (
    <Link
      to={taskHref(task.id)}
      style={{ '--tint': STATUS_META[task.status].tint } as CSSProperties}
      className="group flex h-full min-h-[148px] flex-col gap-2.5 rounded-tile bg-tint-soft p-4 transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-tint-strong focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
    >
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-xs font-bold',
          label.overdue
            ? 'text-danger'
            : 'text-[color-mix(in_oklab,var(--tint)_70%,var(--foreground))]',
        )}
      >
        <WhenIcon aria-hidden="true" className="size-3.5 shrink-0" />
        {label.text}
      </span>
      <h3 className="line-clamp-2 text-[15px] leading-snug font-bold text-foreground">
        {task.title}
      </h3>
      <div className="mt-auto flex items-center justify-between gap-2">
        <StatusBadge status={task.status} />
        <PriorityIndicator priority={task.priority} />
      </div>
    </Link>
  );
}

export function DueSoon({ className }: { className?: string }) {
  const query = useDueSoon();
  const now = new Date();

  return (
    <DashboardCard
      title="Due soon"
      subtitle="Next 7 days"
      className={className}
      aside={
        <Link
          to={OPEN_TASKS_HREF}
          className="inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-fill hover:text-foreground"
        >
          See all
          <ChevronRight aria-hidden="true" className="size-[15px]" />
        </Link>
      }
    >
      {query.isPending ? (
        <ul aria-hidden="true" className={listClass}>
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index} className={itemClass}>
              <Skeleton className="h-[148px] rounded-tile" />
            </li>
          ))}
        </ul>
      ) : query.isError ? (
        <CardError
          what="tasks due soon"
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : query.data.length === 0 ? (
        <EmptyState
          bare
          size="sm"
          icon={PartyPopper}
          tint="var(--status-done)"
          headingLevel="h3"
          title="Nothing due this week"
          description="No open tasks are due in the next 7 days. Nice work staying ahead."
          className="py-4"
        />
      ) : (
        <ul className={listClass}>
          {query.data.map((task) => (
            <li key={task.id} className={itemClass}>
              <DueCard task={task} now={now} />
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
