import type { ReactNode } from 'react';
import type { TaskDto, TaskStatus } from '@taskflow/shared';
import { CircleCheck, GripVertical, Paperclip } from 'lucide-react';
import { Link } from 'react-router';

import { SecureImage } from '@/components/images/secure-image';
import { PriorityIndicator } from '@/components/common/priority-indicator';
import { Skeleton } from '@/components/ui/skeleton';
import { STATUS_META } from '@/lib/task-meta';
import { cn } from '@/lib/utils';

import { formatDateTime, formatRelativeShort } from '../format';
import { DueLabel } from './due-label';

export interface BoardCardProps {
  task: TaskDto;
  /** Floating copy that follows the pointer while dragging. */
  overlay?: boolean;
  /** Extra control in the top-right corner (the mobile "…" button). */
  menu?: ReactNode;
  /** Show the grip affordance (desktop drag and drop). */
  grip?: boolean;
  /** Render the title as a link (off when the whole card is the interactive element). */
  titleLink?: boolean;
  className?: string;
}

function DoneLabel({ completedAt }: { completedAt: string }) {
  const relative = formatRelativeShort(completedAt);
  const text = /^(Just now|Yesterday)$/.test(relative) ? relative.toLowerCase() : relative;
  return (
    <span
      title={formatDateTime(completedAt)}
      className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground"
    >
      <CircleCheck aria-hidden="true" className="size-3.5 shrink-0 text-status-done" />
      Done {text}
    </span>
  );
}

/** Kanban card (spec §16): cover thumbnail, title, description, priority, due and 📎 count. */
export function BoardCard({
  task,
  overlay = false,
  menu,
  grip = false,
  titleLink = true,
  className,
}: BoardCardProps) {
  const done = task.status === 'COMPLETED';
  return (
    <article
      className={cn(
        'relative flex flex-col gap-[9px] rounded-item bg-card p-3.5 shadow-card',
        overlay && 'rotate-[2.5deg] cursor-grabbing shadow-pop outline-2 outline-primary',
        className,
      )}
    >
      {task.coverThumbUrl ? (
        <SecureImage
          src={task.coverThumbUrl}
          alt=""
          compactFallback
          className="-mx-0.5 -mt-0.5 aspect-[16/8] rounded-xl"
          imgClassName="object-cover"
        />
      ) : null}
      {grip && !task.coverThumbUrl ? (
        <GripVertical
          aria-hidden="true"
          className="absolute top-3 right-2.5 size-4 text-muted-foreground opacity-50"
        />
      ) : null}
      {menu ? <div className="absolute top-2 right-2 z-10">{menu}</div> : null}
      <h3
        className={cn(
          'text-sm leading-snug font-bold',
          (grip || menu) && !task.coverThumbUrl && 'pr-6',
          done && 'text-muted-foreground line-through decoration-[1.5px]',
        )}
      >
        {titleLink ? (
          <Link
            to={`/tasks/${task.id}`}
            draggable={false}
            className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-item hover:text-primary focus-visible:ring-4 focus-visible:ring-ring/30"
          >
            {task.title}
          </Link>
        ) : (
          task.title
        )}
      </h3>
      {task.description ? (
        <p className="line-clamp-2 text-[12.5px] leading-[1.45] text-muted-foreground">
          {task.description}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <PriorityIndicator priority={task.priority} />
        <span className="flex items-center gap-2.5">
          {task.imageCount > 0 ? (
            <span
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground"
              aria-label={`${task.imageCount} ${task.imageCount === 1 ? 'image' : 'images'}`}
            >
              <Paperclip aria-hidden="true" className="size-3.5" />
              {task.imageCount}
            </span>
          ) : null}
          {done && task.completedAt ? (
            <DoneLabel completedAt={task.completedAt} />
          ) : (
            <DueLabel task={task} />
          )}
        </span>
      </div>
    </article>
  );
}

/** Where a dragged card will land. Same-column moves show a faded card; other columns a label. */
export function DropPlaceholder({
  task,
  status,
  crossColumn,
}: {
  task: TaskDto;
  status: TaskStatus;
  crossColumn: boolean;
}) {
  if (!crossColumn) {
    return (
      <div
        aria-hidden="true"
        className="rounded-item outline-2 -outline-offset-2 outline-dashed outline-[color-mix(in_oklab,var(--muted-foreground)_40%,transparent)]"
      >
        <BoardCard task={task} className="opacity-35 shadow-none" />
      </div>
    );
  }
  const label =
    status === 'COMPLETED'
      ? 'Drop here to mark as Completed'
      : `Drop here to move to ${STATUS_META[status].label}`;
  return (
    <div
      aria-hidden="true"
      className="grid min-h-24 place-items-center rounded-item border-2 border-dashed border-[color-mix(in_oklab,var(--tint)_60%,transparent)] bg-[color-mix(in_oklab,var(--tint)_8%,transparent)] px-3 text-center text-[12.5px] font-bold text-[color-mix(in_oklab,var(--tint)_85%,var(--foreground))]"
    >
      {label}
    </div>
  );
}

export function BoardCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-2.5 rounded-item bg-card p-3.5 shadow-card"
    >
      <Skeleton className="h-3.5 rounded-full" style={{ width: `${60 + ((index * 17) % 30)}%` }} />
      <Skeleton className="h-2.5 w-4/5 rounded-full" />
      <div className="mt-1 flex justify-between">
        <Skeleton className="h-3 w-14 rounded-full" />
        <Skeleton className="h-3 w-20 rounded-full" />
      </div>
    </div>
  );
}
