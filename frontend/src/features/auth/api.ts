import type {
  LoginData,
  PendingRegistrationDto,
  RegisterData,
  ResetPasswordData,
  SessionPayload,
  UserDto,
} from '@taskflow/shared';

import { api, refreshSession } from '@/lib/api-client';

export type OAuthProviderId = 'google' | 'github';

export const authApi = {
  /** Step 1 of sign-up: emails a code; no account exists yet. */
  register: (input: RegisterData) => api.post<PendingRegistrationDto>('/auth/register', input),
  /** Step 2: the code creates the account and starts a session. */
  verifyRegistration: (registrationId: string, code: string) =>
    api.post<SessionPayload>(
      '/auth/register/verify',
      { registrationId, code },
      { retryOnExpired: false },
    ),
  resendRegistrationCode: (registrationId: string) =>
    api.post<PendingRegistrationDto>(
      '/auth/register/resend',
      { registrationId },
      { retryOnExpired: false },
    ),
  login: (input: LoginData) => api.post<SessionPayload>('/auth/login', input),
  /** Single-flight; also used for the silent boot check. */
  refresh: refreshSession,
  logout: () => api.post<void>('/auth/logout', undefined, { retryOnExpired: false }),
  logoutAll: () => api.post<void>('/auth/logout-all'),
  me: () => api.get<UserDto>('/users/me'),

  forgotPassword: (email: string) =>
    api.post<{ message: string }>('/auth/forgot-password', { email }),
  verifyResetToken: (token: string) =>
    api.post<void>('/auth/reset-password/verify', { token }, { retryOnExpired: false }),
  resetPassword: (input: ResetPasswordData) =>
    api.post<void>('/auth/reset-password', input, { retryOnExpired: false }),

  oauthProviders: () => api.get<OAuthProviderId[]>('/auth/oauth/providers'),
};

/** Full-page navigation target that starts the provider's consent flow. */
export function oauthStartUrl(provider: OAuthProviderId): string {
  return `/api/v1/auth/oauth/${provider}`;
}
