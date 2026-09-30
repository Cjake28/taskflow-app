import type { KeyboardEvent } from 'react';
import { format } from 'date-fns';

import { cn } from '@/lib/utils';

import type { WeekDaySummary } from '../lib/agenda';

export interface WeekStripProps {
  days: WeekDaySummary[];
  selectedKey: string;
  /** Called with a day offset from the selected day (arrow keys may leave the week). */
  onMove: (delta: number) => void;
  onSelect: (day: Date) => void;
  panelId: string;
  idPrefix: string;
}

function countLabel(day: WeekDaySummary): string {
  if (day.count === 0) return 'no tasks due';
  const tasks = `${day.count} ${day.count === 1 ? 'task' : 'tasks'} due`;
  return day.hasOverdue ? `${tasks}, some overdue` : tasks;
}

/**
 * Mon–Sun selector (a tab list: the timeline below is its panel). Dots mark days with tasks;
 * coral dots mean something that day is overdue. Arrow keys move by a day and can cross into the
 * previous or next week; Home/End jump to Monday/Sunday.
 */
export function WeekStrip({
  days,
  selectedKey,
  onMove,
  onSelect,
  panelId,
  idPrefix,
}: WeekStripProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      Home: -index,
      End: days.length - 1 - index,
    };
    const delta = moves[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    onMove(delta);
  };

  return (
    <div role="tablist" aria-label="Days of the week" className="grid grid-cols-7 gap-1 sm:gap-1.5">
      {days.map((day, index) => {
        const selected = day.key === selectedKey;
        return (
          <button
            key={day.key}
            id={`${idPrefix}-${day.key}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            aria-label={`${format(day.date, 'EEEE, MMMM d')}${day.isToday ? ' (today)' : ''}: ${countLabel(day)}`}
            onClick={() => onSelect(day.date)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-1.5 rounded-[18px] pt-2.5 pb-[9px] text-xs font-semibold transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none sm:rounded-tile',
              selected
                ? 'bg-primary text-white/85 shadow-glow'
                : day.isToday
                  ? '[--tint:var(--primary)] bg-tint-faint text-primary hover:bg-tint-soft'
                  : 'text-muted-foreground hover:bg-fill hover:text-foreground',
            )}
          >
            <span aria-hidden="true">{format(day.date, 'EEE')}</span>
            <span
              aria-hidden="true"
              className={cn(
                'text-base leading-none font-bold tabular-nums',
                selected ? 'text-white' : day.isToday ? 'text-primary' : 'text-foreground',
              )}
            >
              {format(day.date, 'd')}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'size-[5px] rounded-full',
                day.count === 0
                  ? 'bg-transparent'
                  : selected
                    ? 'bg-white'
                    : day.hasOverdue
                      ? 'bg-danger'
                      : day.openCount === 0
                        ? 'bg-status-done'
                        : 'bg-muted-foreground/60',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
