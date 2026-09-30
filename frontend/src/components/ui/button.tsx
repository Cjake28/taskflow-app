import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition-[background-color,box-shadow,color,opacity,transform] duration-150 outline-none select-none focus-visible:ring-4 focus-visible:ring-ring/30 active:not-disabled:translate-y-px disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
  {
    variants: {
      variant: {
        /** Gradient primary action with a coloured glow. */
        default:
          'bg-brand-gradient text-primary-foreground shadow-glow hover:brightness-[1.06] focus-visible:ring-primary/35',
        /** Card surface with a hairline border. */
        outline:
          'bg-card text-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-fill focus-visible:shadow-none',
        /** Filled neutral, e.g. "Cancel" or "Go back". */
        secondary:
          'bg-fill text-foreground hover:bg-[color-mix(in_oklab,var(--fill),var(--foreground)_6%)]',
        ghost: 'text-muted-foreground hover:bg-fill hover:text-foreground',
        /** Solid coral for the confirming action of a destructive flow. */
        destructive:
          'bg-danger text-white shadow-[0_14px_24px_-14px_var(--danger)] hover:brightness-[1.05] focus-visible:ring-danger/30',
        /** Tinted coral for secondary destructive actions (e.g. "Delete" in a toolbar). */
        'destructive-soft':
          '[--tint:var(--danger)] bg-tint-faint text-danger hover:bg-tint-soft focus-visible:ring-danger/25',
        link: 'rounded-md text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-5 text-sm',
        sm: 'h-9 gap-1.5 px-3.5 text-[13px] [&_svg:not([class*=size-])]:size-4',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'size-10',
        'icon-sm': 'size-8 [&_svg:not([class*=size-])]:size-4',
        inline: 'h-auto p-0 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shows a spinner, disables the button and sets aria-busy. */
    loading?: boolean;
  };

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
          {children}
        </>
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
