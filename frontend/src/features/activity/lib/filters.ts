import type { ActivityAction } from '@taskflow/shared';
import { endOfDay, isValid, parse, startOfDay, subDays } from 'date-fns';

/*
 * Activity page filters, kept in the URL so they survive reloads and can be shared:
 *   range=all|today|7d|30d|custom · from, to (yyyy-MM-dd, custom only) · type=<csv> · q
 */

export const RANGE_OPTIONS = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom' },
] as const;
export type ActivityRange = (typeof RANGE_OPTIONS)[number]['value'];

/** What people think in, mapped to the API's activity actions. */
export const TYPE_OPTIONS = [
  { value: 'created', label: 'Created', actions: ['CREATED'] },
  { value: 'edited', label: 'Edited', actions: ['UPDATED'] },
  { value: 'status', label: 'Status changes', actions: ['STATUS_CHANGED'] },
  { value: 'images', label: 'Images', actions: ['IMAGE_ADDED', 'IMAGE_REMOVED'] },
  { value: 'deleted', label: 'Deleted', actions: ['DELETED'] },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  actions: readonly ActivityAction[];
}>;
export type ActivityType = (typeof TYPE_OPTIONS)[number]['value'];

export interface ActivityFilters {
  range: ActivityRange;
  /** `yyyy-MM-dd`, used when range is "custom". */
  from: string;
  to: string;
  types: ActivityType[];
  search: string;
}

export const EMPTY_FILTERS: ActivityFilters = {
  range: 'all',
  from: '',
  to: '',
  types: [],
  search: '',
};

const isRange = (value: string | null): value is ActivityRange =>
  RANGE_OPTIONS.some((option) => option.value === value);

function localDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = parse(value, 'yyyy-MM-dd', new Date());
  return isValid(date) ? date : null;
}

export function parseActivityFilters(params: URLSearchParams): ActivityFilters {
  const range = params.get('range');
  const picked = new Set((params.get('type') ?? '').split(',').map((part) => part.trim()));
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  return {
    range: isRange(range) ? range : 'all',
    from: localDate(from) ? from : '',
    to: localDate(to) ? to : '',
    // Keep the canonical order whatever order the URL used.
    types: TYPE_OPTIONS.map((option) => option.value).filter((value) => picked.has(value)),
    search: (params.get('q') ?? '').trim(),
  };
}

/** Writes filters into the URL, dropping defaults so clean URLs stay clean. */
export function writeActivityFilters(filters: ActivityFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.range !== 'all') params.set('range', filters.range);
  if (filters.range === 'custom') {
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
  }
  if (filters.types.length > 0) params.set('type', filters.types.join(','));
  if (filters.search) params.set('q', filters.search);
  return params;
}

export function hasActiveFilters(filters: ActivityFilters): boolean {
  return filters.range !== 'all' || filters.types.length > 0 || filters.search !== '';
}

/** The `GET /activities` query for these filters (local day boundaries → ISO instants). */
export function toActivityQuery(
  filters: ActivityFilters,
  now: Date = new Date(),
): Record<string, string> {
  const query: Record<string, string> = {};
  const actions = TYPE_OPTIONS.filter((option) => filters.types.includes(option.value)).flatMap(
    (option) => option.actions,
  );
  if (actions.length > 0) query.action = actions.join(',');
  if (filters.search) query.search = filters.search;

  let from: Date | null = null;
  let to: Date | null = null;
  if (filters.range === 'today') from = startOfDay(now);
  else if (filters.range === '7d') from = startOfDay(subDays(now, 6));
  else if (filters.range === '30d') from = startOfDay(subDays(now, 29));
  else if (filters.range === 'custom') {
    const start = localDate(filters.from);
    const end = localDate(filters.to);
    if (start) from = startOfDay(start);
    if (end) to = endOfDay(end);
  }
  if (from) query.from = from.toISOString();
  if (to) query.to = to.toISOString();
  return query;
}
