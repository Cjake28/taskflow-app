import {
  listNotificationsQuerySchema,
  markNotificationsReadSchema,
  unsubscribeSchema,
  updateNotificationPreferencesSchema,
  type ListNotificationsQuery,
  type MarkNotificationsReadData,
  type UnsubscribeData,
  type UpdateNotificationPreferencesData,
} from '@taskflow/shared';
import { Router, type Request, type Response } from 'express';
import { ok } from '../../common/http/respond';
import { authenticate, requireUser } from '../../common/middleware/authenticate';
import { byUser, rateLimit } from '../../common/middleware/rate-limit';
import { validate } from '../../common/middleware/validate';
import type { Container } from '../../container';
import type { NotificationPreferencesService } from './notification-preferences.service';
import type { NotificationsService } from './notifications.service';
import { INVALID_UNSUBSCRIBE_MESSAGE, type UnsubscribeService } from './unsubscribe.service';
import { BadRequestException } from '../../common/exceptions';

export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly preferences: NotificationPreferencesService,
    private readonly unsubscribes: UnsubscribeService,
  ) {}

  list = async (req: Request, res: Response) => {
    const query = req.valid.query as ListNotificationsQuery;
    const { items, meta } = await this.notifications.list(requireUser(req).id, query);
    res.status(200).json({ data: items, meta });
  };

  unreadCount = async (req: Request, res: Response) => {
    ok(res, { count: await this.notifications.unreadCount(requireUser(req).id) });
  };

  markRead = async (req: Request, res: Response) => {
    const { ids } = req.valid.body as MarkNotificationsReadData;
    ok(res, { unreadCount: await this.notifications.markRead(requireUser(req).id, ids) });
  };

  getPreferences = async (req: Request, res: Response) => {
    ok(res, await this.preferences.getResponse(requireUser(req).id));
  };

  updatePreferences = async (req: Request, res: Response) => {
    const patch = req.valid.body as UpdateNotificationPreferencesData;
    ok(res, await this.preferences.update(requireUser(req).id, patch));
  };

  unsubscribe = async (req: Request, res: Response) => {
    const { token } = req.valid.body as UnsubscribeData;
    ok(res, await this.unsubscribes.unsubscribe(token));
  };

  /** RFC 8058 one-click: the mail client POSTs to the List-Unsubscribe URL. */
  oneClick = async (req: Request, res: Response) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) throw new BadRequestException(INVALID_UNSUBSCRIBE_MESSAGE);
    ok(res, await this.unsubscribes.unsubscribe(token));
  };
}

export function notificationsModule(c: Container): Router {
  const controller = new NotificationsController(
    c.notifications,
    c.notificationPreferences,
    c.unsubscribes,
  );
  const router = Router();

  // Public: email links carry their own signed token.
  const unsubscribeLimit = rateLimit(c.limiters.unsubscribeIp);
  router.post(
    '/unsubscribe',
    unsubscribeLimit,
    validate({ body: unsubscribeSchema }),
    controller.unsubscribe,
  );
  router.post('/unsubscribe/one-click', unsubscribeLimit, controller.oneClick);

  router.use(authenticate(c.accessTokens, c.sessions), rateLimit(c.limiters.api, byUser));
  router.get('/', validate({ query: listNotificationsQuerySchema }), controller.list);
  router.get('/unread-count', controller.unreadCount);
  router.post('/read', validate({ body: markNotificationsReadSchema }), controller.markRead);
  router.get('/preferences', controller.getPreferences);
  router.patch(
    '/preferences',
    validate({ body: updateNotificationPreferencesSchema }),
    controller.updatePreferences,
  );
  return router;
}
