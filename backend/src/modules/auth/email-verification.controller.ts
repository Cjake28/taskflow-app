import type { VerifyEmailData } from '@taskflow/shared';
import type { Request, Response } from 'express';
import { noContent } from '../../common/http/respond';
import { requireUser } from '../../common/middleware/authenticate';
import type { EmailVerificationService } from './email-verification.service';

export class EmailVerificationController {
  constructor(private readonly emailVerification: EmailVerificationService) {}

  /** Public: the link may be opened in a browser without a session. */
  verify = async (req: Request, res: Response) => {
    const { token } = req.valid.body as VerifyEmailData;
    await this.emailVerification.verify(token);
    noContent(res);
  };

  resend = async (req: Request, res: Response) => {
    await this.emailVerification.requestVerification(requireUser(req).id);
    noContent(res);
  };
}
