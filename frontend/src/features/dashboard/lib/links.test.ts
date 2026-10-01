import { describe, expect, it } from 'vitest';

import { dueSoonLabel, dueSoonUntil } from './due-soon';
import { OPEN_TASKS_HREF, statTileHref, taskHref, tasksHref } from './links';

describe('stat tile links', () => {
  it('opens the list filtered to what each tile counts', () => {
    expect(statTileHref('total')).toBe('/tasks');
    expect(statTileHref('TODO')).toBe('/tasks?status=TODO');
    expect(statTileHref('IN_PROGRESS')).toBe('/tasks?status=IN_PROGRESS');
    expect(statTileHref('COMPLETED')).toBe('/tasks?status=COMPLETED');
    expect(statTileHref('overdue')).toBe('/tasks?overdue=true');
  });

  it('builds readable CSV filters in a stable order', () => {
    expect(tasksHref({ priority: ['HIGH'], status: ['TODO', 'IN_PROGRESS'] })).toBe(
      '/tasks?status=TODO,IN_PROGRESS&priority=HIGH',
    );
    expect(tasksHref({ view: 'board' })).toBe('/tasks?view=board');
    expect(tasksHref({ status: [], overdue: false })).toBe('/tasks');
    expect(OPEN_TASKS_HREF).toBe('/tasks?status=TODO,IN_PROGRESS');
  });

  it('links to task details', () => {
    expect(taskHref('9b0c6f7e-1d2a-4c55-8f00-000000000001')).toBe(
      '/tasks/9b0c6f7e-1d2a-4c55-8f00-000000000001',
    );
  });
});

describe('due soon', () => {
  const now = new Date(2026, 9, 1, 10, 0);

  it('keeps the request window stable for the whole day', () => {
    const morning = dueSoonUntil(new Date(2026, 9, 1, 8, 0));
    const evening = dueSoonUntil(new Date(2026, 9, 1, 21, 0));
    expect(morning).toBe(evening);
    const until = new Date(morning);
    expect([until.getMonth(), until.getDate(), until.getHours()]).toEqual([9, 8, 23]);
  });

  it('describes overdue tasks by how late they are', () => {
    const yesterday = new Date(2026, 8, 30, 23, 59, 59, 999).toISOString();
    const lastWeek = new Date(2026, 8, 25, 23, 59, 59, 999).toISOString();
    const thisMorning = new Date(2026, 9, 1, 9, 0).toISOString();

    expect(dueSoonLabel({ dueDate: yesterday, hasDueTime: false, isOverdue: true }, now)).toEqual({
      overdue: true,
      text: 'Overdue · 1 day',
    });
    expect(dueSoonLabel({ dueDate: lastWeek, hasDueTime: false, isOverdue: true }, now).text).toBe(
      'Overdue · 6 days',
    );
    expect(
      dueSoonLabel({ dueDate: thisMorning, hasDueTime: true, isOverdue: true }, now).text,
    ).toBe('Overdue · 9:00 AM');
  });

  it('uses the shared due label for upcoming tasks', () => {
    const tomorrow = new Date(2026, 9, 2, 23, 59, 59, 999).toISOString();
    expect(dueSoonLabel({ dueDate: tomorrow, hasDueTime: false, isOverdue: false }, now)).toEqual({
      overdue: false,
      text: 'Tomorrow',
    });
  });
});
