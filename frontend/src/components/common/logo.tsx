import { CircleCheck } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface LogoMarkProps {
  size?: 'md' | 'lg';
  /** Translucent variant for the brand panel. */
  onBrand?: boolean;
  className?: string;
}

export function LogoMark({ size = 'md', onBrand = false, className }: LogoMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center text-white',
        size === 'md'
          ? 'size-9 rounded-xl [&_svg]:size-[18px]'
          : 'size-16 rounded-[20px] [&_svg]:size-[30px]',
        onBrand ? 'bg-white/18' : 'bg-primary',
        className,
      )}
    >
      <CircleCheck strokeWidth={2.2} />
    </span>
  );
}

export function Logo({ onBrand = false, className }: { onBrand?: boolean; className?: string }) {
  return (
    <span
      className={cn('flex items-center gap-2.5 text-lg font-extrabold tracking-tight', className)}
    >
      <LogoMark onBrand={onBrand} />
      TaskFlow
    </span>
  );
}
