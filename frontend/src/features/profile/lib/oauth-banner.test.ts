import { describe, expect, it } from 'vitest';

import {
  hasOAuthBannerParams,
  oauthBannerContent,
  parseOAuthBanner,
  withoutOAuthBannerParams,
} from './oauth-banner';
import { parseProfileTab } from './profile-tabs';

const params = (query: string) => new URLSearchParams(query);

describe('parseOAuthBanner', () => {
  it('reads a successful link', () => {
    expect(parseOAuthBanner(params('tab=connected&linked=github'))).toEqual({
      kind: 'linked',
      provider: 'github',
    });
    expect(parseOAuthBanner(params('linked=GOOGLE'))).toEqual({
      kind: 'linked',
      provider: 'google',
    });
  });

  it('ignores unknown providers and missing parameters', () => {
    expect(parseOAuthBanner(params('linked=myspace'))).toBeNull();
    expect(parseOAuthBanner(params('tab=connected'))).toBeNull();
  });

  it('reads errors, falling back to the generic failure for unknown codes', () => {
    expect(parseOAuthBanner(params('oauthError=ACCOUNT_ALREADY_LINKED'))).toEqual({
      kind: 'error',
      code: 'ACCOUNT_ALREADY_LINKED',
      provider: null,
    });
    expect(parseOAuthBanner(params('oauthError=<script>&provider=github'))).toEqual({
      kind: 'error',
      code: 'OAUTH_FAILED',
      provider: 'github',
    });
  });

  it('prefers the error when both parameters are present', () => {
    expect(parseOAuthBanner(params('linked=google&oauthError=OAUTH_FAILED'))?.kind).toBe('error');
  });
});

describe('cleaning the URL', () => {
  it('drops only the one-shot parameters', () => {
    const query = params('tab=connected&linked=google&provider=google&oauthError=OAUTH_FAILED');
    expect(hasOAuthBannerParams(query)).toBe(true);
    const cleaned = withoutOAuthBannerParams(query);
    expect(cleaned.toString()).toBe('tab=connected');
    expect(hasOAuthBannerParams(cleaned)).toBe(false);
    // The input is not mutated.
    expect(query.get('linked')).toBe('google');
  });
});

describe('banner copy', () => {
  it('names the provider', () => {
    expect(oauthBannerContent({ kind: 'linked', provider: 'github' })).toMatchObject({
      variant: 'success',
      title: 'GitHub connected',
    });
    expect(
      oauthBannerContent({ kind: 'error', code: 'ACCOUNT_ALREADY_LINKED', provider: 'google' }),
    ).toMatchObject({ variant: 'danger', title: 'That account is already in use' });
    expect(oauthBannerContent({ kind: 'error', code: 'OAUTH_FAILED', provider: null }).title).toBe(
      "Couldn't connect your account",
    );
  });
});

describe('parseProfileTab', () => {
  it('falls back to Account for unknown values', () => {
    expect(parseProfileTab('security')).toBe('security');
    expect(parseProfileTab('connected')).toBe('connected');
    expect(parseProfileTab('notifications')).toBe('notifications');
    expect(parseProfileTab('billing')).toBe('account');
    expect(parseProfileTab(null)).toBe('account');
  });
});
