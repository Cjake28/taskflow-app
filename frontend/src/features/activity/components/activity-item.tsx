import type { CSSProperties } from 'react';
import type { ActivityDto } from '@taskflow/shared';
import { Link } from 'react-router';

import { describeActivity } from '@/lib/activity';
import { cn } from '@/lib/utils';

import { formatRelativeTime, formatTimestamp } from '../relative-time';

export interface ActivityItemProps {
  activity: ActivityDto;
  now?: Date;
  className?: string;
}

/**
 * One line of an activity feed: tinted action icon, the task title (linked while the task still
 * exists) and "what happened · when".
 */
export function ActivityItem({ activity, now, className }: ActivityItemProps) {
  const view = describeActivity(activity);
  const Icon = view.icon;
  const deleted = activity.taskId === null;

  return (
    <li className={cn('flex items-start gap-3 py-[9px]', className)}>
      <span
        aria-hidden="true"
        style={{ '--tint': view.tint } as CSSProperties}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-tint-soft text-(--tint)"
      >
        <Icon className="size-[15px]" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1 text-[13px] leading-[1.45]">
        <p className="truncate font-bold">
          {deleted ? (
            <span className="text-muted-foreground">{activity.taskTitle}</span>
          ) : (
            <Link
              to={`/tasks/${encodeURIComponent(activity.taskId ?? '')}`}
              className="rounded-sm transition-colors hover:text-primary focus-visible:text-primary"
            >
              {activity.taskTitle}
            </Link>
          )}
        </p>
        <p className="text-muted-foreground">
          <span>{view.summary}</span>
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, </span>
          <time dateTime={activity.createdAt} title={formatTimestamp(activity.createdAt)}>
            {formatRelativeTime(activity.createdAt, now)}
          </time>
        </p>
      </div>
    </li>
  );
}
