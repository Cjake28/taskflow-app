import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type {
  ImageDto,
  PaginationMeta,
  TaskDetailsDto,
  TaskDto,
  TaskStatus,
} from '@taskflow/shared';

import { queryKeys } from '@/lib/query-keys';

import { isBoardColumnQuery, statusesOfQuery } from './url-state';

/*
 * Optimistic cache edits (spec §14.9). Every task query lives under ['tasks', …]; lists carry
 * their exact query object as the third key segment, which tells us whether a list is filtered
 * by status or is a Kanban column.
 *
 * Lists are cached in two shapes: this feature stores `{ items, meta }`, the dashboard stores the
 * raw `{ data, meta }` envelope. Both are read and written back in their own shape, so a change
 * made here also shows up on the dashboard straight away.
 */

export type TaskCacheSnapshot = Array<[QueryKey, unknown]>;

export function snapshotTaskCaches(queryClient: QueryClient): TaskCacheSnapshot {
  return queryClient.getQueriesData({ queryKey: queryKeys.tasks.all });
}

export function restoreTaskCaches(queryClient: QueryClient, snapshot: TaskCacheSnapshot) {
  for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
}

interface CachedList {
  key: QueryKey;
  params: unknown;
  items: TaskDto[];
  /** Writes new items (and a total change) back in the entry's original shape. */
  write: (items: TaskDto[], totalDelta?: number) => void;
}

function withTotal(meta: PaginationMeta, delta: number): PaginationMeta {
  const total = Math.max(0, meta.total + delta);
  return {
    ...meta,
    total,
    totalPages: Math.max(1, Math.ceil(total / Math.max(1, meta.pageSize))),
  };
}

function cachedLists(queryClient: QueryClient): CachedList[] {
  const lists: CachedList[] = [];
  for (const [key, data] of queryClient.getQueriesData({ queryKey: queryKeys.tasks.lists() })) {
    if (typeof data !== 'object' || data === null) continue;
    const record = data as { items?: unknown; data?: unknown; meta?: PaginationMeta };
    const field = Array.isArray(record.items)
      ? 'items'
      : Array.isArray(record.data)
        ? 'data'
        : null;
    if (!field) continue;
    lists.push({
      key,
      params: key[2],
      items: record[field] as TaskDto[],
      write: (items, totalDelta = 0) =>
        queryClient.setQueryData(key, {
          ...record,
          [field]: items,
          ...(record.meta && totalDelta !== 0 ? { meta: withTotal(record.meta, totalDelta) } : {}),
        }),
    });
  }
  return lists;
}

/** Board columns sharing the same search/priority/overdue filters belong to one board. */
function boardSignature(params: unknown): string {
  const { status: _status, ...rest } = (params ?? {}) as Record<string, unknown>;
  return JSON.stringify(Object.entries(rest).sort(([a], [b]) => a.localeCompare(b)));
}

/** The task with a new status, keeping the derived fields consistent. */
export function withStatus(task: TaskDto, status: TaskStatus, now: Date = new Date()): TaskDto {
  const completed = status === 'COMPLETED';
  return {
    ...task,
    status,
    completedAt: completed ? (task.completedAt ?? now.toISOString()) : null,
    isOverdue: !completed && task.dueDate !== null && new Date(task.dueDate) < now,
    updatedAt: now.toISOString(),
  };
}

/** A task as currently cached (list or details), used to seed optimistic edits. */
export function findCachedTask(queryClient: QueryClient, id: string): TaskDto | undefined {
  const detail = queryClient.getQueryData<TaskDetailsDto>(queryKeys.tasks.detail(id));
  if (detail) return detail;
  for (const list of cachedLists(queryClient)) {
    const found = list.items.find((task) => task.id === id);
    if (found) return found;
  }
  return undefined;
}

/**
 * Applies `update` to every cached copy of a task. When the status changes, the task leaves lists
 * whose status filter no longer matches and is put at the top of the matching board column
 * (where the server also puts it).
 */
export function updateTaskInCaches(
  queryClient: QueryClient,
  id: string,
  update: (task: TaskDto) => TaskDto,
) {
  const original = findCachedTask(queryClient, id);
  if (!original) return;
  const next = update(original);
  const statusChanged = next.status !== original.status;
  const boards = new Set<string>();

  for (const list of cachedLists(queryClient)) {
    if (!list.items.some((task) => task.id === id)) continue;
    if (isBoardColumnQuery(list.params)) boards.add(boardSignature(list.params));
    const statuses = statusesOfQuery(list.params);
    if (statusChanged && statuses && !statuses.includes(next.status)) {
      list.write(
        list.items.filter((task) => task.id !== id),
        -1,
      );
    } else {
      list.write(list.items.map((task) => (task.id === id ? next : task)));
    }
  }

  if (statusChanged) {
    for (const list of cachedLists(queryClient)) {
      if (!isBoardColumnQuery(list.params, next.status)) continue;
      if (!boards.has(boardSignature(list.params))) continue;
      if (list.items.some((task) => task.id === id)) continue;
      list.write([next, ...list.items], 1);
    }
  }

  queryClient.setQueryData<TaskDetailsDto>(queryKeys.tasks.detail(id), (detail) =>
    detail ? { ...detail, ...next, images: detail.images } : detail,
  );
}

export function removeTaskFromCaches(queryClient: QueryClient, id: string) {
  for (const list of cachedLists(queryClient)) {
    if (!list.items.some((task) => task.id === id)) continue;
    list.write(
      list.items.filter((task) => task.id !== id),
      -1,
    );
  }
}

function imageSummary(images: ImageDto[]): Pick<TaskDto, 'imageCount' | 'coverThumbUrl'> {
  return { imageCount: images.length, coverThumbUrl: images[0]?.thumbUrl ?? null };
}

/** Replaces the task's images (details) and refreshes the count and cover in every list. */
export function setTaskImages(
  queryClient: QueryClient,
  taskId: string,
  update: (images: ImageDto[]) => ImageDto[],
) {
  const detail = queryClient.getQueryData<TaskDetailsDto>(queryKeys.tasks.detail(taskId));
  if (!detail) return;
  const images = update(detail.images)
    .filter((image, index, all) => all.findIndex((other) => other.id === image.id) === index)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const summary = imageSummary(images);
  queryClient.setQueryData<TaskDetailsDto>(queryKeys.tasks.detail(taskId), {
    ...detail,
    ...summary,
    images,
  });
  for (const list of cachedLists(queryClient)) {
    if (!list.items.some((task) => task.id === taskId)) continue;
    list.write(list.items.map((task) => (task.id === taskId ? { ...task, ...summary } : task)));
  }
}
