import type { CSSProperties } from 'react';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type ActivityDto,
  type TaskPriority,
  type TaskStatus,
} from '@taskflow/shared';
import { ArrowRight, History, RotateCw } from 'lucide-react';

import { PriorityIndicator } from '@/components/common/priority-indicator';
import { StatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { describeActivity, type ActivityChange } from '@/lib/activity';
import { getErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

import { formatDateTime, formatTimelineTime } from '../format';
import { useTaskActivities } from '../hooks';
import { coalesceActivities } from '../timeline';

const asStatus = (value: unknown): TaskStatus | null =>
  typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value)
    ? (value as TaskStatus)
    : null;

const asPriority = (value: unknown): TaskPriority | null =>
  typeof value === 'string' && (TASK_PRIORITIES as readonly string[]).includes(value)
    ? (value as TaskPriority)
    : null;

function rawChange(activity: ActivityDto, field: string): { from: unknown; to: unknown } {
  const change = activity.changes?.[field];
  return typeof change === 'object' && change !== null
    ? (change as { from: unknown; to: unknown })
    : { from: undefined, to: undefined };
}

function Arrow() {
  return <ArrowRight aria-label="changed to" className="size-3.5 shrink-0 text-muted-foreground" />;
}

/** Before → after line: pills for status, bars for priority, text for the rest. */
function ChangeLine({ activity, change }: { activity: ActivityDto; change: ActivityChange }) {
  if (change.label === 'Status') {
    const { from, to } = rawChange(activity, 'status');
    const before = asStatus(from);
    const after = asStatus(to);
    if (before && after) {
      return (
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={before} />
          <Arrow />
          <StatusBadge status={after} />
        </span>
      );
    }
  }
  if (change.label === 'Priority') {
    const { from, to } = rawChange(activity, 'priority');
    const before = asPriority(from);
    const after = asPriority(to);
    if (before && after) {
      return (
        <span className="mt-1.5 flex flex-wrap items-center gap-2">
          <PriorityIndicator priority={before} />
          <Arrow />
          <PriorityIndicator priority={after} />
        </span>
      );
    }
  }
  if (change.label === 'Description') return null;
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
      <span className="font-semibold text-muted-foreground">{change.label}:</span>
      <span className="max-w-full truncate rounded-md bg-fill px-1.5 py-0.5 font-semibold text-muted-foreground line-through decoration-[1.5px]">
        {change.from || 'None'}
      </span>
      <Arrow />
      <span className="max-w-full truncate rounded-md bg-tint-soft px-1.5 py-0.5 font-semibold [--tint:var(--primary)]">
        {change.to || 'None'}
      </span>
    </span>
  );
}

/** Task history with before → after changes (spec §16). */
export function TaskActivityList({ taskId }: { taskId: string }) {
  const activities = useTaskActivities(taskId);

  if (activities.isPending) {
    return (
      <div className="flex flex-col gap-4 pl-[30px]" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <div key={index}>
            <Skeleton className="mb-2 h-3 rounded-full" style={{ width: `${50 + index * 12}%` }} />
            <Skeleton className="h-2.5 w-24 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (activities.isError) {
    return (
      <div className="flex flex-col items-start gap-3 text-sm text-muted-foreground">
        <p role="alert">Couldn&apos;t load the history. {getErrorMessage(activities.error)}</p>
        <Button
          variant="outline"
          size="sm"
          loading={activities.isFetching}
          onClick={() => void activities.refetch()}
        >
          {activities.isFetching ? null : <RotateCw aria-hidden="true" />}
          Try again
        </Button>
      </div>
    );
  }

  const entries = coalesceActivities(activities.data);
  if (entries.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <History aria-hidden="true" className="size-4" />
        No history yet.
      </p>
    );
  }

  return (
    <ol className="relative flex flex-col gap-[18px] pl-[30px] before:absolute before:top-2 before:bottom-2 before:left-2 before:w-0.5 before:rounded-full before:bg-fill">
      {entries.map((activity, index) => {
        const view = describeActivity(activity);
        return (
          <li
            key={activity.id}
            style={{ '--tint': view.tint } as CSSProperties}
            className={cn(
              'relative text-[13.5px] leading-normal',
              'before:absolute before:top-[5px] before:-left-[26px] before:size-2.5 before:rounded-full before:border-2 before:border-(--tint)',
              index === 0
                ? 'before:bg-(--tint) before:shadow-[0_0_0_4px_color-mix(in_oklab,var(--tint)_22%,transparent)]'
                : 'before:bg-card',
            )}
          >
            <p className="font-semibold">{view.summary}</p>
            {view.changes.map((change) => (
              <ChangeLine key={change.label} activity={activity} change={change} />
            ))}
            <time
              dateTime={activity.createdAt}
              title={formatDateTime(activity.createdAt)}
              className="mt-1 block text-xs text-muted-foreground"
            >
              {formatTimelineTime(activity.createdAt)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
