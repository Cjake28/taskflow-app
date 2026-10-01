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

/**
 * CSRF defense: state-changing requests must come from the frontend's origin. `exemptPaths` are
 * endpoints authorised by a token in the request itself (not cookies), e.g. one-click
 * unsubscribe, which mail providers call from their own servers.
 */
export function verifyOrigin(
  frontendUrl: string,
  options: { exemptPaths?: readonly string[] } = {},
): RequestHandler {
  const allowed = new URL(frontendUrl).origin;
  const exempt = new Set(options.exemptPaths ?? []);
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method) || exempt.has(req.path)) {
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
