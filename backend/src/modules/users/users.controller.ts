import type {
  ChangeEmailData,
  ChangePasswordData,
  UpdateProfileData,
  VerifyEmailChangeData,
} from '@taskflow/shared';
import type { Request, Response } from 'express';
import { accepted, noContent, ok } from '../../common/http/respond';
import { requireUser } from '../../common/middleware/authenticate';
import { clearAuthCookies } from '../../common/security/cookies';
import type { Env } from '../../config/env';
import type { EmailChangeService } from './email-change.service';
import type { UsersService } from './users.service';

export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly emailChange: EmailChangeService,
    private readonly env: Env,
  ) {}

  me = async (req: Request, res: Response) => {
    ok(res, await this.users.getProfile(requireUser(req).id));
  };

  updateMe = async (req: Request, res: Response) => {
    const user = requireUser(req);
    ok(res, await this.users.updateProfile(user.id, req.valid.body as UpdateProfileData));
  };

  /** Sends a code to the new address; the email changes only after `verifyEmailChange`. */
  startEmailChange = async (req: Request, res: Response) => {
    const userId = requireUser(req).id;
    accepted(res, await this.emailChange.start(userId, req.valid.body as ChangeEmailData));
  };

  verifyEmailChange = async (req: Request, res: Response) => {
    const { code } = req.valid.body as VerifyEmailChangeData;
    ok(res, await this.emailChange.verify(requireUser(req).id, code));
  };

  resendEmailChange = async (req: Request, res: Response) => {
    ok(res, await this.emailChange.resend(requireUser(req).id));
  };

  pendingEmailChange = async (req: Request, res: Response) => {
    ok(res, await this.emailChange.pending(requireUser(req).id));
  };

  cancelEmailChange = async (req: Request, res: Response) => {
    await this.emailChange.cancel(requireUser(req).id);
    noContent(res);
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
