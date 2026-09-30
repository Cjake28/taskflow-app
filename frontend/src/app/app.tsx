import { RouterProvider } from 'react-router/dom';

import { BootErrorScreen, LoadingScreen } from '@/components/common/loading-screen';
import { useAuth } from '@/features/auth/use-auth';

import { router } from './router';

/**
 * The router mounts only once the boot check has settled, so a signed-in user never sees a
 * flash of the login page and guards never have to guess (spec §7.5).
 */
export function App() {
  const { status, bootError, retryBoot } = useAuth();
  if (status === 'loading') {
    return bootError ? (
      <BootErrorScreen error={bootError} onRetry={retryBoot} />
    ) : (
      <LoadingScreen />
    );
  }
  return <RouterProvider router={router} />;
}
