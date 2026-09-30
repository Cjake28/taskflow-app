import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Filled input (spec §15.5: 14px radius, fill surface, primary focus ring, coral when invalid).
 * `startIcon` and `endSlot` render inside the field; the wrapper mirrors the input's
 * focus and aria-invalid state so the whole control lights up.
 */
type InputProps = React.ComponentProps<'input'> & {
  startIcon?: React.ReactNode;
  endSlot?: React.ReactNode;
  wrapperClassName?: string;
};

const shell =
  'flex min-h-12 w-full items-center gap-2.5 rounded-input border-[1.5px] border-transparent bg-fill px-3.5 text-sm text-foreground transition-[background-color,border-color,box-shadow] duration-150 has-[input:disabled]:opacity-60 has-[input:focus-visible]:border-primary has-[input:focus-visible]:bg-card has-[input:focus-visible]:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_16%,transparent)] has-[input[aria-invalid=true]]:border-danger has-[input[aria-invalid=true]]:bg-[color-mix(in_oklab,var(--danger)_6%,var(--card))] has-[input[aria-invalid=true]:focus-visible]:shadow-[0_0_0_4px_color-mix(in_oklab,var(--danger)_14%,transparent)]';

function Input({ className, wrapperClassName, type, startIcon, endSlot, ...props }: InputProps) {
  return (
    <div data-slot="input-wrapper" className={cn(shell, wrapperClassName)}>
      {startIcon ? (
        <span
          aria-hidden="true"
          className="flex shrink-0 text-muted-foreground [&_svg]:size-[17px]"
        >
          {startIcon}
        </span>
      ) : null}
      <input
        type={type}
        data-slot="input"
        className={cn(
          // 16px on phones stops iOS Safari from zooming into the field on focus.
          'h-11 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed sm:text-sm',
          className,
        )}
        {...props}
      />
      {endSlot ? <span className="-mr-1.5 flex shrink-0 items-center">{endSlot}</span> : null}
    </div>
  );
}

export { Input };
export type { InputProps };
