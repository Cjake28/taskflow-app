import { decodeIdToken, Google } from 'arctic';
import { z } from 'zod';
import type { NormalizedProfile, OAuthProvider } from './oauth-provider';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

const claimsSchema = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  sub: z.string().min(1),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
});

export class GoogleProvider implements OAuthProvider {
  readonly id = 'google' as const;
  private readonly client: Google;

  constructor(
    private readonly clientId: string,
    clientSecret: string,
    redirectUri: string,
  ) {
    this.client = new Google(clientId, clientSecret, redirectUri);
  }

  createAuthorizationUrl(state: string, codeVerifier: string): URL {
    const url = this.client.createAuthorizationURL(state, codeVerifier, [
      'openid',
      'email',
      'profile',
    ]);
    url.searchParams.set('prompt', 'select_account');
    return url;
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<NormalizedProfile> {
    const tokens = await this.client.validateAuthorizationCode(code, codeVerifier);
    // The ID token comes straight from Google's token endpoint over TLS, so its
    // signature does not need re-verifying (OIDC Core §3.1.3.7); issuer and
    // audience are still checked.
    const claims = claimsSchema.parse(decodeIdToken(tokens.idToken()));
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!GOOGLE_ISSUERS.includes(claims.iss) || !audiences.includes(this.clientId)) {
      throw new Error('Google ID token was not issued for this client');
    }

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
