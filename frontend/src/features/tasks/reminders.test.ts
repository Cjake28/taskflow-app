import { createTaskSchema, updateTaskSchema, type TaskReminderDto } from '@taskflow/shared';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api-client';
import { toDueDateIso } from '@/lib/due-date';

import {
  CUSTOM_WHEN,
  describeReminder,
  newReminder,
  relativeRemindAt,
  remapReminderErrors,
  toReminderFormValue,
  whenOptions,
} from './reminders';
import { taskFormSchema, toCreateInput, toFormValues, toUpdateInput } from './task-form';

const base = {
  title: 'Sign the lease',
  description: '',
  status: 'TODO' as const,
  priority: 'MEDIUM' as const,
  dueDate: '2099-10-05',
  dueTime: '14:00',
};

const relative: TaskReminderDto = {
  id: '01900000-0000-7000-8000-000000000001',
  kind: 'relative',
  offsetMinutes: 60,
  remindAt: toDueDateIso('2099-10-05', '13:00'),
  message: 'Bring the ID',
  sentAt: null,
  status: 'scheduled',
};

const sentAbsolute: TaskReminderDto = {
  id: '01900000-0000-7000-8000-000000000002',
  kind: 'absolute',
  offsetMinutes: null,
  // In the past and with seconds: sent already, and must round-trip untouched.
  remindAt: '2020-01-02T03:04:05.678Z',
  message: null,
  sentAt: '2020-01-02T03:04:06.000Z',
  status: 'sent',
};

const task = {
  title: 'Sign the lease',
  description: null,
  status: 'TODO' as const,
  priority: 'MEDIUM' as const,
  dueDate: toDueDateIso('2099-10-05', '14:00'),
  hasDueTime: true,
  reminders: [relative, sentAbsolute],
};

const issuesOf = (input: unknown) => {
  const result = taskFormSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

describe('reminders in the task form', () => {
  it('creates relative and custom reminders', () => {
    const values = taskFormSchema.parse({
      ...base,
      reminders: [
        { ...newReminder([], true), message: '  Call first  ' },
        { ...newReminder([], false), when: CUSTOM_WHEN, date: '2099-10-04', time: '18:30' },
      ],
    });
    const input = toCreateInput(values);
    expect(input.reminders).toEqual([
      { kind: 'relative', offsetMinutes: 0, message: 'Call first' },
      {
        kind: 'absolute',
        remindAt: toDueDateIso('2099-10-04', '18:30'),
        message: null,
      },
    ]);
    expect(createTaskSchema.safeParse(input).success).toBe(true);
  });

  it('leaves reminders out of an update when nothing changed', () => {
    const values = taskFormSchema.parse(toFormValues(task));
    expect(values.reminders).toHaveLength(2);
    expect(toUpdateInput(values, task)).toBeNull();
  });

  it('sends the whole list when a reminder changes, keeping ids and sent times', () => {
    const form = toFormValues(task);
    const values = taskFormSchema.parse({
      ...form,
      reminders: [{ ...form.reminders?.[0], when: '1440' }, form.reminders?.[1]],
    });
    const input = toUpdateInput(values, task);
    expect(input).toEqual({
      reminders: [
        { id: relative.id, kind: 'relative', offsetMinutes: 1440, message: 'Bring the ID' },
        { id: sentAbsolute.id, kind: 'absolute', remindAt: sentAbsolute.remindAt, message: null },
      ],
    });
    expect(updateTaskSchema.safeParse(input).success).toBe(true);
  });

  it('sends an empty list when every reminder is removed', () => {
    const values = taskFormSchema.parse({ ...toFormValues(task), reminders: [] });
    expect(toUpdateInput(values, task)).toEqual({ reminders: [] });
  });

  it('wants a future time for new custom reminders only', () => {
    const past = { ...newReminder([], false), date: '2020-01-01', time: '09:00' };
    expect(issuesOf({ ...base, reminders: [past] })).toEqual([
      'reminders.0.time: Pick a time in the future',
    ]);
    // The sent reminder from the past is kept as is.
    expect(issuesOf(toFormValues(task))).toEqual([]);
  });

  it('flags incomplete and duplicate reminders', () => {
    const custom = { ...newReminder([], false), date: '', time: '' };
    expect(issuesOf({ ...base, reminders: [custom] })).toEqual(['reminders.0.date: Pick a date']);
    const hour = { ...newReminder([], true), when: '60' };
    expect(issuesOf({ ...base, reminders: [hour, hour] })).toEqual([
      'reminders.1.when: This reminder is already set',
    ]);
  });
});

describe('reminder helpers', () => {
  it('picks the first unused choice, or a custom time without a due date', () => {
    expect(newReminder([{ when: '0', date: '', time: '' }], true).when).toBe('10');
    const now = new Date(2099, 0, 1, 14, 20);
    expect(newReminder([], false, now)).toMatchObject({
      when: CUSTOM_WHEN,
      date: '2099-01-01',
      time: '16:00',
    });
  });

  it('counts back from 9:00 AM for tasks without a time', () => {
    const at = relativeRemindAt(1440, '2099-10-05', '');
    expect([at?.getDate(), at?.getHours(), at?.getMinutes()]).toEqual([4, 9, 0]);
    expect(relativeRemindAt(30, '', '')).toBeNull();
  });

  it('keeps an off-preset offset as a choice', () => {
    const values = whenOptions(45).map((option) => option.value);
    expect(values).toContain('45');
    expect(values.at(-1)).toBe(CUSTOM_WHEN);
    expect(toReminderFormValue({ ...relative, offsetMinutes: 45 }).when).toBe('45');
  });

  it('describes saved reminders', () => {
    const now = new Date(2099, 5, 1);
    expect(describeReminder(relative, now)).toEqual({
      title: '1 hour before',
      time: 'Mon, Oct 5 · 1:00 PM',
    });
    expect(describeReminder({ ...relative, remindAt: null }, now)).toEqual({
      title: '1 hour before',
      time: null,
    });
  });

  it('points server errors at the form controls', () => {
    const error = new ApiError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid',
      details: [
        { field: 'reminders.1.remindAt', message: 'Pick a time in the future' },
        { field: 'reminders.0', message: 'This reminder is already set' },
        { field: 'title', message: 'Title is required' },
      ],
    });
    const mapped = remapReminderErrors(error) as ApiError;
    expect(mapped.details.map((detail) => detail.field)).toEqual([
      'reminders.1.time',
      'reminders.0.when',
      'title',
    ]);
  });
});
