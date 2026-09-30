import type { LoginData, RegisterData } from '@taskflow/shared';
import type { Request, Response } from 'express';
import { sessionMeta } from '../../common/http/request-meta';
import { created, noContent, ok } from '../../common/http/respond';
import { requireUser } from '../../common/middleware/authenticate';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  setAccessCookie,
  setAuthCookies,
} from '../../common/security/cookies';
import type { Clock } from '../../common/utils/clock';
import type { AccessTokenService } from '../../common/utils/tokens';
import type { Env } from '../../config/env';
import { toUserResponse } from '../users/users.mapper';
import type { UsersService } from '../users/users.service';
import { toSessionPayload } from './auth.mapper';
import type { AuthService } from './auth.service';
import type { RefreshResult, SessionsService } from './sessions.service';

export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly accessTokens: AccessTokenService,
    private readonly users: UsersService,
    private readonly env: Env,
    private readonly clock: Clock,
  ) {}

  register = async (req: Request, res: Response) => {
    const { user, session } = await this.auth.register(
      req.valid.body as RegisterData,
      sessionMeta(req),
    );
    setAuthCookies(res, this.env, session, this.clock.now());
    created(res, toSessionPayload(toUserResponse(user), session.access));
  };

  login = async (req: Request, res: Response) => {
    const { user, session } = await this.auth.login(req.valid.body as LoginData, sessionMeta(req));
    setAuthCookies(res, this.env, session, this.clock.now());
    ok(res, toSessionPayload(toUserResponse(user), session.access));
  };

  refresh = async (req: Request, res: Response) => {
    let result: RefreshResult;
    try {
      result = await this.sessions.refresh(req.cookies?.[REFRESH_COOKIE], sessionMeta(req));
    } catch (err) {
      clearAuthCookies(res, this.env);
      throw err;
    }

    const now = this.clock.now();
    if (result.kind === 'rotated') setAuthCookies(res, this.env, result, now);
    else setAccessCookie(res, this.env, result.access, now);

    ok(res, toSessionPayload(await this.users.getProfile(result.userId), result.access));
  };

  logout = async (req: Request, res: Response) => {
    const sessionId =
      (await this.sessions.findSessionIdByRefreshToken(req.cookies?.[REFRESH_COOKIE])) ??
      (await this.sessionIdFromAccessCookie(req));
    if (sessionId) await this.sessions.revoke(sessionId);
    clearAuthCookies(res, this.env);
    noContent(res);
  };

  logoutAll = async (req: Request, res: Response) => {
    await this.sessions.revokeAllForUser(requireUser(req).id);
    clearAuthCookies(res, this.env);
    noContent(res);
  };

  private async sessionIdFromAccessCookie(req: Request): Promise<string | null> {
    const token: unknown = req.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string') return null;
    try {
      return (await this.accessTokens.verify(token)).sessionId;
    } catch {
      return null;
    }
  }
}
