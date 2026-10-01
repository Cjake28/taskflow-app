import type { ReactNode } from 'react';
import type { TaskDto } from '@taskflow/shared';
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Ellipsis,
  Paperclip,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router';

import { PriorityIndicator } from '@/components/common/priority-indicator';
import { StatusBadge } from '@/components/common/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { formatDateTime, formatRelativeShort } from '../format';
import type { ListSortField, SortOrder } from '../url-state';
import { CompletionToggle } from './completion-toggle';
import { DueLabel } from './due-label';
import { ReminderCount } from './reminder-count';
import type { TaskActions } from './task-row-menu';

export interface TaskTableProps {
  tasks: TaskDto[];
  actions: TaskActions;
  sortBy: ListSortField;
  sortOrder: SortOrder;
  onSort: (field: ListSortField) => void;
  /** Dim rows while a new page or filter loads over the previous results. */
  stale?: boolean;
  footer?: ReactNode;
}

const th =
  'bg-[color-mix(in_oklab,var(--fill)_55%,var(--card))] px-4 py-3.5 text-left text-[11.5px] font-bold tracking-[0.07em] whitespace-nowrap text-muted-foreground uppercase';

function SortHeader({
  field,
  label,
  sortBy,
  sortOrder,
  onSort,
  className,
}: {
  field: ListSortField;
  label: string;
  sortBy: ListSortField;
  sortOrder: SortOrder;
  onSort: (field: ListSortField) => void;
  className?: string;
}) {
  const active = sortBy === field;
  const Icon = active ? (sortOrder === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
      className={cn(th, 'p-0', className)}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'group/sort inline-flex w-full cursor-pointer items-center gap-1.5 px-4 py-3.5 text-left uppercase transition-colors outline-none hover:text-foreground focus-visible:text-foreground focus-visible:underline',
          active && 'text-foreground',
        )}
      >
        {label}
        <Icon
          aria-hidden="true"
          className={cn(
            'size-3.5 shrink-0 transition-opacity',
            active
              ? 'opacity-100'
              : 'opacity-0 group-hover/sort:opacity-70 group-focus-visible/sort:opacity-70',
          )}
        />
      </button>
    </th>
  );
}

function RowActions({ task, actions }: { task: TaskDto; actions: TaskActions }) {
  const button =
    'grid size-8 cursor-pointer place-items-center rounded-[10px] bg-card text-muted-foreground shadow-card transition-colors hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none';
  return (
    <div className="relative flex justify-end">
      <Ellipsis
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2 size-[18px] -translate-y-1/2 text-muted-foreground transition-opacity group-focus-within/row:opacity-0 group-hover/row:opacity-0 pointer-coarse:hidden"
      />
      <div className="flex gap-1 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-100">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={button}
              onClick={() => actions.onEdit(task)}
              aria-label={`Edit “${task.title}”`}
            >
              <Pencil aria-hidden="true" className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Edit</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(button, 'hover:text-danger')}
              onClick={() => actions.onDelete(task)}
              aria-label={`Delete “${task.title}”`}
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

/** Desktop task table (spec §16): completion, title, status, priority, due, updated, actions. */
export function TaskTable({
  tasks,
  actions,
  sortBy,
  sortOrder,
  onSort,
  stale = false,
  footer,
}: TaskTableProps) {
  return (
    <div className="overflow-hidden rounded-card bg-card shadow-card">
      <table
        aria-busy={stale || undefined}
        className={cn('w-full border-collapse transition-opacity', stale && 'opacity-60')}
      >
        <thead>
          <tr>
            <th scope="col" className={cn(th, 'w-[52px]')}>
              <span className="sr-only">Completed</span>
            </th>
            <SortHeader field="title" label="Task" {...{ sortBy, sortOrder, onSort }} />
            <th scope="col" className={cn(th, 'w-[136px]')}>
              Status
            </th>
            <SortHeader
              field="priority"
              label="Priority"
              className="w-[118px]"
              {...{ sortBy, sortOrder, onSort }}
            />
            <SortHeader
              field="dueDate"
              label="Due"
              className="w-[176px]"
              {...{ sortBy, sortOrder, onSort }}
            />
            <SortHeader
              field="updatedAt"
              label="Updated"
              className="hidden w-[118px] xl:table-cell"
              {...{ sortBy, sortOrder, onSort }}
            />
            <th scope="col" className={cn(th, 'w-[92px]')}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const done = task.status === 'COMPLETED';
            return (
              <tr
                key={task.id}
                className="group/row transition-colors hover:bg-[color-mix(in_oklab,var(--primary)_5%,var(--card))] focus-within:bg-[color-mix(in_oklab,var(--primary)_5%,var(--card))]"
              >
                <td className="border-t border-border py-3.5 pr-0 pl-4 align-middle">
                  <CompletionToggle
                    completed={done}
                    title={task.title}
                    onToggle={() => actions.onToggleComplete(task)}
                  />
                </td>
                <td className="w-full max-w-0 border-t border-border px-4 py-3.5">
                  <Link
                    to={`/tasks/${task.id}`}
                    className={cn(
                      'block truncate rounded-sm text-sm font-bold transition-colors hover:text-primary',
                      done && 'text-muted-foreground line-through decoration-[1.5px]',
                    )}
                  >
                    {task.title}
                  </Link>
                  {task.description || task.imageCount > 0 || task.reminderCount > 0 ? (
                    <p className="mt-0.5 flex items-center gap-2 text-[12.5px] text-muted-foreground">
                      {task.description ? (
                        <span className="truncate">{task.description}</span>
                      ) : null}
                      {task.imageCount > 0 ? (
                        <span
                          className="inline-flex shrink-0 items-center gap-1 font-semibold"
                          aria-label={`${task.imageCount} ${task.imageCount === 1 ? 'image' : 'images'}`}
                        >
                          <Paperclip aria-hidden="true" className="size-3.5" />
                          {task.imageCount}
                        </span>
                      ) : null}
                      <ReminderCount count={task.reminderCount} className="shrink-0" />
                    </p>
                  ) : null}
                </td>
                <td className="border-t border-border px-4 py-3.5">
                  <StatusBadge status={task.status} />
                </td>
                <td className="border-t border-border px-4 py-3.5">
                  <PriorityIndicator priority={task.priority} />
                </td>
                <td className="border-t border-border px-4 py-3.5">
                  <DueLabel task={task} emptyText="—" />
                </td>
                <td className="hidden border-t border-border px-4 py-3.5 text-[13px] whitespace-nowrap text-muted-foreground xl:table-cell">
                  <time dateTime={task.updatedAt} title={formatDateTime(task.updatedAt)}>
                    {formatRelativeShort(task.updatedAt)}
                  </time>
                </td>
                <td className="border-t border-border py-3.5 pr-4 pl-2">
                  <RowActions task={task} actions={actions} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {footer ? <div className="border-t border-border">{footer}</div> : null}
    </div>
  );
}

/** Table-shaped skeleton (spec §16 loading state). */
export function TaskTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-card bg-card shadow-card" aria-hidden="true">
      <div className={cn(th, 'h-[46px]')} />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-t border-border px-4 py-[17px]">
          <Skeleton className="size-[22px] rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton
              className="mb-2 h-3 rounded-full"
              style={{ width: `${48 + ((index * 17) % 30)}%` }}
            />
            <Skeleton
              className="h-2.5 rounded-full"
              style={{ width: `${62 + ((index * 11) % 25)}%` }}
            />
          </div>
          <Skeleton className="h-[24px] w-[92px] rounded-full" />
          <Skeleton className="h-3 w-[70px] rounded-full" />
          <Skeleton className="h-3 w-[110px] rounded-full" />
          <Skeleton className="hidden h-3 w-[60px] rounded-full xl:block" />
          <div className="w-[60px]" />
        </div>
      ))}
    </div>
  );
}
