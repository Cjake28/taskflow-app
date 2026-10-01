import type { CSSProperties, KeyboardEvent } from 'react';
import type { TaskDto } from '@taskflow/shared';
import { format, isSameDay, isSameMonth } from 'date-fns';

import { OVERDUE_META, STATUS_META } from '@/lib/task-meta';
import { dayKey } from '@/lib/task-days';
import { cn } from '@/lib/utils';

import { WEEKDAY_LABELS } from '../lib/month';

/** Lines a day cell can hold (desktop): all tasks if they fit, else two plus "+N more". */
const MAX_LINES = 3;

function visibleChips(count: number): number {
  return count <= MAX_LINES ? count : MAX_LINES - 1;
}

function chipTint(task: TaskDto): string {
  return task.isOverdue ? OVERDUE_META.tint : STATUS_META[task.status].tint;
}

function TaskChip({ task }: { task: TaskDto }) {
  const done = task.status === 'COMPLETED';
  return (
    <span
      style={{ '--tint': chipTint(task) } as CSSProperties}
      className={cn(
        'flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-[3px] text-left text-[11.5px] leading-tight font-semibold',
        'bg-[color-mix(in_oklab,var(--tint)_14%,var(--card))] text-[color-mix(in_oklab,var(--tint)_70%,var(--foreground))]',
        done && 'opacity-70',
      )}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-(--tint)" />
      {/* Times are listed in the day panel; the cell keeps the title as long as possible. */}
      <span className={cn('truncate', done && 'line-through')}>{task.title}</span>
    </span>
  );
}

function describeDay(day: Date, tasks: readonly TaskDto[], now: Date): string {
  const parts = [format(day, 'EEEE, MMMM d')];
  if (isSameDay(day, now)) parts.push('today');
  if (tasks.length === 0) parts.push('no tasks');
  else parts.push(`${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`);
  const overdue = tasks.filter((task) => task.isOverdue).length;
  if (overdue > 0) parts.push(`${overdue} overdue`);
  return parts.join(', ');
}

export interface MonthGridProps {
  month: Date;
  days: Date[];
  groups: Map<string, TaskDto[]>;
  selected: Date;
  now: Date;
  idPrefix: string;
  onSelect: (day: Date) => void;
  /** Arrow keys / PageUp / PageDown: move the selection by days and focus it. */
  onMove: (deltaDays: number, deltaMonths?: number) => void;
}

/**
 * A month as whole weeks. Each day is a button (roving tabindex): arrows move by a day or a
 * week, PageUp/PageDown by a month, Home/End to the start/end of the week.
 */
export function MonthGrid({
  month,
  days,
  groups,
  selected,
  now,
  idPrefix,
  onSelect,
  onMove,
}: MonthGridProps) {
  const weeks: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, [number, number?]> = {
      ArrowLeft: [-1],
      ArrowRight: [1],
      ArrowUp: [-7],
      ArrowDown: [7],
      PageUp: [0, -1],
      PageDown: [0, 1],
      Home: [-((selected.getDay() + 6) % 7)],
      End: [6 - ((selected.getDay() + 6) % 7)],
    };
    const move = keys[event.key];
    if (!move) return;
    event.preventDefault();
    onMove(move[0], move[1]);
  };

  return (
    <div role="grid" aria-label={format(month, 'MMMM yyyy')} onKeyDown={handleKeyDown}>
      <div role="row" className="grid grid-cols-7 gap-1 pb-2 sm:gap-1.5">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            role="columnheader"
            className="text-center text-[11px] font-bold tracking-wide text-muted-foreground uppercase"
          >
            <span aria-hidden="true" className="sm:hidden">
              {label.charAt(0)}
            </span>
            <span className="max-sm:sr-only">{label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1 sm:gap-1.5">
        {weeks.map((week) => (
          <div role="row" key={dayKey(week[0]!)} className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {week.map((day) => {
              const key = dayKey(day);
              const tasks = groups.get(key) ?? [];
              const isSelected = isSameDay(day, selected);
              const isToday = isSameDay(day, now);
              const outside = !isSameMonth(day, month);
              const shown = visibleChips(tasks.length);
              const hidden = tasks.length - shown;
              return (
                <div role="gridcell" key={key} aria-selected={isSelected}>
                  <button
                    type="button"
                    id={`${idPrefix}-${key}`}
                    tabIndex={isSelected ? 0 : -1}
                    aria-label={describeDay(day, tasks, now)}
                    aria-current={isToday ? 'date' : undefined}
                    onClick={() => onSelect(day)}
                    className={cn(
                      'flex h-16 w-full cursor-pointer flex-col items-center gap-1 overflow-hidden rounded-[14px] border-[1.5px] p-1 text-left transition-colors sm:h-[118px] sm:items-stretch sm:p-1.5',
                      'focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none',
                      isSelected
                        ? 'border-primary bg-[color-mix(in_oklab,var(--primary)_7%,var(--card))]'
                        : 'border-transparent hover:bg-fill',
                      outside && !isSelected && 'opacity-45',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold tabular-nums',
                        isToday && 'bg-primary text-primary-foreground',
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                    {/* Phones: dots. Larger screens: chips with the task titles. */}
                    <span aria-hidden="true" className="flex gap-1 sm:hidden">
                      {tasks.slice(0, 3).map((task) => (
                        <span
                          key={task.id}
                          style={{ '--tint': chipTint(task) } as CSSProperties}
                          className="size-1.5 rounded-full bg-(--tint)"
                        />
                      ))}
                    </span>
                    <span aria-hidden="true" className="hidden min-w-0 flex-col gap-1 sm:flex">
                      {tasks.slice(0, shown).map((task) => (
                        <TaskChip key={task.id} task={task} />
                      ))}
                      {hidden > 0 ? (
                        <span className="px-1.5 text-[11px] font-bold text-muted-foreground">
                          +{hidden} more
                        </span>
                      ) : null}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
