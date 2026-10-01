import type {
  ChangeEmailInput,
  ChangePasswordInput,
  LinkedAccountsDto,
  OAuthProviderId,
  PendingEmailChangeDto,
  SessionDto,
  UpdateProfileInput,
  UserDto,
} from '@taskflow/shared';

import { api, request } from '@/lib/api-client';

export const profileApi = {
  update: (input: UpdateProfileInput) => api.patch<UserDto>('/users/me', input),
  changePassword: (input: ChangePasswordInput) => api.patch<void>('/users/me/password', input),

  /** Emails a code to the new address; the email changes only after `verifyEmailChange`. */
  startEmailChange: (input: ChangeEmailInput) =>
    api.post<PendingEmailChangeDto>('/users/me/email', input),
  verifyEmailChange: (code: string) => api.post<UserDto>('/users/me/email/verify', { code }),
  resendEmailChange: () => api.post<PendingEmailChangeDto>('/users/me/email/resend'),
  pendingEmailChange: (signal?: AbortSignal) =>
    api.get<PendingEmailChangeDto | null>('/users/me/email', { signal }),
  cancelEmailChange: () => api.delete('/users/me/email'),

  /** Multipart field `image`; the server crops and re-encodes it and returns the updated user. */
  uploadAvatar: (file: File) => {
    const body = new FormData();
    body.append('image', file);
    return request<UserDto>('/users/me/avatar', { method: 'PUT', body });
  },
  removeAvatar: () => api.delete('/users/me/avatar'),

  sessions: (signal?: AbortSignal) => api.get<SessionDto[]>('/users/me/sessions', { signal }),
  revokeSession: (id: string) => api.delete(`/users/me/sessions/${encodeURIComponent(id)}`),

  linkedAccounts: (signal?: AbortSignal) =>
    api.get<LinkedAccountsDto>('/users/me/accounts', { signal }),
  unlink: (provider: OAuthProviderId) => api.delete(`/users/me/accounts/${provider}`),
};

/** Full-page navigation target that starts linking a provider to the signed-in account. */
export function oauthLinkUrl(provider: OAuthProviderId): string {
  return `/api/v1/auth/oauth/${provider}?mode=link`;
}
