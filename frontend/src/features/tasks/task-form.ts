import {
  TASK_LIMITS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  createTaskSchema,
  type CreateTaskInput,
  type TaskDto,
  type TaskStatus,
  type UpdateTaskInput,
} from '@taskflow/shared';
import { isValid, parse } from 'date-fns';
import { z } from 'zod';

import { fromDueDate, toDueDateIso } from '@/lib/due-date';

/*
 * Frontend-only form shape (spec §14.7): the due date is split into a local date and an optional
 * time. `toCreateInput` / `toUpdateInput` turn it into the shared API payloads: a date without a
 * time means the end of that local day, and on edit only changed fields are sent (null clears).
 */

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const isDate = (value: string) => isValid(parse(value, 'yyyy-MM-dd', new Date()));

export const taskFormSchema = z
  .object({
    title: createTaskSchema.shape.title,
    description: z
      .string()
      .refine(
        (value) => value.trim().length <= TASK_LIMITS.description,
        `Description must be at most ${TASK_LIMITS.description} characters`,
      ),
    status: z.enum(TASK_STATUSES, { error: 'Choose a status' }),
    priority: z.enum(TASK_PRIORITIES, { error: 'Choose a priority' }),
    dueDate: z.string().refine((value) => value === '' || isDate(value), 'Enter a valid date'),
    dueTime: z
      .string()
      .refine((value) => value === '' || TIME_PATTERN.test(value), 'Enter a valid time'),
  })
  .refine((values) => values.dueTime === '' || values.dueDate !== '', {
    path: ['dueDate'],
    message: 'Pick a date for this time',
  });

export type TaskFormInput = z.input<typeof taskFormSchema>;
export type TaskFormValues = z.output<typeof taskFormSchema>;

export function toFormValues(
  task?: Pick<
    TaskDto,
    'title' | 'description' | 'status' | 'priority' | 'dueDate' | 'hasDueTime'
  > | null,
  defaults: { status?: TaskStatus } = {},
): TaskFormInput {
  const due = task ? fromDueDate(task.dueDate, task.hasDueTime) : null;
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? defaults.status ?? 'TODO',
    priority: task?.priority ?? 'MEDIUM',
    dueDate: due?.date ?? '',
    dueTime: due?.time ?? '',
  };
}

function dueOf(values: Pick<TaskFormValues, 'dueDate' | 'dueTime'>) {
  if (!values.dueDate) return { dueDate: null, hasDueTime: false };
  return {
    dueDate: toDueDateIso(values.dueDate, values.dueTime || null),
    hasDueTime: values.dueTime !== '',
  };
}

export function toCreateInput(values: TaskFormValues): CreateTaskInput {
  const input: CreateTaskInput = {
    title: values.title.trim(),
    status: values.status,
    priority: values.priority,
  };
  const description = values.description.trim();
  if (description) input.description = description;
  const due = dueOf(values);
  if (due.dueDate) {
    input.dueDate = due.dueDate;
    input.hasDueTime = due.hasDueTime;
  }
  return input;
}

const minuteOf = (iso: string) => Math.floor(new Date(iso).getTime() / 60_000);

/** Only the fields that changed; `null` clears the description or due date. Null = no changes. */
export function toUpdateInput(
  values: TaskFormValues,
  task: Pick<
    TaskDto,
    'title' | 'description' | 'status' | 'priority' | 'dueDate' | 'hasDueTime'
  >,
): UpdateTaskInput | null {
  const input: UpdateTaskInput = {};

  const title = values.title.trim();
  if (title !== task.title) input.title = title;

  const description = values.description.trim();
  if (description !== (task.description ?? '')) input.description = description || null;

  if (values.status !== task.status) input.status = values.status;
  if (values.priority !== task.priority) input.priority = values.priority;

  const due = dueOf(values);
  const dateChanged =
    (due.dueDate === null) !== (task.dueDate === null) ||
    (due.dueDate !== null && task.dueDate !== null && minuteOf(due.dueDate) !== minuteOf(task.dueDate));
  const timeModeChanged = due.dueDate !== null && due.hasDueTime !== task.hasDueTime;
  if (dateChanged || timeModeChanged) {
    input.dueDate = due.dueDate;
    if (due.dueDate) input.hasDueTime = due.hasDueTime;
  }

  return Object.keys(input).length > 0 ? input : null;
}
