import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { TASK_STATUSES, type TaskDto, type TaskStatus } from '@taskflow/shared';
import { Ellipsis, Plus } from 'lucide-react';

import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';
import { STATUS_META } from '@/lib/task-meta';
import { cn } from '@/lib/utils';

import { BoardCard, BoardCardSkeleton } from './board-card';
import type { ColumnState } from './kanban-board';
import { MoveTaskSheet } from './move-task-sheet';

const SHORT_LABEL: Record<TaskStatus, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Done',
};

export interface MobileBoardProps {
  columns: Record<TaskStatus, ColumnState>;
  onMove: (task: TaskDto, status: TaskStatus) => void;
  onEdit: (task: TaskDto) => void;
  onDelete: (task: TaskDto) => void;
  onAdd: (status: TaskStatus) => void;
}

/** Phone board (spec §14.9): status tabs, and a "Move to…" sheet instead of drag and drop. */
export function MobileBoard({ columns, onMove, onEdit, onDelete, onAdd }: MobileBoardProps) {
  const [tab, setTab] = useState<TaskStatus>('TODO');
  const [sheetTask, setSheetTask] = useState<TaskDto | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const column = columns[tab];
  const meta = STATUS_META[tab];

  const onTabKeyDown = (event: KeyboardEvent, index: number) => {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = (index + delta + TASK_STATUSES.length) % TASK_STATUSES.length;
    const status = TASK_STATUSES[next];
    if (!status) return;
    setTab(status);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div
        role="tablist"
        aria-label="Board columns"
        className="grid grid-cols-3 gap-1 rounded-2xl bg-fill p-1"
      >
        {TASK_STATUSES.map((status, index) => {
          const selected = status === tab;
          return (
            <button
              key={status}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`board-tab-${status}`}
              aria-selected={selected}
              aria-controls="board-tab-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(status)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              style={{ '--tint': STATUS_META[status].tint } as CSSProperties}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-px rounded-xl px-1 py-2 text-xs font-bold transition-[background-color,box-shadow,color] duration-150 focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none',
                selected
                  ? 'bg-card text-[color-mix(in_oklab,var(--tint)_85%,var(--foreground))] shadow-card'
                  : 'text-muted-foreground',
              )}
            >
              <b className="text-base text-foreground tabular-nums">
                {columns[status].isPending ? '–' : columns[status].total}
              </b>
              {SHORT_LABEL[status]}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="board-tab-panel"
        aria-labelledby={`board-tab-${tab}`}
        className="flex flex-col gap-3"
      >
        {column.isPending ? (
          [0, 1, 2].map((index) => <BoardCardSkeleton key={index} index={index} />)
        ) : column.tasks.length === 0 ? (
          <EmptyState
            size="sm"
            icon={meta.icon}
            tint={meta.tint}
            title={`Nothing in ${meta.label}`}
            description={
              tab === 'COMPLETED'
                ? 'Tasks you finish will show up here.'
                : 'Add a task or move one here from another column.'
            }
            action={
              <Button variant="outline" size="sm" onClick={() => onAdd(tab)}>
                <Plus aria-hidden="true" />
                Add task
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {column.tasks.map((task) => (
              <li key={task.id}>
                <BoardCard
                  task={task}
                  menu={
                    <button
                      type="button"
                      onClick={() => setSheetTask(task)}
                      aria-label={`Move or edit “${task.title}”`}
                      aria-haspopup="dialog"
                      className={cn(
                        'grid size-[34px] cursor-pointer place-items-center rounded-[10px] text-muted-foreground transition-colors hover:bg-fill hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none',
                        sheetTask?.id === task.id && 'bg-fill text-foreground',
                      )}
                    >
                      <Ellipsis aria-hidden="true" className="size-[18px]" />
                    </button>
                  }
                />
              </li>
            ))}
          </ul>
        )}
        {!column.isPending && column.total > column.tasks.length ? (
          <p className="text-center text-[12.5px] font-semibold text-muted-foreground">
            Showing {column.tasks.length} of {column.total}. Use the list view to see the rest.
          </p>
        ) : null}
      </div>

      <MoveTaskSheet
        task={sheetTask}
        onOpenChange={(open) => !open && setSheetTask(null)}
        onMove={onMove}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  );
}
