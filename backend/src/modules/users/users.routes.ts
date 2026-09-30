import { changePasswordSchema, idParamSchema, updateProfileSchema } from '@taskflow/shared';
import { Router, type RequestHandler } from 'express';
import { validate } from '../../common/middleware/validate';
import type { UsersController } from './users.controller';

export function createUsersRouter(
  controller: UsersController,
  guards: { authenticate: RequestHandler; apiLimit: RequestHandler },
): Router {
  const router = Router();
  router.use(guards.authenticate, guards.apiLimit);

  router.get('/me', controller.me);
  router.patch('/me', validate({ body: updateProfileSchema }), controller.updateMe);
  router.patch('/me/password', validate({ body: changePasswordSchema }), controller.changePassword);
  router.get('/me/sessions', controller.listSessions);
  router.delete('/me/sessions/:id', validate({ params: idParamSchema }), controller.revokeSession);

  return router;
}
