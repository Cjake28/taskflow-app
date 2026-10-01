import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { localWeekRange } from '@/lib/due-date';
import { queryKeys } from '@/lib/query-keys';

import { dashboardApi, type TaskListParams } from './api';
import { dueSoonUntil } from './lib/due-soon';

export const RECENT_ACTIVITY_LIMIT = 10;
export const DUE_SOON_LIMIT = 6;

/** Shared with the sidebar's open-task count, so both stay in sync. */
export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard.stats(),
    queryFn: ({ signal }) => dashboardApi.stats(signal),
  });
}

/** Open count shown next to "Tasks" in the sidebar; null until the stats arrive. */
export function useOpenTaskCount(): number | null {
  const { data } = useDashboardStats();
  return data ? data.byStatus.TODO + data.byStatus.IN_PROGRESS : null;
}

/** Every task due in the local week (Mon–Sun) containing `anchor`. */
export function useWeekAgenda(anchor: Date) {
  const weekKey = anchor.getTime();
  const params = useMemo<TaskListParams>(() => {
    const { dueFrom, dueTo } = localWeekRange(new Date(weekKey));
    return { dueFrom, dueTo, sortBy: 'dueDate', sortOrder: 'asc', pageSize: 100 };
  }, [weekKey]);

  return useQuery({
    queryKey: queryKeys.tasks.list(params),
    queryFn: ({ signal }) => dashboardApi.tasks(params, signal),
    select: (envelope) => envelope.data,
  });
}

/** Open tasks due within a week, overdue ones first (spec §6.5.1). */
export function useDueSoon() {
  const until = dueSoonUntil();
  const params = useMemo<TaskListParams>(
    () => ({
      status: 'TODO,IN_PROGRESS',
      dueTo: until,
      sortBy: 'dueDate',
      sortOrder: 'asc',
      pageSize: DUE_SOON_LIMIT,
    }),
    [until],
  );

  return useQuery({
    queryKey: queryKeys.tasks.list(params),
    queryFn: ({ signal }) => dashboardApi.tasks(params, signal),
    select: (envelope) => envelope.data,
  });
}

export function useRecentActivity(limit: number = RECENT_ACTIVITY_LIMIT) {
  return useQuery({
    queryKey: queryKeys.activities.recent(limit),
    queryFn: ({ signal }) => dashboardApi.recentActivity(limit, signal),
  });
}
