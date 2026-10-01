import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TASK_SEARCH,
  clearFilters,
  hasActiveFilters,
  isBoardColumnQuery,
  parseTaskSearch,
  serializeTaskSearch,
  statusesOfQuery,
  toBoardColumnQuery,
  toListQuery,
  toSearchString,
  toggleFilterValue,
  updateTaskSearch,
} from './url-state';

const params = (query: string) => new URLSearchParams(query);

describe('parseTaskSearch', () => {
  it('returns the defaults for an empty URL', () => {
    expect(parseTaskSearch(params(''))).toEqual(DEFAULT_TASK_SEARCH);
  });

  it('reads every parameter', () => {
    expect(
      parseTaskSearch(
        params(
          'view=board&search=%20deploy%20&status=IN_PROGRESS,TODO&priority=HIGH&overdue=true&sortBy=dueDate&sortOrder=asc&page=3',
        ),
      ),
    ).toEqual({
      view: 'board',
      search: 'deploy',
      status: ['TODO', 'IN_PROGRESS'],
      priority: ['HIGH'],
      overdue: true,
      sortBy: 'dueDate',
      sortOrder: 'asc',
      page: 3,
    });
  });

  it('ignores unknown or malformed values instead of failing', () => {
    const state = parseTaskSearch(
      params(
        'view=grid&status=TODO,DONE,todo&priority=URGENT&overdue=yes&sortBy=position&sortOrder=up&page=-2',
      ),
    );
    expect(state.view).toBe('list');
    expect(state.status).toEqual(['TODO']);
    expect(state.priority).toEqual([]);
    expect(state.overdue).toBe(false);
    expect(state.sortBy).toBe('createdAt');
    expect(state.sortOrder).toBe('desc');
    expect(state.page).toBe(1);
  });
});

describe('serializeTaskSearch', () => {
  it('omits defaults and writes statuses in canonical order', () => {
    const next = serializeTaskSearch({
      ...DEFAULT_TASK_SEARCH,
      status: ['COMPLETED', 'TODO'],
      priority: ['HIGH', 'LOW'],
      overdue: true,
    });
    expect(toSearchString(next)).toBe('?status=TODO,COMPLETED&priority=LOW,HIGH&overdue=true');
    expect(toSearchString(serializeTaskSearch(DEFAULT_TASK_SEARCH))).toBe('');
  });

  it('keeps unrelated parameters such as new=1', () => {
    const next = serializeTaskSearch({ ...DEFAULT_TASK_SEARCH, view: 'board' }, params('new=1'));
    expect(next.get('new')).toBe('1');
    expect(next.get('view')).toBe('board');
  });

  it('round-trips through the parser', () => {
    const state = {
      ...DEFAULT_TASK_SEARCH,
      search: 'auth',
      status: ['IN_PROGRESS' as const],
      sortBy: 'title' as const,
      sortOrder: 'asc' as const,
      page: 2,
    };
    expect(parseTaskSearch(serializeTaskSearch(state))).toEqual(state);
  });
});

describe('updateTaskSearch', () => {
  it('goes back to page 1 when the results change', () => {
    const next = updateTaskSearch(params('page=4&sortBy=title&sortOrder=asc'), {
      priority: ['HIGH'],
    });
    expect(next.get('page')).toBeNull();
    expect(next.get('priority')).toBe('HIGH');
    expect(next.get('sortBy')).toBe('title');
  });

  it('keeps the page for page changes and unchanged values', () => {
    expect(updateTaskSearch(params('page=2'), { page: 3 }).get('page')).toBe('3');
    expect(updateTaskSearch(params('page=2&overdue=true'), { overdue: true }).get('page')).toBe(
      '2',
    );
  });

  it('drops the page when switching to the board', () => {
    const next = updateTaskSearch(params('page=3&status=TODO'), { view: 'board' });
    expect(toSearchString(next)).toBe('?view=board&status=TODO');
  });

  it('clears search and filters but keeps view and sort', () => {
    const next = clearFilters(
      params('view=board&search=x&status=TODO&priority=LOW&overdue=true&sortBy=title&page=2'),
    );
    expect(toSearchString(next)).toBe('?view=board&sortBy=title');
  });
});

describe('filters', () => {
  it('knows when filters are active', () => {
    expect(hasActiveFilters(DEFAULT_TASK_SEARCH)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_TASK_SEARCH, search: '  ' })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_TASK_SEARCH, overdue: true })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_TASK_SEARCH, sortBy: 'title' })).toBe(false);
  });

  it('toggles values and treats "all selected" as no filter', () => {
    const all = ['LOW', 'MEDIUM', 'HIGH'] as const;
    expect(toggleFilterValue([], 'HIGH', true, all)).toEqual(['HIGH']);
    expect(toggleFilterValue(['HIGH'], 'LOW', true, all)).toEqual(['LOW', 'HIGH']);
    expect(toggleFilterValue(['LOW', 'HIGH'], 'MEDIUM', true, all)).toEqual([]);
    expect(toggleFilterValue(['LOW', 'HIGH'], 'HIGH', false, all)).toEqual(['LOW']);
  });
});

describe('API queries', () => {
  it('builds the list query with paging', () => {
    expect(
      toListQuery({
        ...DEFAULT_TASK_SEARCH,
        search: ' api ',
        status: ['TODO', 'IN_PROGRESS'],
        overdue: true,
        page: 2,
      }),
    ).toEqual({
      search: 'api',
      status: 'TODO,IN_PROGRESS',
      overdue: 'true',
      sortBy: 'createdAt',
      sortOrder: 'desc',
      page: 2,
      pageSize: 10,
    });
  });

  it('builds one position-ordered query per board column, ignoring the status filter', () => {
    const query = toBoardColumnQuery(
      { ...DEFAULT_TASK_SEARCH, status: ['TODO'], priority: ['HIGH'], sortBy: 'title' },
      'COMPLETED',
    );
    expect(query).toEqual({
      priority: 'HIGH',
      status: 'COMPLETED',
      sortBy: 'position',
      sortOrder: 'asc',
      pageSize: 50,
    });
    expect(isBoardColumnQuery(query)).toBe(true);
    expect(isBoardColumnQuery(query, 'COMPLETED')).toBe(true);
    expect(isBoardColumnQuery(query, 'TODO')).toBe(false);
    expect(isBoardColumnQuery(toListQuery(DEFAULT_TASK_SEARCH))).toBe(false);
  });

  it('reads the status filter of a cached query', () => {
    expect(statusesOfQuery({ status: 'TODO,IN_PROGRESS' })).toEqual(['TODO', 'IN_PROGRESS']);
    expect(statusesOfQuery({ pageSize: 1 })).toBeNull();
    expect(statusesOfQuery(undefined)).toBeNull();
  });
});
