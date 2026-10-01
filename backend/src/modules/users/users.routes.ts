import {
  changeEmailSchema,
  changePasswordSchema,
  idParamSchema,
  updateProfileSchema,
  verifyEmailChangeSchema,
} from '@taskflow/shared';
import { Router, type RequestHandler } from 'express';
import { validate } from '../../common/middleware/validate';
import type { UsersController } from './users.controller';

export function createUsersRouter(
  controller: UsersController,
  guards: { authenticate: RequestHandler; apiLimit: RequestHandler; otpLimit: RequestHandler },
): Router {
  const router = Router();
  router.use(guards.authenticate, guards.apiLimit);

  router.get('/me', controller.me);
  router.patch('/me', validate({ body: updateProfileSchema }), controller.updateMe);
  router.patch('/me/password', validate({ body: changePasswordSchema }), controller.changePassword);

  // Email change confirmed with a code sent to the new address.
  router.get('/me/email', controller.pendingEmailChange);
  router.post(
    '/me/email',
    guards.otpLimit,
    validate({ body: changeEmailSchema }),
    controller.startEmailChange,
  );
  router.post(
    '/me/email/verify',
    guards.otpLimit,
    validate({ body: verifyEmailChangeSchema }),
    controller.verifyEmailChange,
  );
  router.post('/me/email/resend', guards.otpLimit, controller.resendEmailChange);
  router.delete('/me/email', controller.cancelEmailChange);
  router.get('/me/sessions', controller.listSessions);
  router.delete('/me/sessions/:id', validate({ params: idParamSchema }), controller.revokeSession);

  return router;
}
