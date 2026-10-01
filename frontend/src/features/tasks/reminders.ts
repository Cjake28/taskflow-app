import {
  DATE_ONLY_REMINDER_TIME,
  REMINDER_LIMITS,
  REMINDER_OFFSET_PRESETS,
  type FieldError,
  type ReminderInput,
  type ReminderStatus,
  type TaskReminderDto,
} from '@taskflow/shared';
import { addHours, format, isValid, parse, startOfHour, subMinutes } from 'date-fns';
import { z } from 'zod';

import { ApiError } from '@/lib/api-client';
import { formatBefore } from '@/lib/offsets';

/*
 * Reminder rows in the task form (frontend-only shape). `when` is the number of minutes before
 * the due time as a string ("0", "60", …) or "custom" for a fixed date and time. `original`
 * remembers how a loaded reminder looked, so new or changed rows can be told apart from
 * reminders that were already sent.
 */

export const CUSTOM_WHEN = 'custom';

export interface ReminderFormValue {
  /** The saved reminder this row edits (absent for new rows). */
  reminderId?: string;
  when: string;
  /** `yyyy-MM-dd`, for custom reminders. */
  date: string;
  /** `HH:mm`, for custom reminders. */
  time: string;
  message: string;
  /** Timing key of the saved reminder (null for new rows). */
  original: string | null;
  /** The saved reminder's exact time, reused when its minute did not change. */
  originalRemindAt: string | null;
  sentAt: string | null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function localDateTime(date: string, time: string): Date | null {
  if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(time)) return null;
  const value = parse(`${date} ${time}`, 'yyyy-MM-dd HH:mm', new Date());
  return isValid(value) ? value : null;
}

const minuteOf = (date: Date) => Math.floor(date.getTime() / 60_000);

/** "relative:60" or "absolute:<minute>"; null while a custom row is incomplete. */
export function reminderKey(
  value: Pick<ReminderFormValue, 'when' | 'date' | 'time'>,
): string | null {
  if (value.when !== CUSTOM_WHEN) return `relative:${Number(value.when)}`;
  const at = localDateTime(value.date, value.time);
  return at ? `absolute:${minuteOf(at)}` : null;
}

export const reminderFormSchema = z.object({
  reminderId: z.string().optional(),
  when: z.string().min(1, 'Choose when to be reminded'),
  date: z.string(),
  time: z.string(),
  message: z
    .string()
    .refine(
      (value) => value.trim().length <= REMINDER_LIMITS.message,
      `A message must be at most ${REMINDER_LIMITS.message} characters`,
    ),
  original: z.string().nullable(),
  originalRemindAt: z.string().nullable(),
  sentAt: z.string().nullable(),
});

/** Row checks: complete custom times, future times for new or changed rows, no duplicates. */
export function checkReminders(
  reminders: ReminderFormValue[],
  ctx: z.RefinementCtx,
  now: Date = new Date(),
): void {
  if (reminders.length > REMINDER_LIMITS.perTask) {
    ctx.addIssue({
      code: 'custom',
      path: ['reminders'],
      message: `A task can have at most ${REMINDER_LIMITS.perTask} reminders`,
    });
  }
  const seen = new Set<string>();
  reminders.forEach((reminder, index) => {
    const path = (field: keyof ReminderFormValue) => ['reminders', index, field];
    if (reminder.when === CUSTOM_WHEN) {
      if (!DATE_PATTERN.test(reminder.date) || !localDateTime(reminder.date, '00:00')) {
        ctx.addIssue({ code: 'custom', path: path('date'), message: 'Pick a date' });
        return;
      }
      const at = localDateTime(reminder.date, reminder.time);
      if (!at) {
        ctx.addIssue({ code: 'custom', path: path('time'), message: 'Pick a time' });
        return;
      }
      if (reminderKey(reminder) !== reminder.original && at <= now) {
        ctx.addIssue({ code: 'custom', path: path('time'), message: 'Pick a time in the future' });
        return;
      }
    }
    const key = reminderKey(reminder);
    if (key && seen.has(key)) {
      ctx.addIssue({ code: 'custom', path: path('when'), message: 'This reminder is already set' });
    }
    if (key) seen.add(key);
  });
}

/** A saved reminder as a form row. */
export function toReminderFormValue(reminder: TaskReminderDto): ReminderFormValue {
  const base = {
    reminderId: reminder.id,
    message: reminder.message ?? '',
    sentAt: reminder.sentAt,
    originalRemindAt: reminder.remindAt,
  };
  if (reminder.kind === 'relative') {
    const row = { when: String(reminder.offsetMinutes ?? 0), date: '', time: '' };
    return { ...base, ...row, original: reminderKey(row) };
  }
  const at = reminder.remindAt ? new Date(reminder.remindAt) : null;
  const row = {
    when: CUSTOM_WHEN,
    date: at ? format(at, 'yyyy-MM-dd') : '',
    time: at ? format(at, 'HH:mm') : '',
  };
  return { ...base, ...row, original: reminderKey(row) };
}

/** A form row as the API payload (call only with rows that passed validation). */
export function toReminderInput(row: ReminderFormValue): ReminderInput {
  const message = row.message.trim() || null;
  const id = row.reminderId ? { id: row.reminderId } : {};
  if (row.when !== CUSTOM_WHEN) {
    return { ...id, kind: 'relative', offsetMinutes: Number(row.when), message };
  }
  const unchanged = row.originalRemindAt !== null && reminderKey(row) === row.original;
  const at = localDateTime(row.date, row.time);
  const remindAt = unchanged ? row.originalRemindAt : (at?.toISOString() ?? '');
  return { ...id, kind: 'absolute', remindAt: remindAt ?? '', message };
}

/** Order-sensitive comparison key for a list of reminder payloads (minute precision). */
export function remindersSignature(inputs: ReminderInput[]): string {
  return JSON.stringify(
    inputs.map((input) => [
      input.id ?? null,
      input.kind,
      input.kind === 'relative'
        ? input.offsetMinutes
        : Math.floor(new Date(input.remindAt).getTime() / 60_000),
      input.message ?? null,
    ]),
  );
}

/** A new row: the first unused "before the due time" choice, or in an hour without a due date. */
export function newReminder(
  existing: Array<Pick<ReminderFormValue, 'when' | 'date' | 'time'>>,
  hasDueDate: boolean,
  now: Date = new Date(),
): ReminderFormValue {
  const empty = {
    message: '',
    original: null,
    originalRemindAt: null,
    sentAt: null,
  };
  if (hasDueDate) {
    const used = new Set(existing.map((row) => row.when));
    const offset = REMINDER_OFFSET_PRESETS.find((preset) => !used.has(String(preset)));
    if (offset !== undefined) return { ...empty, when: String(offset), date: '', time: '' };
  }
  const at = startOfHour(addHours(now, 2));
  return { ...empty, when: CUSTOM_WHEN, date: format(at, 'yyyy-MM-dd'), time: format(at, 'HH:mm') };
}

/** When a "before the due time" reminder fires for the due date in the form (local time). */
export function relativeRemindAt(
  offsetMinutes: number,
  dueDate: string,
  dueTime: string,
): Date | null {
  const anchor = localDateTime(dueDate, dueTime || DATE_ONLY_REMINDER_TIME);
  return anchor ? subMinutes(anchor, offsetMinutes) : null;
}

/** "Fri, Oct 3 · 9:00 AM", with the year when it is not this year. */
export function formatReminderTime(value: string | Date, now: Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return format(
    date,
    date.getFullYear() === now.getFullYear()
      ? "EEE, MMM d '·' h:mm a"
      : "EEE, MMM d, yyyy '·' h:mm a",
  );
}

/** Choices for the "When" select; an off-preset offset of a saved reminder is kept as a choice. */
export function whenOptions(extraOffset?: number | null): Array<{ value: string; label: string }> {
  const offsets: number[] = [...REMINDER_OFFSET_PRESETS];
  if (extraOffset !== undefined && extraOffset !== null && !offsets.includes(extraOffset)) {
    offsets.push(extraOffset);
    offsets.sort((a, b) => a - b);
  }
  return [
    ...offsets.map((offset) => ({ value: String(offset), label: formatBefore(offset) })),
    { value: CUSTOM_WHEN, label: 'Custom date & time' },
  ];
}

export const REMINDER_STATUS_META: Record<ReminderStatus, { label: string; tint: string }> = {
  scheduled: { label: 'Scheduled', tint: 'var(--primary)' },
  sent: { label: 'Sent', tint: 'var(--status-done)' },
  'needs-due-date': { label: 'Needs a due date', tint: 'var(--status-progress)' },
  paused: { label: 'Paused', tint: 'var(--muted-foreground)' },
  missed: { label: 'Missed', tint: 'var(--danger)' },
};

/** Headline and time line for a saved reminder: "1 hour before" + "Fri, Oct 3 · 8:00 AM". */
export function describeReminder(
  reminder: TaskReminderDto,
  now: Date = new Date(),
): { title: string; time: string | null } {
  const time = reminder.remindAt ? formatReminderTime(reminder.remindAt, now) : null;
  if (reminder.kind === 'relative') {
    return { title: formatBefore(reminder.offsetMinutes ?? 0), time };
  }
  return { title: time ?? 'No time set', time: null };
}

/**
 * Server field errors use the payload names (`reminders.0.remindAt`); point them at the form
 * controls (`reminders.0.time`, `reminders.0.when`).
 */
export function remapReminderErrors(error: unknown): unknown {
  if (!(error instanceof ApiError) || error.details.length === 0) return error;
  const details: FieldError[] = error.details.map((detail) => {
    const match = /^reminders\.(\d+)(?:\.(\w+))?$/.exec(detail.field);
    if (!match) return detail;
    const [, index, field] = match;
    const target = field === 'remindAt' ? 'time' : field === 'message' ? 'message' : 'when';
    return { ...detail, field: `reminders.${index}.${target}` };
  });
  return new ApiError({
    status: error.status,
    code: error.code,
    message: error.message,
    details,
    requestId: error.requestId,
    retryAfterSeconds: error.retryAfterSeconds,
  });
}
