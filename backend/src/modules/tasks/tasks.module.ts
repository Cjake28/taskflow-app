import type { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { byUser, rateLimit } from '../../common/middleware/rate-limit';
import type { Container } from '../../container';
import { TasksController } from './tasks.controller';
import { createTasksRouter } from './tasks.routes';

export function tasksModule(c: Container): Router {
  return createTasksRouter(new TasksController(c.tasks, c.activities), {
    authenticate: authenticate(c.accessTokens, c.sessions),
    apiLimit: rateLimit(c.limiters.api, byUser),
  });
}
