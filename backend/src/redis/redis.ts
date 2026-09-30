import { Redis } from 'ioredis';
import type { Logger } from '../common/utils/logger';

export function createRedis(url: string, logger: Logger): Redis {
  const client = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  client.on('error', (err) => logger.warn({ err }, 'Redis connection error'));
  return client;
}
