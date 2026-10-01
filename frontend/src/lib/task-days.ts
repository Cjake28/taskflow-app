import type { TaskDto } from '@taskflow/shared';
import { format } from 'date-fns';

/** `yyyy-MM-dd` of a local calendar day; stable key for grouping and element ids. */
export function dayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function byDueDate(a: TaskDto, b: TaskDto): number {
  const diff = Date.parse(a.dueDate ?? '') - Date.parse(b.dueDate ?? '');
  return diff !== 0 ? diff : a.title.localeCompare(b.title);
}

/**
 * Groups tasks by the local day of their due date. Timed tasks sort by time; all-day tasks
 * (stored at 23:59:59.999, see lib/due-date) naturally land at the end of their day.
 */
export function groupByLocalDay(tasks: readonly TaskDto[]): Map<string, TaskDto[]> {
  const groups = new Map<string, TaskDto[]>();
  for (const task of tasks) {
    if (!task.dueDate) continue;
    const key = dayKey(new Date(task.dueDate));
    const group = groups.get(key);
    if (group) group.push(task);
    else groups.set(key, [task]);
  }
  for (const group of groups.values()) group.sort(byDueDate);
  return groups;
}
