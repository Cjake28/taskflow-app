import { activityQuerySchema, type ActivityQuery } from '@taskflow/shared';
import { Router, type Request, type Response } from 'express';
import { ok } from '../../common/http/respond';
import { authenticate, requireUser } from '../../common/middleware/authenticate';
import { byUser, rateLimit } from '../../common/middleware/rate-limit';
import { validate } from '../../common/middleware/validate';
import type { Container } from '../../container';
import type { ActivityService } from './activity.service';

export class ActivitiesController {
  constructor(private readonly activities: ActivityService) {}

  recent = async (req: Request, res: Response) => {
    const { limit } = req.valid.query as ActivityQuery;
    ok(res, await this.activities.listRecent(requireUser(req).id, limit));
  };
}

export function activitiesModule(c: Container): Router {
  const controller = new ActivitiesController(c.activities);
  const router = Router();
  router.use(authenticate(c.accessTokens, c.sessions), rateLimit(c.limiters.api, byUser));
  router.get('/', validate({ query: activityQuerySchema }), controller.recent);
  return router;
}
