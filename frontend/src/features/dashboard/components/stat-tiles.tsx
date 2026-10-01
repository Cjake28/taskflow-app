import type { CSSProperties } from 'react';
import type { DashboardStats } from '@taskflow/shared';
import { ChevronRight, Layers, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';

import { Skeleton } from '@/components/ui/skeleton';
import { OVERDUE_META, STATUS_META } from '@/lib/task-meta';
import { cn } from '@/lib/utils';

import { statTileHref, type StatKind } from '../lib/links';

interface TileSpec {
  kind: StatKind;
  label: string;
  /** Shorter label for the compact phone tiles. */
  shortLabel?: string;
  icon: LucideIcon;
  tint: string;
  value: (stats: DashboardStats) => number;
  /** Phones show the three status tiles; Total and Overdue appear from `sm` up. */
  phone: boolean;
  /** Neutral tints read as grey at full pastel strength, so they get a fainter fill. */
  neutral?: boolean;
}

const TILES: TileSpec[] = [
  {
    kind: 'total',
    label: 'Total tasks',
    icon: Layers,
    tint: 'var(--foreground)',
    value: (stats) => stats.total,
    phone: false,
    neutral: true,
  },
  {
    kind: 'TODO',
    label: STATUS_META.TODO.label,
    icon: STATUS_META.TODO.icon,
    tint: STATUS_META.TODO.tint,
    value: (stats) => stats.byStatus.TODO,
    phone: true,
  },
  {
    kind: 'IN_PROGRESS',
    label: STATUS_META.IN_PROGRESS.label,
    icon: STATUS_META.IN_PROGRESS.icon,
    tint: STATUS_META.IN_PROGRESS.tint,
    value: (stats) => stats.byStatus.IN_PROGRESS,
    phone: true,
  },
  {
    kind: 'COMPLETED',
    label: STATUS_META.COMPLETED.label,
    shortLabel: 'Done',
    icon: STATUS_META.COMPLETED.icon,
    tint: STATUS_META.COMPLETED.tint,
    value: (stats) => stats.byStatus.COMPLETED,
    phone: true,
  },
  {
    kind: 'overdue',
    label: OVERDUE_META.label,
    icon: OVERDUE_META.icon,
    tint: OVERDUE_META.tint,
    value: (stats) => stats.overdue,
    phone: false,
  },
];

const gridClass = 'grid grid-cols-3 gap-2.5 sm:grid-cols-5 sm:gap-3 xl:gap-4';

/** Total / To Do / In Progress / Completed / Overdue, each linking to the filtered list. */
export function StatTiles({ stats }: { stats: DashboardStats }) {
  return (
    <section aria-label="Task summary" className="flex flex-col gap-3">
      <ul className={gridClass}>
        {TILES.map((tile) => {
          const value = tile.value(stats);
          const Icon = tile.icon;
          const alarming = tile.kind === 'overdue' && value > 0;
          return (
            <li key={tile.kind} className={cn(!tile.phone && 'hidden sm:block')}>
              <Link
                to={statTileHref(tile.kind)}
                style={{ '--tint': tile.tint } as CSSProperties}
                className={cn(
                  'group relative flex h-full flex-col items-center gap-2 rounded-[22px] px-1.5 pt-3.5 pb-3 text-center transition-colors duration-150 focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none sm:items-start sm:gap-3.5 sm:rounded-tile sm:p-4 sm:text-left xl:p-[18px]',
                  tile.neutral
                    ? 'bg-tint-faint hover:bg-tint-soft'
                    : 'bg-tint-soft hover:bg-tint-strong',
                )}
              >
                <span
                  aria-hidden="true"
                  className="grid size-11 place-items-center rounded-full bg-(--tint) text-card sm:size-[46px]"
                >
                  <Icon className="size-5" strokeWidth={2.1} />
                </span>
                <span className="flex flex-col items-center sm:items-start">
                  <span
                    className={cn(
                      'text-[19px] leading-none font-extrabold tracking-[-0.02em] tabular-nums sm:text-[28px] xl:text-[30px]',
                      alarming
                        ? 'text-danger'
                        : 'text-[color-mix(in_oklab,var(--tint)_22%,var(--foreground))]',
                    )}
                  >
                    {value}
                  </span>
                  <span className="mt-1.5 text-xs font-semibold text-[color-mix(in_oklab,var(--tint)_45%,var(--foreground))] opacity-80 sm:mt-[5px] sm:text-[13px]">
                    {tile.shortLabel ? (
                      <>
                        <span className="sm:hidden">{tile.shortLabel}</span>
                        <span className="hidden sm:inline">{tile.label}</span>
                      </>
                    ) : (
                      tile.label
                    )}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="absolute top-[18px] right-3 hidden size-[18px] text-[color-mix(in_oklab,var(--tint)_60%,var(--foreground))] opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-90 sm:block"
                />
              </Link>
            </li>
          );
        })}
      </ul>
      {stats.overdue > 0 ? <OverdueBanner count={stats.overdue} /> : null}
    </section>
  );
}

/** Phones only: the Overdue tile is replaced by a banner (approved mobile mockup). */
function OverdueBanner({ count }: { count: number }) {
  return (
    <Link
      to={statTileHref('overdue')}
      className="flex items-center gap-2.5 rounded-tile [--tint:var(--danger)] bg-tint-soft px-3.5 py-3 text-[13px] font-bold text-danger focus-visible:ring-4 focus-visible:ring-danger/25 focus-visible:outline-none sm:hidden"
    >
      <TriangleAlert aria-hidden="true" className="size-[18px] shrink-0" />
      {count === 1 ? '1 task is overdue' : `${count} tasks are overdue`}
      <span className="ml-auto inline-flex items-center font-semibold opacity-85">
        View
        <ChevronRight aria-hidden="true" className="size-[15px]" />
      </span>
    </Link>
  );
}

export function StatTilesSkeleton() {
  return (
    <div className={gridClass} aria-hidden="true">
      {TILES.map((tile) => (
        <div
          key={tile.kind}
          className={cn(
            'flex flex-col items-center gap-3 rounded-[22px] bg-card px-1.5 pt-3.5 pb-3 shadow-card sm:items-start sm:rounded-tile sm:p-4 xl:p-[18px]',
            !tile.phone && 'hidden sm:flex',
          )}
        >
          <Skeleton className="size-11 rounded-full sm:size-[46px]" />
          <Skeleton className="h-6 w-10 sm:h-7" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
