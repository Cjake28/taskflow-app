export const OAUTH_PROVIDERS = ['google', 'github'] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDERS)[number];

export const OAUTH_PROVIDER_LABELS: Record<OAuthProviderId, string> = {
  google: 'Google',
  github: 'GitHub',
};
