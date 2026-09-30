import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/api-client';

const MAX_RETRIES = 2;

/** Client errors (4xx) are final; retry only network failures and 5xx responses. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_RETRIES) return false;
  if (error instanceof ApiError) return error.status === 0 || error.status >= 500;
  return true;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export const queryClient = createQueryClient();
