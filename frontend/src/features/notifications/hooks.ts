import { useEffect, useRef } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type {
  NotificationPreferencesDto,
  UpdateNotificationPreferencesInput,
} from '@taskflow/shared';
import { toast } from 'sonner';

import { getErrorMessage } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

import { notificationsApi, type NotificationPage } from './api';
import { deviceTimeZone } from './lib/time-zones';

export type NotificationFilter = 'all' | 'unread';

type FeedData = InfiniteData<NotificationPage, string | null>;

/* ------------------------------------------------------------------ queries */

/** The bell badge: polled every minute and refreshed when the tab regains focus. */
export function useUnreadCount() {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: ({ signal }) => notificationsApi.unreadCount(signal),
    select: (data) => data.count,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Newest first, a page at a time; each page also brings the badge up to date. */
export function useNotificationFeed(filter: NotificationFilter, enabled = true) {
  const queryClient = useQueryClient();
  return useInfiniteQuery({
    queryKey: queryKeys.notifications.feed(filter),
    queryFn: async ({ pageParam, signal }) => {
      const page = await notificationsApi.list(
        { cursor: pageParam, unread: filter === 'unread' },
        signal,
      );
      queryClient.setQueryData(queryKeys.notifications.unreadCount(), {
        count: page.meta.unreadCount,
      });
      return page;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.meta.nextCursor,
    enabled,
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: queryKeys.notifications.preferences(),
    queryFn: ({ signal }) => notificationsApi.preferences(signal),
    staleTime: 5 * 60_000,
  });
}

/* ---------------------------------------------------------------- mutations */

interface FeedSnapshot {
  feeds: Array<[QueryKey, FeedData | undefined]>;
  count: { count: number } | undefined;
}

function snapshotFeeds(queryClient: QueryClient): FeedSnapshot {
  return {
    feeds: queryClient.getQueriesData<FeedData>({ queryKey: queryKeys.notifications.feeds() }),
    count: queryClient.getQueryData<{ count: number }>(queryKeys.notifications.unreadCount()),
  };
}

function restoreFeeds(queryClient: QueryClient, snapshot: FeedSnapshot): void {
  for (const [key, data] of snapshot.feeds) queryClient.setQueryData(key, data);
  queryClient.setQueryData(queryKeys.notifications.unreadCount(), snapshot.count);
}

/** Marks notifications read in every cached feed; returns how many were unread before. */
function markReadInFeeds(queryClient: QueryClient, ids: string[] | undefined, at: string): number {
  const wanted = ids ? new Set(ids) : null;
  const newlyRead = new Set<string>();
  queryClient.setQueriesData<FeedData>({ queryKey: queryKeys.notifications.feeds() }, (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.map((item) => {
          if (item.readAt || (wanted && !wanted.has(item.id))) return item;
          newlyRead.add(item.id);
          return { ...item, readAt: at };
        }),
      })),
    };
  });
  return newlyRead.size;
}

/** Mark the given notifications (or all of them) as read, updating the feed and badge first. */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation<{ unreadCount: number }, unknown, string[] | undefined, FeedSnapshot>({
    mutationFn: (ids) => notificationsApi.markRead(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.all });
      const snapshot = snapshotFeeds(queryClient);
      const newlyRead = markReadInFeeds(queryClient, ids, new Date().toISOString());
      const before = snapshot.count?.count ?? 0;
      queryClient.setQueryData(queryKeys.notifications.unreadCount(), {
        count: ids ? Math.max(0, before - newlyRead) : 0,
      });
      return snapshot;
    },
    onError: (error, _ids, snapshot) => {
      if (snapshot) restoreFeeds(queryClient, snapshot);
      toast.error("Couldn't mark as read", { description: getErrorMessage(error) });
    },
    onSuccess: ({ unreadCount }) => {
      queryClient.setQueryData(queryKeys.notifications.unreadCount(), { count: unreadCount });
    },
  });
}

/** Applies a partial settings update to the current settings (nested groups are merged). */
export function mergePreferences(
  current: NotificationPreferencesDto,
  patch: UpdateNotificationPreferencesInput,
): NotificationPreferencesDto {
  return {
    timezone: patch.timezone ?? current.timezone,
    timezoneAuto: patch.timezoneAuto ?? current.timezoneAuto,
    taskReminder: { ...current.taskReminder, ...patch.taskReminder },
    dueSoon: { ...current.dueSoon, ...patch.dueSoon },
    dailyDigest: { ...current.dailyDigest, ...patch.dailyDigest },
    newSignIn: { ...current.newSignIn, ...patch.newSignIn },
  };
}

/**
 * Saves settings as soon as they change: applied to the cache first, rolled back with a toast
 * when the server refuses (`silent` skips the toast, for background updates).
 */
export function useUpdateNotificationPreferences({ silent = false }: { silent?: boolean } = {}) {
  const queryClient = useQueryClient();
  const key = queryKeys.notifications.preferences();
  return useMutation<
    NotificationPreferencesDto,
    unknown,
    UpdateNotificationPreferencesInput,
    { previous: NotificationPreferencesDto | undefined }
  >({
    mutationFn: (input) => notificationsApi.updatePreferences(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationPreferencesDto>(key);
      if (previous) queryClient.setQueryData(key, mergePreferences(previous, input));
      return { previous };
    },
    onError: (error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      if (!silent) {
        toast.error("Couldn't save your notification settings", {
          description: `Change reverted. ${getErrorMessage(error)}`,
        });
      }
    },
    onSuccess: (saved) => queryClient.setQueryData(key, saved),
  });
}

/**
 * Once per app load: when the user lets TaskFlow follow their device's time zone and this
 * device is somewhere else, save the device's zone (daily summaries and date-only reminders
 * use it).
 */
export function useTimeZoneAutoSync() {
  const preferences = useNotificationPreferences();
  const { mutate } = useUpdateNotificationPreferences({ silent: true });
  const checked = useRef(false);
  const data = preferences.data;

  useEffect(() => {
    if (!data || checked.current) return;
    checked.current = true;
    const device = deviceTimeZone();
    if (data.timezoneAuto && data.timezone !== device) mutate({ timezone: device });
  }, [data, mutate]);
}
