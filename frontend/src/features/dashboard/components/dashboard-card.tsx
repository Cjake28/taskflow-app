import { useId, type ReactNode } from 'react';
import { RotateCw, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ApiError, getErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

export interface DashboardCardProps {
  title: ReactNode;
  /** Muted text next to the title, e.g. the selected date. */
  subtitle?: ReactNode;
  /** Right-aligned header content (links, buttons). */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** White dashboard card with an h2 header row (spec §15.5: 24px radius, soft shadow). */
export function DashboardCard({ title, subtitle, aside, children, className }: DashboardCardProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn('min-w-0 rounded-card bg-card p-[18px] shadow-card sm:p-[22px]', className)}
    >
      <header className="mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 id={titleId} className="text-base font-extrabold tracking-[-0.01em]">
          {title}
        </h2>
        {subtitle ? (
          <span className="text-[13px] font-medium text-muted-foreground">{subtitle}</span>
        ) : null}
        {aside ? <div className="ml-auto flex items-center gap-1">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}

export interface CardErrorProps {
  /** What failed to load, e.g. "your agenda". */
  what: string;
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
}

/** Compact failed-load state that fits inside a card, with retry and the request id. */
export function CardError({ what, error, onRetry, retrying = false }: CardErrorProps) {
  const requestId = error instanceof ApiError ? error.requestId : null;
  return (
    <div className="flex flex-col items-center gap-2 rounded-tile bg-[color-mix(in_oklab,var(--danger)_7%,var(--card))] px-4 py-6 text-center">
      <TriangleAlert aria-hidden="true" className="size-5 text-danger" />
      <div role="alert">
        <p className="text-sm font-bold">Couldn&apos;t load {what}</p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {getErrorMessage(error)}
          {requestId ? (
            <>
              {' '}
              ID:{' '}
              <code className="rounded-md bg-fill px-1.5 py-0.5 text-[11.5px] font-semibold text-foreground">
                {requestId}
              </code>
            </>
          ) : null}
        </p>
      </div>
      <Button variant="outline" size="sm" className="mt-1" onClick={onRetry} loading={retrying}>
        {!retrying && <RotateCw aria-hidden="true" />}
        Try again
      </Button>
    </div>
  );
}
