import type { CSSProperties } from 'react';
import type { NotificationDto } from '@taskflow/shared';

import { formatRelativeTime, formatTimestamp } from '@/features/activity/relative-time';
import { cn } from '@/lib/utils';

import { NOTIFICATION_META } from '../lib/notification-meta';

/** One row of the notification feed; the whole row is a button. */
export function NotificationItem({
  notification,
  onOpen,
  now,
}: {
  notification: NotificationDto;
  onOpen: (notification: NotificationDto) => void;
  now?: Date;
}) {
  const meta = NOTIFICATION_META[notification.type];
  const Icon = meta.icon;
  const unread = notification.readAt === null;

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(notification)}
        className={cn(
          'flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-fill focus-visible:bg-fill focus-visible:outline-none',
          unread && 'bg-[color-mix(in_oklab,var(--primary)_5%,var(--card))]',
        )}
      >
        <span
          aria-hidden="true"
          style={{ '--tint': meta.tint } as CSSProperties}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-tint-soft text-tint"
        >
          <Icon className="size-[17px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block text-[13.5px] leading-snug break-words',
              unread ? 'font-bold text-foreground' : 'font-semibold text-foreground/80',
            )}
          >
            {notification.title}
          </span>
          {notification.body ? (
            <span className="mt-0.5 line-clamp-2 text-[12.5px] leading-normal break-words text-muted-foreground">
              {notification.body}
            </span>
          ) : null}
          <time
            dateTime={notification.createdAt}
            title={formatTimestamp(notification.createdAt)}
            className="mt-1 block text-[11.5px] font-semibold text-muted-foreground"
          >
            {formatRelativeTime(notification.createdAt, now)}
          </time>
        </span>
        {unread ? (
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary">
            <span className="sr-only">Unread</span>
          </span>
        ) : null}
      </button>
    </li>
  );
}
