import type { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import type { Container } from '../../container';
import { AuthController } from './auth.controller';
import { createAuthRouter } from './auth.routes';
import { EmailVerificationController } from './email-verification.controller';
import { PasswordResetController } from './password-reset.controller';

export function authModule(c: Container): Router {
  const auth = new AuthController(c.auth, c.sessions, c.accessTokens, c.users, c.env, c.clock);
  const passwordReset = new PasswordResetController(
    c.passwordReset,
    c.limiters.forgotEmail,
    c.logger,
  );
  return createAuthRouter(
    {
      auth,
      passwordReset,
      emailVerification: new EmailVerificationController(c.emailVerification),
    },
    { limiters: c.limiters, authenticate: authenticate(c.accessTokens, c.sessions) },
  );
}
