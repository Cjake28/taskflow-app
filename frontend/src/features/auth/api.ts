import type {
  LoginData,
  RegisterData,
  ResetPasswordData,
  SessionPayload,
  UserDto,
} from '@taskflow/shared';

import { api, refreshSession } from '@/lib/api-client';

export type OAuthProviderId = 'google' | 'github';

export const authApi = {
  register: (input: RegisterData) => api.post<SessionPayload>('/auth/register', input),
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
