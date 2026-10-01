import {
  OAUTH_PROVIDER_LABELS,
  OAUTH_PROVIDERS,
  OAuthErrorCode,
  type OAuthProviderId,
} from '@taskflow/shared';

import type { AlertVariant } from '@/components/common/alert';
import { oauthErrorCopy } from '@/features/auth/oauth-errors';

/*
 * After "Connect" the API redirects back to
 *   /profile?tab=connected&linked=<provider>       (success)
 *   /profile?tab=connected&oauthError=<CODE>       (failure)
 * (spec §9.4). The banner is read once, then the parameters are removed from the URL.
 */

export const OAUTH_BANNER_PARAMS = ['linked', 'oauthError', 'provider'] as const;

export type OAuthBanner =
  | { kind: 'linked'; provider: OAuthProviderId }
  | { kind: 'error'; code: string; provider: OAuthProviderId | null };

export function asProvider(value: string | null): OAuthProviderId | null {
  const normalized = value?.toLowerCase() ?? '';
  return (OAUTH_PROVIDERS as readonly string[]).includes(normalized)
    ? (normalized as OAuthProviderId)
    : null;
}

const KNOWN_CODES = new Set<string>(Object.values(OAuthErrorCode));

export function parseOAuthBanner(params: URLSearchParams): OAuthBanner | null {
  const error = params.get('oauthError');
  if (error) {
    // Unknown codes still produce the generic failure banner rather than silently disappearing.
    const code = KNOWN_CODES.has(error) ? error : OAuthErrorCode.OAUTH_FAILED;
    return { kind: 'error', code, provider: asProvider(params.get('provider')) };
  }
  const linked = asProvider(params.get('linked'));
  return linked ? { kind: 'linked', provider: linked } : null;
}

export function hasOAuthBannerParams(params: URLSearchParams): boolean {
  return OAUTH_BANNER_PARAMS.some((name) => params.has(name));
}

/** A copy of `params` without the one-shot banner parameters (the tab and anything else stay). */
export function withoutOAuthBannerParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const name of OAUTH_BANNER_PARAMS) next.delete(name);
  return next;
}

export interface BannerContent {
  variant: AlertVariant;
  title: string;
  body: string;
}

/** Copy for the Connected accounts page (linking context, not sign-in). */
export function oauthBannerContent(banner: OAuthBanner): BannerContent {
  if (banner.kind === 'linked') {
    const name = OAUTH_PROVIDER_LABELS[banner.provider];
    return {
      variant: 'success',
      title: `${name} connected`,
      body: `You can now log in with ${name} as well.`,
    };
  }
  const name = banner.provider ? OAUTH_PROVIDER_LABELS[banner.provider] : null;
  switch (banner.code) {
    case OAuthErrorCode.ACCOUNT_ALREADY_LINKED:
      return {
        variant: 'danger',
        title: 'That account is already in use',
        body: `This ${name ?? 'Google or GitHub'} account is connected to a different TaskFlow user. Disconnect it there first, or use another account.`,
      };
    case OAuthErrorCode.OAUTH_EMAIL_UNVERIFIED:
      return {
        variant: 'warning',
        title: `Your ${name ?? 'provider'} email isn't verified`,
        body: `Verify your email with ${name ?? 'the provider'} first, then try connecting again.`,
      };
    case OAuthErrorCode.OAUTH_PROVIDER_DISABLED:
      return {
        variant: 'warning',
        title: `${name ?? 'That provider'} isn't available`,
        body: 'This sign-in method is turned off right now, so it cannot be connected.',
      };
    case OAuthErrorCode.OAUTH_FAILED:
      return {
        variant: 'danger',
        title: `Couldn't connect ${name ?? 'your account'}`,
        body: 'The connection was cancelled or something went wrong. Please try again.',
      };
    default: {
      const copy = oauthErrorCopy(banner.code, banner.provider);
      return { variant: copy.variant, title: copy.title, body: copy.body };
    }
  }
}
