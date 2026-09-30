import { useState, type CSSProperties, type ReactNode } from 'react';
import { Trash2, type LucideIcon } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** May return a promise: the dialog stays open with a spinner until it settles. */
  onConfirm: () => void | Promise<void>;
  /** Destructive (coral, default) or a neutral primary confirmation. */
  tone?: 'danger' | 'default';
  icon?: LucideIcon;
}

/**
 * Confirmation for destructive actions (spec §14.9): delete task, remove image, revoke session,
 * disconnect account, log out of all devices. Built on the accessible Radix AlertDialog.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  tone = 'danger',
  icon: Icon = Trash2,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // The caller reports the failure (toast); keep the dialog open so the user can retry.
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia
            className="mb-2.5"
            style={
              tone === 'danger' ? undefined : ({ '--tint': 'var(--primary)' } as CSSProperties)
            }
          >
            <Icon aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <Button
            variant={tone === 'danger' ? 'destructive' : 'default'}
            loading={pending}
            onClick={() => void handleConfirm()}
          >
            {!pending && tone === 'danger' ? <Icon aria-hidden="true" /> : null}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
