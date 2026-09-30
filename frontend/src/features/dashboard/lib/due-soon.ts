import type { TaskDto } from '@taskflow/shared';
import { addDays, endOfDay, format } from 'date-fns';

import { daysOverdue, formatDueLabel } from '@/lib/due-date';

/**
 * Upper bound for the "Due soon" request. Rounded to the end of the local day a week from now so
 * the query key (and cache entry) stays stable for the whole day instead of changing every render.
 */
export function dueSoonUntil(now: Date = new Date()): string {
  return endOfDay(addDays(now, 7)).toISOString();
}

export interface DueSoonLabel {
  text: string;
  overdue: boolean;
}

/** "Overdue · 2 days", "Overdue · 9:00 AM" (earlier today), or the shared due label. */
export function dueSoonLabel(
  task: Pick<TaskDto, 'dueDate' | 'hasDueTime' | 'isOverdue'>,
  now: Date = new Date(),
): DueSoonLabel {
  if (task.isOverdue && task.dueDate) {
    const days = daysOverdue(task, now);
    if (days === 0) {
      return {
        overdue: true,
        text: task.hasDueTime ? `Overdue · ${format(new Date(task.dueDate), 'h:mm a')}` : 'Overdue',
      };
    }
    return { overdue: true, text: `Overdue · ${days} ${days === 1 ? 'day' : 'days'}` };
  }
  return { overdue: false, text: formatDueLabel(task, now) ?? 'No due date' };
}
