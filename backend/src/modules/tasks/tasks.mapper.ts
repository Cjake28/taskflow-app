import type { ImageDto, TaskDetailsDto, TaskDto, TaskReminderDto } from '@taskflow/shared';
import type { TaskPriority, TaskStatus } from '../../generated/prisma/client';

export interface TaskRecord {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  hasDueTime: boolean;
  completedAt: Date | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskSummary {
  imageCount: number;
  coverImageId: string | null;
  /** Reminders not sent yet. */
  reminderCount: number;
}

export const imageUrl = (imageId: string) => `/api/v1/images/${imageId}`;
export const thumbUrl = (imageId: string) => `/api/v1/images/${imageId}?variant=thumb`;

export function isOverdue(task: Pick<TaskRecord, 'dueDate' | 'status'>, now: Date): boolean {
  return task.dueDate !== null && task.status !== 'COMPLETED' && task.dueDate < now;
}

export function toTaskResponse(task: TaskRecord, summary: TaskSummary, now: Date): TaskDto {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate?.toISOString() ?? null,
    hasDueTime: task.hasDueTime,
    completedAt: task.completedAt?.toISOString() ?? null,
    position: task.position,
    isOverdue: isOverdue(task, now),
    imageCount: summary.imageCount,
    coverThumbUrl: summary.coverImageId ? thumbUrl(summary.coverImageId) : null,
    reminderCount: summary.reminderCount,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function toTaskDetailsResponse(
  task: TaskRecord,
  images: ImageDto[],
  reminders: TaskReminderDto[],
  now: Date,
): TaskDetailsDto {
  return {
    ...toTaskResponse(
      task,
      {
        imageCount: images.length,
        coverImageId: images[0]?.id ?? null,
        reminderCount: reminders.filter((reminder) => reminder.sentAt === null).length,
      },
      now,
    ),
    images,
    reminders,
  };
}
