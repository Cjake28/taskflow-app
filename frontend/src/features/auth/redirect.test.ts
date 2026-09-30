import { describe, expect, it } from 'vitest';

import { loginPathFor, sanitizeRedirect } from './redirect';

const ORIGIN = 'http://localhost:5173';

describe('sanitizeRedirect', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/tasks?view=board&status=TODO', '/tasks?view=board&status=TODO'],
    ['/tasks/0199a1b2#activity', '/tasks/0199a1b2#activity'],
    ['/profile?tab=security', '/profile?tab=security'],
  ])('accepts the same-origin path %s', (input, expected) => {
    expect(sanitizeRedirect(input, ORIGIN)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['dashboard'], // relative
    ['https://evil.example/phish'],
    ['//evil.example'], // protocol-relative
    ['/\\evil.example'], // backslash is treated like a slash by browsers
    ['\\\\evil.example'],
    ['/\t/evil.example'], // tabs are stripped by URL parsing → //evil.example
    ['/\n/evil.example'],
    [' /dashboard'],
    ['javascript:alert(1)'],
    ['data:text/html,hi'],
    ['/%0A/evil.example/'.replace('%0A', '\n')],
    [`/${'a'.repeat(3000)}`],
  ])('rejects %j', (input) => {
    expect(sanitizeRedirect(input, ORIGIN)).toBeNull();
  });

  it('refuses to send users back to auth pages', () => {
    expect(sanitizeRedirect('/login', ORIGIN)).toBeNull();
    expect(sanitizeRedirect('/login/', ORIGIN)).toBeNull();
    expect(sanitizeRedirect('/register?redirect=/tasks', ORIGIN)).toBeNull();
    expect(sanitizeRedirect('/forgot-password', ORIGIN)).toBeNull();
    expect(sanitizeRedirect('/reset-password?token=abc', ORIGIN)).toBeNull();
  });

  it('normalises dot segments without leaving the origin', () => {
    expect(sanitizeRedirect('/tasks/../profile', ORIGIN)).toBe('/profile');
  });
});

describe('loginPathFor', () => {
  it('keeps the denied location as a readable redirect', () => {
    expect(loginPathFor({ pathname: '/dashboard', search: '', hash: '' })).toBe(
      '/login?redirect=/dashboard',
    );
    expect(loginPathFor({ pathname: '/tasks', search: '?view=board', hash: '' })).toBe(
      '/login?redirect=/tasks%3Fview%3Dboard',
    );
  });

  it('adds the expiry reason and skips a redirect to the root', () => {
    expect(loginPathFor({ pathname: '/', search: '', hash: '' }, 'expired')).toBe(
      '/login?reason=expired',
    );
    expect(loginPathFor({ pathname: '/profile', search: '', hash: '' }, 'expired')).toBe(
      '/login?reason=expired&redirect=/profile',
    );
  });

  it('round-trips through URLSearchParams', () => {
    const path = loginPathFor({ pathname: '/tasks', search: '?view=board&page=2', hash: '' });
    const redirect = new URL(path, ORIGIN).searchParams.get('redirect');
    expect(sanitizeRedirect(redirect, ORIGIN)).toBe('/tasks?view=board&page=2');
  });
});
