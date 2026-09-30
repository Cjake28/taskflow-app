import { describe, expect, it } from 'vitest';
import {
  createTaskSchema,
  listTasksQuerySchema,
  moveTaskSchema,
  updateTaskSchema,
} from '../src/schemas/task';

describe('createTaskSchema', () => {
  it('trims the title and turns an empty description into null', () => {
    expect(createTaskSchema.parse({ title: '  Write README ', description: '   ' })).toEqual({
      title: 'Write README',
      description: null,
    });
  });

  it('requires a title and rejects unknown fields', () => {
    expect(createTaskSchema.safeParse({ title: '  ' }).success).toBe(false);
    expect(createTaskSchema.safeParse({ title: 'x', userId: 'someone' }).success).toBe(false);
  });

  it('accepts ISO due dates with an offset and rejects other formats', () => {
    expect(
      createTaskSchema.safeParse({ title: 'x', dueDate: '2026-10-03T15:59:59.999Z' }).success,
    ).toBe(true);
    expect(createTaskSchema.safeParse({ title: 'x', dueDate: '10/03/2026' }).success).toBe(false);
  });
});

describe('updateTaskSchema', () => {
  it('requires at least one field', () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
    expect(updateTaskSchema.safeParse({ dueDate: null }).success).toBe(true);
  });
});

describe('moveTaskSchema', () => {
  it('accepts nullable neighbours', () => {
    expect(moveTaskSchema.safeParse({ status: 'COMPLETED', prevId: null }).success).toBe(true);
  });
});

describe('listTasksQuerySchema', () => {
  it('parses comma-separated filters and applies defaults', () => {
    expect(
      listTasksQuerySchema.parse({ status: 'TODO,IN_PROGRESS', overdue: 'true', page: '2' }),
    ).toEqual({
      status: ['TODO', 'IN_PROGRESS'],
      overdue: true,
      page: 2,
      pageSize: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('rejects unknown statuses and oversized pages', () => {
    expect(listTasksQuerySchema.safeParse({ status: 'DONE' }).success).toBe(false);
    expect(listTasksQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });
});
