import type { CSSProperties } from 'react';

import { OVERDUE_META, STATUS_META, type TaskStatus } from '@/lib/task-meta';
import { cn } from '@/lib/utils';

export interface StatusBadgeProps {
  status: TaskStatus | 'OVERDUE';
  className?: string;
}

/** Status pill: tinted background, coloured dot and a text label (never colour alone). */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const meta = status === 'OVERDUE' ? OVERDUE_META : STATUS_META[status];
  return (
    <span
      data-status={status}
      style={{ '--tint': meta.tint } as CSSProperties}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-tint-strong px-2.5 py-1 text-xs font-bold whitespace-nowrap text-tint',
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-(--tint)" />
      {meta.label}
    </span>
  );
}
