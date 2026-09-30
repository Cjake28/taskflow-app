import { isRouteErrorResponse, useRouteError } from 'react-router';

import { ErrorState } from '@/components/common/error-state';

import { NotFoundPage } from './not-found-page';

/** Lazy chunks go missing after a deploy; a reload fetches the new ones. */
function isChunkLoadError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
      error.message,
    )
  );
}

/** Route-level error boundary: crashes render a friendly error instead of a blank page. */
export function RouteError() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;

  if (import.meta.env.DEV) console.error(error);

  const chunk = isChunkLoadError(error);
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <title>Something went wrong · TaskFlow</title>
      <ErrorState
        className="w-full max-w-[460px]"
        title={chunk ? 'A new version is available' : 'Something went wrong'}
        error={error}
        description={
          chunk
            ? 'Reload the page to get the latest version of TaskFlow.'
            : 'An unexpected error stopped this page from loading. Reloading usually fixes it.'
        }
        onRetry={() => window.location.reload()}
      />
    </main>
  );
}
