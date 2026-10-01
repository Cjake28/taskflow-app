import { useState } from 'react';
import type { NotificationDto } from '@taskflow/shared';
import { Bell, BellOff, CheckCheck, Settings2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router';

import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import {
  useMarkNotificationsRead,
  useNotificationFeed,
  useUnreadCount,
  type NotificationFilter,
} from '../hooks';
import { bellLabel, formatUnreadBadge, notificationHref } from '../lib/notification-meta';
import { NotificationItem } from './notification-item';

export interface NotificationBellProps {
  className?: string;
  /** Popover alignment against the bell. */
  align?: 'start' | 'center' | 'end';
}

/** Bell with the unread count; opens the notification feed. */
export function NotificationBell({ className, align = 'end' }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  const count = unread.data ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={bellLabel(count)}
          className={cn(
            'relative grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors hover:bg-fill hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none data-[state=open]:bg-fill data-[state=open]:text-foreground',
            className,
          )}
        >
          <Bell aria-hidden="true" className="size-5" />
          {count > 0 ? (
            <span
              aria-hidden="true"
              className="absolute top-0.5 right-0 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10.5px] leading-[18px] font-bold text-white tabular-nums ring-2 ring-(--bell-ring,var(--card))"
            >
              {formatUnreadBadge(count)}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        aria-label="Notifications"
        className="flex max-h-[min(560px,var(--radix-popover-content-available-height))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden"
      >
        <NotificationPanel unreadCount={count} onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

const filterButton =
  'cursor-pointer rounded-full px-3 py-1 text-[12.5px] font-bold transition-colors focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none';

function FeedSkeleton() {
  return (
    <ul aria-hidden="true" className="flex flex-col">
      {[0, 1, 2].map((index) => (
        <li key={index} className="flex gap-3 px-4 py-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-3.5 w-3/4 rounded-full" />
            <Skeleton className="mt-2 h-3 w-full rounded-full" />
            <Skeleton className="mt-2 h-2.5 w-16 rounded-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Header (title, filter, mark all, settings), the feed and "Load more". */
export function NotificationPanel({
  unreadCount,
  onNavigate,
}: {
  unreadCount: number;
  onNavigate: () => void;
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const feed = useNotificationFeed(filter);
  const markRead = useMarkNotificationsRead();
  const items = feed.data?.pages.flatMap((page) => page.items) ?? [];

  const openNotification = (notification: NotificationDto) => {
    if (notification.readAt === null) markRead.mutate([notification.id]);
    const href = notificationHref(notification);
    if (!href) return;
    onNavigate();
    void navigate(href);
  };

  let body;
  if (feed.isPending) {
    body = <FeedSkeleton />;
  } else if (feed.isError) {
    body = (
      <ErrorState
        bare
        title="Couldn't load notifications"
        error={feed.error}
        retrying={feed.isFetching}
        onRetry={() => void feed.refetch()}
        className="px-4 py-6"
      />
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        bare
        size="sm"
        headingLevel="h3"
        icon={filter === 'unread' ? CheckCheck : BellOff}
        title={filter === 'unread' ? 'No unread notifications' : "You're all caught up"}
        description={
          filter === 'unread'
            ? 'Everything here has been read.'
            : 'Task reminders, due-date heads-ups and sign-in alerts will show up here.'
        }
        className="px-4 py-8"
      />
    );
  } else {
    body = (
      <>
        <ul aria-label="Notifications" className="flex flex-col divide-y divide-border/70">
          {items.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onOpen={openNotification}
            />
          ))}
        </ul>
        {feed.hasNextPage ? (
          <div className="border-t border-border/70 p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              loading={feed.isFetchingNextPage}
              onClick={() => void feed.fetchNextPage()}
            >
              Load more
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2.5 border-b border-border px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-extrabold">Notifications</h2>
          {unreadCount > 0 ? (
            <span className="rounded-full [--tint:var(--primary)] bg-tint-soft px-2 py-0.5 text-[11.5px] font-bold text-tint tabular-nums">
              {unreadCount} new
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            asChild
            aria-label="Notification settings"
          >
            <Link to="/profile?tab=notifications" onClick={onNavigate}>
              <Settings2 aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Show" className="flex gap-1 rounded-full bg-fill p-[3px]">
            {(['all', 'unread'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  filterButton,
                  filter === value
                    ? 'bg-card text-foreground shadow-card'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {value === 'all' ? 'All' : 'Unread'}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            disabled={unreadCount === 0 || markRead.isPending}
            onClick={() => markRead.mutate(undefined)}
          >
            <CheckCheck aria-hidden="true" />
            Mark all as read
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">{body}</div>
    </>
  );
}
