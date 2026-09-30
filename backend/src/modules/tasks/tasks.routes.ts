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

export function createTasksRouter(
  controller: TasksController,
  guards: { authenticate: RequestHandler; apiLimit: RequestHandler },
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
  router.get('/:id/activities', byId, controller.activity);

  return router;
}
