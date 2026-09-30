import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';

import { LoadingScreen } from '@/components/common/loading-screen';

import { DEFAULT_AUTHENTICATED_PATH, loginPathFor, sanitizeRedirect } from './redirect';
import { useAuth } from './use-auth';

/** Signed-in users only; everyone else goes to /login (with a safe `redirect` back). */
export function ProtectedRoute() {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') return <LoadingScreen />;
  if (state.status === 'unauthenticated') {
    const to =
      state.reason === 'logout'
        ? '/login'
        : loginPathFor(location, state.reason === 'expired' ? 'expired' : undefined);
    return <Navigate to={to} replace />;
  }
  return <Outlet />;
}

/** Login, register, forgot password: signed-in users are sent on to the app. */
export function PublicOnlyRoute() {
  const { status } = useAuth();
  const [searchParams] = useSearchParams();

  if (status === 'loading') return <LoadingScreen />;
  if (status === 'authenticated') {
    const target = sanitizeRedirect(searchParams.get('redirect')) ?? DEFAULT_AUTHENTICATED_PATH;
    return <Navigate to={target} replace />;
  }
  return <Outlet />;
}
