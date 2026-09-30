import type {
  CreateTaskData,
  ListTasksQuery,
  MoveTaskData,
  UpdateTaskData,
} from '@taskflow/shared';
import type { Request, Response } from 'express';
import { created, noContent, ok, paginated } from '../../common/http/respond';
import { requireUser } from '../../common/middleware/authenticate';
import type { ActivityService } from '../activities/activity.service';
import type { TasksService } from './tasks.service';

export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly activities: ActivityService,
  ) {}

  list = async (req: Request, res: Response) => {
    const { items, meta } = await this.tasks.list(
      requireUser(req).id,
      req.valid.query as ListTasksQuery,
    );
    paginated(res, items, meta);
  };

  create = async (req: Request, res: Response) => {
    const task = await this.tasks.create(requireUser(req).id, req.valid.body as CreateTaskData);
    created(res, task, `/api/v1/tasks/${task.id}`);
  };

  findOne = async (req: Request, res: Response) => {
    ok(res, await this.tasks.findOne(requireUser(req).id, this.taskId(req)));
  };

  update = async (req: Request, res: Response) => {
    const userId = requireUser(req).id;
    ok(res, await this.tasks.update(userId, this.taskId(req), req.valid.body as UpdateTaskData));
  };

  move = async (req: Request, res: Response) => {
    const userId = requireUser(req).id;
    ok(res, await this.tasks.move(userId, this.taskId(req), req.valid.body as MoveTaskData));
  };

  remove = async (req: Request, res: Response) => {
    await this.tasks.remove(requireUser(req).id, this.taskId(req));
    noContent(res);
  };

  activity = async (req: Request, res: Response) => {
    const userId = requireUser(req).id;
    const taskId = this.taskId(req);
    await this.tasks.assertOwned(userId, taskId);
    ok(res, await this.activities.listForTask(userId, taskId));
  };

  private taskId(req: Request): string {
    return (req.valid.params as { id: string }).id;
  }
}
