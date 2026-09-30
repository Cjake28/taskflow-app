import { Router } from 'express';
import type { Container } from './container';
import { healthModule } from './modules/health/health.module';
import { usersModule } from './modules/users/users.module';

export function createApiRouter(c: Container): Router {
  const router = Router();
  router.use('/health', healthModule(c));
  router.use('/users', usersModule(c));
  return router;
}
