import { format } from 'date-fns';

/** "Sep 2026" (or another date-fns pattern); null for an unparsable timestamp. */
export function memberSince(createdAt: string, pattern = 'MMM yyyy'): string | null {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : format(date, pattern);
}
