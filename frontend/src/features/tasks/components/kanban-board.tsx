import { useMemo, useState, type CSSProperties } from 'react';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  getFirstCollision,
  KeyboardCode,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TASK_STATUSES, type TaskDto, type TaskStatus } from '@taskflow/shared';
import { Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router';

import { STATUS_META } from '@/lib/task-meta';
import { cn } from '@/lib/utils';

import {
  dropIndex,
  findColumn,
  isStatus,
  moveCard,
  resolveMove,
  type BoardColumns,
  type BoardMove,
} from '../board';
import { BoardCard, BoardCardSkeleton, DropPlaceholder } from './board-card';

export interface ColumnState {
  tasks: TaskDto[];
  total: number;
  isPending: boolean;
}

export interface KanbanBoardProps {
  columns: Record<TaskStatus, ColumnState>;
  onMove: (move: BoardMove, columns: BoardColumns) => void;
  onAdd: (status: TaskStatus) => void;
  /** Link to the list view filtered to a status (for columns with more than 50 cards). */
  listHref: (status: TaskStatus) => string;
}

interface DragState {
  activeId: string;
  origin: BoardColumns;
  columns: BoardColumns;
}

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    'Press Enter to open the task. To move it, press Space to pick it up, use the arrow keys to move it within a column or to another column, then press Space again to drop it, or Escape to cancel.',
};

/** Space picks up and drops; Enter is left free to open the card. */
const keyboardCodes = { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] };

/**
 * ↑/↓ move within a column (sortable default). ←/→ jump to the nearest card of the next column
 * (or the column itself when it is empty): the default getter only looks for droppables
 * overlapping the dragged card's row, which keeps it in its own column.
 */
const boardKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  if (event.code !== KeyboardCode.Left && event.code !== KeyboardCode.Right) {
    return sortableKeyboardCoordinates(event, args);
  }
  event.preventDefault();
  const { active, collisionRect, droppableRects, droppableContainers, over } = args.context;
  if (!active || !collisionRect) return undefined;

  const candidates = droppableContainers.getEnabled().filter((entry) => {
    const rect = droppableRects.get(entry.id);
    if (!rect || entry.id === active.id) return false;
    const data = entry.data.current as { type?: string; count?: number } | undefined;
    // Prefer cards; a column only counts when it has none to land on.
    if (data?.type === 'column' && (data.count ?? 0) > 0) return false;
    return event.code === KeyboardCode.Right
      ? rect.left >= collisionRect.left + collisionRect.width
      : rect.left + rect.width <= collisionRect.left;
  });
  const collisions = closestCorners({
    active,
    collisionRect,
    droppableRects,
    droppableContainers: candidates,
    pointerCoordinates: null,
  });
  let targetId = getFirstCollision(collisions, 'id');
  if (targetId === over?.id && collisions.length > 1) targetId = collisions[1]?.id ?? null;
  if (targetId == null) return undefined;

  const target = droppableContainers.get(targetId);
  const rect = target?.rect.current;
  if (!rect) return undefined;
  const isColumn = (target.data.current as { type?: string } | undefined)?.type === 'column';
  return isColumn ? { x: rect.left + 14, y: rect.top + 60 } : { x: rect.left, y: rect.top };
};

function SortableCard({
  task,
  status,
  crossColumn,
}: {
  task: TaskDto;
  status: TaskStatus;
  crossColumn: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: 'task' },
    attributes: { roleDescription: 'draggable task' },
  });

  const navigate = useNavigate();
  const open = () => void navigate(`/tasks/${task.id}`);

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        setActivatorNodeRef(node);
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={open}
      onKeyDown={(event) => {
        listeners?.onKeyDown?.(event);
        if (event.key === 'Enter' && !isDragging && !event.defaultPrevented) {
          event.preventDefault();
          open();
        }
      }}
      aria-label={`${task.title}, ${STATUS_META[status].label}`}
      data-card-id={task.id}
      className={cn(
        'touch-manipulation rounded-[18px] outline-none focus-visible:ring-4 focus-visible:ring-ring/40',
        isDragging ? 'cursor-grabbing' : 'cursor-grab',
      )}
    >
      {isDragging ? (
        <DropPlaceholder task={task} status={status} crossColumn={crossColumn} />
      ) : (
        <BoardCard task={task} grip titleLink={false} />
      )}
    </div>
  );
}

function Column({
  status,
  state,
  tasks,
  isTarget,
  originStatus,
  onAdd,
  listHref,
}: {
  status: TaskStatus;
  state: ColumnState;
  tasks: TaskDto[];
  isTarget: boolean;
  originStatus: TaskStatus | null;
  onAdd: (status: TaskStatus) => void;
  listHref: (status: TaskStatus) => string;
}) {
  const { setNodeRef } = useDroppable({
    id: status,
    data: { type: 'column', count: tasks.length },
  });
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  const headingId = `board-column-${status}`;
  const hidden = Math.max(0, state.total - state.tasks.length);

  return (
    <section
      aria-labelledby={headingId}
      style={{ '--tint': meta.tint } as CSSProperties}
      className={cn(
        'flex min-h-[520px] min-w-0 flex-col gap-3 rounded-card bg-[color-mix(in_oklab,var(--tint)_7%,var(--background))] p-3.5 transition-shadow duration-150',
        isTarget && 'shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--tint)_45%,transparent)]',
      )}
    >
      <header className="flex items-center gap-2.5 px-1 pt-1 pb-0.5">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-[30px] shrink-0 place-items-center rounded-full bg-(--tint) shadow-[0_8px_14px_-8px_var(--tint)]',
            status === 'IN_PROGRESS' ? 'text-on-progress' : 'text-white',
          )}
        >
          <Icon className="size-[15px]" strokeWidth={2.3} />
        </span>
        <h2 id={headingId} className="truncate text-[15px] font-extrabold">
          {meta.label}
        </h2>
        <span className="rounded-full bg-card px-[9px] py-0.5 text-xs font-bold text-muted-foreground tabular-nums">
          <span className="sr-only">Tasks: </span>
          {state.isPending ? '–' : state.total}
        </span>
        <button
          type="button"
          onClick={() => onAdd(status)}
          aria-label={`Add a task to ${meta.label}`}
          className="ml-auto grid size-[30px] shrink-0 cursor-pointer place-items-center rounded-full bg-card text-muted-foreground shadow-card transition-colors hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
        >
          <Plus aria-hidden="true" className="size-[15px]" />
        </button>
      </header>

      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex flex-1 flex-col gap-3">
          {state.isPending
            ? [0, 1, 2].map((index) => <BoardCardSkeleton key={index} index={index} />)
            : tasks.map((task) => (
                <SortableCard
                  key={task.id}
                  task={task}
                  status={status}
                  crossColumn={originStatus !== null && originStatus !== status}
                />
              ))}
          {!state.isPending && tasks.length === 0 ? (
            <p className="grid min-h-24 place-items-center rounded-[18px] px-4 text-center text-[12.5px] font-semibold text-muted-foreground">
              {status === 'COMPLETED' ? 'Finished tasks land here.' : 'No tasks here yet.'}
            </p>
          ) : null}
        </div>
      </SortableContext>

      {hidden > 0 ? (
        <Link
          to={listHref(status)}
          className="rounded-xl py-1 text-center text-[12.5px] font-bold text-[color-mix(in_oklab,var(--tint)_85%,var(--foreground))] hover:underline"
        >
          +{hidden} more in the list view
        </Link>
      ) : null}

      <button
        type="button"
        onClick={() => onAdd(status)}
        className="flex cursor-pointer items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-border p-[11px] text-[13px] font-semibold text-muted-foreground transition-colors hover:border-[color-mix(in_oklab,var(--tint)_50%,transparent)] hover:bg-card/60 hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
      >
        <Plus aria-hidden="true" className="size-[15px]" />
        Add task
      </button>
    </section>
  );
}

/**
 * Desktop Kanban (spec §16): drag within and between columns with mouse, touch or keyboard.
 * The board shows a local copy of the columns while dragging; on drop the parent writes the
 * result to the cache (optimistic) and calls `PATCH /tasks/:id/move`.
 */
export function KanbanBoard({ columns, onMove, onAdd, listHref }: KanbanBoardProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  // After a drop, keep showing the dropped layout until the (optimistically updated) query data
  // reaches this component; otherwise the card flashes back to its old column for a frame.
  const [settling, setSettling] = useState<{ base: BoardColumns; columns: BoardColumns } | null>(
    null,
  );

  const todo = columns.TODO.tasks;
  const inProgress = columns.IN_PROGRESS.tasks;
  const completed = columns.COMPLETED.tasks;
  const serverColumns = useMemo<BoardColumns>(
    () => ({ TODO: todo, IN_PROGRESS: inProgress, COMPLETED: completed }),
    [todo, inProgress, completed],
  );
  if (settling && settling.base !== serverColumns) setSettling(null);
  const visible = drag?.columns ?? settling?.columns ?? serverColumns;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinates, keyboardCodes }),
  );

  const titleOf = (id: UniqueIdentifier) => {
    const status = findColumn(visible, String(id));
    return status ? (visible[status].find((task) => task.id === id)?.title ?? 'Task') : 'Task';
  };
  const describeOver = (id: UniqueIdentifier) => {
    const key = String(id);
    if (isStatus(key)) return `the ${STATUS_META[key].label} column`;
    const status = findColumn(visible, key);
    if (!status) return 'the board';
    const index = visible[status].findIndex((task) => task.id === key);
    return `position ${index + 1} of ${visible[status].length} in ${STATUS_META[status].label}`;
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${titleOf(active.id)} is over ${describeOver(over.id)}.`
        : `${titleOf(active.id)} is no longer over a column.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${titleOf(active.id)} was dropped at ${describeOver(over.id)}.`
        : `${titleOf(active.id)} was dropped outside the board. Nothing changed.`,
    onDragCancel: ({ active }) => `Moving ${titleOf(active.id)} was cancelled.`,
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    setDrag({ activeId: String(active.id), origin: serverColumns, columns: serverColumns });
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!drag || !over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const from = findColumn(drag.columns, activeId);
    const to = isStatus(overId) ? overId : findColumn(drag.columns, overId);
    if (!from || !to || from === to) return;
    const translated = active.rect.current.translated;
    const below = translated ? translated.top > over.rect.top + over.rect.height / 2 : false;
    const index = isStatus(overId)
      ? drag.columns[to].length
      : dropIndex(drag.columns[to], overId, below);
    setDrag({ ...drag, columns: moveCard(drag.columns, activeId, to, index) });
  };

  const onDragEnd = ({ active, over, activatorEvent }: DragEndEvent) => {
    if (!drag) return;
    if (!over) {
      setDrag(null);
      return;
    }
    const activeId = String(active.id);
    const overId = String(over.id);
    let final = drag.columns;
    const container = findColumn(final, activeId);
    if (container && !isStatus(overId) && findColumn(final, overId) === container) {
      const list = final[container];
      const oldIndex = list.findIndex((task) => task.id === activeId);
      const newIndex = list.findIndex((task) => task.id === overId);
      if (oldIndex !== newIndex)
        final = { ...final, [container]: arrayMove(list, oldIndex, newIndex) };
    }
    const move = resolveMove(drag.origin, final, activeId);
    if (move) {
      setSettling({ base: serverColumns, columns: final });
      onMove(move, final);
    }
    setDrag(null);
    // A card dropped into another column is a new DOM node: give keyboard users their focus back.
    if (activatorEvent instanceof KeyboardEvent) {
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`[data-card-id="${activeId}"]`)?.focus(),
      );
    }
  };

  const activeTask = drag
    ? (() => {
        const status = findColumn(drag.columns, drag.activeId);
        return status ? drag.columns[status].find((task) => task.id === drag.activeId) : undefined;
      })()
    : undefined;
  const originStatus = drag ? findColumn(drag.origin, drag.activeId) : null;
  const currentStatus = drag ? findColumn(drag.columns, drag.activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{ announcements, screenReaderInstructions }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDrag(null)}
    >
      <div className="grid grid-cols-3 items-start gap-3.5 xl:gap-[18px]">
        {TASK_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            state={columns[status]}
            tasks={visible[status]}
            isTarget={currentStatus === status && originStatus !== status}
            originStatus={originStatus}
            onAdd={onAdd}
            listHref={listHref}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
        {activeTask ? <BoardCard task={activeTask} overlay grip titleLink={false} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
