import { useState, type CSSProperties } from 'react';
import { TASK_STATUSES, type TaskDto, type TaskStatus } from '@taskflow/shared';
import { Check, Pencil, Trash2 } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';

import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { STATUS_META } from '@/lib/task-meta';
import { cn } from '@/lib/utils';

export interface MoveTaskSheetProps {
  /** The task the sheet is for; null closes it. */
  task: TaskDto | null;
  onOpenChange: (open: boolean) => void;
  onMove: (task: TaskDto, status: TaskStatus) => void;
  onEdit: (task: TaskDto) => void;
  onDelete: (task: TaskDto) => void;
}

const row =
  'flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-[13px] text-left text-[14.5px] font-semibold transition-colors hover:bg-fill focus-visible:bg-fill focus-visible:outline-none';

/** Bottom sheet for the phone board (spec §14.9): "Move to…" instead of drag and drop. */
export function MoveTaskSheet({
  task,
  onOpenChange,
  onMove,
  onEdit,
  onDelete,
}: MoveTaskSheetProps) {
  // Keep the content while the sheet slides out.
  const [shown, setShown] = useState(task);
  if (task && task !== shown) setShown(task);

  const choose = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <Dialog open={task !== null} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-[28px] bg-card px-[18px] pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-card-foreground shadow-pop outline-none data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:duration-300 data-[state=open]:slide-in-from-bottom">
          <div aria-hidden="true" className="mx-auto mb-3.5 h-[5px] w-11 rounded-full bg-border" />
          {shown ? (
            <>
              <DialogPrimitive.Title className="line-clamp-2 px-1.5 text-base font-extrabold">
                {shown.title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                Move this task to another column, edit it or delete it.
              </DialogPrimitive.Description>

              <p
                id="move-to-label"
                className="mx-1.5 mt-3.5 mb-1 text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase"
              >
                Move to
              </p>
              <div role="group" aria-labelledby="move-to-label">
                {TASK_STATUSES.map((status) => {
                  const current = status === shown.status;
                  return (
                    <button
                      key={status}
                      type="button"
                      aria-current={current ? 'true' : undefined}
                      onClick={() => choose(() => !current && onMove(shown, status))}
                      style={{ '--dot': STATUS_META[status].tint } as CSSProperties}
                      className={cn(row, current && 'bg-fill')}
                    >
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full bg-(--dot)"
                      />
                      {STATUS_META[status].label}
                      {current ? (
                        <>
                          <span className="sr-only">(current)</span>
                          <Check aria-hidden="true" className="ml-auto size-[18px] text-primary" />
                        </>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <div className="my-2 h-px bg-border" />
              <button type="button" className={row} onClick={() => choose(() => onEdit(shown))}>
                <Pencil aria-hidden="true" className="size-[18px] text-muted-foreground" />
                Edit task
              </button>
              <button
                type="button"
                className={cn(
                  row,
                  'text-danger hover:bg-[color-mix(in_oklab,var(--danger)_9%,var(--card))]',
                )}
                onClick={() => choose(() => onDelete(shown))}
              >
                <Trash2 aria-hidden="true" className="size-[18px]" />
                Delete task
              </button>
            </>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
