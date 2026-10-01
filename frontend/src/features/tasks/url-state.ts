import {
  TASK_LIMITS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '@taskflow/shared';

/*
 * The tasks screen keeps every filter in the URL (spec §14.4), so a reload, the back button or a
 * shared link restores the same view. Parameter names are shared with the dashboard links:
 *   view=list|board · search · status=TODO,IN_PROGRESS · priority=HIGH · overdue=true ·
 *   sortBy · sortOrder · page · new=1 (opens the create dialog once)
 * Defaults are omitted from the URL.
 */

export type TaskView = 'list' | 'board';
export type ListSortField = 'createdAt' | 'updatedAt' | 'dueDate' | 'priority' | 'title';
export type SortOrder = 'asc' | 'desc';

export const LIST_SORT_FIELDS: readonly ListSortField[] = [
  'createdAt',
  'updatedAt',
  'dueDate',
  'priority',
  'title',
];

export const SORT_LABELS: Record<ListSortField, string> = {
  createdAt: 'Date created',
  updatedAt: 'Last updated',
  dueDate: 'Due date',
  priority: 'Priority',
  title: 'Title',
};

export const ORDER_LABELS: Record<ListSortField, Record<SortOrder, string>> = {
  createdAt: { desc: 'Newest first', asc: 'Oldest first' },
  updatedAt: { desc: 'Recently updated first', asc: 'Least recently updated first' },
  dueDate: { asc: 'Soonest first', desc: 'Latest first' },
  priority: { desc: 'Highest first', asc: 'Lowest first' },
  title: { asc: 'A to Z', desc: 'Z to A' },
};

/** The natural direction when a sort field is picked. */
export const DEFAULT_ORDER: Record<ListSortField, SortOrder> = {
  createdAt: 'desc',
  updatedAt: 'desc',
  dueDate: 'asc',
  priority: 'desc',
  title: 'asc',
};

export interface TaskSearchState {
  view: TaskView;
  search: string;
  status: TaskStatus[];
  priority: TaskPriority[];
  overdue: boolean;
  sortBy: ListSortField;
  sortOrder: SortOrder;
  page: number;
}

/** A change to apply, or a function of the newest state (for toggles). */
export type TaskSearchPatch =
  Partial<TaskSearchState> | ((current: TaskSearchState) => Partial<TaskSearchState>);

/** Adds or removes one value; picking every option means "no filter". */
export function toggleFilterValue<T extends string>(
  current: readonly T[],
  value: T,
  checked: boolean,
  all: readonly T[],
): T[] {
  const next = checked ? [...current, value] : current.filter((item) => item !== value);
  const ordered = all.filter((item) => next.includes(item));
  return ordered.length === all.length ? [] : ordered;
}

export const DEFAULT_TASK_SEARCH: TaskSearchState = {
  view: 'list',
  search: '',
  status: [],
  priority: [],
  overdue: false,
  sortBy: 'createdAt',
  sortOrder: 'desc',
  page: 1,
};

export const LIST_PAGE_SIZE = TASK_LIMITS.pageSizeDefault;
export const BOARD_PAGE_SIZE = 50;

/** Keeps known values in canonical order, dropping duplicates and anything unknown. */
function parseCsv<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const picked = new Set(raw.split(',').map((part) => part.trim().toUpperCase()));
  return allowed.filter((value) => picked.has(value));
}

export function parseTaskSearch(params: URLSearchParams): TaskSearchState {
  const sortBy = params.get('sortBy');
  const sortOrder = params.get('sortOrder');
  const page = Number(params.get('page'));
  return {
    view: params.get('view') === 'board' ? 'board' : 'list',
    search: (params.get('search') ?? '').trim().slice(0, TASK_LIMITS.title),
    status: parseCsv(params.get('status'), TASK_STATUSES),
    priority: parseCsv(params.get('priority'), TASK_PRIORITIES),
    overdue: params.get('overdue') === 'true',
    sortBy: LIST_SORT_FIELDS.includes(sortBy as ListSortField)
      ? (sortBy as ListSortField)
      : DEFAULT_TASK_SEARCH.sortBy,
    sortOrder:
      sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : DEFAULT_TASK_SEARCH.sortOrder,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

const MANAGED_KEYS = [
  'view',
  'search',
  'status',
  'priority',
  'overdue',
  'sortBy',
  'sortOrder',
  'page',
] as const;

/** Writes `state` into a copy of `current`, leaving unrelated parameters (e.g. `new`) alone. */
export function serializeTaskSearch(
  state: TaskSearchState,
  current: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const key of MANAGED_KEYS) next.delete(key);

  if (state.view !== DEFAULT_TASK_SEARCH.view) next.set('view', state.view);
  const search = state.search.trim();
  if (search) next.set('search', search);
  if (state.status.length > 0) {
    next.set('status', TASK_STATUSES.filter((s) => state.status.includes(s)).join(','));
  }
  if (state.priority.length > 0) {
    next.set('priority', TASK_PRIORITIES.filter((p) => state.priority.includes(p)).join(','));
  }
  if (state.overdue) next.set('overdue', 'true');
  if (state.sortBy !== DEFAULT_TASK_SEARCH.sortBy) next.set('sortBy', state.sortBy);
  if (state.sortOrder !== DEFAULT_TASK_SEARCH.sortOrder) next.set('sortOrder', state.sortOrder);
  if (state.page > 1) next.set('page', String(state.page));
  return next;
}

/**
 * Applies a change. Anything that changes the result set (search, filters, sort) sends the user
 * back to page 1; switching to the board drops the page too.
 */
export function updateTaskSearch(
  current: URLSearchParams,
  patch: Partial<TaskSearchState>,
): URLSearchParams {
  const state = parseTaskSearch(current);
  const next: TaskSearchState = { ...state, ...patch };
  const resultsChanged = (
    ['search', 'status', 'priority', 'overdue', 'sortBy', 'sortOrder'] as const
  ).some((key) => key in patch && JSON.stringify(patch[key]) !== JSON.stringify(state[key]));
  if ((resultsChanged && !('page' in patch)) || next.view === 'board') next.page = 1;
  return serializeTaskSearch(next, current);
}

export function hasActiveFilters(state: TaskSearchState): boolean {
  return (
    state.search.trim().length > 0 ||
    state.status.length > 0 ||
    state.priority.length > 0 ||
    state.overdue
  );
}

/** `?status=TODO,IN_PROGRESS` rather than `%2C`: readable, shareable URLs ("" when empty). */
export function toSearchString(params: URLSearchParams): string {
  const query = params.toString().replace(/%2C/gi, ',');
  return query ? `?${query}` : '';
}

/** Removes search and filters but keeps the view and sort. */
export function clearFilters(current: URLSearchParams): URLSearchParams {
  return updateTaskSearch(current, { search: '', status: [], priority: [], overdue: false });
}

/** Query-string values for `GET /tasks`; also the TanStack Query key (spec §14.4). */
export type TaskListQuery = Record<string, string | number>;

/** Filters the list and the board have in common. */
function sharedFilters(state: TaskSearchState): TaskListQuery {
  const query: TaskListQuery = {};
  const search = state.search.trim();
  if (search) query.search = search;
  if (state.priority.length > 0) query.priority = state.priority.join(',');
  if (state.overdue) query.overdue = 'true';
  return query;
}

export function toListQuery(state: TaskSearchState): TaskListQuery {
  const query = sharedFilters(state);
  if (state.status.length > 0) query.status = state.status.join(',');
  return {
    ...query,
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
    page: state.page,
    pageSize: LIST_PAGE_SIZE,
  };
}

/** One request per Kanban column (spec §6.5.1); the status filter does not apply to the board. */
export function toBoardColumnQuery(state: TaskSearchState, status: TaskStatus): TaskListQuery {
  return {
    ...sharedFilters(state),
    status,
    sortBy: 'position',
    sortOrder: 'asc',
    pageSize: BOARD_PAGE_SIZE,
  };
}

/** `search=a b&status=TODO` style string with keys sorted for stable URLs. */
export function toQueryString(query: TaskListQuery): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(query).sort()) params.set(key, String(query[key]));
  return params.toString();
}

/** The status filter of a cached list query, or null when the list is not filtered by status. */
export function statusesOfQuery(query: unknown): TaskStatus[] | null {
  if (typeof query !== 'object' || query === null) return null;
  const raw = (query as { status?: unknown }).status;
  if (typeof raw !== 'string' || raw === '') return null;
  return parseCsv(raw, TASK_STATUSES);
}

/** True for a Kanban column query (`status=X&sortBy=position`). */
export function isBoardColumnQuery(query: unknown, status?: TaskStatus): boolean {
  const statuses = statusesOfQuery(query);
  return (
    statuses !== null &&
    statuses.length === 1 &&
    (query as { sortBy?: unknown }).sortBy === 'position' &&
    (status === undefined || statuses[0] === status)
  );
}
