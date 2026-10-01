import type { ActivityDto } from '@taskflow/shared';

import { requestEnvelope, type ApiEnvelope } from '@/lib/api-client';

export const ACTIVITY_PAGE_SIZE = 25;

/** One page of `GET /activities` with the given filters (newest first). */
export function fetchActivityPage(
  filters: Record<string, string>,
  page: number,
  signal?: AbortSignal,
): Promise<ApiEnvelope<ActivityDto[]>> {
  const query = new URLSearchParams({
    ...filters,
    page: String(page),
    pageSize: String(ACTIVITY_PAGE_SIZE),
  });
  return requestEnvelope<ActivityDto[]>(`/activities?${query.toString()}`, { signal });
}
