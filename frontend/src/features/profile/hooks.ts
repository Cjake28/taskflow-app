import { useQuery } from '@tanstack/react-query';
import { OAUTH_PROVIDERS, type OAuthProviderId } from '@taskflow/shared';

import { authApi } from '@/features/auth/api';
import { authKeys } from '@/features/auth/hooks';
import { queryKeys } from '@/lib/query-keys';

import { profileApi } from './api';

/** The email change waiting for its code (null when there is none). */
export function usePendingEmailChange() {
  return useQuery({
    queryKey: queryKeys.account.emailChange(),
    queryFn: ({ signal }) => profileApi.pendingEmailChange(signal),
  });
}

export function useSessions() {
  return useQuery({
    queryKey: queryKeys.account.sessions(),
    queryFn: ({ signal }) => profileApi.sessions(signal),
  });
}

const KNOWN_PROVIDERS: readonly OAuthProviderId[] = OAUTH_PROVIDERS;

/**
 * Enabled OAuth providers with a loading state (the auth feature's hook only returns the list).
 * Same key and semantics as `useOAuthProviders`, so both share one cache entry: any failure
 * means "no providers".
 */
export function useEnabledProviders() {
  return useQuery({
    queryKey: authKeys.oauthProviders,
    queryFn: async () => {
      try {
        const providers = await authApi.oauthProviders();
        return Array.isArray(providers)
          ? providers.filter((provider): provider is OAuthProviderId =>
              KNOWN_PROVIDERS.includes(provider),
            )
          : [];
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLinkedAccounts() {
  return useQuery({
    queryKey: queryKeys.account.linkedAccounts(),
    queryFn: ({ signal }) => profileApi.linkedAccounts(signal),
  });
}
