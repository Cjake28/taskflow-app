import { Router } from 'express';
import type { Container } from './container';
import { activitiesModule } from './modules/activities/activities.module';
import { authModule } from './modules/auth/auth.module';
import { healthModule } from './modules/health/health.module';
import { tasksModule } from './modules/tasks/tasks.module';
import { usersModule } from './modules/users/users.module';

export function createApiRouter(c: Container): Router {
  const router = Router();
  router.use('/health', healthModule(c));
  router.use('/auth', authModule(c));
  router.use('/users', usersModule(c));
  router.use('/tasks', tasksModule(c));
  router.use('/activities', activitiesModule(c));
  return router;
}
