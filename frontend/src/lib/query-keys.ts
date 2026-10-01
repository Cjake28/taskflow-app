import type { QueryClient } from '@tanstack/react-query';

/**
 * Query keys shared across features. Everything about tasks lives under
 * `['tasks', …]`, so one invalidation refreshes lists, boards and details.
 */
export const queryKeys = {
  tasks: {
    all: ['tasks'] as const,
    lists: () => ['tasks', 'list'] as const,
    /** `params` is the exact query-string object sent to `GET /tasks`. */
    list: (params: Record<string, unknown>) => ['tasks', 'list', params] as const,
    detail: (id: string) => ['tasks', 'detail', id] as const,
    activities: (id: string) => ['tasks', 'activities', id] as const,
    /** Every task due within a date range (not a paginated list). */
    calendar: (range: { dueFrom: string; dueTo: string }) => ['tasks', 'calendar', range] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    stats: () => ['dashboard', 'stats'] as const,
  },
  activities: {
    all: ['activities'] as const,
    recent: (limit: number) => ['activities', 'recent', limit] as const,
    /** The filtered history on the Activity page. */
    history: (filters: Record<string, unknown>) => ['activities', 'history', filters] as const,
  },
  account: {
    sessions: () => ['account', 'sessions'] as const,
    linkedAccounts: () => ['account', 'linked-accounts'] as const,
    emailChange: () => ['account', 'email-change'] as const,
  },
};

/** Call after any task, image or status change: lists, details, stats and activity all depend on it. */
export function invalidateTaskData(queryClient: QueryClient): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.activities.all }),
  ]);
}
