import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { authorizationUrl, exchangeAuthorizationCode } from './oauth2';
import type { NormalizedProfile, OAuthProvider } from './oauth-provider';

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

const claimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
});

export interface GoogleProviderOptions {
  fetchImpl?: typeof fetch;
  /** Key source for ID token signatures (Google's published JWKS by default). */
  jwks?: JWTVerifyGetKey;
}

/** Google sign-in: OpenID Connect Authorization Code flow with PKCE. */
export class GoogleProvider implements OAuthProvider {
  readonly id = 'google' as const;
  private readonly fetchImpl: typeof fetch;
  private readonly jwks: JWTVerifyGetKey;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
    options: GoogleProviderOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.jwks = options.jwks ?? createRemoteJWKSet(new URL(JWKS_URL));
  }

  createAuthorizationUrl(state: string, codeVerifier: string): URL {
    return authorizationUrl(AUTHORIZATION_ENDPOINT, {
      clientId: this.clientId,
      redirectUri: this.redirectUri,
      scopes: ['openid', 'email', 'profile'],
      state,
      codeVerifier,
      extra: { prompt: 'select_account' },
    });
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<NormalizedProfile> {
    const tokens = await exchangeAuthorizationCode(
      TOKEN_ENDPOINT,
      {
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        redirectUri: this.redirectUri,
        code,
        codeVerifier,
      },
      this.fetchImpl,
    );
    if (!tokens.id_token) throw new Error('Google returned no ID token');

    // Signature, issuer, audience and expiry are all checked.
    const { payload } = await jwtVerify(tokens.id_token, this.jwks, {
      issuer: ISSUERS,
      audience: this.clientId,
    });
    const claims = claimsSchema.parse(payload);

    return {
      providerAccountId: claims.sub,
      email: claims.email ?? null,
      emailVerified: claims.email_verified === true,
      firstName: claims.given_name ?? claims.name ?? '',
      lastName: claims.family_name ?? '',
      usernameHint: null,
      avatarUrl: claims.picture ?? null,
    };
  }
}
