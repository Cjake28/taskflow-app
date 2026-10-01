import type { TaskDto } from '@taskflow/shared';
import { addDays, format, isSameDay, isSameWeek, startOfDay, startOfWeek } from 'date-fns';

import { dayKey } from '@/lib/task-days';

/*
 * Agenda helpers (spec §6.5.1): one request fetches the whole local week, then the
 * client groups tasks by local day for the week-strip dots and the selected day's timeline.
 */

const WEEK = { weekStartsOn: 1 } as const;

export { dayKey, groupByLocalDay } from '@/lib/task-days';

/** Monday 00:00 (local) of the week containing `day`. */
export function weekStart(day: Date): Date {
  return startOfWeek(day, WEEK);
}

/** The seven local days (Mon → Sun) of the week containing `anchor`, each at 00:00. */
export function weekDays(anchor: Date): Date[] {
  const monday = weekStart(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function isCurrentWeek(day: Date, now: Date = new Date()): boolean {
  return isSameWeek(day, now, WEEK);
}

function byDueDate(a: TaskDto, b: TaskDto): number {
  const diff = Date.parse(a.dueDate ?? '') - Date.parse(b.dueDate ?? '');
  return diff !== 0 ? diff : a.title.localeCompare(b.title);
}

export interface WeekDaySummary {
  date: Date;
  key: string;
  count: number;
  /** Open tasks that are not completed yet (drives the week-strip dot). */
  openCount: number;
  hasOverdue: boolean;
  isToday: boolean;
}

export function summarizeWeek(
  anchor: Date,
  groups: Map<string, TaskDto[]>,
  now: Date = new Date(),
): WeekDaySummary[] {
  return weekDays(anchor).map((date) => {
    const key = dayKey(date);
    const tasks = groups.get(key) ?? [];
    return {
      date,
      key,
      count: tasks.length,
      openCount: tasks.filter((task) => task.status !== 'COMPLETED').length,
      hasOverdue: tasks.some((task) => task.isOverdue),
      isToday: isSameDay(date, now),
    };
  });
}

export type TimelineState = 'done' | 'overdue' | 'next' | 'upcoming';

export interface TimelineEntry {
  task: TaskDto;
  state: TimelineState;
}

/**
 * Timeline for one day. On today's timeline the first open task that is not due yet is the
 * "next up" item (rendered solid, spec §15.1); completed and overdue tasks keep their own state.
 */
export function timelineFor(tasks: readonly TaskDto[], now: Date = new Date()): TimelineEntry[] {
  let nextAssigned = false;
  return [...tasks].sort(byDueDate).map((task) => {
    if (task.status === 'COMPLETED') return { task, state: 'done' };
    const due = task.dueDate ? new Date(task.dueDate) : null;
    if (task.isOverdue || (due && due < now)) return { task, state: 'overdue' };
    if (!nextAssigned && due && isSameDay(due, now)) {
      nextAssigned = true;
      return { task, state: 'next' };
    }
    return { task, state: 'upcoming' };
  });
}

/** Moves a selected day by `delta` days; used for arrow keys and week paging. */
export function shiftDay(day: Date, delta: number): Date {
  return startOfDay(addDays(day, delta));
}

/** "End of day" for all-day tasks, otherwise the local time. */
export function timeLabel(task: Pick<TaskDto, 'dueDate' | 'hasDueTime'>): string {
  if (!task.dueDate) return 'No date';
  return task.hasDueTime ? format(new Date(task.dueDate), 'h:mm a') : 'End of day';
}
