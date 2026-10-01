import { listActivitiesQuerySchema, type ListActivitiesQuery } from '@taskflow/shared';
import { Router, type Request, type Response } from 'express';
import { paginated } from '../../common/http/respond';
import { authenticate, requireUser } from '../../common/middleware/authenticate';
import { byUser, rateLimit } from '../../common/middleware/rate-limit';
import { validate } from '../../common/middleware/validate';
import type { Container } from '../../container';
import type { ActivityService } from './activity.service';

export class ActivitiesController {
  constructor(private readonly activities: ActivityService) {}

  list = async (req: Request, res: Response) => {
    const query = req.valid.query as ListActivitiesQuery;
    const { items, meta } = await this.activities.list(requireUser(req).id, query);
    paginated(res, items, meta);
  };
}

export function activitiesModule(c: Container): Router {
  const controller = new ActivitiesController(c.activities);
  const router = Router();
  router.use(authenticate(c.accessTokens, c.sessions), rateLimit(c.limiters.api, byUser));
  router.get('/', validate({ query: listActivitiesQuerySchema }), controller.list);
  return router;
}
