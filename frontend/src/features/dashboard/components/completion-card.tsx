import { useId } from 'react';
import type { DashboardStats } from '@taskflow/shared';
import { CalendarClock, Target, TrendingUp, Trophy } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';

const RING_SIZE = 92;
const STROKE = 9;
const RADIUS = (RING_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ProgressRing({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  const Icon = clamped >= 100 ? Trophy : Target;
  return (
    <div
      role="meter"
      aria-label="Completion rate"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-valuetext={`${clamped}% of tasks completed`}
      className="relative grid size-[92px] shrink-0 place-items-center"
    >
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          className="text-white/22"
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped / 100)}
          className="text-white transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-white/16">
        <Icon className="size-5" strokeWidth={2.2} />
      </span>
    </div>
  );
}

/** Gradient hero (spec §15.1): completion rate, ring, and the rolling 7-day windows. */
export function CompletionCard({ stats }: { stats: DashboardStats }) {
  const titleId = useId();
  const completed = stats.byStatus.COMPLETED;
  return (
    <section
      aria-labelledby={titleId}
      className="relative isolate overflow-hidden rounded-card bg-primary p-6 text-primary-foreground"
    >
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-[13px] font-semibold text-white/85">
            Completion rate
          </h2>
          <p className="mt-1.5 text-[46px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
            {stats.completionRate}%
          </p>
          <p className="mt-2 text-[13px] text-white/85">
            {completed} of {stats.total} {stats.total === 1 ? 'task' : 'tasks'} completed
          </p>
        </div>
        <ProgressRing value={stats.completionRate} />
      </div>

      <dl className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-xs font-semibold text-white/90">
        <div className="flex items-center gap-1.5">
          <TrendingUp aria-hidden="true" className="size-3.5" />
          <dt className="sr-only">Completed in the last 7 days</dt>
          <dd>
            {stats.completedLast7Days > 0
              ? `+${stats.completedLast7Days} completed in the last 7 days`
              : 'Nothing completed in the last 7 days'}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <CalendarClock aria-hidden="true" className="size-3.5" />
          <dt className="sr-only">Due in the next 7 days</dt>
          <dd>{stats.dueSoon} due in 7 days</dd>
        </div>
      </dl>
    </section>
  );
}

export function CompletionCardSkeleton() {
  return (
    <div aria-hidden="true" className="rounded-card bg-card p-6 shadow-card">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-10 w-28" />
          <Skeleton className="mt-3 h-3 w-36" />
        </div>
        <Skeleton className="size-[92px] rounded-full" />
      </div>
      <Skeleton className="mt-5 h-3 w-2/3" />
    </div>
  );
}
