import { z } from 'zod';
import { TASK_LIMITS, TASK_PRIORITIES, TASK_SORT_FIELDS, TASK_STATUSES } from '../constants/task';

const titleSchema = z
  .string({ error: 'Title is required' })
  .trim()
  .min(1, { error: 'Title is required', abort: true })
  .max(TASK_LIMITS.title, `Title must be at most ${TASK_LIMITS.title} characters`);

/** Empty or whitespace-only descriptions are stored as null. */
const descriptionSchema = z
  .string()
  .trim()
  .max(TASK_LIMITS.description, `Description must be at most ${TASK_LIMITS.description} characters`)
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();

const dueDateSchema = z.iso.datetime({ offset: true, error: 'Enter a valid due date' }).nullable();

const statusSchema = z.enum(TASK_STATUSES, { error: 'Choose a valid status' });
const prioritySchema = z.enum(TASK_PRIORITIES, { error: 'Choose a valid priority' });

export const createTaskSchema = z.strictObject({
  title: titleSchema,
  description: descriptionSchema.optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  dueDate: dueDateSchema.optional(),
  hasDueTime: z.boolean().optional(),
});

export type CreateTaskInput = z.input<typeof createTaskSchema>;
export type CreateTaskData = z.output<typeof createTaskSchema>;

export const updateTaskSchema = z
  .strictObject({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    status: statusSchema.optional(),
    priority: prioritySchema.optional(),
    dueDate: dueDateSchema.optional(),
    hasDueTime: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (Object.values(data).every((value) => value === undefined)) {
      ctx.addIssue({ code: 'custom', path: [], message: 'Provide at least one field to update' });
    }
  });

export type UpdateTaskInput = z.input<typeof updateTaskSchema>;
export type UpdateTaskData = z.output<typeof updateTaskSchema>;

export const moveTaskSchema = z.strictObject({
  status: statusSchema,
  /** The card that will sit directly above the moved card (null = top of the column). */
  prevId: z.uuid('Invalid task id').nullable().optional(),
  /** The card that will sit directly below the moved card (null = bottom of the column). */
  nextId: z.uuid('Invalid task id').nullable().optional(),
});

export type MoveTaskData = z.output<typeof moveTaskSchema>;

/** `?status=TODO,IN_PROGRESS` → `['TODO', 'IN_PROGRESS']`; errors are reported on the param itself. */
const csvOf = <const T extends readonly [string, ...string[]]>(values: T, label: string) =>
  z.string().transform((value, ctx) => {
    const parts = value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const invalid = parts.filter((part) => !values.includes(part));
    if (invalid.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid ${label}: ${invalid.join(', ')}. Use ${values.join(', ')}`,
      });
      return z.NEVER;
    }
    return parts as T[number][];
  });

export const listTasksQuerySchema = z.object({
  search: z.string().trim().max(TASK_LIMITS.title).optional(),
  status: csvOf(TASK_STATUSES, 'status').optional(),
  priority: csvOf(TASK_PRIORITIES, 'priority').optional(),
  overdue: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  dueFrom: z.iso.datetime({ offset: true, error: 'Invalid dueFrom date' }).optional(),
  dueTo: z.iso.datetime({ offset: true, error: 'Invalid dueTo date' }).optional(),
  sortBy: z.enum(TASK_SORT_FIELDS).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(TASK_LIMITS.pageSizeMax)
    .default(TASK_LIMITS.pageSizeDefault),
});

export type ListTasksQuery = z.output<typeof listTasksQuerySchema>;

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type ActivityQuery = z.output<typeof activityQuerySchema>;
