import type { CSSProperties } from 'react';
import type { ActivityDto } from '@taskflow/shared';
import { format } from 'date-fns';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';

import { describeActivity } from '@/lib/activity';

import { formatTimestamp } from '../relative-time';

/**
 * A full-history row: action icon, task (linked while it exists), what happened with its
 * before → after values, and the time of day (the list is grouped by day).
 */
export function ActivityRow({ activity }: { activity: ActivityDto }) {
  const view = describeActivity(activity);
  const Icon = view.icon;
  const deleted = activity.taskId === null;

  return (
    <li className="flex items-start gap-3.5 py-3.5">
      <span
        aria-hidden="true"
        style={{ '--tint': view.tint } as CSSProperties}
        className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-tint-soft text-(--tint)"
      >
        <Icon className="size-4" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="min-w-0 text-[14px] font-bold">
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
          <time
            dateTime={activity.createdAt}
            title={formatTimestamp(activity.createdAt)}
            className="ml-auto shrink-0 text-[12px] font-semibold text-muted-foreground tabular-nums"
          >
            {format(new Date(activity.createdAt), 'h:mm a')}
          </time>
        </div>
        <p className="text-[13px] text-muted-foreground">
          {view.summary}
          {deleted && activity.action !== 'DELETED' ? ' · task deleted since' : ''}
        </p>
        {view.changes.length > 0 ? (
          <dl className="mt-2 flex flex-col gap-1.5">
            {view.changes.map((change) => (
              <div
                key={change.label}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]"
              >
                <dt className="font-semibold text-muted-foreground">{change.label}</dt>
                <dd className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {change.from !== null ? (
                    <>
                      <span className="max-w-[260px] truncate rounded-md bg-fill px-1.5 py-0.5 text-muted-foreground line-through">
                        {change.from || '—'}
                      </span>
                      <ArrowRight
                        aria-label="changed to"
                        className="size-3.5 text-muted-foreground"
                      />
                    </>
                  ) : null}
                  <span className="max-w-[260px] truncate rounded-md bg-[color-mix(in_oklab,var(--primary)_10%,var(--card))] px-1.5 py-0.5 font-semibold">
                    {change.to || '—'}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </li>
  );
}
