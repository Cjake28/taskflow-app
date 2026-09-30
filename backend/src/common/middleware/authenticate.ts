import type { Request, RequestHandler } from 'express';
import type { SessionsService } from '../../modules/auth/sessions.service';
import { UnauthorizedException } from '../exceptions';
import { ACCESS_COOKIE } from '../security/cookies';
import type { AccessTokenService } from '../utils/tokens';

async function identify(
  req: Request,
  accessTokens: AccessTokenService,
  sessions: SessionsService,
): Promise<{ id: string; sessionId: string }> {
  const token: unknown = req.cookies?.[ACCESS_COOKIE];
  if (typeof token !== 'string' || token.length === 0) throw new UnauthorizedException();

  const claims = await accessTokens.verify(token);
  if (!(await sessions.isActive(claims.sessionId))) throw new UnauthorizedException();
  return { id: claims.userId, sessionId: claims.sessionId };
}

export function authenticate(
  accessTokens: AccessTokenService,
  sessions: SessionsService,
): RequestHandler {
  return async (req, _res, next) => {
    req.user = await identify(req, accessTokens, sessions);
    next();
  };
}

/** Sets `req.user` when a valid session cookie is present; anonymous requests continue. */
export function optionalAuthenticate(
  accessTokens: AccessTokenService,
  sessions: SessionsService,
): RequestHandler {
  return async (req, _res, next) => {
    try {
      req.user = await identify(req, accessTokens, sessions);
    } catch {
      req.user = undefined;
    }
    next();
  };
}

export function requireUser(req: Request): { id: string; sessionId: string } {
  if (!req.user) throw new UnauthorizedException();
  return req.user;
}
