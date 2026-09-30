import { useId, useMemo, useState } from 'react';
import { format, isSameDay, isSameYear, startOfDay } from 'date-fns';
import { CalendarCheck2, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Link } from 'react-router';

import { IconArt } from '@/components/common/icon-art';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { useWeekAgenda } from '../hooks';
import {
  dayKey,
  groupByLocalDay,
  shiftDay,
  summarizeWeek,
  timelineFor,
  weekStart,
} from '../lib/agenda';
import { NEW_TASK_HREF } from '../lib/links';
import { AgendaTimeline } from './agenda-timeline';
import { CardError, DashboardCard } from './dashboard-card';
import { WeekStrip } from './week-strip';

function TimelineSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3 pl-[34px]">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-[92px] rounded-tile" />
      ))}
    </div>
  );
}

function EmptyDay({ day, now }: { day: Date; now: Date }) {
  const today = isSameDay(day, now);
  return (
    <div className="flex flex-col items-center px-4 py-7 text-center">
      <IconArt icon={CalendarCheck2} tint="var(--status-done)" size="sm" className="mb-3.5" />
      <h3 className="text-base font-extrabold">
        {today ? 'Nothing due today' : `Nothing due on ${format(day, 'EEEE')}`}
      </h3>
      <p className="mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-muted-foreground">
        {today
          ? 'Your day is clear. Pick something from your list or plan ahead.'
          : 'No tasks are due that day. Choose another day to see its plan.'}
      </p>
      <Button asChild variant="outline" size="sm" className="mt-4">
        <Link to={NEW_TASK_HREF}>
          <Plus aria-hidden="true" />
          New task
        </Link>
      </Button>
    </div>
  );
}

/**
 * Week strip + the selected day's timeline. One request per week (`dueFrom`/`dueTo` are the
 * local Monday 00:00 and Sunday 23:59:59.999); grouping by local day happens here.
 */
export function AgendaCard({ className }: { className?: string }) {
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const query = useWeekAgenda(weekStart(selected));
  const idPrefix = useId();
  const panelId = `${idPrefix}-panel`;
  const now = new Date();

  const groups = useMemo(() => groupByLocalDay(query.data ?? []), [query.data]);
  const days = summarizeWeek(selected, groups, now);
  const selectedKey = dayKey(selected);
  const entries = timelineFor(groups.get(selectedKey) ?? [], now);
  const viewingToday = isSameDay(selected, now);

  const focusDay = (day: Date) => {
    requestAnimationFrame(() => document.getElementById(`${idPrefix}-${dayKey(day)}`)?.focus());
  };
  const moveBy = (delta: number, focus = false) => {
    const next = shiftDay(selected, delta);
    setSelected(next);
    if (focus) focusDay(next);
  };

  return (
    <DashboardCard
      title="Agenda"
      subtitle={format(selected, isSameYear(selected, now) ? 'EEEE, MMMM d' : 'EEEE, MMMM d, yyyy')}
      className={className}
      aside={
        <>
          {!viewingToday ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3"
              onClick={() => setSelected(startOfDay(new Date()))}
            >
              Today
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous week"
            onClick={() => moveBy(-7)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => moveBy(7)}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </>
      }
    >
      <WeekStrip
        days={days}
        selectedKey={selectedKey}
        idPrefix={idPrefix}
        panelId={panelId}
        onSelect={(day) => setSelected(startOfDay(day))}
        onMove={(delta) => moveBy(delta, true)}
      />

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-${selectedKey}`}
        aria-busy={query.isPending || undefined}
        tabIndex={entries.length === 0 ? 0 : undefined}
        className="mt-[18px] rounded-tile focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
      >
        {query.isPending ? (
          <TimelineSkeleton />
        ) : query.isError ? (
          <CardError
            what="your agenda"
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : entries.length === 0 ? (
          <EmptyDay day={selected} now={now} />
        ) : (
          <AgendaTimeline entries={entries} />
        )}
      </div>
    </DashboardCard>
  );
}
