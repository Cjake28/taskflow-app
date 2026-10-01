import type { CSSProperties } from 'react';
import type { DashboardStats, TaskPriority } from '@taskflow/shared';
import { Link } from 'react-router';

import { PriorityIndicator } from '@/components/common/priority-indicator';
import { PRIORITY_META } from '@/lib/task-meta';

import { tasksHref } from '../lib/links';
import { DashboardCard } from './dashboard-card';

/** High is coral (danger), Medium uses the brand colour, Low stays neutral (spec §15.4). */
const ROWS: Array<{ priority: TaskPriority; tint: string }> = [
  { priority: 'HIGH', tint: 'var(--danger)' },
  { priority: 'MEDIUM', tint: 'var(--primary)' },
  { priority: 'LOW', tint: 'var(--muted-foreground)' },
];

export function PriorityBreakdown({ stats }: { stats: DashboardStats }) {
  return (
    <DashboardCard
      title="By priority"
      subtitle={`${stats.total} ${stats.total === 1 ? 'task' : 'tasks'}`}
    >
      <ul className="-my-1 divide-y divide-dashed divide-border">
        {ROWS.map(({ priority, tint }) => {
          const count = stats.byPriority[priority];
          const share = stats.total === 0 ? 0 : Math.round((count / stats.total) * 100);
          return (
            <li key={priority}>
              <Link
                to={tasksHref({ priority: [priority] })}
                aria-label={`${PRIORITY_META[priority].label} priority: ${count} ${count === 1 ? 'task' : 'tasks'} (${share}%)`}
                style={{ '--tint': tint } as CSSProperties}
                className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-[11px] transition-colors hover:bg-fill focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
              >
                <PriorityIndicator
                  priority={priority}
                  className="w-[84px] shrink-0 text-sm text-foreground [&_svg]:text-(--tint)"
                />
                <span
                  aria-hidden="true"
                  className="h-[7px] flex-1 overflow-hidden rounded-full bg-fill"
                >
                  <span
                    className="block h-full rounded-full bg-(--tint) transition-[width] duration-700 ease-out"
                    style={{ width: `${share}%` }}
                  />
                </span>
                <span className="w-7 text-right font-extrabold tabular-nums">{count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </DashboardCard>
  );
}
