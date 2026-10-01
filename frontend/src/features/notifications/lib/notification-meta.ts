import type { NotificationDto, NotificationType } from '@taskflow/shared';
import { AlarmClock, Hourglass, KeyRound, Sunrise, type LucideIcon } from 'lucide-react';

export interface NotificationTypeMeta {
  icon: LucideIcon;
  /** CSS colour for the icon circle (`--tint`). */
  tint: string;
  /** What the email is called, for sentences like "You won't get … emails". */
  emailNoun: string;
  /** Short explanation for the settings page. */
  description: string;
}

export const NOTIFICATION_META: Record<NotificationType, NotificationTypeMeta> = {
  TASK_REMINDER: {
    icon: AlarmClock,
    tint: 'var(--primary)',
    emailNoun: 'task reminder',
    description: 'The reminders you set on a task.',
  },
  DUE_SOON: {
    icon: Hourglass,
    tint: 'var(--status-progress)',
    emailNoun: 'due soon',
    description: 'A heads-up before a task without its own reminders is due.',
  },
  DAILY_DIGEST: {
    icon: Sunrise,
    tint: 'var(--status-done)',
    emailNoun: 'daily summary',
    description: "What's due today and what's overdue, once a day. Skipped when there's nothing.",
  },
  NEW_SIGN_IN: {
    icon: KeyRound,
    tint: 'var(--primary-2)',
    emailNoun: 'new sign-in alert',
    description: 'When your account is used on a browser or device we haven’t seen before.',
  },
};

function numberIn(data: Record<string, unknown> | null, key: string): number {
  const value = data?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Where clicking a notification takes you (null: nowhere to go, e.g. its task was deleted). */
export function notificationHref(
  notification: Pick<NotificationDto, 'type' | 'taskId' | 'data'>,
): string | null {
  switch (notification.type) {
    case 'NEW_SIGN_IN':
      return '/profile?tab=security';
    case 'DAILY_DIGEST':
      return numberIn(notification.data, 'overdue') > 0 ? '/tasks?overdue=true' : '/dashboard';
    default:
      return notification.taskId ? `/tasks/${notification.taskId}` : null;
  }
}

/** Badge text: the count, capped at "9+". */
export function formatUnreadBadge(count: number): string {
  return count > 9 ? '9+' : String(count);
}

/** "Notifications", or "Notifications, 3 unread". */
export function bellLabel(count: number): string {
  return count > 0 ? `Notifications, ${count} unread` : 'Notifications';
}
