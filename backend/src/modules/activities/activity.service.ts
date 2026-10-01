import type { ActivityDto, ListActivitiesQuery, PaginationMeta } from '@taskflow/shared';
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

  /** The user's activity history, newest first, with type, date and title filters. */
  async list(
    userId: string,
    query: ListActivitiesQuery,
  ): Promise<{ items: ActivityDto[]; meta: PaginationMeta }> {
    const where: Prisma.TaskActivityWhereInput = { userId };
    if (query.action?.length) where.action = { in: query.action };
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    if (query.search) where.taskTitle = { contains: query.search, mode: 'insensitive' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.taskActivity.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.taskActivity.count({ where }),
    ]);
    return {
      items: rows.map(toActivityResponse),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
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
