import type { ActivityDto } from '@taskflow/shared';
import { describe, expect, it } from 'vitest';

import {
  dueSentence,
  dueTone,
  formatClock,
  formatRelativeShort,
  formatTimelineTime,
  overdueLabel,
  pageWindow,
  timeOptions,
} from './format';
import { coalesceActivities } from './timeline';

const now = new Date(2026, 9, 5, 10, 0);
const at = (day: number, hour = 23, minute = 59) =>
  new Date(2026, 9, day, hour, minute).toISOString();

describe('due dates', () => {
  it('picks a tone', () => {
    const open = { status: 'TODO' as const, hasDueTime: false };
    expect(dueTone({ ...open, dueDate: null, isOverdue: false }, now)).toBe('none');
    expect(dueTone({ ...open, dueDate: at(3), isOverdue: true }, now)).toBe('overdue');
    expect(dueTone({ ...open, dueDate: at(5), isOverdue: false }, now)).toBe('today');
    expect(dueTone({ ...open, dueDate: at(9), isOverdue: false }, now)).toBe('normal');
    expect(
      dueTone({ status: 'COMPLETED', hasDueTime: false, dueDate: at(3), isOverdue: false }, now),
    ).toBe('done');
  });

  it('describes how late a task is', () => {
    expect(overdueLabel({ dueDate: at(4), hasDueTime: false }, now)).toBe('Overdue · 1 day');
    expect(overdueLabel({ dueDate: at(1), hasDueTime: false }, now)).toBe('Overdue · 4 days');
    expect(overdueLabel({ dueDate: at(5, 9, 0), hasDueTime: true }, now)).toBe(
      'Overdue · since 9:00 AM',
    );
  });

  it('writes the header sentence', () => {
    const task = { status: 'TODO' as const, isOverdue: false };
    expect(dueSentence({ ...task, dueDate: at(5, 11, 30), hasDueTime: true }, now)).toBe(
      'Due today · 11:30 AM',
    );
    expect(dueSentence({ ...task, dueDate: at(9), hasDueTime: false }, now)).toBe('Due Fri, Oct 9');
  });
});

describe('relative times', () => {
  it('formats compact table times', () => {
    expect(formatRelativeShort(new Date(2026, 9, 5, 9, 59, 40).toISOString(), now)).toBe(
      'Just now',
    );
    expect(formatRelativeShort(new Date(2026, 9, 5, 9, 15).toISOString(), now)).toBe('45m ago');
    expect(formatRelativeShort(new Date(2026, 9, 5, 7, 0).toISOString(), now)).toBe('3h ago');
    expect(formatRelativeShort(new Date(2026, 9, 4, 22, 0).toISOString(), now)).toBe('Yesterday');
    expect(formatRelativeShort(new Date(2026, 9, 1, 12, 0).toISOString(), now)).toBe('4d ago');
    expect(formatRelativeShort(new Date(2026, 8, 20, 12, 0).toISOString(), now)).toBe('Sep 20');
    expect(formatRelativeShort(new Date(2025, 8, 20, 12, 0).toISOString(), now)).toBe(
      'Sep 20, 2025',
    );
  });

  it('formats timeline stamps', () => {
    expect(formatTimelineTime(new Date(2026, 9, 5, 8, 42).toISOString(), now)).toBe(
      'Today, 8:42 AM',
    );
    expect(formatTimelineTime(new Date(2026, 9, 4, 17, 10).toISOString(), now)).toBe(
      'Yesterday, 5:10 PM',
    );
    expect(formatTimelineTime(new Date(2026, 8, 29, 16, 12).toISOString(), now)).toBe(
      'Sep 29, 4:12 PM',
    );
  });
});

describe('time options', () => {
  it('lists half hours and keeps an existing off-grid time', () => {
    const slots = timeOptions();
    expect(slots).toHaveLength(48);
    expect(slots[0]).toBe('00:00');
    expect(slots.at(-1)).toBe('23:30');
    expect(timeOptions('09:45')).toContain('09:45');
    expect(formatClock('00:30')).toBe('12:30 AM');
    expect(formatClock('15:05')).toBe('3:05 PM');
  });
});

describe('pageWindow', () => {
  it('shows every page when there are few', () => {
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it('collapses long ranges around the current page', () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 'gap', 20]);
    expect(pageWindow(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
    expect(pageWindow(20, 20)).toEqual([1, 'gap', 17, 18, 19, 20]);
  });
});

describe('coalesceActivities', () => {
  const activity = (id: string, action: ActivityDto['action'], minute: number): ActivityDto => ({
    id,
    action,
    taskId: 't',
    taskTitle: 'Task',
    changes: action === 'IMAGE_ADDED' ? { images: { count: 1 } } : null,
    createdAt: new Date(2026, 9, 5, 9, minute).toISOString(),
  });

  it('merges a burst of single-image uploads into one entry', () => {
    const merged = coalesceActivities([
      activity('3', 'IMAGE_ADDED', 30),
      activity('2', 'IMAGE_ADDED', 29),
      activity('1', 'IMAGE_ADDED', 29),
      activity('0', 'CREATED', 0),
    ]);
    expect(merged.map((entry) => entry.id)).toEqual(['3', '0']);
    expect(merged[0]?.changes).toEqual({ images: { count: 3 } });
  });

  it('keeps uploads apart when something else happened in between or much later', () => {
    const merged = coalesceActivities([
      activity('3', 'IMAGE_ADDED', 50),
      activity('2', 'IMAGE_ADDED', 30),
      activity('1', 'UPDATED', 29),
      activity('0', 'IMAGE_ADDED', 28),
    ]);
    expect(merged).toHaveLength(4);
  });
});
