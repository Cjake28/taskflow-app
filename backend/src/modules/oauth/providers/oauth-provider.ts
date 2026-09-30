import type { OAuthProviderId } from '@taskflow/shared';

/** What TaskFlow needs from any provider, in one shape. */
export interface NormalizedProfile {
  /** Stable provider id (Google `sub`, GitHub numeric `id`) — never the email. */
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  /** A username hint such as the GitHub login. */
  usernameHint: string | null;
  avatarUrl: string | null;
}

export interface OAuthProvider {
  readonly id: OAuthProviderId;
  /** Authorization Code flow with PKCE (S256). */
  createAuthorizationUrl(state: string, codeVerifier: string): URL;
  exchangeCode(code: string, codeVerifier: string): Promise<NormalizedProfile>;
}

/** Splits "Ada King Lovelace" into "Ada King" / "Lovelace". */
export function splitFullName(name: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const trimmed = (name ?? '').trim().replace(/\s+/g, ' ');
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace === -1) return { firstName: trimmed, lastName: '' };
  return { firstName: trimmed.slice(0, lastSpace), lastName: trimmed.slice(lastSpace + 1) };
}
