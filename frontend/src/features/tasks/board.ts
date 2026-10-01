import { TASK_STATUSES, type TaskDto, type TaskStatus } from '@taskflow/shared';

/*
 * Pure Kanban helpers (no React, no dnd-kit), so ordering rules are unit-testable.
 * The server positions a moved card between `prevId` (the card above it) and `nextId` (the card
 * below it) in the destination column (spec §6.5.3).
 */

export type BoardColumns = Record<TaskStatus, TaskDto[]>;

export function emptyColumns(): BoardColumns {
  return { TODO: [], IN_PROGRESS: [], COMPLETED: [] };
}

export function isStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value);
}

/** The column holding a task, or null. */
export function findColumn(columns: BoardColumns, taskId: string): TaskStatus | null {
  for (const status of TASK_STATUSES) {
    if (columns[status].some((task) => task.id === taskId)) return status;
  }
  return null;
}

/** Moves a card to `toStatus` at `toIndex` (clamped); returns new column arrays. */
export function moveCard(
  columns: BoardColumns,
  taskId: string,
  toStatus: TaskStatus,
  toIndex: number,
): BoardColumns {
  const from = findColumn(columns, taskId);
  if (!from) return columns;
  const card = columns[from].find((task) => task.id === taskId);
  if (!card) return columns;

  const next: BoardColumns = { ...columns, [from]: columns[from].filter((t) => t.id !== taskId) };
  const target = [...next[toStatus]];
  const index = Math.max(0, Math.min(toIndex, target.length));
  target.splice(index, 0, card);
  next[toStatus] = target;
  return next;
}

/** The cards directly above and below `taskId` in its column. */
export function neighboursOf(
  column: readonly Pick<TaskDto, 'id'>[],
  taskId: string,
): { prevId: string | null; nextId: string | null } {
  const index = column.findIndex((task) => task.id === taskId);
  if (index < 0) return { prevId: null, nextId: null };
  return { prevId: column[index - 1]?.id ?? null, nextId: column[index + 1]?.id ?? null };
}

export interface BoardMove {
  taskId: string;
  fromStatus: TaskStatus;
  status: TaskStatus;
  index: number;
  prevId: string | null;
  nextId: string | null;
}

/**
 * Compares the columns before and after a drag. Returns the `PATCH /tasks/:id/move` payload, or
 * null when the card ended where it started.
 */
export function resolveMove(
  before: BoardColumns,
  after: BoardColumns,
  taskId: string,
): BoardMove | null {
  const fromStatus = findColumn(before, taskId);
  const status = findColumn(after, taskId);
  if (!fromStatus || !status) return null;
  const fromIndex = before[fromStatus].findIndex((task) => task.id === taskId);
  const index = after[status].findIndex((task) => task.id === taskId);
  if (fromStatus === status && fromIndex === index) return null;
  return { taskId, fromStatus, status, index, ...neighboursOf(after[status], taskId) };
}

/**
 * Where a dragged card lands when hovering `overId` (a card or a column). `below` is true when the
 * pointer is past the middle of the hovered card.
 */
export function dropIndex(
  column: readonly Pick<TaskDto, 'id'>[],
  overId: string,
  below: boolean,
): number {
  const overIndex = column.findIndex((task) => task.id === overId);
  if (overIndex < 0) return column.length;
  return overIndex + (below ? 1 : 0);
}
