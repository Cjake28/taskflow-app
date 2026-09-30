import type { OAuthProviderId } from '@taskflow/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { InlineJobQueue } from '../src/jobs/job-queue';
import type {
  NormalizedProfile,
  OAuthProvider,
} from '../src/modules/oauth/providers/oauth-provider';
import { cookieHeader, setCookies } from './setup/cookies';
import { createUser } from './setup/factories';
import { createHarness, type Harness } from './setup/harness';

/** Stands in for Google/GitHub: each authorization code maps to a profile. */
class FakeProvider implements OAuthProvider {
  readonly codes = new Map<string, NormalizedProfile>();
  lastVerifier: string | null = null;

  constructor(readonly id: OAuthProviderId) {}

  createAuthorizationUrl(state: string, codeVerifier: string): URL {
    this.lastVerifier = codeVerifier;
    return new URL(`https://${this.id}.example/authorize?state=${state}`);
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<NormalizedProfile> {
    const profile = this.codes.get(code);
    if (!profile || codeVerifier !== this.lastVerifier) throw new Error('invalid_grant');
    return profile;
  }
}

const google = new FakeProvider('google');
const github = new FakeProvider('github');
let h: Harness;

beforeAll(async () => {
  h = await createHarness({ oauthProviders: [google, github] });
});
beforeEach(async () => {
  await h.reset();
  google.codes.clear();
  github.codes.clear();
  (h.container.jobs as InlineJobQueue).enqueued.length = 0;
});
afterAll(() => h.close());

const FRONTEND = 'http://localhost:5173';

function profile(overrides: Partial<NormalizedProfile> = {}): NormalizedProfile {
  return {
    providerAccountId: 'google-123',
    email: 'maria.santos@gmail.com',
    emailVerified: true,
    firstName: 'Maria',
    lastName: 'Santos',
    usernameHint: null,
    avatarUrl: null,
    ...overrides,
  };
}

/** Runs the redirect dance: start → (provider) → callback. */
async function signInWith(
  provider: FakeProvider,
  code: string,
  options: { mode?: 'link'; cookie?: string } = {},
) {
  let start = h.get(`/api/v1/auth/oauth/${provider.id}${options.mode ? '?mode=link' : ''}`);
  if (options.cookie) start = start.set('Cookie', options.cookie);
  const started = await start;
  if (started.status !== 302 || !started.headers.location?.startsWith('https://')) {
    return started;
  }
  const state = new URL(started.headers.location).searchParams.get('state')!;
  const stateCookie = setCookies(started).tf_oauth_state!.value;
  return h
    .get(`/api/v1/auth/oauth/${provider.id}/callback?code=${code}&state=${state}`)
    .set('Cookie', cookieHeader({ tf_oauth_state: stateCookie }));
}

describe('GET /api/v1/auth/oauth/providers', () => {
  it('lists the configured providers', async () => {
    const res = await h.get('/api/v1/auth/oauth/providers');
    expect(res.body.data).toEqual(['google', 'github']);
  });
});

describe('OAuth sign-in', () => {
  it('starts the flow with a state cookie scoped to the OAuth routes', async () => {
    const res = await h.get('/api/v1/auth/oauth/google');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/google\.example\/authorize\?state=/);
    const cookie = setCookies(res).tf_oauth_state!;
    expect(cookie.attributes).toMatch(/Path=\/api\/v1\/auth\/oauth/);
    expect(cookie.attributes).toMatch(/HttpOnly/);
    expect(cookie.attributes).toMatch(/SameSite=Lax/);
  });

  it('creates a verified, password-less account and signs in', async () => {
    google.codes.set('ok', profile({ avatarUrl: 'https://lh3.googleusercontent.com/a/photo' }));
    const res = await signInWith(google, 'ok');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${FRONTEND}/dashboard`);
    const cookies = setCookies(res);
    expect(cookies.tf_access?.value).toBeTruthy();
    expect(cookies.tf_refresh?.value).toBeTruthy();

    const me = await h
      .get('/api/v1/users/me')
      .set('Cookie', `tf_access=${cookies.tf_access!.value}`);
    expect(me.body.data).toMatchObject({
      firstName: 'Maria',
      lastName: 'Santos',
      username: 'maria.santos',
      email: 'maria.santos@gmail.com',
      hasPassword: false,
    });
    const user = await h.container.prisma.user.findUniqueOrThrow({
      where: { email: 'maria.santos@gmail.com' },
    });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect((h.container.jobs as InlineJobQueue).enqueued).toContainEqual({
      name: 'avatar.import',
      payload: { userId: user.id, url: 'https://lh3.googleusercontent.com/a/photo' },
    });
  });

  it('signs the same provider account back in without creating another user', async () => {
    google.codes.set('first', profile());
    google.codes.set('again', profile({ email: 'changed@gmail.com' }));
    await signInWith(google, 'first');
    const res = await signInWith(google, 'again');

    expect(res.headers.location).toBe(`${FRONTEND}/dashboard`);
    expect(await h.container.prisma.user.count()).toBe(1);
  });

  it('never attaches itself to an existing password account with the same email', async () => {
    await createUser(h.container.prisma, { email: 'maria.santos@gmail.com' });
    google.codes.set('ok', profile());
    const res = await signInWith(google, 'ok');

    expect(res.headers.location).toBe(`${FRONTEND}/login?oauthError=OAUTH_ACCOUNT_EXISTS`);
    expect(setCookies(res).tf_access).toBeUndefined();
    expect(await h.container.prisma.oAuthAccount.count()).toBe(0);
  });

  it('rejects unverified or missing emails', async () => {
    github.codes.set('unverified', profile({ providerAccountId: '42', emailVerified: false }));
    const res = await signInWith(github, 'unverified');
    expect(res.headers.location).toBe(`${FRONTEND}/login?oauthError=OAUTH_EMAIL_UNVERIFIED`);
    expect(await h.container.prisma.user.count()).toBe(0);
  });

  it('generates a unique username from the provider login', async () => {
    await createUser(h.container.prisma, { username: 'octocat' });
    github.codes.set(
      'ok',
      profile({ providerAccountId: '583231', email: 'octo@github.com', usernameHint: 'OctoCat' }),
    );
    await signInWith(github, 'ok');
    const user = await h.container.prisma.user.findUniqueOrThrow({
      where: { email: 'octo@github.com' },
    });
    expect(user.username).toMatch(/^octocat\d{4,5}$/);
  });

  it('rejects a callback whose state does not match the cookie, and replays', async () => {
    google.codes.set('ok', profile());
    const started = await h.get('/api/v1/auth/oauth/google');
    const state = new URL(started.headers.location!).searchParams.get('state')!;

    const forged = await h
      .get(`/api/v1/auth/oauth/google/callback?code=ok&state=${state}`)
      .set('Cookie', 'tf_oauth_state=attacker-state');
    expect(forged.headers.location).toBe(`${FRONTEND}/login?oauthError=OAUTH_FAILED`);

    const noCookie = await h.get(`/api/v1/auth/oauth/google/callback?code=ok&state=${state}`);
    expect(noCookie.headers.location).toBe(`${FRONTEND}/login?oauthError=OAUTH_FAILED`);

    const valid = await h
      .get(`/api/v1/auth/oauth/google/callback?code=ok&state=${state}`)
      .set('Cookie', `tf_oauth_state=${state}`);
    expect(valid.headers.location).toBe(`${FRONTEND}/dashboard`);

    const replay = await h
      .get(`/api/v1/auth/oauth/google/callback?code=ok&state=${state}`)
      .set('Cookie', `tf_oauth_state=${state}`);
    expect(replay.headers.location).toBe(`${FRONTEND}/login?oauthError=OAUTH_FAILED`);
  });

  it('handles a denied consent screen and failed code exchanges', async () => {
    const started = await h.get('/api/v1/auth/oauth/google');
    const state = new URL(started.headers.location!).searchParams.get('state')!;
    const denied = await h
      .get(`/api/v1/auth/oauth/google/callback?error=access_denied&state=${state}`)
      .set('Cookie', `tf_oauth_state=${state}`);
    expect(denied.headers.location).toBe(`${FRONTEND}/login?oauthError=OAUTH_FAILED`);

    const badCode = await signInWith(google, 'unknown-code');
    expect(badCode.headers.location).toBe(`${FRONTEND}/login?oauthError=OAUTH_FAILED`);
  });

  it('redirects unknown providers back with an error', async () => {
    const res = await h.get('/api/v1/auth/oauth/facebook');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${FRONTEND}/login?oauthError=OAUTH_PROVIDER_DISABLED`);
  });
});

describe('connecting accounts from the profile', () => {
  async function signedIn() {
    const { user } = await createUser(h.container.prisma, { email: 'me@example.com' });
    const session = await h.container.sessions.create(user.id, {
      persistent: false,
      userAgent: 'vitest',
      ip: '127.0.0.1',
    });
    return { user, cookie: `tf_access=${session.access.token}` };
  }

  it('links a provider to the signed-in user, even with a different email', async () => {
    const { user, cookie } = await signedIn();
    github.codes.set('ok', profile({ providerAccountId: '7', email: 'someone@else.dev' }));

    const res = await signInWith(github, 'ok', { mode: 'link', cookie });
    expect(res.headers.location).toBe(`${FRONTEND}/profile?tab=connected&linked=github`);

    const accounts = await h.get('/api/v1/users/me/accounts').set('Cookie', cookie);
    expect(accounts.body.data).toMatchObject({
      hasPassword: true,
      providers: [{ provider: 'github', email: 'someone@else.dev' }],
    });

    // Signing in with that GitHub account now opens the same user.
    github.codes.set('login', profile({ providerAccountId: '7', email: 'someone@else.dev' }));
    const login = await signInWith(github, 'login');
    const me = await h
      .get('/api/v1/users/me')
      .set('Cookie', `tf_access=${setCookies(login).tf_access!.value}`);
    expect(me.body.data.id).toBe(user.id);
  });

  it('refuses a provider account that belongs to someone else', async () => {
    google.codes.set('theirs', profile({ providerAccountId: 'shared' }));
    await signInWith(google, 'theirs');

    const { cookie } = await signedIn();
    google.codes.set('mine', profile({ providerAccountId: 'shared' }));
    const res = await signInWith(google, 'mine', { mode: 'link', cookie });
    expect(res.headers.location).toBe(
      `${FRONTEND}/profile?tab=connected&oauthError=ACCOUNT_ALREADY_LINKED`,
    );
  });

  it('requires a session to link', async () => {
    const res = await h.get('/api/v1/auth/oauth/google?mode=link');
    expect(res.headers.location).toBe(`${FRONTEND}/login?oauthError=OAUTH_FAILED`);
  });

  it('never removes the last way to sign in', async () => {
    google.codes.set('ok', profile());
    const login = await signInWith(google, 'ok');
    const cookie = `tf_access=${setCookies(login).tf_access!.value}`;

    const res = await h.del('/api/v1/users/me/accounts/google').set('Cookie', cookie);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CANNOT_UNLINK_LAST_METHOD');

    const missing = await h.del('/api/v1/users/me/accounts/github').set('Cookie', cookie);
    expect(missing.status).toBe(404);
  });

  it('disconnects a provider when a password remains', async () => {
    const { cookie } = await signedIn();
    github.codes.set('ok', profile({ providerAccountId: '9' }));
    await signInWith(github, 'ok', { mode: 'link', cookie });

    expect((await h.del('/api/v1/users/me/accounts/github').set('Cookie', cookie)).status).toBe(
      204,
    );
    const accounts = await h.get('/api/v1/users/me/accounts').set('Cookie', cookie);
    expect(accounts.body.data.providers).toEqual([]);
  });
});
