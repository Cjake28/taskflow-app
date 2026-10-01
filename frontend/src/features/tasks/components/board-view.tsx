import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TASK_STATUSES, type TaskDto, type TaskStatus } from '@taskflow/shared';
import { toast } from 'sonner';

import { ErrorState } from '@/components/common/error-state';
import { getErrorMessage } from '@/lib/api-client';
import { invalidateTaskData, queryKeys } from '@/lib/query-keys';
import { STATUS_META } from '@/lib/task-meta';

import { tasksApi, type MoveTaskInput, type TaskListResult } from '../api';
import type { BoardColumns, BoardMove } from '../board';
import { restoreTaskCaches, snapshotTaskCaches, withStatus } from '../cache';
import { BOARD_COLUMNS_QUERY, useBoardColumns, useMediaQuery, useUpdateTask } from '../hooks';
import {
  hasActiveFilters,
  serializeTaskSearch,
  toBoardColumnQuery,
  toSearchString,
  type TaskSearchState,
} from '../url-state';
import { KanbanBoard, type ColumnState } from './kanban-board';
import { MobileBoard } from './mobile-board';
import { NoMatchState } from './task-empty-states';

export interface BoardViewProps {
  state: TaskSearchState;
  onAdd: (status: TaskStatus) => void;
  onEdit: (task: TaskDto) => void;
  onDelete: (task: TaskDto) => void;
  onClearFilters: () => void;
}

/** Board view: three column queries, desktop drag and drop or the phone tabs. */
export function BoardView({ state, onAdd, onEdit, onDelete, onClearFilters }: BoardViewProps) {
  const queryClient = useQueryClient();
  const wide = useMediaQuery(BOARD_COLUMNS_QUERY);
  const results = useBoardColumns(state);
  const updateTask = useUpdateTask();
  const moveTask = useMutation({
    mutationFn: ({ id, input }: { id: string; input: MoveTaskInput }) => tasksApi.move(id, input),
  });

  const columns = Object.fromEntries(
    TASK_STATUSES.map((status, index) => {
      const result = results[index];
      return [
        status,
        {
          tasks: result?.data?.items ?? [],
          total: result?.data?.meta.total ?? 0,
          isPending: result?.isPending ?? true,
        } satisfies ColumnState,
      ];
    }),
  ) as Record<TaskStatus, ColumnState>;

  const failed = results.find((result) => result.isError && !result.data);
  if (failed) {
    return (
      <ErrorState
        title="Couldn't load your board"
        error={failed.error}
        retrying={results.some((result) => result.isFetching)}
        onRetry={() => results.forEach((result) => void result.refetch())}
      />
    );
  }

  const loaded = results.every((result) => result.data);
  if (loaded && hasActiveFilters(state) && TASK_STATUSES.every((s) => columns[s].total === 0)) {
    return <NoMatchState state={state} onClear={onClearFilters} />;
  }

  const keyFor = (status: TaskStatus) => queryKeys.tasks.list(toBoardColumnQuery(state, status));

  /** Optimistic drop: write the new columns to the cache, then ask the server; undo on failure. */
  const commitMove = (move: BoardMove, final: BoardColumns) => {
    void queryClient.cancelQueries({ queryKey: queryKeys.tasks.lists() });
    const snapshot = snapshotTaskCaches(queryClient);
    const now = new Date();
    const changedColumn = move.fromStatus !== move.status;

    for (const status of TASK_STATUSES) {
      queryClient.setQueryData<TaskListResult>(keyFor(status), (old) => {
        if (!old) return old;
        const delta = !changedColumn
          ? 0
          : status === move.status
            ? 1
            : status === move.fromStatus
              ? -1
              : 0;
        return {
          items: final[status].map((task) =>
            task.id === move.taskId && changedColumn ? withStatus(task, status, now) : task,
          ),
          meta: { ...old.meta, total: Math.max(0, old.meta.total + delta) },
        };
      });
    }

    moveTask.mutate(
      {
        id: move.taskId,
        input: { status: move.status, prevId: move.prevId, nextId: move.nextId },
      },
      {
        onError: (error) => {
          restoreTaskCaches(queryClient, snapshot);
          toast.error("Couldn't move the task", {
            description: `Change reverted. ${getErrorMessage(error)}`,
          });
        },
        onSettled: () => void invalidateTaskData(queryClient),
      },
    );
  };

  const listHref = (status: TaskStatus) =>
    `/tasks${toSearchString(serializeTaskSearch({ ...state, view: 'list', status: [status], page: 1 }))}`;

  if (!wide) {
    return (
      <MobileBoard
        columns={columns}
        onAdd={onAdd}
        onEdit={onEdit}
        onDelete={onDelete}
        onMove={(task, status) =>
          updateTask.mutate(
            { id: task.id, input: { status }, optimistic: true },
            {
              onSuccess: () =>
                toast.success(`Moved to ${STATUS_META[status].label}`, {
                  description: `“${task.title}”`,
                }),
            },
          )
        }
      />
    );
  }

  return <KanbanBoard columns={columns} onMove={commitMove} onAdd={onAdd} listHref={listHref} />;
}
