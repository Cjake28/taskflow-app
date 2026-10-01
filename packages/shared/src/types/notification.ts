import type { NotificationType } from '../constants/notification';

/**
 * - `scheduled`: will be sent at `remindAt`
 * - `sent`: already delivered (`sentAt`)
 * - `needs-due-date`: a "before the due time" reminder on a task without a due date
 * - `paused`: the task is completed, so nothing is sent unless it is reopened in time
 * - `missed`: the time passed without sending (e.g. the due date moved closer)
 */
export type ReminderStatus = 'scheduled' | 'sent' | 'needs-due-date' | 'paused' | 'missed';

export interface TaskReminderDto {
  id: string;
  kind: 'relative' | 'absolute';
  /** Minutes before the due time (relative reminders only). */
  offsetMinutes: number | null;
  /** When it fires; null while a relative reminder has no due date to count back from. */
  remindAt: string | null;
  message: string | null;
  sentAt: string | null;
  status: ReminderStatus;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** The task it is about, while that task exists. */
  taskId: string | null;
  /**
   * Extra details by type: `{ dueToday, overdue }` for the daily summary,
   * `{ device, ip }` for a new sign-in, `{ remindAt }` / `{ dueDate }` for task notifications.
   */
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListMeta {
  /** Pass as `cursor` to load the next page; null on the last page. */
  nextCursor: string | null;
  unreadCount: number;
}

export interface NotificationChannelPreferences {
  inApp: boolean;
  email: boolean;
}

export interface NotificationPreferencesDto {
  /** IANA time zone used for the daily summary and date-only reminders. */
  timezone: string;
  /** Follow the time zone of the device the user is on. */
  timezoneAuto: boolean;
  taskReminder: NotificationChannelPreferences;
  dueSoon: NotificationChannelPreferences & { leadMinutes: number };
  dailyDigest: NotificationChannelPreferences & { time: string };
  newSignIn: NotificationChannelPreferences;
}

export interface UnsubscribeResultDto {
  type: NotificationType;
  /** Masked, e.g. `j***@example.com`. */
  email: string;
}
