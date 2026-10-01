import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query-keys';

import { fetchTasksDueBetween } from './api';

export function useTasksDueBetween(range: { dueFrom: string; dueTo: string }) {
  return useQuery({
    queryKey: queryKeys.tasks.calendar(range),
    queryFn: ({ signal }) => fetchTasksDueBetween(range, signal),
    // Paging between months should not flash an empty grid.
    placeholderData: (previous) => previous,
  });
}
