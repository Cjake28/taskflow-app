import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface CompletionToggleProps {
  completed: boolean;
  title: string;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}

/** Round completion checkbox (list rows and mobile cards). */
export function CompletionToggle({
  completed,
  title,
  onToggle,
  disabled = false,
  className,
}: CompletionToggleProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={completed}
      aria-label={completed ? `Mark “${title}” as not completed` : `Mark “${title}” as completed`}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'group/check relative grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-full border-2 transition-[background-color,border-color,transform] duration-200 after:absolute after:-inset-2.5 focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none active:scale-90 disabled:cursor-default disabled:opacity-60',
        completed
          ? 'border-status-done bg-status-done text-white'
          : 'border-[color-mix(in_oklab,var(--muted-foreground)_55%,transparent)] text-transparent hover:border-status-done hover:text-[color-mix(in_oklab,var(--status-done)_70%,transparent)]',
        className,
      )}
    >
      <Check
        aria-hidden="true"
        strokeWidth={3.2}
        className={cn(
          'size-3 transition-transform duration-200',
          completed ? 'scale-100' : 'scale-75 group-hover/check:scale-100',
        )}
      />
    </button>
  );
}
