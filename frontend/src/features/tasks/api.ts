import type {
  ActivityDto,
  CreateTaskInput,
  ImageDto,
  PaginationMeta,
  TaskDetailsDto,
  TaskDto,
  TaskStatus,
  UpdateTaskInput,
} from '@taskflow/shared';

import { api, requestEnvelope } from '@/lib/api-client';

import { toQueryString, type TaskListQuery } from './url-state';

export interface TaskListResult {
  items: TaskDto[];
  meta: PaginationMeta;
}

export interface MoveTaskInput {
  status: TaskStatus;
  prevId: string | null;
  nextId: string | null;
}

export const tasksApi = {
  list: async (query: TaskListQuery, signal?: AbortSignal): Promise<TaskListResult> => {
    const { data, meta } = await requestEnvelope<TaskDto[]>(`/tasks?${toQueryString(query)}`, {
      signal,
    });
    const pageSize = Number(query.pageSize ?? data.length) || 1;
    return {
      items: data,
      meta: meta ?? { page: 1, pageSize, total: data.length, totalPages: 1 },
    };
  },
  get: (id: string, signal?: AbortSignal) =>
    api.get<TaskDetailsDto>(`/tasks/${encodeURIComponent(id)}`, { signal }),
  create: (input: CreateTaskInput) => api.post<TaskDetailsDto>('/tasks', input),
  update: (id: string, input: UpdateTaskInput) =>
    api.patch<TaskDetailsDto>(`/tasks/${encodeURIComponent(id)}`, input),
  move: (id: string, input: MoveTaskInput) =>
    api.patch<TaskDetailsDto>(`/tasks/${encodeURIComponent(id)}/move`, input),
  remove: (id: string) => api.delete(`/tasks/${encodeURIComponent(id)}`),
  activities: (id: string, signal?: AbortSignal) =>
    api.get<ActivityDto[]>(`/tasks/${encodeURIComponent(id)}/activities`, { signal }),
  removeImage: (taskId: string, imageId: string) =>
    api.delete(`/tasks/${encodeURIComponent(taskId)}/images/${encodeURIComponent(imageId)}`),
  restoreImage: (taskId: string, imageId: string) =>
    api.post<ImageDto>(
      `/tasks/${encodeURIComponent(taskId)}/images/${encodeURIComponent(imageId)}/restore`,
    ),
};
