import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: ReactNode;
  /** Small line above the title, e.g. "24 tasks · 14 open". */
  eyebrow?: ReactNode;
  /** Buttons aligned to the right (wrap under the title on narrow screens). */
  actions?: ReactNode;
  /** Breadcrumb or back link above everything. */
  crumbs?: ReactNode;
  className?: string;
}

export function PageHeader({ title, eyebrow, actions, crumbs, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3', className)}>
      {crumbs}
      <div className="flex flex-wrap items-end gap-x-[18px] gap-y-3">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1.5 text-sm font-medium text-muted-foreground">{eyebrow}</p>
          ) : null}
          <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.025em] sm:text-[30px]">
            {title}
          </h1>
        </div>
        {actions ? <div className="ml-auto flex items-center gap-2.5">{actions}</div> : null}
      </div>
    </header>
  );
}
