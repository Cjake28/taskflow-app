import { Router } from 'express';
import type { Container } from './container';
import { healthModule } from './modules/health/health.module';

export function createApiRouter(c: Container): Router {
  const router = Router();
  router.use('/health', healthModule(c));
  return router;
}
