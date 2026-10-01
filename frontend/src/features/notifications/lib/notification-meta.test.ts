import { describe, expect, it } from 'vitest';

import { formatBefore, formatDuration } from '@/lib/offsets';

import { bellLabel, formatUnreadBadge, notificationHref } from './notification-meta';
import { formatTimeZone, timeZoneOptions } from './time-zones';

describe('notificationHref', () => {
  it('opens the task for task notifications', () => {
    expect(notificationHref({ type: 'TASK_REMINDER', taskId: 't1', data: null })).toBe('/tasks/t1');
    expect(notificationHref({ type: 'DUE_SOON', taskId: null, data: null })).toBeNull();
  });

  it('sends the daily summary to overdue tasks only when there are some', () => {
    expect(
      notificationHref({ type: 'DAILY_DIGEST', taskId: null, data: { dueToday: 2, overdue: 3 } }),
    ).toBe('/tasks?overdue=true');
    expect(
      notificationHref({ type: 'DAILY_DIGEST', taskId: null, data: { dueToday: 2, overdue: 0 } }),
    ).toBe('/dashboard');
  });

  it('sends sign-in alerts to the security settings', () => {
    expect(notificationHref({ type: 'NEW_SIGN_IN', taskId: null, data: null })).toBe(
      '/profile?tab=security',
    );
  });
});

describe('badge and labels', () => {
  it('caps the badge and describes the bell', () => {
    expect(formatUnreadBadge(3)).toBe('3');
    expect(formatUnreadBadge(10)).toBe('9+');
    expect(bellLabel(0)).toBe('Notifications');
    expect(bellLabel(4)).toBe('Notifications, 4 unread');
  });

  it('formats offsets in the largest whole unit', () => {
    expect(formatBefore(0)).toBe('At due time');
    expect(formatBefore(10)).toBe('10 minutes before');
    expect(formatBefore(60)).toBe('1 hour before');
    expect(formatBefore(1440)).toBe('1 day before');
    expect(formatBefore(10080)).toBe('1 week before');
    expect(formatDuration(90)).toBe('90 minutes');
    expect(formatDuration(2880)).toBe('2 days');
  });

  it('lists time zones with UTC and shows offsets', () => {
    expect(timeZoneOptions()).toContain('UTC');
    expect(formatTimeZone('Asia/Manila', new Date('2026-01-15T00:00:00Z'))).toBe(
      'Asia/Manila (GMT+8)',
    );
  });
});
