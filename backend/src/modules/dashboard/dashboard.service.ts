import type { DashboardStats } from '@taskflow/shared';
import type { Clock } from '../../common/utils/clock';
import type { Db } from '../../database/prisma';
import { TaskPriority, TaskStatus } from '../../generated/prisma/client';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export class DashboardService {
  constructor(
    private readonly prisma: Db,
    private readonly clock: Clock,
  ) {}

  /**
   * Counted in the database with groupBy/count, never by loading tasks. The
   * "due soon" and "completed" windows are rolling 7 days, so they are right
   * in every time zone without the server knowing the user's zone.
   */
  async stats(userId: string): Promise<DashboardStats> {
    const now = this.clock.now();
    const weekAhead = new Date(now.getTime() + WEEK_MS);
    const weekAgo = new Date(now.getTime() - WEEK_MS);
    const open = { not: TaskStatus.COMPLETED };

    const [statusGroups, priorityGroups, overdue, dueSoon, completedLast7Days] =
      await this.prisma.$transaction([
        this.prisma.task.groupBy({
          by: ['status'],
          where: { userId },
          orderBy: { status: 'asc' },
          _count: { _all: true },
        }),
        this.prisma.task.groupBy({
          by: ['priority'],
          where: { userId },
          orderBy: { priority: 'asc' },
          _count: { _all: true },
        }),
        this.prisma.task.count({ where: { userId, status: open, dueDate: { lt: now } } }),
        this.prisma.task.count({
          where: { userId, status: open, dueDate: { gte: now, lte: weekAhead } },
        }),
        this.prisma.task.count({
          where: { userId, status: TaskStatus.COMPLETED, completedAt: { gte: weekAgo } },
        }),
      ]);

    const byStatus = { TODO: 0, IN_PROGRESS: 0, COMPLETED: 0 } satisfies Record<TaskStatus, number>;
    for (const group of statusGroups) byStatus[group.status] = countOf(group._count);
    const byPriority = { LOW: 0, MEDIUM: 0, HIGH: 0 } satisfies Record<TaskPriority, number>;
    for (const group of priorityGroups) byPriority[group.priority] = countOf(group._count);

    const total = byStatus.TODO + byStatus.IN_PROGRESS + byStatus.COMPLETED;
    return {
      total,
      byStatus,
      byPriority,
      overdue,
      dueSoon,
      completedLast7Days,
      completionRate: total === 0 ? 0 : Math.round((byStatus.COMPLETED / total) * 100),
    };
  }
}

function countOf(count: true | { _all?: number } | undefined): number {
  return typeof count === 'object' ? (count._all ?? 0) : 0;
}
