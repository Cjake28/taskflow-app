import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

/** 256-bit random values, base64url-encoded (RFC 7636 allows 43–128 characters). */
export const generateState = (): string => randomBytes(32).toString('base64url');
export const generateCodeVerifier = (): string => randomBytes(32).toString('base64url');

/** PKCE S256 challenge: base64url(SHA-256(verifier)). */
export const codeChallengeS256 = (verifier: string): string =>
  createHash('sha256').update(verifier).digest('base64url');

export function authorizationUrl(
  endpoint: string,
  params: {
    clientId: string;
    redirectUri: string;
    scopes: string[];
    state: string;
    codeVerifier: string;
    extra?: Record<string, string>;
  },
): URL {
  const url = new URL(endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', params.scopes.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', codeChallengeS256(params.codeVerifier));
  url.searchParams.set('code_challenge_method', 'S256');
  for (const [key, value] of Object.entries(params.extra ?? {})) url.searchParams.set(key, value);
  return url;
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  id_token: z.string().optional(),
});

export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export class OAuthTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthTokenError';
  }
}

/** Authorization-code grant with the PKCE verifier (client_secret_post authentication). */
export async function exchangeAuthorizationCode(
  endpoint: string,
  params: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
    codeVerifier: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code_verifier: params.codeVerifier,
  });
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // GitHub answers form-encoded unless JSON is requested.
      Accept: 'application/json',
      'User-Agent': 'TaskFlow',
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new OAuthTokenError(`Token endpoint responded ${response.status} without JSON`);
  }
  // OAuth errors can come back with 200 (GitHub) or 400 (Google).
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    throw new OAuthTokenError(`Token endpoint error: ${String(payload.error)}`);
  }
  if (!response.ok) throw new OAuthTokenError(`Token endpoint responded ${response.status}`);
  const parsed = tokenResponseSchema.safeParse(payload);
  if (!parsed.success) throw new OAuthTokenError('Token endpoint returned no access token');
  return parsed.data;
}
