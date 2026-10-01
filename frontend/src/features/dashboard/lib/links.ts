import type { TaskPriority, TaskStatus } from '@taskflow/shared';

/*
 * Links into the tasks screens, using the URL parameters agreed with the tasks feature:
 * `status` and `priority` are CSV lists, `overdue=true`, `view=board`, `new=1`.
 */

export interface TaskListFilters {
  status?: readonly TaskStatus[];
  priority?: readonly TaskPriority[];
  overdue?: boolean;
  view?: 'board';
}

/** Commas stay readable (`status=TODO,IN_PROGRESS`); values are fixed enum tokens. */
export function tasksHref(filters: TaskListFilters = {}): string {
  const parts: string[] = [];
  if (filters.status?.length) parts.push(`status=${filters.status.join(',')}`);
  if (filters.priority?.length) parts.push(`priority=${filters.priority.join(',')}`);
  if (filters.overdue) parts.push('overdue=true');
  if (filters.view) parts.push(`view=${filters.view}`);
  return parts.length > 0 ? `/tasks?${parts.join('&')}` : '/tasks';
}

export type StatKind = 'total' | TaskStatus | 'overdue';

/** Each stat tile opens the list pre-filtered to what it counts. */
export function statTileHref(kind: StatKind): string {
  switch (kind) {
    case 'total':
      return tasksHref();
    case 'overdue':
      return tasksHref({ overdue: true });
    default:
      return tasksHref({ status: [kind] });
  }
}

export const NEW_TASK_HREF = '/tasks?new=1';
export const OPEN_TASKS_HREF = tasksHref({ status: ['TODO', 'IN_PROGRESS'] });

export function taskHref(id: string): string {
  return `/tasks/${encodeURIComponent(id)}`;
}
