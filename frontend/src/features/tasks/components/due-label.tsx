import type { TaskDto } from '@taskflow/shared';
import { CalendarCheck2, CalendarDays, Clock3, TriangleAlert } from 'lucide-react';

import { cn } from '@/lib/utils';

import { dueSentence, dueText, dueTone, formatDueDetail, type DueTone } from '../format';

type DueTask = Pick<TaskDto, 'dueDate' | 'hasDueTime' | 'status' | 'isOverdue'>;

const TONE_CLASS: Record<DueTone, string> = {
  overdue: 'text-danger',
  today: 'text-[color-mix(in_oklab,var(--status-progress)_85%,var(--foreground))]',
  done: 'text-muted-foreground',
  normal: 'text-muted-foreground',
  none: 'text-muted-foreground',
};

export interface DueLabelProps {
  task: DueTask;
  /** "Due today · 11:30 AM" instead of "Today · 11:30 AM". */
  sentence?: boolean;
  /** Text shown when there is no due date (nothing by default). */
  emptyText?: string;
  className?: string;
}

/** Due date with an icon; overdue in coral, due today in orange (spec §15.4). */
export function DueLabel({ task, sentence = false, emptyText, className }: DueLabelProps) {
  const tone = dueTone(task);
  if (tone === 'none') {
    return emptyText ? (
      <span className={cn('text-[12.5px] font-semibold text-muted-foreground', className)}>
        {emptyText}
      </span>
    ) : null;
  }
  const Icon =
    tone === 'overdue'
      ? TriangleAlert
      : tone === 'done'
        ? CalendarCheck2
        : tone === 'today' || task.hasDueTime
          ? Clock3
          : CalendarDays;
  const text = sentence ? dueSentence(task) : dueText(task);

  return (
    <span
      data-tone={tone}
      title={formatDueDetail(task) ?? undefined}
      className={cn(
        'inline-flex items-center gap-1.5 text-[12.5px] font-semibold whitespace-nowrap',
        TONE_CLASS[tone],
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {text}
    </span>
  );
}
