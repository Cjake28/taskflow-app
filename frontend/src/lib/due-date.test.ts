import { describe, expect, it } from 'vitest';

import { describeActivity } from './activity';
import { daysOverdue, formatDueLabel, fromDueDate, toDueDateIso } from './due-date';

describe('due dates', () => {
  it('stores all-day tasks at the end of the local day', () => {
    const iso = toDueDateIso('2026-10-05');
    const local = new Date(iso);
    expect([local.getFullYear(), local.getMonth(), local.getDate()]).toEqual([2026, 9, 5]);
    expect([local.getHours(), local.getMinutes(), local.getSeconds()]).toEqual([23, 59, 59]);
    expect(fromDueDate(iso, false)).toEqual({ date: '2026-10-05', time: null });
  });

  it('stores timed tasks at the chosen local time', () => {
    const iso = toDueDateIso('2026-10-05', '14:30');
    expect(fromDueDate(iso, true)).toEqual({ date: '2026-10-05', time: '14:30' });
  });

  it('formats relative labels', () => {
    const now = new Date(2026, 9, 5, 10, 0);
    const at = (day: number, hour = 23) => new Date(2026, 9, day, hour, 0).toISOString();
    expect(formatDueLabel({ dueDate: at(5), hasDueTime: false }, now)).toBe('Today');
    expect(formatDueLabel({ dueDate: at(6), hasDueTime: false }, now)).toBe('Tomorrow');
    expect(formatDueLabel({ dueDate: at(4), hasDueTime: false }, now)).toBe('Yesterday');
    expect(formatDueLabel({ dueDate: at(5, 15), hasDueTime: true }, now)).toBe('Today · 3:00 PM');
    expect(formatDueLabel({ dueDate: at(9), hasDueTime: false }, now)).toBe('Fri, Oct 9');
    expect(formatDueLabel({ dueDate: null, hasDueTime: false }, now)).toBeNull();
    expect(daysOverdue({ dueDate: at(2), hasDueTime: false }, now)).toBe(3);
  });
});

describe('describeActivity', () => {
  const base = { id: '1', taskId: 't', taskTitle: 'Ship it', createdAt: new Date().toISOString() };

  it('describes status changes and edits', () => {
    expect(
      describeActivity({
        ...base,
        action: 'STATUS_CHANGED',
        changes: { status: { from: 'TODO', to: 'IN_PROGRESS' } },
      }),
    ).toMatchObject({
      summary: 'Moved to In Progress',
      changes: [{ label: 'Status', from: 'To Do', to: 'In Progress' }],
    });

    const edit = describeActivity({
      ...base,
      action: 'UPDATED',
      changes: { title: { from: 'A', to: 'B' }, priority: { from: 'LOW', to: 'HIGH' } },
    });
    expect(edit.summary).toBe('Edited title and priority');
    expect(edit.changes).toContainEqual({ label: 'Priority', from: 'Low', to: 'High' });
  });

  it('describes images and tolerates missing payloads', () => {
    expect(
      describeActivity({ ...base, action: 'IMAGE_ADDED', changes: { images: { count: 3 } } })
        .summary,
    ).toBe('Added 3 images');
    expect(
      describeActivity({
        ...base,
        action: 'IMAGE_ADDED',
        changes: { images: { count: 1, restored: true } },
      }).summary,
    ).toBe('Restored an image');
    expect(describeActivity({ ...base, action: 'IMAGE_REMOVED', changes: null }).summary).toBe(
      'Removed an image',
    );
    expect(describeActivity({ ...base, action: 'UPDATED', changes: null }).summary).toBe(
      'Edited the task',
    );
  });
});
