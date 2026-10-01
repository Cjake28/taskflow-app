import { describe, expect, it } from 'vitest';

import { formatMonthParam, gridRange, monthGrid, parseDayParam, parseMonthParam } from './month';

describe('monthGrid', () => {
  it('covers whole Monday–Sunday weeks around the month', () => {
    const days = monthGrid(new Date(2026, 9, 15)); // October 2026 starts on a Thursday
    expect(days[0]).toEqual(new Date(2026, 8, 28)); // Mon, Sep 28
    expect(days.at(-1)).toEqual(new Date(2026, 10, 1)); // Sun, Nov 1
    expect(days).toHaveLength(35);
    expect(days.every((day) => day.getHours() === 0)).toBe(true);
  });

  it('uses six rows when the month needs them', () => {
    expect(monthGrid(new Date(2026, 7, 1))).toHaveLength(42); // August 2026
  });

  it('turns the grid into an inclusive due-date range', () => {
    const { dueFrom, dueTo } = gridRange(new Date(2026, 9, 1));
    expect(new Date(dueFrom)).toEqual(new Date(2026, 8, 28));
    expect(new Date(dueTo)).toEqual(new Date(2026, 10, 1, 23, 59, 59, 999));
  });
});

describe('URL params', () => {
  it('round-trips the month and validates input', () => {
    expect(formatMonthParam(new Date(2026, 9, 20))).toBe('2026-10');
    expect(parseMonthParam('2026-10')).toEqual(new Date(2026, 9, 1));
    expect(parseMonthParam('2026-13')).toBeNull();
    expect(parseMonthParam('nope')).toBeNull();
    expect(parseDayParam('2026-10-05')).toEqual(new Date(2026, 9, 5));
    expect(parseDayParam('2026-02-31')).toBeNull();
  });
});
