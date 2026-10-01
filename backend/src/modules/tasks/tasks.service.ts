import type {
  CreateTaskData,
  ListTasksQuery,
  MoveTaskData,
  PaginationMeta,
  TaskDetailsDto,
  TaskDto,
  UpdateTaskData,
} from '@taskflow/shared';
import { BadRequestException, NotFoundException } from '../../common/exceptions';
import type { Clock } from '../../common/utils/clock';
import type { Db, Tx } from '../../database/prisma';
import type { Prisma } from '../../generated/prisma/client';
import { ActivityAction, TaskPriority, TaskStatus } from '../../generated/prisma/client';
import type { ActivityService } from '../activities/activity.service';
import { toImageResponse } from '../images/images.mapper';
import type { NotificationPreferencesService } from '../notifications/notification-preferences.service';
import { needsRenumber, positionBetween } from './positions';
import {
  compareReminders,
  followDueDate,
  replaceReminders,
  toReminderResponse,
} from './task-reminders';
import { toTaskDetailsResponse, toTaskResponse, type TaskRecord } from './tasks.mapper';

const LIST_SUMMARY = {
  _count: {
    select: {
      images: { where: { deletedAt: null } },
      reminders: { where: { sentAt: null } },
    },
  },
  images: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    take: 1,
    select: { id: true },
  },
} satisfies Prisma.TaskInclude;

export interface TaskDeletionHooks {
  /** Called after a task (and its images) were deleted — used to schedule image purges. */
  afterTaskDeleted?(userId: string, taskId: string): Promise<void>;
}

export class TasksService {
  constructor(
    private readonly prisma: Db,
    private readonly activities: ActivityService,
    private readonly preferences: NotificationPreferencesService,
    private readonly clock: Clock,
    private readonly hooks: TaskDeletionHooks = {},
  ) {}

  async list(
    userId: string,
    query: ListTasksQuery,
  ): Promise<{ items: TaskDto[]; meta: PaginationMeta }> {
    const now = this.clock.now();
    const where = this.buildWhere(userId, query, now);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        orderBy: this.buildOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: LIST_SUMMARY,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      items: rows.map((row) =>
        toTaskResponse(
          row,
          {
            imageCount: row._count.images,
            coverImageId: row.images[0]?.id ?? null,
            reminderCount: row._count.reminders,
          },
          now,
        ),
      ),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async findOne(userId: string, taskId: string): Promise<TaskDetailsDto> {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, userId } });
    if (!task) throw new NotFoundException('Task');
    return this.details(task);
  }

  async create(userId: string, input: CreateTaskData): Promise<TaskDetailsDto> {
    const now = this.clock.now();
    const status = input.status ?? TaskStatus.TODO;
    const dueDate = input.dueDate ? new Date(input.dueDate) : null;

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          userId,
          title: input.title,
          description: input.description ?? null,
          status,
          priority: input.priority ?? TaskPriority.MEDIUM,
          dueDate,
          hasDueTime: dueDate ? (input.hasDueTime ?? false) : false,
          completedAt: status === TaskStatus.COMPLETED ? now : null,
          position: await this.topPosition(tx, userId, status),
        },
      });
      await this.activities.record(tx, {
        userId,
        taskId: created.id,
        taskTitle: created.title,
        action: ActivityAction.CREATED,
      });
      if (input.reminders?.length) {
        await replaceReminders(tx, {
          userId,
          task: created,
          inputs: input.reminders,
          now,
          timeZone: await this.preferences.timezoneOf(userId, tx),
        });
      }
      return created;
    });
    return this.details(task);
  }

  async update(userId: string, taskId: string, input: UpdateTaskData): Promise<TaskDetailsDto> {
    const now = this.clock.now();

    const task = await this.prisma.$transaction(async (tx) => {
      const current = await tx.task.findFirst({ where: { id: taskId, userId } });
      if (!current) throw new NotFoundException('Task');

      const data: Prisma.TaskUpdateInput = {};
      const changes: Record<string, unknown> = {};

      if (input.title !== undefined && input.title !== current.title) {
        data.title = input.title;
        changes.title = { from: current.title, to: input.title };
      }
      if (input.description !== undefined && input.description !== current.description) {
        data.description = input.description;
        changes.description = { changed: true };
      }
      if (input.priority !== undefined && input.priority !== current.priority) {
        data.priority = input.priority;
        changes.priority = { from: current.priority, to: input.priority };
      }

      let nextDueDate = current.dueDate;
      if (input.dueDate !== undefined) {
        nextDueDate = input.dueDate ? new Date(input.dueDate) : null;
        if (nextDueDate?.getTime() !== current.dueDate?.getTime()) {
          data.dueDate = nextDueDate;
          changes.dueDate = {
            from: current.dueDate?.toISOString() ?? null,
            to: nextDueDate?.toISOString() ?? null,
          };
        }
      }
      const nextHasDueTime = nextDueDate ? (input.hasDueTime ?? current.hasDueTime) : false;
      if (nextHasDueTime !== current.hasDueTime) data.hasDueTime = nextHasDueTime;

      let statusChange: { from: TaskStatus; to: TaskStatus } | null = null;
      if (input.status !== undefined && input.status !== current.status) {
        statusChange = { from: current.status, to: input.status };
        data.status = input.status;
        data.position = await this.topPosition(tx, userId, input.status);
        data.completedAt = input.status === TaskStatus.COMPLETED ? now : null;
      }

      const dueMoved = data.dueDate !== undefined || data.hasDueTime !== undefined;
      const saved =
        Object.keys(data).length === 0
          ? current
          : await tx.task.update({ where: { id: taskId }, data });

      if (input.reminders !== undefined || dueMoved) {
        const timeZone = await this.preferences.timezoneOf(userId, tx);
        if (input.reminders !== undefined) {
          await replaceReminders(tx, {
            userId,
            task: saved,
            inputs: input.reminders,
            now,
            timeZone,
          });
        } else {
          await followDueDate(tx, saved, timeZone);
        }
      }
      if (saved === current) return current;

      if (statusChange) {
        await this.activities.record(tx, {
          userId,
          taskId,
          taskTitle: saved.title,
          action: ActivityAction.STATUS_CHANGED,
          changes: { status: statusChange },
        });
      }
      if (Object.keys(changes).length > 0) {
        await this.activities.record(tx, {
          userId,
          taskId,
          taskTitle: saved.title,
          action: ActivityAction.UPDATED,
          changes,
        });
      }
      return saved;
    });
    return this.details(task);
  }

  async move(userId: string, taskId: string, input: MoveTaskData): Promise<TaskDetailsDto> {
    const now = this.clock.now();

    const task = await this.prisma.$transaction(async (tx) => {
      const current = await tx.task.findFirst({ where: { id: taskId, userId } });
      if (!current) throw new NotFoundException('Task');

      const neighbourIds = [input.prevId, input.nextId].filter(
        (value): value is string => typeof value === 'string' && value !== taskId,
      );
      const loadNeighbours = () =>
        neighbourIds.length === 0
          ? Promise.resolve([] as Array<{ id: string; position: number }>)
          : tx.task.findMany({
              where: { id: { in: neighbourIds }, userId, status: input.status },
              select: { id: true, position: true },
            });

      let neighbours = await loadNeighbours();
      if (neighbours.length !== neighbourIds.length) {
        throw new BadRequestException(
          'The neighbouring tasks must be yours and in the target column.',
        );
      }
      const positionOf = (id: string | null | undefined) =>
        id ? (neighbours.find((n) => n.id === id)?.position ?? null) : null;

      let prev = positionOf(input.prevId);
      let next = positionOf(input.nextId);
      if (needsRenumber(prev, next)) {
        await this.renumberColumn(tx, userId, input.status, taskId);
        neighbours = await loadNeighbours();
        prev = positionOf(input.prevId);
        next = positionOf(input.nextId);
      }

      const statusChanged = input.status !== current.status;
      const saved = await tx.task.update({
        where: { id: taskId },
        data: {
          position: positionBetween(prev, next),
          ...(statusChanged
            ? {
                status: input.status,
                completedAt: input.status === TaskStatus.COMPLETED ? now : null,
              }
            : {}),
        },
      });

      if (statusChanged) {
        await this.activities.record(tx, {
          userId,
          taskId,
          taskTitle: saved.title,
          action: ActivityAction.STATUS_CHANGED,
          changes: { status: { from: current.status, to: input.status } },
        });
      }
      return saved;
    });
    return this.details(task);
  }

  async remove(userId: string, taskId: string): Promise<void> {
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.task.findFirst({
        where: { id: taskId, userId },
        select: { id: true, title: true },
      });
      if (!current) throw new NotFoundException('Task');

      // Images are kept (soft-deleted) for the retention period, then purged by a job.
      await tx.image.updateMany({
        where: { taskId, deletedAt: null },
        data: { deletedAt: now },
      });
      await this.activities.record(tx, {
        userId,
        taskId,
        taskTitle: current.title,
        action: ActivityAction.DELETED,
      });
      await tx.task.delete({ where: { id: taskId } });
    });
    await this.hooks.afterTaskDeleted?.(userId, taskId);
  }

  async assertOwned(userId: string, taskId: string): Promise<void> {
    const exists = await this.prisma.task.count({ where: { id: taskId, userId } });
    if (exists === 0) throw new NotFoundException('Task');
  }

  private async details(task: TaskRecord & { id: string }): Promise<TaskDetailsDto> {
    const now = this.clock.now();
    const [images, reminders] = await Promise.all([
      this.prisma.image.findMany({
        where: { taskId: task.id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.taskReminder.findMany({ where: { taskId: task.id } }),
    ]);
    return toTaskDetailsResponse(
      task,
      images.map(toImageResponse),
      reminders.sort(compareReminders).map((reminder) => toReminderResponse(reminder, task, now)),
      now,
    );
  }

  private async topPosition(tx: Tx, userId: string, status: TaskStatus): Promise<number> {
    const result = await tx.task.aggregate({
      where: { userId, status },
      _min: { position: true },
    });
    return result._min.position === null ? 0 : result._min.position - 1;
  }

  private async renumberColumn(
    tx: Tx,
    userId: string,
    status: TaskStatus,
    excludeId: string,
  ): Promise<void> {
    const column = await tx.task.findMany({
      where: { userId, status, id: { not: excludeId } },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    for (const [index, item] of column.entries()) {
      await tx.task.update({ where: { id: item.id }, data: { position: index + 1 } });
    }
  }

  private buildWhere(userId: string, query: ListTasksQuery, now: Date): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = { userId };
    if (query.search) where.title = { contains: query.search, mode: 'insensitive' };
    if (query.priority?.length) where.priority = { in: query.priority };

    let statuses = query.status?.length ? [...query.status] : undefined;
    const due: Prisma.DateTimeNullableFilter = {};
    if (query.dueFrom) due.gte = new Date(query.dueFrom);
    if (query.dueTo) due.lte = new Date(query.dueTo);
    if (query.overdue) {
      due.lt = now;
      statuses = (statuses ?? [TaskStatus.TODO, TaskStatus.IN_PROGRESS]).filter(
        (status) => status !== TaskStatus.COMPLETED,
      );
    }
    if (statuses) where.status = { in: statuses };
    if (Object.keys(due).length > 0) where.dueDate = due;
    return where;
  }

  private buildOrderBy(query: ListTasksQuery): Prisma.TaskOrderByWithRelationInput[] {
    const direction = query.sortOrder;
    switch (query.sortBy) {
      case 'dueDate':
        return [{ dueDate: { sort: direction, nulls: 'last' } }, { createdAt: 'desc' }];
      case 'priority':
        return [{ priority: direction }, { createdAt: 'desc' }];
      case 'title':
        return [{ title: direction }, { createdAt: 'desc' }];
      case 'position':
        return [{ position: direction }, { createdAt: 'desc' }];
      case 'updatedAt':
        return [{ updatedAt: direction }, { id: direction }];
      default:
        return [{ createdAt: direction }, { id: direction }];
    }
  }
}
