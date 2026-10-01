import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type ActivityDto,
  type TaskPriority,
  type TaskStatus,
} from '@taskflow/shared';
import {
  ArrowRightLeft,
  ImageMinus,
  ImagePlus,
  PencilLine,
  Plus,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

import { formatDueLabel } from './due-date';

export interface ActivityChange {
  label: string;
  from: string | null;
  to: string | null;
}

export interface ActivityView {
  icon: LucideIcon;
  /** CSS colour for the icon tint. */
  tint: string;
  /** Short sentence without the task title, e.g. "Moved to In Progress". */
  summary: string;
  /** Before → after pairs for the timeline (empty when not applicable). */
  changes: ActivityChange[];
}

type Change = { from?: unknown; to?: unknown; changed?: unknown; count?: unknown; name?: unknown };

const asChange = (value: unknown): Change =>
  typeof value === 'object' && value !== null ? (value as Change) : {};

const statusLabel = (value: unknown) =>
  typeof value === 'string' && value in TASK_STATUS_LABELS
    ? TASK_STATUS_LABELS[value as TaskStatus]
    : null;

const priorityLabel = (value: unknown) =>
  typeof value === 'string' && value in TASK_PRIORITY_LABELS
    ? TASK_PRIORITY_LABELS[value as TaskPriority]
    : null;

const dueLabel = (value: unknown) =>
  typeof value === 'string' ? formatDueLabel({ dueDate: value, hasDueTime: false }) : 'No date';

/** Turns an activity row into display text. Unknown shapes degrade to a generic line. */
export function describeActivity(activity: ActivityDto): ActivityView {
  const changes = activity.changes ?? {};

  switch (activity.action) {
    case 'CREATED':
      return { icon: Plus, tint: 'var(--primary)', summary: 'Created the task', changes: [] };
    case 'DELETED':
      return { icon: Trash2, tint: 'var(--danger)', summary: 'Deleted the task', changes: [] };
    case 'STATUS_CHANGED': {
      const status = asChange(changes.status);
      const to = statusLabel(status.to);
      return {
        icon: ArrowRightLeft,
        tint: to === TASK_STATUS_LABELS.COMPLETED ? 'var(--status-done)' : 'var(--status-progress)',
        summary:
          to === TASK_STATUS_LABELS.COMPLETED ? 'Completed' : `Moved to ${to ?? 'a new status'}`,
        changes: [{ label: 'Status', from: statusLabel(status.from), to }],
      };
    }
    case 'IMAGE_ADDED': {
      const images = asChange(changes.images) as Change & { restored?: unknown };
      const count = Number(images.count ?? 1);
      return {
        icon: ImagePlus,
        tint: 'var(--status-done)',
        summary:
          images.restored === true
            ? 'Restored an image'
            : count === 1
              ? 'Added an image'
              : `Added ${count} images`,
        changes: [],
      };
    }
    case 'IMAGE_REMOVED': {
      const name = asChange(changes.image).name;
      return {
        icon: ImageMinus,
        tint: 'var(--danger)',
        summary: typeof name === 'string' ? `Removed image "${name}"` : 'Removed an image',
        changes: [],
      };
    }
    case 'UPDATED':
    default: {
      const lines: ActivityChange[] = [];
      if (changes.title) {
        const title = asChange(changes.title);
        lines.push({ label: 'Title', from: String(title.from ?? ''), to: String(title.to ?? '') });
      }
      if (changes.priority) {
        const priority = asChange(changes.priority);
        lines.push({
          label: 'Priority',
          from: priorityLabel(priority.from),
          to: priorityLabel(priority.to),
        });
      }
      if (changes.dueDate) {
        const due = asChange(changes.dueDate);
        lines.push({ label: 'Due date', from: dueLabel(due.from), to: dueLabel(due.to) });
      }
      if (changes.description) lines.push({ label: 'Description', from: null, to: 'Updated' });
      const fields = lines.map((line) => line.label.toLowerCase());
      return {
        icon: PencilLine,
        tint: 'var(--primary-2)',
        summary: fields.length > 0 ? `Edited ${joinWords(fields)}` : 'Edited the task',
        changes: lines,
      };
    }
  }
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}
