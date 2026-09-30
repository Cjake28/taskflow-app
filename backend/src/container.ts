import type { Redis } from 'ioredis';
import { systemClock, type Clock } from './common/utils/clock';
import { createLogger, type Logger } from './common/utils/logger';
import { AccessTokenService } from './common/utils/tokens';
import { loadEnv, type Env } from './config/env';
import { createPrismaClient, type Db } from './database/prisma';
import { SessionsService } from './modules/auth/sessions.service';
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
  accessTokens: AccessTokenService;
  sessions: SessionsService;
  close(): Promise<void>;
}

export async function createContainer(overrides: ContainerOverrides = {}): Promise<Container> {
  const env = overrides.env ?? loadEnv();
  const clock = overrides.clock ?? systemClock;
  const logger = overrides.logger ?? createLogger(env);
  const prisma = createPrismaClient(env.DATABASE_URL);
  const redis = createRedis(env.REDIS_URL, logger);
  await redis.connect();

  const accessTokens = new AccessTokenService(
    env.JWT_ACCESS_SECRET,
    env.ACCESS_TOKEN_TTL_MINUTES,
    clock,
  );
  const sessions = new SessionsService(prisma, redis, accessTokens, clock, logger, {
    accessTtlMinutes: env.ACCESS_TOKEN_TTL_MINUTES,
    refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    rememberTtlDays: env.REFRESH_TOKEN_REMEMBER_TTL_DAYS,
  });

  return {
    env,
    clock,
    logger,
    prisma,
    redis,
    accessTokens,
    sessions,
    async close() {
      await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
    },
  };
}
