import type { Request, RequestHandler } from 'express';
import type { SessionsService } from '../../modules/auth/sessions.service';
import { UnauthorizedException } from '../exceptions';
import { ACCESS_COOKIE } from '../security/cookies';
import type { AccessTokenService } from '../utils/tokens';

export function authenticate(
  accessTokens: AccessTokenService,
  sessions: SessionsService,
): RequestHandler {
  return async (req, _res, next) => {
    const token: unknown = req.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string' || token.length === 0) throw new UnauthorizedException();

    const claims = await accessTokens.verify(token);
    if (!(await sessions.isActive(claims.sessionId))) throw new UnauthorizedException();

    req.user = { id: claims.userId, sessionId: claims.sessionId };
    next();
  };
}

export function requireUser(req: Request): { id: string; sessionId: string } {
  if (!req.user) throw new UnauthorizedException();
  return req.user;
}
