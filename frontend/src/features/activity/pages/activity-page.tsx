import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { ActivityDto } from '@taskflow/shared';
import { format, isToday, isYesterday } from 'date-fns';
import { CalendarRange, History, Search, SearchX, X } from 'lucide-react';
import { useSearchParams } from 'react-router';

import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/lib/query-keys';
import { dayKey } from '@/lib/task-days';
import { cn } from '@/lib/utils';

import { ACTIVITY_PAGE_SIZE, fetchActivityPage } from '../api';
import { ActivityRow } from '../components/activity-row';
import {
  EMPTY_FILTERS,
  RANGE_OPTIONS,
  TYPE_OPTIONS,
  hasActiveFilters,
  parseActivityFilters,
  toActivityQuery,
  writeActivityFilters,
  type ActivityFilters,
} from '../lib/filters';

const chip =
  'inline-flex h-10 shrink-0 cursor-pointer items-center gap-[7px] rounded-full bg-card px-3.5 text-[13px] font-semibold whitespace-nowrap text-foreground shadow-card transition-[background-color,color,box-shadow] duration-150 outline-none hover:bg-[color-mix(in_oklab,var(--fill)_60%,var(--card))] focus-visible:ring-4 focus-visible:ring-ring/30 [&_svg]:size-[15px] [&_svg]:shrink-0';
const chipOn =
  '[--tint:var(--primary)] bg-tint-soft text-[color-mix(in_oklab,var(--tint)_88%,var(--foreground))] shadow-none hover:bg-tint-strong';

function dayHeading(day: Date): string {
  if (isToday(day)) return 'Today';
  if (isYesterday(day)) return 'Yesterday';
  return format(
    day,
    day.getFullYear() === new Date().getFullYear() ? 'EEEE, MMMM d' : 'EEEE, MMMM d, yyyy',
  );
}

/** Consecutive rows grouped by the local day they happened on (rows arrive newest first). */
function groupByDay(rows: readonly ActivityDto[]) {
  const groups: Array<{ key: string; day: Date; rows: ActivityDto[] }> = [];
  for (const row of rows) {
    const day = new Date(row.createdAt);
    const key = dayKey(day);
    const last = groups.at(-1);
    if (last?.key === key) last.rows.push(row);
    else groups.push({ key, day, rows: [row] });
  }
  return groups;
}

function SearchField({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  // Cleared or changed from elsewhere (Clear filters, back button).
  if (value !== synced) {
    setSynced(value);
    if (value !== text.trim()) setText(value);
  }
  useEffect(() => {
    if (text.trim() === value) return;
    const timer = setTimeout(() => onCommit(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text, value, onCommit]);

  return (
    <div className="flex h-11 w-full items-center gap-2.5 rounded-full bg-card px-4 text-sm shadow-card transition-shadow duration-150 focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent),var(--shadow-card)] lg:max-w-[340px]">
      <Search aria-hidden="true" className="size-[18px] shrink-0 text-muted-foreground" />
      <input
        type="search"
        aria-label="Search by task title"
        placeholder="Search by task title…"
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="h-full w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
      />
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul aria-hidden="true" className="flex flex-col">
      {Array.from({ length: 6 }, (_, index) => (
        <li key={index} className="flex items-center gap-3.5 py-3.5">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="mt-2 h-3 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Every change across the user's tasks, with date, type and title filters (`/activity`). */
export function ActivityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseActivityFilters(searchParams);
  // Day boundaries ("Today", "Last 7 days") are local midnights, so the key is stable all day.
  const apiQuery = toActivityQuery(filters);

  const query = useInfiniteQuery({
    queryKey: queryKeys.activities.history(apiQuery),
    queryFn: ({ pageParam, signal }) => fetchActivityPage(apiQuery, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta && last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
  });

  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.data) ?? [], [query.data]);
  const total = query.data?.pages[0]?.meta?.total;
  const groups = useMemo(() => groupByDay(rows), [rows]);
  const filtered = hasActiveFilters(filters);

  const update = (patch: Partial<ActivityFilters>) => {
    setSearchParams(writeActivityFilters({ ...filters, ...patch }), { replace: true });
  };
  const toggleType = (value: ActivityFilters['types'][number]) =>
    update({
      types: filters.types.includes(value)
        ? filters.types.filter((type) => type !== value)
        : [...filters.types, value],
    });

  return (
    <>
      <title>Activity · TaskFlow</title>
      <PageHeader
        title="Activity"
        eyebrow={
          total === undefined
            ? 'Everything that happened to your tasks'
            : `${total} ${total === 1 ? 'change' : 'changes'}${filtered ? ' match your filters' : ''}`
        }
      />

      <div className="flex flex-col gap-3" role="search" aria-label="Filter activity">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchField value={filters.search} onCommit={(search) => update({ search })} />
          <div
            role="radiogroup"
            aria-label="Time range"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden"
          >
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={filters.range === option.value}
                onClick={() => update({ range: option.value })}
                className={cn(chip, filters.range === option.value && chipOn)}
              >
                {option.value === 'custom' ? <CalendarRange aria-hidden="true" /> : null}
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {filters.range === 'custom' ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-10 items-center gap-2 rounded-full bg-card px-3.5 text-[13px] font-semibold shadow-card">
              From
              <input
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(event) => update({ from: event.target.value })}
                className="bg-transparent text-sm outline-none"
              />
            </label>
            <label className="flex h-10 items-center gap-2 rounded-full bg-card px-3.5 text-[13px] font-semibold shadow-card">
              To
              <input
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(event) => update({ to: event.target.value })}
                className="bg-transparent text-sm outline-none"
              />
            </label>
          </div>
        ) : null}

        <div
          role="group"
          aria-label="Activity type"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden lg:mx-0 lg:flex-wrap lg:px-0 lg:pb-0"
        >
          {TYPE_OPTIONS.map((option) => {
            const on = filters.types.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={on}
                onClick={() => toggleType(option.value)}
                style={{ '--tint': 'var(--primary)' } as CSSProperties}
                className={cn(chip, 'h-9', on && chipOn)}
              >
                {option.label}
              </button>
            );
          })}
          {filtered ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 shrink-0"
              onClick={() =>
                setSearchParams(writeActivityFilters(EMPTY_FILTERS), { replace: true })
              }
            >
              <X aria-hidden="true" />
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      <section
        aria-label="Activity history"
        aria-busy={query.isFetching || undefined}
        className="rounded-card bg-card px-[18px] py-2 shadow-card sm:px-[22px]"
      >
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <ErrorState
            title="We couldn't load your activity"
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : rows.length === 0 ? (
          filtered ? (
            <EmptyState
              bare
              icon={SearchX}
              title="No activity matches your filters"
              description="Try a longer time range or another activity type."
              action={
                <Button
                  variant="outline"
                  onClick={() =>
                    setSearchParams(writeActivityFilters(EMPTY_FILTERS), { replace: true })
                  }
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              bare
              icon={History}
              title="No activity yet"
              description="Creating, editing and completing tasks will show up here."
            />
          )
        ) : (
          <>
            {groups.map((group) => (
              <div key={group.key} className="border-b border-border/70 py-2 last:border-b-0">
                <h2 className="pt-2 text-[12px] font-bold tracking-wide text-muted-foreground uppercase">
                  {dayHeading(group.day)}
                </h2>
                <ol className="divide-y divide-border/50">
                  {group.rows.map((row) => (
                    <ActivityRow key={row.id} activity={row} />
                  ))}
                </ol>
              </div>
            ))}
            <div className="flex flex-col items-center gap-2 py-4">
              <p className="text-[12.5px] text-muted-foreground" aria-live="polite">
                Showing {rows.length} of {total ?? rows.length}
              </p>
              {query.hasNextPage ? (
                <Button
                  variant="outline"
                  loading={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                >
                  Load {Math.min(ACTIVITY_PAGE_SIZE, (total ?? 0) - rows.length)} more
                </Button>
              ) : null}
            </div>
          </>
        )}
      </section>
    </>
  );
}
