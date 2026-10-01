import type {
  ListNotificationsQuery,
  NotificationDto,
  NotificationListMeta,
  NotificationType,
} from '@taskflow/shared';
import type { Clock } from '../../common/utils/clock';
import { isUniqueViolation, type Db } from '../../database/prisma';
import type { Notification, Prisma } from '../../generated/prisma/client';
import type { JobQueue } from '../../jobs/job-queue';
import {
  channelsFor,
  type NotificationPreferencesService,
  type PreferenceRecord,
} from './notification-preferences.service';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  taskId?: string | null;
  data?: Prisma.InputJsonObject;
  /** Same key for the same user = the same notification; a repeat is ignored. */
  dedupeKey?: string;
}

export function toNotificationResponse(row: Notification): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    taskId: row.taskId,
    data: (row.data as Record<string, unknown> | null) ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export class NotificationsService {
  constructor(
    private readonly prisma: Db,
    private readonly preferences: NotificationPreferencesService,
    private readonly jobs: JobQueue,
    private readonly clock: Clock,
  ) {}

  /**
   * Records a notification and queues its email, following the user's settings for its type.
   * Returns null when the user turned the type off or `dedupeKey` was already used.
   */
  async notify(input: NotifyInput, prefs?: PreferenceRecord): Promise<Notification | null> {
    const settings = prefs ?? (await this.preferences.get(input.userId));
    const channels = channelsFor(settings, input.type);
    if (!channels.inApp && !channels.email) return null;

    let row: Notification;
    try {
      row = await this.prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title.slice(0, 255),
          body: input.body ?? null,
          taskId: input.taskId ?? null,
          ...(input.data ? { data: input.data } : {}),
          inApp: channels.inApp,
          dedupeKey: input.dedupeKey ?? null,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) return null;
      throw err;
    }
    if (channels.email) await this.jobs.enqueue('email.notification', { notificationId: row.id });
    return row;
  }

  async list(
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<{ items: NotificationDto[]; meta: NotificationListMeta }> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      inApp: true,
      ...(query.unread ? { readAt: null } : {}),
      // Ids are UUIDv7 (time-ordered), so "older than the cursor" is a plain comparison.
      ...(query.cursor ? { id: { lt: query.cursor } } : {}),
    };
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { id: 'desc' },
        take: query.limit + 1,
      }),
      this.unreadCount(userId),
    ]);
    const page = rows.slice(0, query.limit);
    return {
      items: page.map(toNotificationResponse),
      meta: {
        nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
        unreadCount,
      },
    };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, inApp: true, readAt: null } });
  }

  /** Marks the given notifications (or all of them) as read; returns the new unread count. */
  async markRead(userId: string, ids?: string[]): Promise<number> {
    await this.prisma.notification.updateMany({
      where: { userId, inApp: true, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: this.clock.now() },
    });
    return this.unreadCount(userId);
  }

  /** Read notifications older than `days` are removed by the daily cleanup. */
  async removeOld(days: number): Promise<number> {
    const before = new Date(this.clock.now().getTime() - days * 86_400_000);
    const { count } = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: before }, OR: [{ readAt: { not: null } }, { inApp: false }] },
    });
    return count;
  }
}
