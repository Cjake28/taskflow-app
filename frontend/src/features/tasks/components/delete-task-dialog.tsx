import { useState } from 'react';
import type { TaskDto } from '@taskflow/shared';

import { ConfirmDialog } from '@/components/common/confirm-dialog';

import { useDeleteTask } from '../hooks';

export interface DeleteTaskDialogProps {
  /** The task to delete; null keeps the dialog closed. */
  task: Pick<TaskDto, 'id' | 'title'> | null;
  onOpenChange: (open: boolean) => void;
  /** Runs after the server confirmed the deletion (e.g. leave the details page). */
  onDeleted?: () => void;
}

/** "Delete this task?" confirmation (spec §14.9); stays open with a spinner until it settles. */
export function DeleteTaskDialog({ task, onOpenChange, onDeleted }: DeleteTaskDialogProps) {
  const deleteTask = useDeleteTask();
  // Keep the title on screen while the dialog animates out.
  const [shown, setShown] = useState(task);
  if (task && task !== shown) setShown(task);

  return (
    <ConfirmDialog
      open={task !== null}
      onOpenChange={onOpenChange}
      title="Delete this task?"
      description={
        <>
          “<b className="font-bold text-foreground">{shown?.title}</b>” will be permanently deleted.
          This can&apos;t be undone.
        </>
      }
      confirmLabel="Delete task"
      onConfirm={async () => {
        if (!task) return;
        await deleteTask.mutateAsync(task);
        onDeleted?.();
      }}
    />
  );
}
