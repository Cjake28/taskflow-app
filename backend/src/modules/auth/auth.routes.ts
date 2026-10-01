import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  verifyResetTokenSchema,
} from '@taskflow/shared';
import { Router, type RequestHandler } from 'express';
import { byUser, rateLimit } from '../../common/middleware/rate-limit';
import { validate } from '../../common/middleware/validate';
import type { RateLimiters } from '../../common/security/rate-limiters';
import type { AuthController } from './auth.controller';
import type { EmailVerificationController } from './email-verification.controller';
import type { PasswordResetController } from './password-reset.controller';

export function createAuthRouter(
  controllers: {
    auth: AuthController;
    passwordReset: PasswordResetController;
    emailVerification: EmailVerificationController;
  },
  deps: { limiters: RateLimiters; authenticate: RequestHandler },
): Router {
  const { auth, passwordReset, emailVerification } = controllers;
  const router = Router();

  router.post(
    '/register',
    rateLimit(deps.limiters.register),
    validate({ body: registerSchema }),
    auth.register,
  );
  router.post(
    '/login',
    rateLimit(deps.limiters.loginIp),
    validate({ body: loginSchema }),
    auth.login,
  );
  router.post('/refresh', rateLimit(deps.limiters.refreshIp), auth.refresh);
  router.post('/logout', auth.logout);
  router.post('/logout-all', deps.authenticate, auth.logoutAll);

  router.post(
    '/forgot-password',
    rateLimit(deps.limiters.forgotIp),
    validate({ body: forgotPasswordSchema }),
    passwordReset.forgotPassword,
  );
  router.post(
    '/reset-password/verify',
    rateLimit(deps.limiters.resetIp),
    validate({ body: verifyResetTokenSchema }),
    passwordReset.verifyResetToken,
  );
  router.post(
    '/reset-password',
    rateLimit(deps.limiters.resetIp),
    validate({ body: resetPasswordSchema }),
    passwordReset.resetPassword,
  );

  router.post(
    '/verify-email',
    rateLimit(deps.limiters.verifyIp),
    validate({ body: verifyEmailSchema }),
    emailVerification.verify,
  );
  router.post(
    '/verify-email/resend',
    deps.authenticate,
    rateLimit(deps.limiters.verifyResend, byUser),
    emailVerification.resend,
  );

  return router;
}
