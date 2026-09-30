import { loginSchema, registerSchema } from '@taskflow/shared';
import { Router, type RequestHandler } from 'express';
import { rateLimit } from '../../common/middleware/rate-limit';
import { validate } from '../../common/middleware/validate';
import type { RateLimiters } from '../../common/security/rate-limiters';
import type { AuthController } from './auth.controller';

export function createAuthRouter(
  controller: AuthController,
  deps: { limiters: RateLimiters; authenticate: RequestHandler },
): Router {
  const router = Router();
  router.post(
    '/register',
    rateLimit(deps.limiters.register),
    validate({ body: registerSchema }),
    controller.register,
  );
  router.post(
    '/login',
    rateLimit(deps.limiters.loginIp),
    validate({ body: loginSchema }),
    controller.login,
  );
  router.post('/refresh', rateLimit(deps.limiters.refreshIp), controller.refresh);
  router.post('/logout', controller.logout);
  router.post('/logout-all', deps.authenticate, controller.logoutAll);
  return router;
}
