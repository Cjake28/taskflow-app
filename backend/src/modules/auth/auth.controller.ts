import type { RegisterData } from '@taskflow/shared';
import type { Request, Response } from 'express';
import { sessionMeta } from '../../common/http/request-meta';
import { created } from '../../common/http/respond';
import { setAuthCookies } from '../../common/security/cookies';
import type { Clock } from '../../common/utils/clock';
import type { AccessTokenService } from '../../common/utils/tokens';
import type { Env } from '../../config/env';
import { toUserResponse } from '../users/users.mapper';
import type { UsersService } from '../users/users.service';
import { toSessionPayload } from './auth.mapper';
import type { AuthService } from './auth.service';
import type { SessionsService } from './sessions.service';

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
}
