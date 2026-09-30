import type { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import type { Container } from '../../container';
import { AuthController } from './auth.controller';
import { createAuthRouter } from './auth.routes';

export function authModule(c: Container): Router {
  const controller = new AuthController(
    c.auth,
    c.sessions,
    c.accessTokens,
    c.users,
    c.env,
    c.clock,
  );
  return createAuthRouter(controller, {
    limiters: c.limiters,
    authenticate: authenticate(c.accessTokens, c.sessions),
  });
}
