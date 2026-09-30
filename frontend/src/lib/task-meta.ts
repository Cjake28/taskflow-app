import { ClipboardCheck, ClipboardList, Timer, TriangleAlert, type LucideIcon } from 'lucide-react';

/*
 * Presentation metadata for task status and priority (spec §15.4).
 * Colour encodes status, shape encodes priority, coral is reserved for danger,
 * and every indicator also carries an icon and a text label.
 */

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export interface StatusMeta {
  label: string;
  /** CSS colour reference for the `--tint` custom property. */
  tint: string;
  icon: LucideIcon;
}

export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  TODO: { label: 'To Do', tint: 'var(--status-todo)', icon: ClipboardList },
  IN_PROGRESS: { label: 'In Progress', tint: 'var(--status-progress)', icon: Timer },
  COMPLETED: { label: 'Completed', tint: 'var(--status-done)', icon: ClipboardCheck },
};

export const OVERDUE_META: StatusMeta = {
  label: 'Overdue',
  tint: 'var(--danger)',
  icon: TriangleAlert,
};

export interface PriorityMeta {
  label: string;
  /** Number of filled signal bars. */
  bars: 1 | 2 | 3;
}

export const PRIORITY_META: Record<TaskPriority, PriorityMeta> = {
  LOW: { label: 'Low', bars: 1 },
  MEDIUM: { label: 'Medium', bars: 2 },
  HIGH: { label: 'High', bars: 3 },
};
