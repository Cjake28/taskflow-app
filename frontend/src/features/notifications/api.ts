import type {
  NotificationDto,
  NotificationListMeta,
  NotificationPreferencesDto,
  UnsubscribeResultDto,
  UpdateNotificationPreferencesInput,
} from '@taskflow/shared';

import { api, requestEnvelope } from '@/lib/api-client';

export interface NotificationPage {
  items: NotificationDto[];
  meta: NotificationListMeta;
}

export interface NotificationPageParams {
  cursor?: string | null;
  limit?: number;
  unread?: boolean;
}

export const notificationsApi = {
  /** Newest first; pass the previous page's `meta.nextCursor` to continue. */
  list: async (
    { cursor, limit = 20, unread }: NotificationPageParams,
    signal?: AbortSignal,
  ): Promise<NotificationPage> => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set('cursor', cursor);
    if (unread) query.set('unread', 'true');
    const { data, meta } = await requestEnvelope<NotificationDto[]>(
      `/notifications?${query.toString()}`,
      { signal },
    );
    // The envelope's `meta` is typed for page-based lists; this endpoint pages by cursor.
    const cursorMeta = meta as unknown as Partial<NotificationListMeta> | undefined;
    return {
      items: data,
      meta: {
        nextCursor: cursorMeta?.nextCursor ?? null,
        unreadCount: cursorMeta?.unreadCount ?? 0,
      },
    };
  },
  unreadCount: (signal?: AbortSignal) =>
    api.get<{ count: number }>('/notifications/unread-count', { signal }),
  /** Marks the given notifications as read, or all of them when `ids` is omitted. */
  markRead: (ids?: string[]) =>
    api.post<{ unreadCount: number }>('/notifications/read', ids ? { ids } : {}),
  preferences: (signal?: AbortSignal) =>
    api.get<NotificationPreferencesDto>('/notifications/preferences', { signal }),
  updatePreferences: (input: UpdateNotificationPreferencesInput) =>
    api.patch<NotificationPreferencesDto>('/notifications/preferences', input),
  /** Public: the token from an email's unsubscribe link is the only credential. */
  unsubscribe: (token: string) =>
    api.post<UnsubscribeResultDto>(
      '/notifications/unsubscribe',
      { token },
      { retryOnExpired: false },
    ),
};
