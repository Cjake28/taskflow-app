import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

const SIZES = {
  sm: {
    box: 'size-[84px]',
    ring: 'inset-3',
    core: 'inset-6',
    icon: 'size-[18px]',
  },
  md: {
    box: 'size-[120px]',
    ring: 'inset-[18px]',
    core: 'inset-9',
    icon: 'size-6',
  },
  lg: {
    box: 'size-[180px]',
    ring: 'inset-[26px]',
    core: 'inset-[54px]',
    icon: 'size-8',
  },
} as const;

export interface IconArtProps {
  icon: LucideIcon;
  /** Any CSS colour, typically a token such as `var(--status-done)`. */
  tint?: string;
  size?: keyof typeof SIZES;
  /** Translucent white rendering for use on the brand panel. */
  onBrand?: boolean;
  className?: string;
}

/**
 * "Illustration" built from tokens (spec §15.6): two layered tinted circles, a solid core
 * with a Lucide icon. Works in both themes, no external assets.
 */
export function IconArt({
  icon: Icon,
  tint = 'var(--primary)',
  size = 'md',
  onBrand = false,
  className,
}: IconArtProps) {
  const s = SIZES[size];
  return (
    <div
      aria-hidden="true"
      style={{ '--tint': tint } as CSSProperties}
      className={cn('relative shrink-0', s.box, className)}
    >
      <div
        className={cn(
          'absolute inset-0 rounded-full',
          onBrand ? 'bg-white/10' : 'bg-[color-mix(in_oklab,var(--tint)_14%,var(--card))]',
        )}
      />
      <div
        className={cn(
          'absolute rounded-full',
          s.ring,
          onBrand ? 'bg-white/16' : 'bg-[color-mix(in_oklab,var(--tint)_24%,var(--card))]',
        )}
      />
      <div
        className={cn(
          'absolute grid place-items-center rounded-full',
          s.core,
          onBrand ? 'bg-white text-primary' : 'bg-(--tint) text-white',
        )}
      >
        <Icon className={s.icon} strokeWidth={2.2} />
      </div>
    </div>
  );
}
