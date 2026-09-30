import type { Redis } from 'ioredis';
import { LoginThrottle } from './common/security/login-throttle';
import {
  HibpPasswordChecker,
  noopBreachChecker,
  type PasswordBreachChecker,
} from './common/security/password-breach';
import { createRateLimiters, type RateLimiters } from './common/security/rate-limiters';
import { systemClock, type Clock } from './common/utils/clock';
import { createLogger, type Logger } from './common/utils/logger';
import { AccessTokenService } from './common/utils/tokens';
import { loadEnv, type Env } from './config/env';
import { createPrismaClient, type Db } from './database/prisma';
import { AuthService } from './modules/auth/auth.service';
import { SessionsService } from './modules/auth/sessions.service';
import { UsersService } from './modules/users/users.service';
import { createRedis } from './redis/redis';

export interface ContainerOverrides {
  env?: Env;
  clock?: Clock;
  logger?: Logger;
  breachChecker?: PasswordBreachChecker;
}

export interface Container {
  env: Env;
  clock: Clock;
  logger: Logger;
  prisma: Db;
  redis: Redis;
  limiters: RateLimiters;
  accessTokens: AccessTokenService;
  sessions: SessionsService;
  users: UsersService;
  breachChecker: PasswordBreachChecker;
  auth: AuthService;
  close(): Promise<void>;
}

export async function createContainer(overrides: ContainerOverrides = {}): Promise<Container> {
  const env = overrides.env ?? loadEnv();
  const clock = overrides.clock ?? systemClock;
  const logger = overrides.logger ?? createLogger(env);
  const prisma = createPrismaClient(env.DATABASE_URL);
  const redis = createRedis(env.REDIS_URL, logger);
  await redis.connect();

  const limiters = createRateLimiters(redis, env.RATE_LIMIT_SCALE);
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
  const users = new UsersService(prisma);
  const breachChecker =
    overrides.breachChecker ??
    (env.HIBP_ENABLED ? new HibpPasswordChecker(logger) : noopBreachChecker);
  const auth = new AuthService(
    prisma,
    sessions,
    breachChecker,
    new LoginThrottle(limiters.loginFailures),
  );

  return {
    env,
    clock,
    logger,
    prisma,
    redis,
    limiters,
    accessTokens,
    sessions,
    users,
    breachChecker,
    auth,
    async close() {
      await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
    },
  };
}
