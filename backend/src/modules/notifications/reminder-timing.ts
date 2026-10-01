import { DATE_ONLY_REMINDER_TIME, type ReminderStatus } from '@taskflow/shared';
import { localDateKey, zonedTimeToUtc } from '../../common/utils/zoned-time';

const MINUTE_MS = 60_000;

/** A reminder this late (e.g. while the worker was down) is still sent; older ones are missed. */
export const REMINDER_GRACE_MS = 60 * MINUTE_MS;

export interface DueFields {
  dueDate: Date | null;
  hasDueTime: boolean;
}

/**
 * The moment "before the due time" counts back from: the due time itself, or — for a task due
 * "by the end of the day" — `DATE_ONLY_REMINDER_TIME` on that date in the user's time zone.
 */
export function reminderAnchor(task: DueFields, timeZone: string): Date | null {
  if (!task.dueDate) return null;
  if (task.hasDueTime) return task.dueDate;
  // Date-only due dates are stored as the last instant of the local day.
  const dateKey = localDateKey(task.dueDate, timeZone);
  return zonedTimeToUtc(dateKey, DATE_ONLY_REMINDER_TIME, timeZone);
}

export function relativeRemindAt(
  offsetMinutes: number,
  task: DueFields,
  timeZone: string,
): Date | null {
  const anchor = reminderAnchor(task, timeZone);
  return anchor ? new Date(anchor.getTime() - offsetMinutes * MINUTE_MS) : null;
}

export function reminderStatus(
  reminder: { remindAt: Date | null; sentAt: Date | null },
  task: { status: string },
  now: Date,
): ReminderStatus {
  if (reminder.sentAt) return 'sent';
  if (!reminder.remindAt) return 'needs-due-date';
  if (reminder.remindAt.getTime() < now.getTime() - REMINDER_GRACE_MS) return 'missed';
  if (task.status === 'COMPLETED') return 'paused';
  return 'scheduled';
}
