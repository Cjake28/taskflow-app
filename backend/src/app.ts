import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler } from './common/middleware/error-handler';
import { notFound } from './common/middleware/not-found';
import { requestContext } from './common/middleware/request-context';
import { verifyOrigin } from './common/middleware/verify-origin';
import type { Container } from './container';
import { docsModule } from './docs/docs.module';
import { createApiRouter } from './routes';

function parseTrustProxy(value: string): boolean | number | string {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

export function createApp(c: Container): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', parseTrustProxy(c.env.TRUST_PROXY));

  app.use(requestContext(c.logger));
  app.use(helmet());
  app.use(cors({ origin: c.env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());
  app.use(verifyOrigin(c.env.FRONTEND_URL));
  app.use((req, _res, next) => {
    req.valid = {};
    next();
  });

  app.use('/api/v1', createApiRouter(c));
  if (c.env.API_DOCS_ENABLED) app.use('/api/docs', docsModule());

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
