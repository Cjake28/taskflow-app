import type { Env } from '../../../config/env';
import { GitHubProvider } from './github.provider';
import { GoogleProvider } from './google.provider';
import type { OAuthProvider } from './oauth-provider';

export function oauthCallbackBase(env: Env): string {
  const base = env.OAUTH_REDIRECT_BASE_URL || `${env.FRONTEND_URL}/api/v1/auth/oauth`;
  return base.replace(/\/+$/, '');
}

/** Only providers with both a client id and secret are enabled. */
export function createOAuthProviders(env: Env): OAuthProvider[] {
  const base = oauthCallbackBase(env);
  const providers: OAuthProvider[] = [];
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      new GoogleProvider(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, `${base}/google/callback`),
    );
  }
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    providers.push(
      new GitHubProvider(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET, `${base}/github/callback`),
    );
  }
  return providers;
}
