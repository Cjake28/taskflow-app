import type { TaskDto } from '@taskflow/shared';
import {
  differenceInCalendarDays,
  endOfDay,
  endOfWeek,
  format,
  isValid,
  parse,
  startOfDay,
  startOfWeek,
} from 'date-fns';

/*
 * Due date convention (shared by every screen):
 * - A task without a time ("all day") is stored as the END of that local day
 *   (23:59:59.999 local), so it only becomes overdue once the day is over.
 * - A task with a time is stored at that local time.
 * The server stores UTC instants and computes `isOverdue` from them.
 */

/** `date` is `yyyy-MM-dd`, `time` is `HH:mm` (optional). Returns an ISO instant for the API. */
export function toDueDateIso(date: string, time?: string | null): string {
  const day = parse(date, 'yyyy-MM-dd', new Date());
  if (!isValid(day)) throw new Error(`Invalid date: ${date}`);
  if (!time) return endOfDay(day).toISOString();
  const withTime = parse(`${date} ${time}`, 'yyyy-MM-dd HH:mm', new Date());
  if (!isValid(withTime)) throw new Error(`Invalid time: ${time}`);
  return withTime.toISOString();
}

/** Splits a stored due date back into form values (local date, and time when set). */
export function fromDueDate(
  iso: string | null,
  hasDueTime: boolean,
): { date: string; time: string | null } | null {
  if (!iso) return null;
  const value = new Date(iso);
  return {
    date: format(value, 'yyyy-MM-dd'),
    time: hasDueTime ? format(value, 'HH:mm') : null,
  };
}

type DueTask = Pick<TaskDto, 'dueDate' | 'hasDueTime'>;

/** "Today", "Tomorrow", "Yesterday", "Mon, Oct 6" or "Oct 6, 2027", plus the time when set. */
export function formatDueLabel(task: DueTask, now: Date = new Date()): string | null {
  if (!task.dueDate) return null;
  const due = new Date(task.dueDate);
  const days = differenceInCalendarDays(due, now);
  let day: string;
  if (days === 0) day = 'Today';
  else if (days === 1) day = 'Tomorrow';
  else if (days === -1) day = 'Yesterday';
  else if (due.getFullYear() === now.getFullYear()) day = format(due, 'EEE, MMM d');
  else day = format(due, 'MMM d, yyyy');
  return task.hasDueTime ? `${day} · ${format(due, 'h:mm a')}` : day;
}

/** Whole days a task is overdue (0 when it is not overdue). */
export function daysOverdue(task: DueTask, now: Date = new Date()): number {
  if (!task.dueDate) return 0;
  return Math.max(0, differenceInCalendarDays(now, new Date(task.dueDate)));
}

/** Local-day and local-week boundaries as ISO instants, for `dueFrom` / `dueTo` filters. */
export function localDayRange(day: Date): { dueFrom: string; dueTo: string } {
  return { dueFrom: startOfDay(day).toISOString(), dueTo: endOfDay(day).toISOString() };
}

export function localWeekRange(day: Date): { dueFrom: string; dueTo: string } {
  return {
    dueFrom: startOfWeek(day, { weekStartsOn: 1 }).toISOString(),
    dueTo: endOfWeek(day, { weekStartsOn: 1 }).toISOString(),
  };
}
