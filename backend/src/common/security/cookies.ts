import type { CookieOptions, Response } from 'express';
import type { Env } from '../../config/env';
import type { SignedToken } from '../utils/tokens';

export const ACCESS_COOKIE = 'tf_access';
export const REFRESH_COOKIE = 'tf_refresh';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
/** Identifies a browser across sign-ins (only read by the sign-in endpoints under /auth). */
export const DEVICE_COOKIE = 'tf_device';
/** Browsers cap cookie lifetimes at 400 days. */
const DEVICE_COOKIE_MAX_AGE_MS = 400 * 86_400_000;

type CookieEnv = Pick<Env, 'COOKIE_SECURE'>;

const baseOptions = (env: CookieEnv): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.COOKIE_SECURE,
});

export function setAccessCookie(
  res: Response,
  env: CookieEnv,
  access: SignedToken,
  now: Date,
): void {
  res.cookie(ACCESS_COOKIE, access.token, {
    ...baseOptions(env),
    path: '/',
    maxAge: Math.max(0, access.expiresAt.getTime() - now.getTime()),
  });
}

export function setRefreshCookie(
  res: Response,
  env: CookieEnv,
  refresh: SignedToken,
  persistent: boolean,
  now: Date,
): void {
  res.cookie(REFRESH_COOKIE, refresh.token, {
    ...baseOptions(env),
    path: REFRESH_COOKIE_PATH,
    ...(persistent ? { maxAge: Math.max(0, refresh.expiresAt.getTime() - now.getTime()) } : {}),
  });
}

export function setAuthCookies(
  res: Response,
  env: CookieEnv,
  session: {
    access: SignedToken;
    refresh: SignedToken;
    persistent: boolean;
    deviceToken?: string;
  },
  now: Date,
): void {
  setAccessCookie(res, env, session.access, now);
  setRefreshCookie(res, env, session.refresh, session.persistent, now);
  if (session.deviceToken) {
    // Kept after logout on purpose: it is what makes this browser "known" next time.
    res.cookie(DEVICE_COOKIE, session.deviceToken, {
      ...baseOptions(env),
      path: REFRESH_COOKIE_PATH,
      maxAge: DEVICE_COOKIE_MAX_AGE_MS,
    });
  }
}

export function clearAuthCookies(res: Response, env: CookieEnv): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseOptions(env), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseOptions(env), path: REFRESH_COOKIE_PATH });
}
