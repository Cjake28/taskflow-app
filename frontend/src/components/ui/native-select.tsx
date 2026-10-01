import type { ComponentProps, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

export type NativeSelectProps = ComponentProps<'select'> & {
  startIcon?: ReactNode;
  /** Shorter, for settings rows. */
  compact?: boolean;
  wrapperClassName?: string;
};

/**
 * A native `<select>` (keyboard and screen-reader behaviour for free) styled like the inputs.
 * The wrapper mirrors focus and `aria-invalid` from the select.
 */
export function NativeSelect({
  startIcon,
  compact = false,
  className,
  wrapperClassName,
  disabled,
  children,
  ...props
}: NativeSelectProps) {
  return (
    <div
      className={cn(
        'relative flex w-full items-center gap-2.5 rounded-input border-[1.5px] border-transparent bg-fill px-3.5 text-sm text-foreground transition-[background-color,border-color,box-shadow] duration-150 has-[select:focus-visible]:border-primary has-[select:focus-visible]:bg-card has-[select:focus-visible]:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_16%,transparent)] has-[select[aria-invalid=true]]:border-danger',
        compact ? 'min-h-10 px-3' : 'min-h-12',
        disabled && 'opacity-60',
        wrapperClassName,
      )}
    >
      {startIcon ? (
        <span
          aria-hidden="true"
          className="flex shrink-0 text-muted-foreground [&_svg]:size-[17px]"
        >
          {startIcon}
        </span>
      ) : null}
      <select
        disabled={disabled}
        className={cn(
          'w-full min-w-0 cursor-pointer appearance-none bg-transparent pr-6 text-base outline-none disabled:cursor-not-allowed sm:text-sm',
          compact ? 'h-9 text-[13.5px] sm:text-[13px]' : 'h-11',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 size-4 text-muted-foreground"
      />
    </div>
  );
}
