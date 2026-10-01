import { useId, useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
} from 'date-fns';
import { CalendarCheck2, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useSearchParams } from 'react-router';

import { ErrorState } from '@/components/common/error-state';
import { IconArt } from '@/components/common/icon-art';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AgendaTimeline } from '@/features/dashboard/components/agenda-timeline';
import { timelineFor } from '@/features/dashboard/lib/agenda';
import { TaskFormDialog } from '@/features/tasks/components/task-form-dialog';
import { dayKey, groupByLocalDay } from '@/lib/task-days';

import { MonthGrid } from '../components/month-grid';
import { useTasksDueBetween } from '../hooks';
import {
  formatMonthParam,
  gridRange,
  monthGrid,
  parseDayParam,
  parseMonthParam,
} from '../lib/month';

/** A month of tasks by due date, with the selected day's plan next to it (`?month=&day=`). */
export function CalendarPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const now = new Date();
  const today = startOfDay(now);
  const selected = parseDayParam(searchParams.get('day')) ?? today;
  const month = parseMonthParam(searchParams.get('month')) ?? startOfMonth(selected);
  const [creating, setCreating] = useState(false);
  const idPrefix = useId();

  // Cheap to rebuild; the query key is compared by value, so a new object is fine.
  const days = monthGrid(month);
  const range = gridRange(month);
  const query = useTasksDueBetween(range);
  const groups = useMemo(() => groupByLocalDay(query.data ?? []), [query.data]);
  const dayTasks = groups.get(dayKey(selected)) ?? [];
  const entries = timelineFor(dayTasks, now);
  const monthTotal = (query.data ?? []).filter((task) =>
    isSameMonth(new Date(task.dueDate!), month),
  ).length;

  const show = (day: Date, nextMonth: Date = startOfMonth(day), focus = false) => {
    const next = new URLSearchParams(searchParams);
    next.set('month', formatMonthParam(nextMonth));
    next.set('day', dayKey(day));
    setSearchParams(next, { replace: true });
    if (focus) {
      requestAnimationFrame(() => document.getElementById(`${idPrefix}-${dayKey(day)}`)?.focus());
    }
  };

  const goToMonth = (delta: number) => {
    const nextMonth = addMonths(month, delta);
    // Keep the same day number when possible, so paging feels stable.
    const day = addMonths(selected, delta);
    show(isSameMonth(day, nextMonth) ? day : nextMonth, nextMonth);
  };

  return (
    <>
      <title>{`Calendar · ${format(month, 'MMMM yyyy')} · TaskFlow`}</title>
      <PageHeader
        eyebrow={
          query.data
            ? `${monthTotal} ${monthTotal === 1 ? 'task' : 'tasks'} due in ${format(month, 'MMMM')}`
            : 'Tasks by due date'
        }
        title="Calendar"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            New task
          </Button>
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <section
          aria-label="Month"
          className="min-w-0 rounded-card bg-card p-3 shadow-card sm:p-[22px]"
        >
          <header className="mb-4 flex flex-wrap items-center gap-2 px-1">
            <h2 className="text-lg font-extrabold tracking-[-0.01em]" aria-live="polite">
              {format(month, 'MMMM yyyy')}
            </h2>
            <div className="ml-auto flex items-center gap-1">
              {!isSameMonth(month, today) || !isSameDay(selected, today) ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3"
                  onClick={() => show(today, startOfMonth(today))}
                >
                  Today
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Previous month"
                onClick={() => goToMonth(-1)}
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Next month"
                onClick={() => goToMonth(1)}
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          </header>

          {query.isError && !query.data ? (
            <ErrorState
              title="We couldn't load your calendar"
              error={query.error}
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          ) : query.isPending ? (
            <div aria-hidden="true" className="grid grid-cols-7 gap-1.5">
              {days.map((day) => (
                <Skeleton key={dayKey(day)} className="h-16 rounded-[14px] sm:h-[118px]" />
              ))}
            </div>
          ) : (
            <MonthGrid
              month={month}
              days={days}
              groups={groups}
              selected={selected}
              now={now}
              idPrefix={idPrefix}
              onSelect={(day) => show(day, isSameMonth(day, month) ? month : startOfMonth(day))}
              onMove={(deltaDays, deltaMonths) => {
                const day = deltaMonths
                  ? addMonths(selected, deltaMonths)
                  : addDays(selected, deltaDays);
                show(startOfDay(day), startOfMonth(day), true);
              }}
            />
          )}
          <p className="mt-3 px-1 text-[12px] text-muted-foreground">
            Tasks without a due date aren&apos;t shown on the calendar.
          </p>
        </section>

        <section
          aria-label={format(selected, 'EEEE, MMMM d')}
          className="min-w-0 rounded-card bg-card p-[18px] shadow-card sm:p-[22px] xl:sticky xl:top-6"
        >
          <header className="mb-4 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-extrabold tracking-[-0.01em]">
                {isSameDay(selected, today) ? 'Today' : format(selected, 'EEEE')}
              </h2>
              <p className="text-[13px] font-medium text-muted-foreground">
                {format(selected, 'MMMM d, yyyy')}
                {dayTasks.length > 0
                  ? ` · ${dayTasks.length} ${dayTasks.length === 1 ? 'task' : 'tasks'}`
                  : ''}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" />
              Add
            </Button>
          </header>

          {query.isPending ? (
            <div aria-hidden="true" className="flex flex-col gap-3 pl-[34px]">
              {[0, 1].map((index) => (
                <Skeleton key={index} className="h-[92px] rounded-tile" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-7 text-center">
              <IconArt
                icon={CalendarCheck2}
                tint="var(--status-done)"
                size="sm"
                className="mb-3.5"
              />
              <h3 className="text-base font-extrabold">Nothing due this day</h3>
              <p className="mt-1.5 max-w-[260px] text-[13px] leading-relaxed text-muted-foreground">
                Add a task for {format(selected, 'MMMM d')} or pick another day.
              </p>
            </div>
          ) : (
            <AgendaTimeline entries={entries} />
          )}
        </section>
      </div>

      <TaskFormDialog
        open={creating}
        onOpenChange={setCreating}
        defaultDueDate={dayKey(selected)}
      />
    </>
  );
}
