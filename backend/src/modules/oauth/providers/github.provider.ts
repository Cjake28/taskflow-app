import { z } from 'zod';
import { authorizationUrl, exchangeAuthorizationCode } from './oauth2';
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

/** GitHub OAuth App: Authorization Code flow with PKCE, then the REST API for the profile. */
export class GitHubProvider implements OAuthProvider {
  readonly id = 'github' as const;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  createAuthorizationUrl(state: string, codeVerifier: string): URL {
    return authorizationUrl(AUTHORIZATION_ENDPOINT, {
      clientId: this.clientId,
      redirectUri: this.redirectUri,
      scopes: ['read:user', 'user:email'],
      state,
      codeVerifier,
    });
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<NormalizedProfile> {
    const { access_token: accessToken } = await exchangeAuthorizationCode(
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
