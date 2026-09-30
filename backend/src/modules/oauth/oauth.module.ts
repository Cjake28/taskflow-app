import { oauthProviderParamSchema } from '@taskflow/shared';
import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../../common/middleware/authenticate';
import { byUser, rateLimit } from '../../common/middleware/rate-limit';
import { validate } from '../../common/middleware/validate';
import type { Container } from '../../container';
import { OAuthController } from './oauth.controller';

const controllerFor = (c: Container) => new OAuthController(c.oauth, c.env, c.clock, c.logger);

/** Mounted at `/auth/oauth`. */
export function oauthModule(c: Container): Router {
  const controller = controllerFor(c);
  const limit = rateLimit(c.limiters.oauthIp);
  const router = Router();
  router.get('/providers', controller.providers);
  router.get(
    '/:provider',
    limit,
    optionalAuthenticate(c.accessTokens, c.sessions),
    controller.start,
  );
  router.get('/:provider/callback', limit, controller.callback);
  return router;
}

/** Mounted at `/users/me/accounts`. */
export function linkedAccountsModule(c: Container): Router {
  const controller = controllerFor(c);
  const router = Router();
  router.use(authenticate(c.accessTokens, c.sessions), rateLimit(c.limiters.api, byUser));
  router.get('/', controller.accounts);
  router.delete('/:provider', validate({ params: oauthProviderParamSchema }), controller.unlink);
  return router;
}
