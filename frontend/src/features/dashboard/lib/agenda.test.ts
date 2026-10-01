import type { TaskDto } from '@taskflow/shared';
import { describe, expect, it } from 'vitest';

import {
  dayKey,
  groupByLocalDay,
  shiftDay,
  summarizeWeek,
  timeLabel,
  timelineFor,
  weekDays,
} from './agenda';

// Local-time constructors keep these tests independent of the machine's time zone.
const local = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);
const allDay = (day: number) => new Date(2026, 9, day, 23, 59, 59, 999).toISOString();

let nextId = 0;
function task(overrides: Partial<TaskDto>): TaskDto {
  nextId += 1;
  return {
    id: `task-${nextId}`,
    title: `Task ${nextId}`,
    description: null,
    status: 'TODO',
    priority: 'MEDIUM',
    dueDate: null,
    hasDueTime: false,
    completedAt: null,
    position: 0,
    isOverdue: false,
    imageCount: 0,
    coverThumbUrl: null,
    reminderCount: 0,
    createdAt: local(1, 8).toISOString(),
    updatedAt: local(1, 8).toISOString(),
    ...overrides,
  };
}

describe('weekDays', () => {
  it('returns Monday to Sunday of the week containing the anchor', () => {
    // Thursday, October 1, 2026
    const days = weekDays(local(1, 15)).map(dayKey);
    expect(days).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
  });

  it('treats Sunday as the last day of its week', () => {
    expect(dayKey(weekDays(local(4, 12))[0] as Date)).toBe('2026-09-28');
    expect(dayKey(weekDays(local(5, 0))[0] as Date)).toBe('2026-10-05');
  });
});

describe('groupByLocalDay', () => {
  it('groups by the local calendar day and sorts timed tasks before all-day ones', () => {
    const readme = task({ title: 'README', dueDate: allDay(1) });
    const late = task({
      title: 'Late call',
      dueDate: local(1, 23, 30).toISOString(),
      hasDueTime: true,
    });
    const early = task({
      title: 'Standup',
      dueDate: local(1, 0, 15).toISOString(),
      hasDueTime: true,
    });
    const friday = task({ title: 'Deploy', dueDate: allDay(2) });
    const undated = task({ title: 'Someday' });

    const groups = groupByLocalDay([readme, late, friday, early, undated]);

    expect([...groups.keys()].sort()).toEqual(['2026-10-01', '2026-10-02']);
    expect(groups.get('2026-10-01')?.map((t) => t.title)).toEqual([
      'Standup',
      'Late call',
      'README',
    ]);
    expect(groups.get('2026-10-02')?.map((t) => t.title)).toEqual(['Deploy']);
  });
});

describe('summarizeWeek', () => {
  it('counts tasks per day, flags overdue days and marks today', () => {
    const tuesday = new Date(2026, 8, 29, 23, 59, 59, 999).toISOString(); // September 29
    const groups = groupByLocalDay([
      task({ dueDate: tuesday, isOverdue: true }),
      task({ dueDate: allDay(1) }),
      task({ dueDate: allDay(1), status: 'COMPLETED' }),
      task({ dueDate: allDay(3), status: 'COMPLETED' }),
      task({ dueDate: allDay(12) }), // next week: ignored
    ]);

    const days = summarizeWeek(local(1, 9), groups, local(1, 9));
    const byKey = Object.fromEntries(days.map((day) => [day.key, day]));

    expect(days).toHaveLength(7);
    expect(byKey['2026-09-29']).toMatchObject({ count: 1, hasOverdue: true, isToday: false });
    expect(byKey['2026-10-01']).toMatchObject({ count: 2, openCount: 1, isToday: true });
    expect(byKey['2026-10-03']).toMatchObject({ count: 1, openCount: 0, hasOverdue: false });
    expect(byKey['2026-10-04']).toMatchObject({ count: 0 });
  });
});

describe('timelineFor', () => {
  it('marks done, overdue and the first open task still ahead as "next"', () => {
    const now = local(1, 12);
    const done = task({
      status: 'COMPLETED',
      dueDate: local(1, 9).toISOString(),
      hasDueTime: true,
    });
    const missed = task({ dueDate: local(1, 11).toISOString(), hasDueTime: true, isOverdue: true });
    const next = task({ dueDate: local(1, 14).toISOString(), hasDueTime: true });
    const later = task({ dueDate: allDay(1) });

    const entries = timelineFor([later, next, missed, done], now);

    expect(entries.map((entry) => [entry.task.id, entry.state])).toEqual([
      [done.id, 'done'],
      [missed.id, 'overdue'],
      [next.id, 'next'],
      [later.id, 'upcoming'],
    ]);
  });

  it('has no "next" item on other days', () => {
    const entries = timelineFor([task({ dueDate: allDay(2) })], local(1, 12));
    expect(entries[0]?.state).toBe('upcoming');
  });
});

describe('small helpers', () => {
  it('shifts days across week and month boundaries at local midnight', () => {
    expect(dayKey(shiftDay(local(30, 18), 1))).toBe('2026-10-31');
    expect(dayKey(shiftDay(local(1, 18), -7))).toBe('2026-09-24');
    expect(shiftDay(local(1, 18), 1).getHours()).toBe(0);
  });

  it('labels all-day tasks as "End of day"', () => {
    expect(timeLabel({ dueDate: allDay(1), hasDueTime: false })).toBe('End of day');
    expect(timeLabel({ dueDate: local(1, 14, 5).toISOString(), hasDueTime: true })).toBe('2:05 PM');
  });
});
