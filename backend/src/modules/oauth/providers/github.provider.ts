import { CodeChallengeMethod, OAuth2Client } from 'arctic';
import { z } from 'zod';
import { splitFullName, type NormalizedProfile, type OAuthProvider } from './oauth-provider';

const AUTHORIZATION_ENDPOINT = 'https://github.com/login/oauth/authorize';
const TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token';
const API = 'https://api.github.com';

const userSchema = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
});

const emailsSchema = z.array(
  z.object({ email: z.string(), primary: z.boolean(), verified: z.boolean() }),
);

/**
 * GitHub OAuth App. Arctic's generic client is used so the flow can include
 * PKCE, which GitHub supports for OAuth Apps.
 */
export class GitHubProvider implements OAuthProvider {
  readonly id = 'github' as const;
  private readonly client: OAuth2Client;

  constructor(
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.client = new OAuth2Client(clientId, clientSecret, redirectUri);
  }

  createAuthorizationUrl(state: string, codeVerifier: string): URL {
    return this.client.createAuthorizationURLWithPKCE(
      AUTHORIZATION_ENDPOINT,
      state,
      CodeChallengeMethod.S256,
      codeVerifier,
      ['read:user', 'user:email'],
    );
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<NormalizedProfile> {
    const tokens = await this.client.validateAuthorizationCode(TOKEN_ENDPOINT, code, codeVerifier);
    const accessToken = tokens.accessToken();
    const [user, emails] = await Promise.all([
      this.get(`${API}/user`, accessToken).then((body) => userSchema.parse(body)),
      // `/user` returns null for private emails, so read the verified primary address here.
      this.get(`${API}/user/emails`, accessToken).then((body) => emailsSchema.parse(body)),
    ]);
    const primary = emails.find((entry) => entry.primary && entry.verified);
    const { firstName, lastName } = splitFullName(user.name);

    return {
      providerAccountId: String(user.id),
      email: primary?.email ?? null,
      emailVerified: primary !== undefined,
      firstName: firstName || user.login,
      lastName,
      usernameHint: user.login,
      avatarUrl: user.avatar_url ?? null,
    };
  }

  private async get(url: string, accessToken: string): Promise<unknown> {
    const response = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'TaskFlow',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`GitHub API ${url} responded ${response.status}`);
    return response.json();
  }
}
