import { TASK_STATUS_LABELS, type TaskStatus } from '@taskflow/shared';

/** "Thu, Oct 1" in the user's time zone. */
export function formatDay(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(instant);
}

/** "9:00 AM" in the user's time zone. */
export function formatTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(
    instant,
  );
}

/** "Thu, Oct 1, 9:00 AM". */
export function formatMoment(instant: Date, timeZone: string): string {
  return `${formatDay(instant, timeZone)}, ${formatTime(instant, timeZone)}`;
}

/** "Thu, Oct 1, 2:00 PM" or "Thu, Oct 1 (end of day)"; null without a due date. */
export function formatDue(
  task: { dueDate: Date | null; hasDueTime: boolean },
  timeZone: string,
): string | null {
  if (!task.dueDate) return null;
  return task.hasDueTime
    ? formatMoment(task.dueDate, timeZone)
    : `${formatDay(task.dueDate, timeZone)} (end of day)`;
}

export const statusLabel = (status: TaskStatus) => TASK_STATUS_LABELS[status];

/** `j***@example.com`. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

/** "Chrome on Windows" · "203.0.113.5" → one line for emails and the feed. */
export function describeSignIn(device: string, ip: string | null): string {
  return ip ? `${device} · IP ${ip}` : device;
}
