import type { TaskDto } from '@taskflow/shared';

import { requestEnvelope } from '@/lib/api-client';

const PAGE_SIZE = 100;
/** A safety stop: 10 pages is 1,000 tasks in one month view. */
const MAX_PAGES = 10;

/** Every task due in the range, following pagination (the API caps a page at 100). */
export async function fetchTasksDueBetween(
  range: { dueFrom: string; dueTo: string },
  signal?: AbortSignal,
): Promise<TaskDto[]> {
  const tasks: TaskDto[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      dueFrom: range.dueFrom,
      dueTo: range.dueTo,
      sortBy: 'dueDate',
      sortOrder: 'asc',
      pageSize: String(PAGE_SIZE),
      page: String(page),
    });
    const envelope = await requestEnvelope<TaskDto[]>(`/tasks?${query.toString()}`, { signal });
    tasks.push(...envelope.data);
    if (!envelope.meta || page >= envelope.meta.totalPages) break;
  }
  return tasks;
}
