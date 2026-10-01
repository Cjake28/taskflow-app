import type { TaskDto } from '@taskflow/shared';
import { CircleCheck, Ellipsis, ExternalLink, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { Link } from 'react-router';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface TaskActions {
  onToggleComplete: (task: TaskDto) => void;
  onEdit: (task: TaskDto) => void;
  onDelete: (task: TaskDto) => void;
}

/** "…" menu for a task (mobile cards and narrow layouts). */
export function TaskRowMenu({
  task,
  actions,
  className,
}: {
  task: TaskDto;
  actions: TaskActions;
  className?: string;
}) {
  const done = task.status === 'COMPLETED';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for “${task.title}”`}
        className={cn(
          'grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl text-muted-foreground transition-colors outline-none hover:bg-fill hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/30 data-[state=open]:bg-fill data-[state=open]:text-foreground',
          className,
        )}
      >
        <Ellipsis aria-hidden="true" className="size-[18px]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem asChild>
          <Link to={`/tasks/${task.id}`}>
            <ExternalLink aria-hidden="true" />
            Open
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onEdit(task)}>
          <Pencil aria-hidden="true" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onToggleComplete(task)}>
          {done ? <RotateCcw aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
          {done ? 'Reopen' : 'Mark as completed'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => actions.onDelete(task)}>
          <Trash2 aria-hidden="true" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
