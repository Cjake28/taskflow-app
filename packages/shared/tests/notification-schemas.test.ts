import { describe, expect, it } from 'vitest';
import {
  listNotificationsQuerySchema,
  markNotificationsReadSchema,
  remindersSchema,
  timeZoneSchema,
  updateNotificationPreferencesSchema,
} from '../src/schemas/notification';
import { createTaskSchema, updateTaskSchema } from '../src/schemas/task';

const messagesOf = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? [] : (result.error?.issues.map((issue) => issue.message) ?? []);

describe('remindersSchema', () => {
  it('accepts relative and absolute reminders and blanks empty messages', () => {
    const parsed = remindersSchema.parse([
      { kind: 'relative', offsetMinutes: 60, message: '  Bring the charger  ' },
      { kind: 'absolute', remindAt: '2026-10-03T09:00:00+08:00', message: '   ' },
    ]);
    expect(parsed[0]).toMatchObject({ kind: 'relative', message: 'Bring the charger' });
    expect(parsed[1]).toMatchObject({ kind: 'absolute', message: null });
  });

  it('allows at most five reminders', () => {
    const six = [0, 10, 30, 60, 120, 1440].map((offsetMinutes) => ({
      kind: 'relative' as const,
      offsetMinutes,
    }));
    expect(messagesOf(remindersSchema.safeParse(six))).toContain(
      'A task can have at most 5 reminders',
    );
  });

  it('rejects the same reminder twice, including the same instant in another offset', () => {
    const result = remindersSchema.safeParse([
      { kind: 'absolute', remindAt: '2026-10-03T01:00:00Z' },
      { kind: 'absolute', remindAt: '2026-10-03T09:00:00+08:00' },
    ]);
    expect(messagesOf(result)).toEqual(['This reminder is already set']);
  });

  it('bounds relative offsets and message length', () => {
    expect(
      remindersSchema.safeParse([{ kind: 'relative', offsetMinutes: 30 * 24 * 60 + 1 }]).success,
    ).toBe(false);
    expect(remindersSchema.safeParse([{ kind: 'relative', offsetMinutes: -5 }]).success).toBe(
      false,
    );
    expect(
      remindersSchema.safeParse([{ kind: 'relative', offsetMinutes: 0, message: 'x'.repeat(501) }])
        .success,
    ).toBe(false);
  });

  it('rejects unknown kinds and fields', () => {
    expect(remindersSchema.safeParse([{ kind: 'weekly', offsetMinutes: 0 }]).success).toBe(false);
    expect(
      remindersSchema.safeParse([{ kind: 'relative', offsetMinutes: 0, remindAt: 'x' }]).success,
    ).toBe(false);
  });

  it('is accepted on task create and update', () => {
    expect(
      createTaskSchema.parse({
        title: 'Pay rent',
        reminders: [{ kind: 'relative', offsetMinutes: 0 }],
      }).reminders,
    ).toHaveLength(1);
    expect(updateTaskSchema.parse({ reminders: [] }).reminders).toEqual([]);
  });
});

describe('notification preferences', () => {
  it('validates IANA time zones', () => {
    expect(timeZoneSchema.safeParse('Asia/Manila').success).toBe(true);
    expect(timeZoneSchema.safeParse('Mars/Olympus').success).toBe(false);
  });

  it('accepts partial updates and rejects empty ones', () => {
    expect(
      updateNotificationPreferencesSchema.parse({ dailyDigest: { time: '07:30', email: false } }),
    ).toEqual({ dailyDigest: { time: '07:30', email: false } });
    expect(updateNotificationPreferencesSchema.safeParse({}).success).toBe(false);
  });

  it('only allows the offered lead times and valid clock times', () => {
    expect(
      updateNotificationPreferencesSchema.safeParse({ dueSoon: { leadMinutes: 45 } }).success,
    ).toBe(false);
    expect(
      updateNotificationPreferencesSchema.safeParse({ dailyDigest: { time: '24:00' } }).success,
    ).toBe(false);
  });
});

describe('notification list and read schemas', () => {
  it('defaults the page size and parses the unread flag', () => {
    expect(listNotificationsQuerySchema.parse({ unread: 'true' })).toEqual({
      limit: 20,
      unread: true,
    });
  });

  it('treats a missing id list as "mark all"', () => {
    expect(markNotificationsReadSchema.parse({})).toEqual({});
    expect(markNotificationsReadSchema.safeParse({ ids: [] }).success).toBe(false);
  });
});
