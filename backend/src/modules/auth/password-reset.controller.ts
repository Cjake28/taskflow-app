import {
  FORGOT_PASSWORD_MESSAGE,
  type ForgotPasswordData,
  type ResetPasswordData,
  type VerifyResetTokenData,
} from '@taskflow/shared';
import type { Request, Response } from 'express';
import type { RateLimiterAbstract } from 'rate-limiter-flexible';
import { ServiceUnavailableException } from '../../common/exceptions';
import { accepted, noContent } from '../../common/http/respond';
import { isRateLimitRejection } from '../../common/security/rate-limiters';
import type { Logger } from '../../common/utils/logger';
import type { PasswordResetService } from './password-reset.service';

export class PasswordResetController {
  constructor(
    private readonly passwordReset: PasswordResetService,
    private readonly perEmailLimiter: RateLimiterAbstract,
    private readonly logger: Logger,
  ) {}

  forgotPassword = async (req: Request, res: Response) => {
    const { email } = req.valid.body as ForgotPasswordData;
    if (await this.withinEmailBudget(email)) {
      try {
        await this.passwordReset.requestReset(email);
      } catch (err) {
        this.logger.error({ err }, 'Could not enqueue password reset request');
        throw new ServiceUnavailableException();
      }
    }
    // Identical response whether or not the account exists (or the email budget is spent).
    accepted(res, { message: FORGOT_PASSWORD_MESSAGE });
  };

  verifyResetToken = async (req: Request, res: Response) => {
    const { token } = req.valid.body as VerifyResetTokenData;
    await this.passwordReset.verify(token);
    noContent(res);
  };

  resetPassword = async (req: Request, res: Response) => {
    const { token, password } = req.valid.body as ResetPasswordData;
    await this.passwordReset.resetPassword(token, password);
    noContent(res);
  };

  private async withinEmailBudget(email: string): Promise<boolean> {
    try {
      await this.perEmailLimiter.consume(email);
      return true;
    } catch (err) {
      if (isRateLimitRejection(err)) return false;
      throw err;
    }
  }
}
