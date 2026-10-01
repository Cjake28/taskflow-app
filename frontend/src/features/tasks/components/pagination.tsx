import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

import { pageWindow } from '../format';

export interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
}

const pageButton =
  'grid h-[34px] min-w-[34px] cursor-pointer place-items-center rounded-[11px] px-2 text-[13px] font-bold tabular-nums transition-[background-color,box-shadow,color] duration-150 focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40';

/** "Showing 1–10 of 57 tasks" with numbered pages (spec §16). */
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  className,
}: PaginationProps) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 text-[13px] text-muted-foreground',
        className,
      )}
    >
      <p aria-live="polite">
        Showing{' '}
        <b className="font-bold text-foreground tabular-nums">
          {from}–{to}
        </b>{' '}
        of <b className="font-bold text-foreground tabular-nums">{total}</b>{' '}
        {total === 1 ? 'task' : 'tasks'}
      </p>
      {totalPages > 1 ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={cn(pageButton, 'bg-fill text-foreground hover:bg-border')}
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft aria-hidden="true" className="size-[15px]" />
          </button>
          <span className="hidden items-center gap-1.5 sm:flex">
            {pageWindow(page, totalPages).map((item, index) =>
              item === 'gap' ? (
                <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-muted-foreground">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => onPageChange(item)}
                  aria-label={`Page ${item}`}
                  aria-current={item === page ? 'page' : undefined}
                  className={cn(
                    pageButton,
                    item === page
                      ? 'bg-brand-gradient text-white shadow-glow'
                      : 'bg-fill text-foreground hover:bg-border',
                  )}
                >
                  {item}
                </button>
              ),
            )}
          </span>
          <span className="px-1 text-[13px] font-bold text-foreground tabular-nums sm:hidden">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className={cn(pageButton, 'bg-fill text-foreground hover:bg-border')}
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            <ChevronRight aria-hidden="true" className="size-[15px]" />
          </button>
        </div>
      ) : null}
    </nav>
  );
}
