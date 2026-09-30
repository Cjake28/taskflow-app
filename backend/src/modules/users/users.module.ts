import type { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { byUser, rateLimit } from '../../common/middleware/rate-limit';
import type { Container } from '../../container';
import { UsersController } from './users.controller';
import { createUsersRouter } from './users.routes';

export function usersModule(c: Container): Router {
  return createUsersRouter(new UsersController(c.users), {
    authenticate: authenticate(c.accessTokens, c.sessions),
    apiLimit: rateLimit(c.limiters.api, byUser),
  });
}
