export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

export const TASK_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'dueDate',
  'priority',
  'title',
  'position',
] as const;
export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];

export const TASK_LIMITS = {
  title: 200,
  description: 2000,
  pageSizeDefault: 10,
  pageSizeMax: 100,
} as const;

export const ACTIVITY_ACTIONS = [
  'CREATED',
  'UPDATED',
  'STATUS_CHANGED',
  'DELETED',
  'IMAGE_ADDED',
  'IMAGE_REMOVED',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];
