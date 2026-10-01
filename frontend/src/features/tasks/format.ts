import type { TaskDto } from '@taskflow/shared';
import {
  differenceInCalendarDays,
  differenceInMinutes,
  format,
  isSameDay,
  isSameYear,
} from 'date-fns';

import { daysOverdue, formatDueLabel } from '@/lib/due-date';

type DueFields = Pick<TaskDto, 'dueDate' | 'hasDueTime' | 'status' | 'isOverdue'>;

/** How a due date should look: overdue (coral), due today (orange), done or plain. */
export type DueTone = 'overdue' | 'today' | 'done' | 'normal' | 'none';

export function dueTone(task: DueFields, now: Date = new Date()): DueTone {
  if (!task.dueDate) return 'none';
  if (task.status === 'COMPLETED') return 'done';
  if (task.isOverdue) return 'overdue';
  return isSameDay(new Date(task.dueDate), now) ? 'today' : 'normal';
}

/** "Overdue · 3 days", or "Overdue · since 9:00 AM" when it was due earlier today. */
export function overdueLabel(task: Pick<TaskDto, 'dueDate' | 'hasDueTime'>, now = new Date()) {
  if (!task.dueDate) return 'Overdue';
  const days = daysOverdue(task, now);
  if (days >= 1) return `Overdue · ${days} ${days === 1 ? 'day' : 'days'}`;
  return `Overdue · since ${format(new Date(task.dueDate), 'h:mm a')}`;
}

/** Short due text for rows and cards ("Today · 11:30 AM", "Overdue · 1 day", "Sat, Oct 3"). */
export function dueText(task: DueFields, now: Date = new Date()): string | null {
  if (!task.dueDate) return null;
  if (task.isOverdue && task.status !== 'COMPLETED') return overdueLabel(task, now);
  return formatDueLabel(task, now);
}

/** Header sentence: "Due today · 11:30 AM", "Due Sat, Oct 3". */
export function dueSentence(task: DueFields, now: Date = new Date()): string | null {
  if (!task.dueDate) return null;
  if (task.isOverdue && task.status !== 'COMPLETED') return overdueLabel(task, now);
  const label = formatDueLabel(task, now) ?? '';
  return /^(Today|Tomorrow|Yesterday)/.test(label)
    ? `Due ${label.charAt(0).toLowerCase()}${label.slice(1)}`
    : `Due ${label}`;
}

/** Details panel: "Oct 3, 2026 · 11:30 AM" or "Oct 3, 2026 · End of day". */
export function formatDueDetail(task: Pick<TaskDto, 'dueDate' | 'hasDueTime'>): string | null {
  if (!task.dueDate) return null;
  const due = new Date(task.dueDate);
  return `${format(due, 'MMM d, yyyy')} · ${task.hasDueTime ? format(due, 'h:mm a') : 'End of day'}`;
}

/** "Sep 29, 2026 · 4:12 PM". */
export function formatDateTime(iso: string): string {
  return format(new Date(iso), "MMM d, yyyy '·' h:mm a");
}

/** Compact relative time for tables: "Just now", "5m ago", "2h ago", "Yesterday", "3d ago", "Sep 29". */
export function formatRelativeShort(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const minutes = differenceInMinutes(now, date);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const days = differenceInCalendarDays(now, date);
  if (days === 0) return `${Math.floor(minutes / 60)}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return isSameYear(date, now) ? format(date, 'MMM d') : format(date, 'MMM d, yyyy');
}

/** Timeline stamps: "Today, 8:42 AM", "Yesterday, 5:10 PM", "Sep 29, 4:12 PM". */
export function formatTimelineTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const days = differenceInCalendarDays(now, date);
  const time = format(date, 'h:mm a');
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  return `${isSameYear(date, now) ? format(date, 'MMM d') : format(date, 'MMM d, yyyy')}, ${time}`;
}

/** "9:30 AM" for a `HH:mm` value. */
export function formatClock(value: string): string {
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/** Every half hour of the day as `HH:mm`, plus `extra` (an existing off-grid time) in order. */
export function timeOptions(extra?: string | null): string[] {
  const slots: string[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
    slots.push(
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
    );
  }
  if (extra && !slots.includes(extra)) slots.push(extra);
  return slots.sort();
}

/** Page numbers to show: first, last, and a window around the current page, with gaps. */
export function pageWindow(page: number, totalPages: number): Array<number | 'gap'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((value) => pages.add(value));
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((v) => pages.add(v));
  const sorted = [...pages].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  const result: Array<number | 'gap'> = [];
  for (const value of sorted) {
    const previous = result.at(-1);
    if (typeof previous === 'number' && value - previous > 1) result.push('gap');
    result.push(value);
  }
  return result;
}
