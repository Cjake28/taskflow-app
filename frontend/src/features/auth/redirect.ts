export const DEFAULT_AUTHENTICATED_PATH = '/dashboard';

/** Public-only pages: never a useful place to return to after logging in. */
const AUTH_PATHS = [
  '/login',
  '/register',
  '/register/verify',
  '/forgot-password',
  '/reset-password',
];

// Browsers strip tabs/newlines from URLs ("/\t/evil.com" becomes "//evil.com"), so any
// whitespace or control character is rejected outright.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARACTERS = /[\u0000-\u001F\u007F\s\\]/;

/**
 * Validates the `?redirect=` parameter so it can only point inside this app (no open redirect).
 * Returns a normalised same-origin path (`/tasks?view=board#top`) or null.
 */
export function sanitizeRedirect(
  value: string | null | undefined,
  origin: string = window.location.origin,
): string | null {
  if (!value || value.length > 2048) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (UNSAFE_CHARACTERS.test(value)) return null;

  let url: URL;
  try {
    url = new URL(value, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;

  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (AUTH_PATHS.includes(path.toLowerCase())) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}

/** `redirect=<path>` query parameter; slashes are legal in a query and stay readable. */
function redirectParam(target: string): string {
  return `redirect=${encodeURIComponent(target).replace(/%2F/gi, '/')}`;
}

/** Appends a (sanitised) redirect to an auth page link, e.g. Log in → Sign up. */
export function withRedirect(path: string, redirect: string | null): string {
  return redirect ? `${path}?${redirectParam(redirect)}` : path;
}

/** `/login?redirect=<current path>` for a protected location the visitor was sent away from. */
export function loginPathFor(
  location: { pathname: string; search: string; hash: string },
  reason?: 'expired',
): string {
  const query: string[] = [];
  if (reason) query.push(`reason=${reason}`);
  const target = sanitizeRedirect(`${location.pathname}${location.search}${location.hash}`);
  if (target && target !== '/') query.push(redirectParam(target));
  return query.length > 0 ? `/login?${query.join('&')}` : '/login';
}
