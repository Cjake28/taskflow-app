import { describe, expect, it } from 'vitest';

import {
  EMPTY_FILTERS,
  hasActiveFilters,
  parseActivityFilters,
  toActivityQuery,
  writeActivityFilters,
} from './filters';

describe('activity filters in the URL', () => {
  it('parses known values and ignores junk', () => {
    const filters = parseActivityFilters(
      new URLSearchParams(
        'range=custom&from=2026-09-01&to=2026-13-01&type=images,bogus,created&q= offsite ',
      ),
    );
    expect(filters).toEqual({
      range: 'custom',
      from: '2026-09-01',
      to: '',
      types: ['created', 'images'],
      search: 'offsite',
    });
    expect(parseActivityFilters(new URLSearchParams('range=forever'))).toEqual(EMPTY_FILTERS);
  });

  it('round-trips and drops defaults', () => {
    expect(writeActivityFilters(EMPTY_FILTERS).toString()).toBe('');
    const filters = { ...EMPTY_FILTERS, range: '7d' as const, types: ['status' as const] };
    expect(parseActivityFilters(writeActivityFilters(filters))).toEqual(filters);
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters(filters)).toBe(true);
  });
});

describe('toActivityQuery', () => {
  const now = new Date(2026, 9, 5, 15, 30);

  it('maps types to API actions and ranges to local-day instants', () => {
    const query = toActivityQuery(
      { ...EMPTY_FILTERS, range: '7d', types: ['images', 'deleted'], search: 'plan' },
      now,
    );
    expect(query.action).toBe('IMAGE_ADDED,IMAGE_REMOVED,DELETED');
    expect(query.search).toBe('plan');
    expect(new Date(query.from!)).toEqual(new Date(2026, 8, 29));
    expect(query.to).toBeUndefined();
  });

  it('uses the whole days of a custom range', () => {
    const query = toActivityQuery(
      { ...EMPTY_FILTERS, range: 'custom', from: '2026-09-01', to: '2026-09-30' },
      now,
    );
    expect(new Date(query.from!)).toEqual(new Date(2026, 8, 1));
    expect(new Date(query.to!)).toEqual(new Date(2026, 8, 30, 23, 59, 59, 999));
  });

  it('sends nothing for "all time" without filters', () => {
    expect(toActivityQuery(EMPTY_FILTERS, now)).toEqual({});
  });
});
