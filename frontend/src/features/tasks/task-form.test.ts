import { createTaskSchema, updateTaskSchema, type TaskDto } from '@taskflow/shared';
import { describe, expect, it } from 'vitest';

import { toDueDateIso } from '@/lib/due-date';

import { taskFormSchema, toCreateInput, toFormValues, toUpdateInput } from './task-form';

const base = {
  title: 'Write the README',
  description: '',
  status: 'TODO' as const,
  priority: 'MEDIUM' as const,
  dueDate: '',
  dueTime: '',
};

const task: Pick<
  TaskDto,
  'title' | 'description' | 'status' | 'priority' | 'dueDate' | 'hasDueTime'
> = {
  title: 'Write the README',
  description: 'Setup and env vars',
  status: 'TODO',
  priority: 'MEDIUM',
  dueDate: toDueDateIso('2026-10-05'),
  hasDueTime: false,
};

describe('taskFormSchema', () => {
  it('requires a title and trims it', () => {
    expect(taskFormSchema.safeParse({ ...base, title: '   ' }).success).toBe(false);
    expect(taskFormSchema.parse({ ...base, title: '  Ship it ' }).title).toBe('Ship it');
  });

  it('limits the description after trimming', () => {
    expect(taskFormSchema.safeParse({ ...base, description: 'x'.repeat(2001) }).success).toBe(
      false,
    );
    expect(
      taskFormSchema.safeParse({ ...base, description: ` ${'x'.repeat(2000)} ` }).success,
    ).toBe(true);
  });

  it('needs a date when a time is set', () => {
    const result = taskFormSchema.safeParse({ ...base, dueTime: '09:30' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['dueDate']);
    expect(taskFormSchema.safeParse({ ...base, dueDate: '2026-02-31' }).success).toBe(false);
  });
});

describe('toCreateInput', () => {
  it('sends only what was filled in', () => {
    const input = toCreateInput(taskFormSchema.parse(base));
    expect(input).toEqual({ title: 'Write the README', status: 'TODO', priority: 'MEDIUM' });
    expect(createTaskSchema.safeParse(input).success).toBe(true);
  });

  it('stores a date without a time as the end of that local day', () => {
    const input = toCreateInput(
      taskFormSchema.parse({ ...base, description: '  Notes  ', dueDate: '2026-10-05' }),
    );
    expect(input.description).toBe('Notes');
    expect(input.hasDueTime).toBe(false);
    const due = new Date(input.dueDate ?? '');
    expect([due.getDate(), due.getHours(), due.getMinutes()]).toEqual([5, 23, 59]);
    expect(createTaskSchema.safeParse(input).success).toBe(true);
  });

  it('stores a date with a time at that local time', () => {
    const input = toCreateInput(
      taskFormSchema.parse({ ...base, dueDate: '2026-10-05', dueTime: '14:30' }),
    );
    expect(input.hasDueTime).toBe(true);
    const due = new Date(input.dueDate ?? '');
    expect([due.getHours(), due.getMinutes()]).toEqual([14, 30]);
  });
});

describe('toUpdateInput', () => {
  it('round-trips an unchanged task to no changes', () => {
    const values = taskFormSchema.parse(toFormValues(task));
    expect(values.dueDate).toBe('2026-10-05');
    expect(values.dueTime).toBe('');
    expect(toUpdateInput(values, task)).toBeNull();
  });

  it('sends only changed fields', () => {
    const values = taskFormSchema.parse({
      ...toFormValues(task),
      title: 'Write the docs',
      priority: 'HIGH',
    });
    const input = toUpdateInput(values, task);
    expect(input).toEqual({ title: 'Write the docs', priority: 'HIGH' });
    expect(updateTaskSchema.safeParse(input).success).toBe(true);
  });

  it('clears the description and the due date with null', () => {
    const values = taskFormSchema.parse({ ...toFormValues(task), description: ' ', dueDate: '' });
    expect(toUpdateInput(values, task)).toEqual({ description: null, dueDate: null });
  });

  it('sends the due date again when only the time mode changes', () => {
    const values = taskFormSchema.parse({ ...toFormValues(task), dueTime: '09:00' });
    const input = toUpdateInput(values, task);
    expect(input?.hasDueTime).toBe(true);
    expect(new Date(input?.dueDate ?? '').getHours()).toBe(9);
  });

  it('pre-fills a timed task and the default status for new tasks', () => {
    const timed = { ...task, dueDate: toDueDateIso('2026-10-05', '08:15'), hasDueTime: true };
    expect(toFormValues(timed)).toMatchObject({ dueDate: '2026-10-05', dueTime: '08:15' });
    expect(toFormValues(null, { status: 'IN_PROGRESS' })).toMatchObject({
      title: '',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
    });
  });
});
