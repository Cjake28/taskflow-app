import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskPriority,
  type TaskStatus,
} from '@taskflow/shared';
import { ClipboardCheck, ClipboardList, Timer, TriangleAlert, type LucideIcon } from 'lucide-react';

export type { TaskPriority, TaskStatus };

/*
 * Presentation metadata for task status and priority (spec §15.4).
 * Colour encodes status, shape encodes priority, coral is reserved for danger,
 * and every indicator also carries an icon and a text label.
 */

export interface StatusMeta {
  label: string;
  /** CSS colour reference for the `--tint` custom property. */
  tint: string;
  icon: LucideIcon;
}

export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  TODO: { label: TASK_STATUS_LABELS.TODO, tint: 'var(--status-todo)', icon: ClipboardList },
  IN_PROGRESS: {
    label: TASK_STATUS_LABELS.IN_PROGRESS,
    tint: 'var(--status-progress)',
    icon: Timer,
  },
  COMPLETED: {
    label: TASK_STATUS_LABELS.COMPLETED,
    tint: 'var(--status-done)',
    icon: ClipboardCheck,
  },
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
  LOW: { label: TASK_PRIORITY_LABELS.LOW, bars: 1 },
  MEDIUM: { label: TASK_PRIORITY_LABELS.MEDIUM, bars: 2 },
  HIGH: { label: TASK_PRIORITY_LABELS.HIGH, bars: 3 },
};
