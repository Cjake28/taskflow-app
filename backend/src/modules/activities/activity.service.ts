import type { ActivityDto } from '@taskflow/shared';
import type { Db, Tx } from '../../database/prisma';
import { ActivityAction, Prisma } from '../../generated/prisma/client';

export interface ActivityInput {
  userId: string;
  taskId: string | null;
  taskTitle: string;
  action: ActivityAction;
  changes?: Record<string, unknown> | null;
}

export class ActivityService {
  constructor(private readonly prisma: Db) {}

  /** Records an activity inside the caller's transaction so it commits with the change itself. */
  async record(tx: Tx, input: ActivityInput): Promise<void> {
    await tx.taskActivity.create({
      data: {
        userId: input.userId,
        taskId: input.taskId,
        taskTitle: input.taskTitle,
        action: input.action,
        changes: input.changes ? (input.changes as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });
  }

  async listRecent(userId: string, limit: number): Promise<ActivityDto[]> {
    const rows = await this.prisma.taskActivity.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toActivityResponse);
  }

  async listForTask(userId: string, taskId: string): Promise<ActivityDto[]> {
    const rows = await this.prisma.taskActivity.findMany({
      where: { userId, taskId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(toActivityResponse);
  }
}

export function toActivityResponse(row: {
  id: string;
  action: ActivityAction;
  taskId: string | null;
  taskTitle: string;
  changes: Prisma.JsonValue;
  createdAt: Date;
}): ActivityDto {
  return {
    id: row.id,
    action: row.action,
    taskId: row.taskId,
    taskTitle: row.taskTitle,
    changes:
      row.changes && typeof row.changes === 'object' && !Array.isArray(row.changes)
        ? (row.changes as Record<string, unknown>)
        : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export { ActivityAction };
