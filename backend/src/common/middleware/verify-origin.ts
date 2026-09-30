import type { RequestHandler } from 'express';
import { ForbiddenException } from '../exceptions';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** CSRF defense: state-changing requests must come from the frontend's origin. */
export function verifyOrigin(frontendUrl: string): RequestHandler {
  const allowed = new URL(frontendUrl).origin;
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const origin = originOf(req.get('origin')) ?? originOf(req.get('referer'));
    if (origin !== allowed) {
      next(new ForbiddenException('Request origin not allowed'));
      return;
    }
    next();
  };
}
