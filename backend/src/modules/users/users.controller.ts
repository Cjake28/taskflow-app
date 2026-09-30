import type { ChangePasswordData, UpdateProfileData } from '@taskflow/shared';
import type { Request, Response } from 'express';
import { noContent, ok } from '../../common/http/respond';
import { requireUser } from '../../common/middleware/authenticate';
import { clearAuthCookies } from '../../common/security/cookies';
import type { Env } from '../../config/env';
import type { UsersService } from './users.service';

export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly env: Env,
  ) {}

  me = async (req: Request, res: Response) => {
    ok(res, await this.users.getProfile(requireUser(req).id));
  };

  updateMe = async (req: Request, res: Response) => {
    const user = requireUser(req);
    ok(res, await this.users.updateProfile(user.id, req.valid.body as UpdateProfileData));
  };

  changePassword = async (req: Request, res: Response) => {
    const user = requireUser(req);
    await this.users.changePassword(user.id, user.sessionId, req.valid.body as ChangePasswordData);
    noContent(res);
  };

  listSessions = async (req: Request, res: Response) => {
    const user = requireUser(req);
    ok(res, await this.users.listSessions(user.id, user.sessionId));
  };

  revokeSession = async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { id } = req.valid.params as { id: string };
    const wasCurrent = await this.users.revokeSession(user.id, id, user.sessionId);
    if (wasCurrent) clearAuthCookies(res, this.env);
    noContent(res);
  };
}
