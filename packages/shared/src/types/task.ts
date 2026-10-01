import type { ActivityAction, TaskPriority, TaskStatus } from '../constants/task';
import type { TaskReminderDto } from './notification';

export interface ImageDto {
  id: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
  originalName: string | null;
  createdAt: string;
}

export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  hasDueTime: boolean;
  completedAt: string | null;
  position: number;
  isOverdue: boolean;
  imageCount: number;
  coverThumbUrl: string | null;
  /** Reminders that have not been sent yet. */
  reminderCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetailsDto extends TaskDto {
  images: ImageDto[];
  /** Ordered by when they fire; reminders without a time (no due date) come last. */
  reminders: TaskReminderDto[];
}

export interface ActivityDto {
  id: string;
  action: ActivityAction;
  taskId: string | null;
  taskTitle: string;
  changes: Record<string, unknown> | null;
  createdAt: string;
}

export interface DashboardStats {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  overdue: number;
  dueSoon: number;
  completedLast7Days: number;
  completionRate: number;
}
