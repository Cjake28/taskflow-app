import { Router, type Request, type Response } from 'express';
import { ok } from '../../common/http/respond';
import { authenticate, requireUser } from '../../common/middleware/authenticate';
import { byUser, rateLimit } from '../../common/middleware/rate-limit';
import type { Container } from '../../container';
import type { DashboardService } from './dashboard.service';

export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  stats = async (req: Request, res: Response) => {
    ok(res, await this.dashboard.stats(requireUser(req).id));
  };
}

export function dashboardModule(c: Container): Router {
  const controller = new DashboardController(c.dashboard);
  const router = Router();
  router.use(authenticate(c.accessTokens, c.sessions), rateLimit(c.limiters.api, byUser));
  router.get('/stats', controller.stats);
  return router;
}
