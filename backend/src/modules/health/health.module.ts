import { Router } from 'express';
import type { Container } from '../../container';

type Status = 'ok' | 'down';

const probe = (check: Promise<unknown>): Promise<Status> =>
  check.then(
    () => 'ok' as const,
    () => 'down' as const,
  );

export function healthModule(c: Container): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    const [db, redis, storage] = await Promise.all([
      probe(c.prisma.$queryRaw`SELECT 1`),
      probe(c.redis.ping()),
      probe(c.storage.healthCheck()),
    ]);
    const status = db === 'ok' && redis === 'ok' && storage === 'ok' ? 'ok' : 'degraded';
    res.status(status === 'ok' ? 200 : 503).json({ data: { status, db, redis, storage } });
  });
  return router;
}
