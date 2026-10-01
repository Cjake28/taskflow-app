import type { ReactNode } from 'react';
import type { TaskDto } from '@taskflow/shared';
import { Paperclip } from 'lucide-react';
import { Link } from 'react-router';

import { PriorityIndicator } from '@/components/common/priority-indicator';
import { StatusBadge } from '@/components/common/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { CompletionToggle } from './completion-toggle';
import { DueLabel } from './due-label';
import { TaskRowMenu, type TaskActions } from './task-row-menu';

/** Phone layout of the task list: one card per task (spec §14.9). */
export function TaskCardList({
  tasks,
  actions,
  stale = false,
  footer,
}: {
  tasks: TaskDto[];
  actions: TaskActions;
  stale?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-3 transition-opacity', stale && 'opacity-60')}>
      <ul className="flex flex-col gap-3" aria-busy={stale || undefined}>
        {tasks.map((task) => {
          const done = task.status === 'COMPLETED';
          return (
            <li
              key={task.id}
              className="relative flex items-start gap-3 rounded-[18px] bg-card p-3.5 shadow-card transition-transform active:scale-[0.99]"
            >
              <CompletionToggle
                className="relative z-10 mt-0.5"
                completed={done}
                title={task.title}
                onToggle={() => actions.onToggleComplete(task)}
              />
              <div className="min-w-0 flex-1">
                <Link
                  to={`/tasks/${task.id}`}
                  className={cn(
                    'block truncate rounded-sm text-[14.5px] font-bold after:absolute after:inset-0 after:rounded-[18px]',
                    done && 'text-muted-foreground line-through decoration-[1.5px]',
                  )}
                >
                  {task.title}
                </Link>
                {task.description ? (
                  <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                    {task.description}
                  </p>
                ) : null}
                <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <StatusBadge status={task.status} />
                  <PriorityIndicator priority={task.priority} />
                  <DueLabel task={task} />
                  {task.imageCount > 0 ? (
                    <span
                      className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground"
                      aria-label={`${task.imageCount} ${task.imageCount === 1 ? 'image' : 'images'}`}
                    >
                      <Paperclip aria-hidden="true" className="size-3.5" />
                      {task.imageCount}
                    </span>
                  ) : null}
                </div>
              </div>
              <TaskRowMenu task={task} actions={actions} className="relative z-10 -mt-1 -mr-1" />
            </li>
          );
        })}
      </ul>
      {footer ? <div className="rounded-[18px] bg-card shadow-card">{footer}</div> : null}
    </div>
  );
}

export function TaskCardListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-start gap-3 rounded-[18px] bg-card p-3.5 shadow-card">
          <Skeleton className="size-[22px] rounded-full" />
          <div className="flex-1">
            <Skeleton className="mb-2 h-3.5 rounded-full" style={{ width: `${55 + ((index * 13) % 30)}%` }} />
            <Skeleton className="mb-3 h-2.5 w-4/5 rounded-full" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
