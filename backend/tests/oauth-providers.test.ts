import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { GitHubProvider } from '../src/modules/oauth/providers/github.provider';
import { GoogleProvider } from '../src/modules/oauth/providers/google.provider';
import { codeChallengeS256 } from '../src/modules/oauth/providers/oauth2';
import { splitFullName } from '../src/modules/oauth/providers/oauth-provider';
import { usernameBase, usernameCandidates } from '../src/modules/oauth/username';

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const formOf = (init: RequestInit | undefined) => new URLSearchParams(String(init?.body ?? ''));

describe('PKCE', () => {
  it('matches the RFC 7636 example', () => {
    expect(codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});

describe('GoogleProvider', () => {
  let privateKey: PrivateKey;
  let jwks: ReturnType<typeof createLocalJWKSet>;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    const publicJwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: 'test', alg: 'RS256' };
    jwks = createLocalJWKSet({ keys: [publicJwk] });
  });

  const idToken = (claims: Record<string, unknown>, options: { key?: PrivateKey } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer('https://accounts.google.com')
      .setAudience('client-id')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(options.key ?? privateKey);

  const provider = (fetchImpl: typeof fetch) =>
    new GoogleProvider('client-id', 'secret', 'http://localhost/cb', { fetchImpl, jwks });

  it('builds a PKCE authorization URL', () => {
    const url = provider(fetch).createAuthorizationUrl('state-1', 'verifier-1');
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('state')).toBe('state-1');
    expect(url.searchParams.get('code_challenge')).toBe(codeChallengeS256('verifier-1'));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost/cb');
  });

  it('sends the code verifier and normalises verified ID token claims', async () => {
    const token = await idToken({
      sub: '1098',
      email: 'maria@gmail.com',
      email_verified: true,
      given_name: 'Maria',
      family_name: 'Santos',
      picture: 'https://lh3.googleusercontent.com/a/x',
    });
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      json({ access_token: 'at', token_type: 'Bearer', id_token: token }),
    );

    expect(await provider(fetchMock as typeof fetch).exchangeCode('code', 'verifier')).toEqual({
      providerAccountId: '1098',
      email: 'maria@gmail.com',
      emailVerified: true,
      firstName: 'Maria',
      lastName: 'Santos',
      usernameHint: null,
      avatarUrl: 'https://lh3.googleusercontent.com/a/x',
    });
    const form = formOf(fetchMock.mock.calls[0]?.[1]);
    expect(form.get('code_verifier')).toBe('verifier');
    expect(form.get('grant_type')).toBe('authorization_code');
  });

  it('rejects ID tokens with a bad signature or for another client', async () => {
    const forgedKey = (await generateKeyPair('RS256')).privateKey;
    const forged = await idToken({ sub: '1' }, { key: forgedKey });
    await expect(
      provider((async () =>
        json({ access_token: 'at', id_token: forged })) as typeof fetch).exchangeCode(
        'code',
        'verifier',
      ),
    ).rejects.toThrow();

    const otherAudience = await new SignJWT({ sub: '1' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer('https://accounts.google.com')
      .setAudience('someone-else')
      .setExpirationTime('5m')
      .sign(privateKey);
    await expect(
      provider((async () =>
        json({ access_token: 'at', id_token: otherAudience })) as typeof fetch).exchangeCode(
        'code',
        'verifier',
      ),
    ).rejects.toThrow();
  });

  it('surfaces token endpoint errors', async () => {
    const failing = (async () => json({ error: 'invalid_grant' }, 400)) as unknown as typeof fetch;
    await expect(provider(failing).exchangeCode('code', 'verifier')).rejects.toThrow(
      /invalid_grant/,
    );
  });
});

describe('GitHubProvider', () => {
  function githubFetch(emails: unknown, user: unknown) {
    return vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const target = String(url);
      if (target.includes('/login/oauth/access_token')) {
        return json({ access_token: 'gho_x', token_type: 'bearer', scope: 'read:user' });
      }
      return json(target.endsWith('/user') ? user : emails);
    });
  }

  it('uses the primary verified email and splits the display name', async () => {
    const fetchMock = githubFetch(
      [
        { email: 'old@example.com', primary: false, verified: true },
        { email: 'octo@github.com', primary: true, verified: true },
      ],
      {
        id: 583231,
        login: 'octocat',
        name: 'The Octo Cat',
        avatar_url: 'https://avatars.githubusercontent.com/u/583231',
      },
    );
    const provider = new GitHubProvider(
      'id',
      'secret',
      'http://localhost/cb',
      fetchMock as typeof fetch,
    );

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
    const tokenCall = fetchMock.mock.calls.find(([target]) =>
      String(target).includes('access_token'),
    );
    expect(formOf(tokenCall?.[1]).get('code_verifier')).toBe('v');
    expect(new Headers(tokenCall?.[1]?.headers).get('accept')).toBe('application/json');
  });

  it('reports no email when the primary address is unverified', async () => {
    const fetchMock = githubFetch([{ email: 'new@example.com', primary: true, verified: false }], {
      id: 1,
      login: 'newbie',
      name: null,
      avatar_url: null,
    });
    const provider = new GitHubProvider(
      'id',
      'secret',
      'http://localhost/cb',
      fetchMock as typeof fetch,
    );
    expect(await provider.exchangeCode('code', 'v')).toMatchObject({
      email: null,
      emailVerified: false,
      firstName: 'newbie',
      lastName: '',
    });
  });

  it('treats an error body with status 200 as a failure', async () => {
    const fetchMock = vi.fn(async () => json({ error: 'bad_verification_code' }));
    const provider = new GitHubProvider(
      'id',
      'secret',
      'http://localhost/cb',
      fetchMock as typeof fetch,
    );
    await expect(provider.exchangeCode('code', 'v')).rejects.toThrow(/bad_verification_code/);
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
