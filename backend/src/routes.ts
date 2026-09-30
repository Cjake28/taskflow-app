import { Router } from 'express';
import type { Container } from './container';
import { activitiesModule } from './modules/activities/activities.module';
import { authModule } from './modules/auth/auth.module';
import { healthModule } from './modules/health/health.module';
import { avatarModule, imagesModule, taskImagesModule } from './modules/images/images.module';
import { tasksModule } from './modules/tasks/tasks.module';
import { usersModule } from './modules/users/users.module';

export function createApiRouter(c: Container): Router {
  const router = Router();
  router.use('/health', healthModule(c));
  router.use('/auth', authModule(c));
  // More specific mounts first, so their guards run once.
  router.use('/users/me/avatar', avatarModule(c));
  router.use('/users', usersModule(c));
  router.use('/tasks/:id/images', taskImagesModule(c));
  router.use('/tasks', tasksModule(c));
  router.use('/images', imagesModule(c));
  router.use('/activities', activitiesModule(c));
  return router;
}
