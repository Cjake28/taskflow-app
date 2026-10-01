import { describe, expect, it } from 'vitest';
import {
  addDaysToKey,
  localDateKey,
  localDayBounds,
  localTimeKey,
  zonedTimeToUtc,
} from '../src/common/utils/zoned-time';

describe('zoned time helpers', () => {
  it('reads the local date and time of an instant', () => {
    const instant = new Date('2026-10-01T17:30:00Z');
    expect(localDateKey(instant, 'Asia/Manila')).toBe('2026-10-02');
    expect(localTimeKey(instant, 'Asia/Manila')).toBe('01:30');
    expect(localDateKey(instant, 'America/Los_Angeles')).toBe('2026-10-01');
  });

  it('turns a local wall-clock time into the right instant', () => {
    expect(zonedTimeToUtc('2026-10-02', '09:00', 'Asia/Manila').toISOString()).toBe(
      '2026-10-02T01:00:00.000Z',
    );
    expect(zonedTimeToUtc('2026-10-02', '09:00', 'UTC').toISOString()).toBe(
      '2026-10-02T09:00:00.000Z',
    );
  });

  it('handles both sides of a daylight-saving change', () => {
    // New York: EDT (UTC-4) until 2026-11-01 02:00, then EST (UTC-5).
    expect(zonedTimeToUtc('2026-10-31', '09:00', 'America/New_York').toISOString()).toBe(
      '2026-10-31T13:00:00.000Z',
    );
    expect(zonedTimeToUtc('2026-11-02', '09:00', 'America/New_York').toISOString()).toBe(
      '2026-11-02T14:00:00.000Z',
    );
    // 02:30 does not exist on 2026-03-08 (clocks jump to 03:00); it lands just after the jump.
    expect(zonedTimeToUtc('2026-03-08', '02:30', 'America/New_York').toISOString()).toBe(
      '2026-03-08T07:30:00.000Z',
    );
  });

  it('moves calendar days across month and year ends', () => {
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('gives the bounds of the local day', () => {
    const { start, end } = localDayBounds(new Date('2026-10-01T20:00:00Z'), 'Asia/Manila');
    expect(start.toISOString()).toBe('2026-10-01T16:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-02T16:00:00.000Z');
  });
});
