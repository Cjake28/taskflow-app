import { OAuthErrorCode } from '@taskflow/shared';
import { Link2, type LucideIcon } from 'lucide-react';

import type { AlertVariant } from '@/components/common/alert';

const PROVIDER_NAMES: Record<string, string> = { google: 'Google', github: 'GitHub' };

export interface BannerCopy {
  variant: AlertVariant;
  title: string;
  body: string;
  icon?: LucideIcon;
}

export function oauthErrorCopy(code: string, provider?: string | null): BannerCopy {
  const name = (provider && PROVIDER_NAMES[provider.toLowerCase()]) || null;
  switch (code) {
    case OAuthErrorCode.OAUTH_ACCOUNT_EXISTS:
      return {
        variant: 'info',
        icon: Link2,
        title: 'This email already has an account',
        body: `Log in with your password, then connect ${name ?? 'Google or GitHub'} from your Profile.`,
      };
    case OAuthErrorCode.OAUTH_EMAIL_UNVERIFIED:
      return {
        variant: 'warning',
        title: `Your ${name ?? 'provider'} email isn't verified`,
        body: 'Verify your email with the provider first, or sign up with a password instead.',
      };
    case OAuthErrorCode.ACCOUNT_ALREADY_LINKED:
      return {
        variant: 'danger',
        title: 'Account already linked',
        body: `That ${name ?? 'provider'} account is connected to a different TaskFlow user.`,
      };
    case OAuthErrorCode.OAUTH_PROVIDER_DISABLED:
      return {
        variant: 'warning',
        title: `${name ?? 'That'} sign-in isn't available`,
        body: 'This sign-in method is turned off right now. Log in with your email or username.',
      };
    case OAuthErrorCode.OAUTH_FAILED:
    default:
      return {
        variant: 'danger',
        title: `${name ?? 'Social'} sign-in failed`,
        body: 'Something went wrong. Please try again.',
      };
  }
}
