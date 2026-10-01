import { createElement, useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  TASK_STATUSES,
  type CreateTaskInput,
  type TaskDto,
  type TaskStatus,
  type UpdateTaskInput,
} from '@taskflow/shared';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { getErrorMessage } from '@/lib/api-client';
import { invalidateTaskData, queryKeys } from '@/lib/query-keys';

import { tasksApi } from './api';
import {
  removeTaskFromCaches,
  restoreTaskCaches,
  snapshotTaskCaches,
  updateTaskInCaches,
  withStatus,
  type TaskCacheSnapshot,
} from './cache';
import { toBoardColumnQuery, type TaskListQuery, type TaskSearchState } from './url-state';

/* ------------------------------------------------------------------ queries */

export function useTaskList(query: TaskListQuery) {
  return useQuery({
    queryKey: queryKeys.tasks.list(query),
    queryFn: ({ signal }) => tasksApi.list(query, signal),
    placeholderData: keepPreviousData,
  });
}

const ALL_TASKS_QUERY: TaskListQuery = { pageSize: 1 };
const OPEN_TASKS_QUERY: TaskListQuery = { status: 'TODO,IN_PROGRESS', pageSize: 1 };

/** Totals for the header ("24 tasks · 14 open"), from two one-row list requests. */
export function useTaskTotals() {
  const [all, open] = useQueries({
    queries: [ALL_TASKS_QUERY, OPEN_TASKS_QUERY].map((query) => ({
      queryKey: queryKeys.tasks.list(query),
      queryFn: ({ signal }: { signal: AbortSignal }) => tasksApi.list(query, signal),
    })),
  });
  return {
    total: all?.data?.meta.total,
    open: open?.data?.meta.total,
  };
}

/** One query per Kanban column (spec §6.5.1). */
export function useBoardColumns(state: TaskSearchState) {
  return useQueries({
    queries: TASK_STATUSES.map((status) => {
      const query = toBoardColumnQuery(state, status);
      return {
        queryKey: queryKeys.tasks.list(query),
        queryFn: ({ signal }: { signal: AbortSignal }) => tasksApi.list(query, signal),
        placeholderData: keepPreviousData,
      };
    }),
  });
}

export function useTask(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(id),
    queryFn: ({ signal }) => tasksApi.get(id, signal),
    enabled,
  });
}

export function useTaskActivities(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.tasks.activities(id),
    queryFn: ({ signal }) => tasksApi.activities(id, signal),
    enabled,
  });
}

/* ---------------------------------------------------------------- mutations */

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => tasksApi.create(input),
    onSuccess: (task) => queryClient.setQueryData(queryKeys.tasks.detail(task.id), task),
    onSettled: () => invalidateTaskData(queryClient),
  });
}

export interface UpdateTaskVariables {
  id: string;
  input: UpdateTaskInput;
  /**
   * Apply the change to every cached copy before the server answers (status and priority
   * changes from checkboxes and menus); rolled back with a toast on failure.
   */
  optimistic?: boolean;
}

function applyOptimistic(task: TaskDto, input: UpdateTaskInput): TaskDto {
  let next = input.status && input.status !== task.status ? withStatus(task, input.status) : task;
  if (input.priority) next = { ...next, priority: input.priority };
  if (typeof input.title === 'string') next = { ...next, title: input.title.trim() };
  return next;
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof tasksApi.update>>,
    unknown,
    UpdateTaskVariables,
    { snapshot: TaskCacheSnapshot } | undefined
  >({
    mutationFn: ({ id, input }) => tasksApi.update(id, input),
    onMutate: async ({ id, input, optimistic }) => {
      if (!optimistic) return undefined;
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all });
      const snapshot = snapshotTaskCaches(queryClient);
      updateTaskInCaches(queryClient, id, (task) => applyOptimistic(task, input));
      return { snapshot };
    },
    onError: (error, _variables, context) => {
      if (!context) return;
      restoreTaskCaches(queryClient, context.snapshot);
      toast.error("Couldn't update the task", {
        description: `Change reverted. ${getErrorMessage(error)}`,
      });
    },
    onSuccess: (task) => {
      queryClient.setQueryData(queryKeys.tasks.detail(task.id), task);
    },
    onSettled: () => invalidateTaskData(queryClient),
  });
}

/** Mark as completed / reopen (reopened tasks go back to To Do). */
export function useToggleComplete() {
  const update = useUpdateTask();
  const toggle = useCallback(
    (task: Pick<TaskDto, 'id' | 'status' | 'title'>) => {
      const status: TaskStatus = task.status === 'COMPLETED' ? 'TODO' : 'COMPLETED';
      update.mutate(
        { id: task.id, input: { status }, optimistic: true },
        {
          onSuccess: () => {
            if (status === 'COMPLETED') {
              toast.success('Task completed', { description: `“${task.title}” is done. Nice!` });
            }
          },
        },
      );
    },
    [update],
  );
  return { toggle, isPending: update.isPending };
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (task: Pick<TaskDto, 'id' | 'title'>) => tasksApi.remove(task.id),
    onSuccess: (_data, task) => {
      removeTaskFromCaches(queryClient, task.id);
      // Gone for good: drop its details so the invalidation below does not refetch a 404.
      queryClient.removeQueries({ queryKey: queryKeys.tasks.detail(task.id) });
      queryClient.removeQueries({ queryKey: queryKeys.tasks.activities(task.id) });
      toast('Task deleted', {
        description: `“${task.title}” was removed.`,
        icon: createElement(Trash2, { className: 'size-4' }),
      });
    },
    onError: (error) => {
      toast.error("Couldn't delete the task", { description: getErrorMessage(error) });
    },
    // Not awaited: the confirmation closes as soon as the server confirmed the deletion.
    onSettled: () => {
      void invalidateTaskData(queryClient);
    },
  });
}

/* ------------------------------------------------------------------ helpers */

function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    if (typeof window.matchMedia !== 'function') return () => undefined;
    const media = window.matchMedia(query);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  };
}

/** Live `matchMedia` result (false where matchMedia is unavailable, e.g. tests). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useMemo(() => subscribeMedia(query), [query]);
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

/** ≥ 1024 px: sidebar layout, table and drag-and-drop board. */
export const DESKTOP_QUERY = '(min-width: 1024px)';
/** ≥ 768 px: the three-column board fits. */
export const BOARD_COLUMNS_QUERY = '(min-width: 768px)';
