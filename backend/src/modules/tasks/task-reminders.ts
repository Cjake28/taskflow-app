import type { FieldError, ReminderData, TaskReminderDto } from '@taskflow/shared';
import { ValidationException } from '../../common/exceptions';
import type { Tx } from '../../database/prisma';
import type { TaskReminder } from '../../generated/prisma/client';
import { relativeRemindAt, reminderStatus, type DueFields } from '../notifications/reminder-timing';

interface ReminderTask extends DueFields {
  id: string;
}

const sameInstant = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

function timingOf(input: ReminderData, task: DueFields, timeZone: string) {
  return input.kind === 'relative'
    ? {
        offsetMinutes: input.offsetMinutes,
        remindAt: relativeRemindAt(input.offsetMinutes, task, timeZone),
      }
    : { offsetMinutes: null, remindAt: new Date(input.remindAt) };
}

/**
 * Replaces a task's reminders with `inputs`. A reminder that keeps its `id` and timing keeps its
 * sent state, so saving a task does not re-send it; a changed one is re-armed. New or changed
 * fixed-time reminders must be in the future.
 */
export async function replaceReminders(
  tx: Tx,
  params: {
    userId: string;
    task: ReminderTask;
    inputs: ReminderData[];
    now: Date;
    timeZone: string;
  },
): Promise<void> {
  const { userId, task, inputs, now, timeZone } = params;
  const existing = await tx.taskReminder.findMany({ where: { taskId: task.id } });
  // Only this task's reminders can be kept; any other id is treated as a new reminder.
  const available = new Map(existing.map((reminder) => [reminder.id, reminder]));
  const errors: FieldError[] = [];

  const rows = inputs.map((input, index) => {
    const timing = timingOf(input, task, timeZone);
    const previous = input.id ? available.get(input.id) : undefined;
    if (previous) available.delete(previous.id);
    const unchanged =
      previous !== undefined &&
      previous.offsetMinutes === timing.offsetMinutes &&
      sameInstant(previous.remindAt, timing.remindAt);

    if (input.kind === 'absolute' && !unchanged && timing.remindAt!.getTime() <= now.getTime()) {
      errors.push({ field: `reminders.${index}.remindAt`, message: 'Pick a time in the future' });
    }
    return {
      ...(previous ? { id: previous.id, createdAt: previous.createdAt } : {}),
      taskId: task.id,
      userId,
      offsetMinutes: timing.offsetMinutes,
      remindAt: timing.remindAt,
      message: input.message ?? null,
      sentAt: unchanged ? previous.sentAt : null,
    };
  });

  if (errors.length > 0) throw new ValidationException(errors);
  await tx.taskReminder.deleteMany({ where: { taskId: task.id } });
  if (rows.length > 0) await tx.taskReminder.createMany({ data: rows });
}

/** After the due date changes, moves "before the due time" reminders with it and re-arms them. */
export async function followDueDate(tx: Tx, task: ReminderTask, timeZone: string): Promise<void> {
  const relative = await tx.taskReminder.findMany({
    where: { taskId: task.id, offsetMinutes: { not: null } },
  });
  for (const reminder of relative) {
    const remindAt = relativeRemindAt(reminder.offsetMinutes!, task, timeZone);
    if (sameInstant(remindAt, reminder.remindAt)) continue;
    await tx.taskReminder.update({
      where: { id: reminder.id },
      data: { remindAt, sentAt: null },
    });
  }
}

/** Earliest first; reminders waiting for a due date last. */
export function compareReminders(a: TaskReminder, b: TaskReminder): number {
  if (a.remindAt && b.remindAt) return a.remindAt.getTime() - b.remindAt.getTime();
  if (a.remindAt) return -1;
  if (b.remindAt) return 1;
  return (a.offsetMinutes ?? 0) - (b.offsetMinutes ?? 0);
}

export function toReminderResponse(
  reminder: TaskReminder,
  task: { status: string },
  now: Date,
): TaskReminderDto {
  return {
    id: reminder.id,
    kind: reminder.offsetMinutes === null ? 'absolute' : 'relative',
    offsetMinutes: reminder.offsetMinutes,
    remindAt: reminder.remindAt?.toISOString() ?? null,
    message: reminder.message,
    sentAt: reminder.sentAt?.toISOString() ?? null,
    status: reminderStatus(reminder, task, now),
  };
}
