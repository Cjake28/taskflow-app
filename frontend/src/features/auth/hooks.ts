import { useQuery } from '@tanstack/react-query';

import { authApi, type OAuthProviderId } from './api';

export const authKeys = {
  oauthProviders: ['auth', 'oauth-providers'] as const,
  resetToken: (token: string) => ['auth', 'reset-token', token] as const,
  verifyEmail: (token: string) => ['auth', 'verify-email', token] as const,
};

const KNOWN_PROVIDERS: readonly OAuthProviderId[] = ['google', 'github'];

/**
 * Enabled OAuth providers. Any failure (including 404 while the endpoint doesn't exist)
 * means "no providers", so the buttons simply stay hidden.
 */
export function useOAuthProviders() {
  const query = useQuery({
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
  return query.data ?? [];
}
