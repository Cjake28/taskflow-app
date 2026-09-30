import type { ImageDto, TaskDetailsDto, TaskDto } from '@taskflow/shared';
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

export interface TaskImageSummary {
  imageCount: number;
  coverImageId: string | null;
}

export const imageUrl = (imageId: string) => `/api/v1/images/${imageId}`;
export const thumbUrl = (imageId: string) => `/api/v1/images/${imageId}?variant=thumb`;

export function isOverdue(task: Pick<TaskRecord, 'dueDate' | 'status'>, now: Date): boolean {
  return task.dueDate !== null && task.status !== 'COMPLETED' && task.dueDate < now;
}

export function toTaskResponse(task: TaskRecord, images: TaskImageSummary, now: Date): TaskDto {
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
    imageCount: images.imageCount,
    coverThumbUrl: images.coverImageId ? thumbUrl(images.coverImageId) : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function toTaskDetailsResponse(
  task: TaskRecord,
  images: ImageDto[],
  now: Date,
): TaskDetailsDto {
  return {
    ...toTaskResponse(
      task,
      { imageCount: images.length, coverImageId: images[0]?.id ?? null },
      now,
    ),
    images,
  };
}
