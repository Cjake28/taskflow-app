import { Router, type RequestHandler } from 'express';
import type { UsersController } from './users.controller';

export function createUsersRouter(
  controller: UsersController,
  guards: { authenticate: RequestHandler; apiLimit: RequestHandler },
): Router {
  const router = Router();
  router.use(guards.authenticate, guards.apiLimit);
  router.get('/me', controller.me);
  return router;
}
