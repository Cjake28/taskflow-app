import { Navigate, createBrowserRouter } from 'react-router';

import { RouteFallback } from '@/components/common/loading-screen';
import { AppLayout } from '@/components/layout/app-layout';
import { ProtectedRoute, PublicOnlyRoute } from '@/features/auth/guards';

import { NotFoundPage } from './not-found-page';
import { RouteError } from './route-error';

/*
 * Routes (spec §14.3). Pages are lazy-loaded; guards and layouts stay in the main chunk.
 *   public-only  /login /register /forgot-password
 *   neutral      /reset-password, /verify-email  (emailed links must work with or without a session)
 *   protected    / → /dashboard, /dashboard, /tasks, /tasks/:id, /profile
 */
export const router = createBrowserRouter([
  {
    ErrorBoundary: RouteError,
    HydrateFallback: RouteFallback,
    children: [
      {
        Component: PublicOnlyRoute,
        children: [
          {
            path: 'login',
            lazy: {
              Component: async () => (await import('@/features/auth/pages/login-page')).LoginPage,
            },
          },
          {
            path: 'register',
            lazy: {
              Component: async () =>
                (await import('@/features/auth/pages/register-page')).RegisterPage,
            },
          },
          {
            path: 'forgot-password',
            lazy: {
              Component: async () =>
                (await import('@/features/auth/pages/forgot-password-page')).ForgotPasswordPage,
            },
          },
        ],
      },
      {
        path: 'reset-password',
        lazy: {
          Component: async () =>
            (await import('@/features/auth/pages/reset-password-page')).ResetPasswordPage,
        },
      },
      {
        path: 'verify-email',
        lazy: {
          Component: async () =>
            (await import('@/features/auth/pages/verify-email-page')).VerifyEmailPage,
        },
      },
      {
        Component: ProtectedRoute,
        children: [
          {
            Component: AppLayout,
            children: [
              { index: true, element: <Navigate to="/dashboard" replace /> },
              {
                path: 'dashboard',
                lazy: {
                  Component: async () =>
                    (await import('@/features/dashboard/pages/dashboard-page')).DashboardPage,
                },
              },
              {
                path: 'tasks',
                lazy: {
                  Component: async () =>
                    (await import('@/features/tasks/pages/tasks-page')).TasksPage,
                },
              },
              {
                path: 'tasks/:id',
                lazy: {
                  Component: async () =>
                    (await import('@/features/tasks/pages/task-details-page')).TaskDetailsPage,
                },
              },
              {
                path: 'profile',
                lazy: {
                  Component: async () =>
                    (await import('@/features/profile/pages/profile-page')).ProfilePage,
                },
              },
            ],
          },
        ],
      },
      { path: '*', Component: NotFoundPage },
    ],
  },
]);
