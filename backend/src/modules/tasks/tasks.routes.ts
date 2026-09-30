import {
  createTaskSchema,
  idParamSchema,
  listTasksQuerySchema,
  moveTaskSchema,
  updateTaskSchema,
} from '@taskflow/shared';
import { Router, type RequestHandler } from 'express';
import { validate } from '../../common/middleware/validate';
import type { TasksController } from './tasks.controller';

export interface TaskRouteExtensions {
  /** Mounts extra `/:id/...` routes (task images) on the same guarded router. */
  (router: Router): void;
}

export function createTasksRouter(
  controller: TasksController,
  guards: { authenticate: RequestHandler; apiLimit: RequestHandler },
  extend?: TaskRouteExtensions,
): Router {
  const router = Router();
  router.use(guards.authenticate, guards.apiLimit);

  const byId = validate({ params: idParamSchema });

  router.get('/', validate({ query: listTasksQuerySchema }), controller.list);
  router.post('/', validate({ body: createTaskSchema }), controller.create);
  router.get('/:id', byId, controller.findOne);
  router.patch('/:id', byId, validate({ body: updateTaskSchema }), controller.update);
  router.patch('/:id/move', byId, validate({ body: moveTaskSchema }), controller.move);
  router.delete('/:id', byId, controller.remove);
  router.get('/:id/activity', byId, controller.activity);
  extend?.(router);

  return router;
}
