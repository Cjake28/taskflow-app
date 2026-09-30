import { Router } from 'express';
import type { Container } from './container';
import { authModule } from './modules/auth/auth.module';
import { healthModule } from './modules/health/health.module';
import { usersModule } from './modules/users/users.module';

export function createApiRouter(c: Container): Router {
  const router = Router();
  router.use('/health', healthModule(c));
  router.use('/auth', authModule(c));
  router.use('/users', usersModule(c));
  return router;
}
