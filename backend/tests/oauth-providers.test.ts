import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubProvider } from '../src/modules/oauth/providers/github.provider';
import { GoogleProvider } from '../src/modules/oauth/providers/google.provider';
import { splitFullName } from '../src/modules/oauth/providers/oauth-provider';
import { usernameBase, usernameCandidates } from '../src/modules/oauth/username';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const idToken = (claims: Record<string, unknown>) =>
  `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url(claims)}.signature`;

afterEach(() => vi.unstubAllGlobals());

describe('GoogleProvider', () => {
  const provider = new GoogleProvider('client-id', 'secret', 'http://localhost/cb');

  it('builds a PKCE authorization URL', () => {
    const url = provider.createAuthorizationUrl('state-1', 'verifier-1');
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
  });

  it('normalises the ID token claims', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          access_token: 'at',
          token_type: 'Bearer',
          id_token: idToken({
            iss: 'https://accounts.google.com',
            aud: 'client-id',
            sub: '1098',
            email: 'maria@gmail.com',
            email_verified: true,
            given_name: 'Maria',
            family_name: 'Santos',
            picture: 'https://lh3.googleusercontent.com/a/x',
          }),
        }),
      ),
    );
    expect(await provider.exchangeCode('code', 'verifier')).toEqual({
      providerAccountId: '1098',
      email: 'maria@gmail.com',
      emailVerified: true,
      firstName: 'Maria',
      lastName: 'Santos',
      usernameHint: null,
      avatarUrl: 'https://lh3.googleusercontent.com/a/x',
    });
  });

  it('rejects ID tokens issued for another client', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          access_token: 'at',
          token_type: 'Bearer',
          id_token: idToken({ iss: 'https://accounts.google.com', aud: 'other', sub: '1' }),
        }),
      ),
    );
    await expect(provider.exchangeCode('code', 'verifier')).rejects.toThrow(/not issued/);
  });
});

describe('GitHubProvider', () => {
  it('uses the primary verified email and splits the display name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ access_token: 'gho_x', token_type: 'bearer', scope: 'read:user' })),
    );
    const api = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/user')) {
        return json({
          id: 583231,
          login: 'octocat',
          name: 'The Octo Cat',
          avatar_url: 'https://avatars.githubusercontent.com/u/583231',
        });
      }
      return json([
        { email: 'old@example.com', primary: false, verified: true },
        { email: 'octo@github.com', primary: true, verified: true },
      ]);
    });
    const provider = new GitHubProvider('id', 'secret', 'http://localhost/cb', api as typeof fetch);

    const url = provider.createAuthorizationUrl('s', 'v');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(await provider.exchangeCode('code', 'v')).toEqual({
      providerAccountId: '583231',
      email: 'octo@github.com',
      emailVerified: true,
      firstName: 'The Octo',
      lastName: 'Cat',
      usernameHint: 'octocat',
      avatarUrl: 'https://avatars.githubusercontent.com/u/583231',
    });
  });

  it('reports no email when the primary address is unverified', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ access_token: 'gho_x', token_type: 'bearer' })),
    );
    const api = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/user')
        ? json({ id: 1, login: 'newbie', name: null, avatar_url: null })
        : json([{ email: 'new@example.com', primary: true, verified: false }]),
    );
    const provider = new GitHubProvider('id', 'secret', 'http://localhost/cb', api as typeof fetch);
    expect(await provider.exchangeCode('code', 'v')).toMatchObject({
      email: null,
      emailVerified: false,
      firstName: 'newbie',
      lastName: '',
    });
  });
});

describe('names and usernames', () => {
  it('splits names on the last space', () => {
    expect(splitFullName('Ada King Lovelace')).toEqual({
      firstName: 'Ada King',
      lastName: 'Lovelace',
    });
    expect(splitFullName('Cher')).toEqual({ firstName: 'Cher', lastName: '' });
    expect(splitFullName(null)).toEqual({ firstName: '', lastName: '' });
  });

  it('derives valid usernames', () => {
    expect(usernameBase('Maria.Santos')).toBe('maria.santos');
    expect(usernameBase('..weird--name__')).toBe('weirdname');
    expect(usernameBase('日本')).toBe('user');
    expect(usernameBase('ab')).toBe('user');
    const candidates = usernameCandidates('maria', 4);
    expect(candidates[0]).toBe('maria');
    expect(candidates.slice(1).every((candidate) => /^maria\d{4,5}$/.test(candidate))).toBe(true);
  });
});
