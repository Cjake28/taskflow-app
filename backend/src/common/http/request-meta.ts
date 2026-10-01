import type { Request } from 'express';
import { DEVICE_COOKIE } from '../security/cookies';

/** `generateSecret()` output: 32 random bytes, base64url. */
const DEVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface SessionMeta {
  userAgent: string | null;
  ip: string | null;
  /** This browser's device cookie, used to spot sign-ins from new devices. */
  deviceToken?: string | null;
}

export function sessionMeta(req: Request): SessionMeta {
  const device: unknown = req.cookies?.[DEVICE_COOKIE];
  return {
    userAgent: req.get('user-agent')?.slice(0, 512) ?? null,
    ip: req.ip ?? null,
    deviceToken: typeof device === 'string' && DEVICE_TOKEN_PATTERN.test(device) ? device : null,
  };
}
