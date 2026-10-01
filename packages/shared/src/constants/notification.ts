export const NOTIFICATION_TYPES = [
  'TASK_REMINDER',
  'DUE_SOON',
  'DAILY_DIGEST',
  'NEW_SIGN_IN',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  TASK_REMINDER: 'Task reminders',
  DUE_SOON: 'Due soon',
  DAILY_DIGEST: 'Daily summary',
  NEW_SIGN_IN: 'New sign-in',
};

/** The two places a notification can be delivered. */
export const NOTIFICATION_CHANNELS = ['inApp', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const REMINDER_LIMITS = {
  /** Reminders per task. */
  perTask: 5,
  /** Characters in a reminder's own message. */
  message: 500,
  /** The furthest a relative reminder can sit before the due time (30 days). */
  maxOffsetMinutes: 30 * 24 * 60,
} as const;

/** Relative reminder choices offered by the UI, in minutes before the due time. */
export const REMINDER_OFFSET_PRESETS = [0, 10, 30, 60, 120, 1440, 2880, 10080] as const;

/**
 * Tasks with a due date but no time are due "by the end of the day"; their reminders count back
 * from this local time on the due date instead (so "1 day before" is the day before at 9:00).
 */
export const DATE_ONLY_REMINDER_TIME = '09:00';

/** "Due soon" lead times offered in the settings, in minutes. */
export const DUE_SOON_LEAD_OPTIONS = [15, 30, 60, 120, 240, 1440] as const;

export const NOTIFICATION_LIMITS = {
  pageSizeDefault: 20,
  pageSizeMax: 50,
  /** Ids per "mark as read" request. */
  markReadMax: 100,
} as const;
