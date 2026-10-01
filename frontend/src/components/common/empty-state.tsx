import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

import { IconArt } from './icon-art';

export interface EmptyStateProps {
  icon: LucideIcon;
  /** CSS colour for the art, e.g. `var(--status-progress)`. */
  tint?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Buttons or links rendered under the copy. */
  action?: ReactNode;
  size?: 'sm' | 'md';
  /** Render without the card surface (when already inside a card). */
  bare?: boolean;
  className?: string;
  /** Heading level for the title (default h2). */
  headingLevel?: 'h1' | 'h2' | 'h3';
}

export function EmptyState({
  icon,
  tint = 'var(--primary)',
  title,
  description,
  action,
  size = 'md',
  bare = false,
  className,
  headingLevel: Heading = 'h2',
}: EmptyStateProps) {
  return (
    <section
      className={cn(
        'flex flex-col items-center text-center',
        size === 'md' ? 'px-6 py-10' : 'px-5 py-7',
        !bare && 'rounded-card bg-card shadow-card',
        className,
      )}
    >
      <IconArt icon={icon} tint={tint} size={size} className={size === 'md' ? 'mb-5' : 'mb-3.5'} />
      <Heading className={cn('font-extrabold', size === 'md' ? 'text-lg' : 'text-base')}>
        {title}
      </Heading>
      {description ? (
        <div
          className={cn(
            'mt-2 max-w-[300px] leading-relaxed text-muted-foreground',
            size === 'md' ? 'text-sm' : 'text-[13px]',
          )}
        >
          {description}
        </div>
      ) : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2.5">{action}</div> : null}
    </section>
  );
}
