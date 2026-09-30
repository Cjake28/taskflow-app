import { differenceInSeconds, format, formatDistanceStrict } from 'date-fns';

/** "just now", "5 minutes ago", "2 days ago", then a date once it is more than a week old. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = differenceInSeconds(now, date);
  if (seconds < 45) return 'just now';
  if (seconds < 7 * 24 * 60 * 60) return formatDistanceStrict(date, now, { addSuffix: true });
  return format(date, date.getFullYear() === now.getFullYear() ? 'MMM d' : 'MMM d, yyyy');
}

/** Full timestamp for tooltips, e.g. "Oct 1, 2026 at 9:41 AM". */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : format(date, "MMM d, yyyy 'at' h:mm a");
}
