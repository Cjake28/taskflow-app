import { registerSchema } from '@taskflow/shared';
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
  return router;
}
