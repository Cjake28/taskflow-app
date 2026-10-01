import type { ActivityDto, DashboardStats, TaskDto } from '@taskflow/shared';

import { api, requestEnvelope, type ApiEnvelope } from '@/lib/api-client';

/** Query-string object for `GET /tasks`; also the `queryKeys.tasks.list(...)` key. */
export type TaskListParams = Record<string, string | number>;

function toQuery(params: TaskListParams): string {
  return new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  ).toString();
}

export const dashboardApi = {
  stats: (signal?: AbortSignal) => api.get<DashboardStats>('/dashboard/stats', { signal }),
  recentActivity: (limit: number, signal?: AbortSignal) =>
    api.get<ActivityDto[]>(`/activities?pageSize=${limit}`, { signal }),
  tasks: (params: TaskListParams, signal?: AbortSignal): Promise<ApiEnvelope<TaskDto[]>> =>
    requestEnvelope<TaskDto[]>(`/tasks?${toQuery(params)}`, { signal }),
};
