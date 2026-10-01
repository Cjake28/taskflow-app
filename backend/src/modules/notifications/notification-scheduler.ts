import type { Clock } from '../../common/utils/clock';
import {
  localDateKey,
  localDayBounds,
  localTimeKey,
  minutesOfDay,
} from '../../common/utils/zoned-time';
import { isUniqueViolation, type Db } from '../../database/prisma';
import { TaskStatus } from '../../generated/prisma/client';
import { formatDue } from './format';
import {
  DEFAULT_PREFERENCES,
  wantsType,
  type NotificationPreferencesService,
  type PreferenceRecord,
} from './notification-preferences.service';
import type { NotificationsService } from './notifications.service';
import { REMINDER_GRACE_MS, reminderAnchor } from './reminder-timing';

const MINUTE_MS = 60_000;
/** The daily summary goes out within this many minutes after the chosen time, or not that day. */
export const DIGEST_WINDOW_MINUTES = 60;
/** Tasks listed in a daily summary. */
export const DIGEST_TASK_LIMIT = 5;
const BATCH = 200;

export interface TickResult {
  reminders: number;
  dueSoon: number;
  digests: number;
}

/**
 * Runs every minute (a BullMQ job scheduler). It reads what is due from the database rather than
 * scheduling one delayed job per reminder, so edited or deleted tasks never leave stale jobs
 * behind. Every send is claimed atomically, so a retry or a second worker cannot repeat it.
 */
export class NotificationScheduler {
  constructor(
    private readonly prisma: Db,
    private readonly notifications: NotificationsService,
    private readonly preferences: NotificationPreferencesService,
    private readonly clock: Clock,
  ) {}

  async tick(): Promise<TickResult> {
    const now = this.clock.now();
    const prefsCache = new Map<string, PreferenceRecord>();
    const prefsOf = async (userId: string) => {
      let prefs = prefsCache.get(userId);
      if (!prefs) {
        prefs = await this.preferences.get(userId);
        prefsCache.set(userId, prefs);
      }
      return prefs;
    };
    return {
      reminders: await this.sendTaskReminders(now, prefsOf),
      dueSoon: await this.sendDueSoon(now, prefsOf),
      digests: await this.sendDailyDigests(now),
    };
  }

  /** Reminders whose time has come (within the grace period) on tasks that are still open. */
  private async sendTaskReminders(
    now: Date,
    prefsOf: (userId: string) => Promise<PreferenceRecord>,
  ): Promise<number> {
    const due = await this.prisma.taskReminder.findMany({
      where: {
        sentAt: null,
        remindAt: { lte: now, gt: new Date(now.getTime() - REMINDER_GRACE_MS) },
        task: { status: { not: TaskStatus.COMPLETED } },
      },
      include: {
        task: { select: { id: true, title: true, dueDate: true, hasDueTime: true } },
      },
      orderBy: { remindAt: 'asc' },
      take: BATCH,
    });

    let sent = 0;
    for (const reminder of due) {
      const claimed = await this.prisma.taskReminder.updateMany({
        where: { id: reminder.id, sentAt: null },
        data: { sentAt: now },
      });
      if (claimed.count !== 1) continue;

      const prefs = await prefsOf(reminder.userId);
      const dueText = formatDue(reminder.task, prefs.timezone);
      const created = await this.notifications.notify(
        {
          userId: reminder.userId,
          type: 'TASK_REMINDER',
          title: `Reminder: ${reminder.task.title}`,
          body: reminder.message ?? (dueText ? `Due ${dueText}` : null),
          taskId: reminder.taskId,
          data: {
            remindAt: reminder.remindAt!.toISOString(),
            dueDate: reminder.task.dueDate?.toISOString() ?? null,
            hasDueTime: reminder.task.hasDueTime,
            message: reminder.message,
          },
          dedupeKey: `reminder:${reminder.id}:${reminder.remindAt!.toISOString()}`,
        },
        prefs,
      );
      if (created) sent += 1;
    }
    return sent;
  }

  /**
   * The default heads-up before a task is due, for open tasks without reminders of their own
   * (those already chose when to be told).
   */
  private async sendDueSoon(
    now: Date,
    prefsOf: (userId: string) => Promise<PreferenceRecord>,
  ): Promise<number> {
    // The longest lead is a day, and a date-only task's anchor is earlier than its stored
    // end-of-day due time, so this window holds every candidate.
    const horizon = new Date(now.getTime() + 2 * 24 * 60 * MINUTE_MS);
    const tasks = await this.prisma.task.findMany({
      where: {
        status: { not: TaskStatus.COMPLETED },
        dueDate: { gt: now, lte: horizon },
        reminders: { none: {} },
        user: wantsType('DUE_SOON'),
      },
      select: { id: true, userId: true, title: true, dueDate: true, hasDueTime: true },
      orderBy: { dueDate: 'asc' },
      take: BATCH * 5,
    });
    if (tasks.length === 0) return 0;

    const already = await this.prisma.notification.findMany({
      where: { type: 'DUE_SOON', taskId: { in: tasks.map((task) => task.id) } },
      select: { userId: true, dedupeKey: true },
    });
    const notified = new Set(already.map((row) => `${row.userId}:${row.dedupeKey}`));

    let sent = 0;
    for (const task of tasks) {
      const prefs = await prefsOf(task.userId);
      const anchor = reminderAnchor(task, prefs.timezone);
      if (!anchor) continue;
      const startsAt = anchor.getTime() - prefs.dueSoonLeadMinutes * MINUTE_MS;
      if (now.getTime() < startsAt || now.getTime() >= anchor.getTime()) continue;

      const dedupeKey = `due-soon:${task.id}:${anchor.toISOString()}`;
      if (notified.has(`${task.userId}:${dedupeKey}`)) continue;

      const created = await this.notifications.notify(
        {
          userId: task.userId,
          type: 'DUE_SOON',
          title: `Due soon: ${task.title}`,
          body: `Due ${formatDue(task, prefs.timezone)}`,
          taskId: task.id,
          data: { dueDate: task.dueDate!.toISOString(), hasDueTime: task.hasDueTime },
          dedupeKey,
        },
        prefs,
      );
      if (created) sent += 1;
    }
    return sent;
  }

  /** Once a day at each user's chosen local time: what is due today and what is overdue. */
  private async sendDailyDigests(now: Date): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: wantsType('DAILY_DIGEST'),
      select: { id: true, notificationPreference: { omit: { updatedAt: true } } },
    });

    let sent = 0;
    for (const user of users) {
      const prefs = user.notificationPreference ?? {
        userId: user.id,
        lastDigestOn: null,
        ...DEFAULT_PREFERENCES,
      };
      const today = localDateKey(now, prefs.timezone);
      if (prefs.lastDigestOn === today) continue;
      const late =
        minutesOfDay(localTimeKey(now, prefs.timezone)) - minutesOfDay(prefs.dailyDigestTime);
      if (late < 0 || late >= DIGEST_WINDOW_MINUTES) continue;
      if (!(await this.claimDigestDay(user.id, today))) continue;

      const { end } = localDayBounds(now, prefs.timezone);
      const open = { userId: user.id, status: { not: TaskStatus.COMPLETED } };
      const [overdue, dueToday, listed] = await Promise.all([
        this.prisma.task.count({ where: { ...open, dueDate: { lt: now } } }),
        this.prisma.task.count({ where: { ...open, dueDate: { gte: now, lt: end } } }),
        this.prisma.task.findMany({
          where: { ...open, dueDate: { lt: end } },
          orderBy: { dueDate: 'asc' },
          take: DIGEST_TASK_LIMIT,
          select: { id: true, title: true, dueDate: true, hasDueTime: true },
        }),
      ]);
      if (overdue + dueToday === 0) continue;

      const parts = [
        dueToday > 0 ? `${dueToday} due today` : null,
        overdue > 0 ? `${overdue} overdue` : null,
      ].filter(Boolean);
      const created = await this.notifications.notify(
        {
          userId: user.id,
          type: 'DAILY_DIGEST',
          title: `Your day: ${parts.join(', ')}`,
          body: listed.map((task) => task.title).join(' · '),
          data: {
            date: today,
            dueToday,
            overdue,
            tasks: listed.map((task) => ({
              id: task.id,
              title: task.title,
              dueDate: task.dueDate!.toISOString(),
              hasDueTime: task.hasDueTime,
              overdue: task.dueDate! < now,
            })),
          },
          dedupeKey: `digest:${today}`,
        },
        prefs,
      );
      if (created) sent += 1;
    }
    return sent;
  }

  /** Marks today's summary as taken; false when another run already did. */
  private async claimDigestDay(userId: string, today: string): Promise<boolean> {
    const claimed = await this.prisma.notificationPreference.updateMany({
      where: { userId, OR: [{ lastDigestOn: null }, { lastDigestOn: { not: today } }] },
      data: { lastDigestOn: today },
    });
    if (claimed.count === 1) return true;
    try {
      await this.prisma.notificationPreference.create({ data: { userId, lastDigestOn: today } });
      return true;
    } catch (err) {
      if (isUniqueViolation(err)) return false;
      throw err;
    }
  }
}
