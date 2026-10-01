import type { CSSProperties } from 'react';
import type { TaskStatus } from '@taskflow/shared';
import { Clock, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';

import { PriorityIndicator } from '@/components/common/priority-indicator';
import { StatusBadge } from '@/components/common/status-badge';
import { STATUS_META } from '@/lib/task-meta';
import { cn } from '@/lib/utils';

import { timeLabel, type TimelineEntry } from '../lib/agenda';
import { taskHref } from '../lib/links';

/** Readable text on a solid status colour; orange needs a dark foreground (spec §15.3). */
const ON_TINT: Record<TaskStatus, string> = {
  TODO: 'var(--primary-foreground)',
  IN_PROGRESS: 'var(--on-progress)',
  COMPLETED: 'var(--primary-foreground)',
};

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  const { task, state } = entry;
  const next = state === 'next';
  const overdue = state === 'overdue';
  const style = {
    '--tint': STATUS_META[task.status].tint,
    '--on-tint': ON_TINT[task.status],
  } as CSSProperties;

  return (
    <li className="relative" style={style}>
      <span
        aria-hidden="true"
        className={cn(
          'absolute rounded-full',
          next
            ? 'top-[17px] -left-8 size-3 bg-(--tint) shadow-[0_0_0_5px_color-mix(in_oklab,var(--tint)_22%,transparent)]'
            : 'top-[19px] -left-[30px] size-2 border-2 border-(--tint) bg-card',
          overdue && 'border-danger',
        )}
      />
      <Link
        to={taskHref(task.id)}
        className={cn(
          'block rounded-tile px-4 py-3.5 transition-[background-color,transform] duration-200 hover:-translate-y-px focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none',
          next
            ? 'bg-(--tint) text-(--on-tint) shadow-[0_16px_30px_-18px_var(--tint)] [&_[data-priority]]:text-[color-mix(in_oklab,var(--on-tint)_80%,transparent)]'
            : 'bg-tint-soft hover:bg-tint-strong',
        )}
      >
        <div className="flex items-start gap-2.5">
          <h3
            className={cn(
              'min-w-0 flex-1 truncate text-[15px] font-bold',
              task.status === 'COMPLETED' && !next && 'text-muted-foreground line-through',
            )}
          >
            {task.title}
          </h3>
          <time
            dateTime={task.dueDate ?? undefined}
            className={cn(
              'inline-flex shrink-0 items-center gap-1 pt-px text-[13px] font-semibold whitespace-nowrap',
              next
                ? 'text-[color-mix(in_oklab,var(--on-tint)_80%,transparent)]'
                : overdue
                  ? 'text-danger'
                  : 'text-muted-foreground',
            )}
          >
            {overdue ? (
              <>
                <TriangleAlert aria-hidden="true" className="size-3.5" />
                <span className="sr-only">Overdue, was due </span>
              </>
            ) : null}
            {timeLabel(task)}
          </time>
        </div>
        {task.description ? (
          <p
            className={cn(
              'mt-1 line-clamp-1 text-[13px] leading-snug',
              next
                ? 'text-[color-mix(in_oklab,var(--on-tint)_78%,transparent)]'
                : 'text-muted-foreground',
            )}
          >
            {task.description}
          </p>
        ) : null}
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          {next ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--on-tint)_14%,transparent)] px-2.5 py-1 text-xs font-bold whitespace-nowrap">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-(--on-tint)" />
              {STATUS_META[task.status].label}
            </span>
          ) : (
            <StatusBadge status={task.status} />
          )}
          <PriorityIndicator priority={task.priority} />
          {next ? (
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold">
              <Clock aria-hidden="true" className="size-3.5" />
              Up next
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

/** Vertical rail with one tinted card per task; the "up next" task is solid. */
export function AgendaTimeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className="relative flex flex-col gap-3 pl-[34px] before:absolute before:top-3.5 before:bottom-3.5 before:left-[9px] before:w-0.5 before:rounded-full before:bg-fill">
      {entries.map((entry) => (
        <TimelineItem key={entry.task.id} entry={entry} />
      ))}
    </ol>
  );
}
