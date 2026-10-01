import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { ImageDto, TaskDetailsDto, TaskDto, TaskStatus } from '@taskflow/shared';

import { queryKeys } from '@/lib/query-keys';

import type { TaskListResult } from './api';
import { isBoardColumnQuery, statusesOfQuery } from './url-state';

/*
 * Optimistic cache edits (spec §14.9). Every task query lives under ['tasks', …]; lists carry
 * their exact query object as the third key segment, which tells us whether a list is filtered
 * by status or is a Kanban column.
 */

export type TaskCacheSnapshot = Array<[QueryKey, unknown]>;

export function snapshotTaskCaches(queryClient: QueryClient): TaskCacheSnapshot {
  return queryClient.getQueriesData({ queryKey: queryKeys.tasks.all });
}

export function restoreTaskCaches(queryClient: QueryClient, snapshot: TaskCacheSnapshot) {
  for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
}

function listEntries(queryClient: QueryClient) {
  return queryClient.getQueriesData<TaskListResult>({ queryKey: queryKeys.tasks.lists() });
}

const paramsOf = (key: QueryKey): unknown => key[2];

/** Board columns sharing the same search/priority/overdue filters belong to one board. */
function boardSignature(params: unknown): string {
  const { status: _status, ...rest } = (params ?? {}) as Record<string, unknown>;
  return JSON.stringify(Object.entries(rest).sort(([a], [b]) => a.localeCompare(b)));
}

function withTotal(result: TaskListResult, delta: number): TaskListResult['meta'] {
  const total = Math.max(0, result.meta.total + delta);
  return {
    ...result.meta,
    total,
    totalPages: Math.max(1, Math.ceil(total / Math.max(1, result.meta.pageSize))),
  };
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
  for (const [, data] of listEntries(queryClient)) {
    const found = data?.items.find((task) => task.id === id);
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

  for (const [key, data] of listEntries(queryClient)) {
    if (!data) continue;
    const params = paramsOf(key);
    const index = data.items.findIndex((task) => task.id === id);
    if (index < 0) continue;
    if (isBoardColumnQuery(params)) boards.add(boardSignature(params));
    const statuses = statusesOfQuery(params);
    if (statusChanged && statuses && !statuses.includes(next.status)) {
      queryClient.setQueryData<TaskListResult>(key, {
        items: data.items.filter((task) => task.id !== id),
        meta: withTotal(data, -1),
      });
    } else {
      queryClient.setQueryData<TaskListResult>(key, {
        ...data,
        items: data.items.map((task) => (task.id === id ? next : task)),
      });
    }
  }

  if (statusChanged) {
    for (const [key, data] of listEntries(queryClient)) {
      const params = paramsOf(key);
      if (!data || !isBoardColumnQuery(params, next.status)) continue;
      if (!boards.has(boardSignature(params))) continue;
      if (data.items.some((task) => task.id === id)) continue;
      queryClient.setQueryData<TaskListResult>(key, {
        items: [next, ...data.items],
        meta: withTotal(data, 1),
      });
    }
  }

  queryClient.setQueryData<TaskDetailsDto>(queryKeys.tasks.detail(id), (detail) =>
    detail ? { ...detail, ...next, images: detail.images } : detail,
  );
}

export function removeTaskFromCaches(queryClient: QueryClient, id: string) {
  for (const [key, data] of listEntries(queryClient)) {
    if (!data?.items.some((task) => task.id === id)) continue;
    queryClient.setQueryData<TaskListResult>(key, {
      items: data.items.filter((task) => task.id !== id),
      meta: withTotal(data, -1),
    });
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
  for (const [key, data] of listEntries(queryClient)) {
    if (!data?.items.some((task) => task.id === taskId)) continue;
    queryClient.setQueryData<TaskListResult>(key, {
      ...data,
      items: data.items.map((task) => (task.id === taskId ? { ...task, ...summary } : task)),
    });
  }
}
