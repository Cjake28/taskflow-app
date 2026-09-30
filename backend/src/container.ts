import type { Redis } from 'ioredis';
import { systemClock, type Clock } from './common/utils/clock';
import { createLogger, type Logger } from './common/utils/logger';
import { loadEnv, type Env } from './config/env';
import { createPrismaClient, type Db } from './database/prisma';
import { createRedis } from './redis/redis';

export interface ContainerOverrides {
  env?: Env;
  clock?: Clock;
  logger?: Logger;
}

export interface Container {
  env: Env;
  clock: Clock;
  logger: Logger;
  prisma: Db;
  redis: Redis;
  close(): Promise<void>;
}

export async function createContainer(overrides: ContainerOverrides = {}): Promise<Container> {
  const env = overrides.env ?? loadEnv();
  const clock = overrides.clock ?? systemClock;
  const logger = overrides.logger ?? createLogger(env);
  const prisma = createPrismaClient(env.DATABASE_URL);
  const redis = createRedis(env.REDIS_URL, logger);
  await redis.connect();

  return {
    env,
    clock,
    logger,
    prisma,
    redis,
    async close() {
      await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
    },
  };
}
