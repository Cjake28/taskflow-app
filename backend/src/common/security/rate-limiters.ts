import type { Redis } from 'ioredis';
import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';

export interface LimiterSpec {
  keyPrefix: string;
  points: number;
  durationSec: number;
  /** When false, RATE_LIMIT_SCALE does not apply (used for brute-force protection). */
  scaled?: boolean;
}

export const LIMITS = {
  loginFailures: { keyPrefix: 'login-fail', points: 5, durationSec: 15 * 60, scaled: false },
  loginIp: { keyPrefix: 'login-ip', points: 50, durationSec: 15 * 60 },
  register: { keyPrefix: 'register-ip', points: 5, durationSec: 60 * 60 },
  forgotIp: { keyPrefix: 'forgot-ip', points: 5, durationSec: 15 * 60 },
  forgotEmail: { keyPrefix: 'forgot-email', points: 3, durationSec: 60 * 60 },
  resetIp: { keyPrefix: 'reset-ip', points: 10, durationSec: 15 * 60 },
  refreshIp: { keyPrefix: 'refresh-ip', points: 30, durationSec: 60 },
  upload: { keyPrefix: 'upload-user', points: 30, durationSec: 15 * 60 },
  imageRead: { keyPrefix: 'image-read-user', points: 600, durationSec: 60 },
  api: { keyPrefix: 'api', points: 300, durationSec: 15 * 60 },
} satisfies Record<string, LimiterSpec>;

export type RateLimiters = { [K in keyof typeof LIMITS]: RateLimiterRedis };

export function createLimiter(redis: Redis, spec: LimiterSpec, scale: number): RateLimiterRedis {
  const points = spec.scaled === false ? spec.points : Math.max(1, Math.round(spec.points * scale));
  return new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: `tf:rl:${spec.keyPrefix}`,
    points,
    duration: spec.durationSec,
    insuranceLimiter: new RateLimiterMemory({
      keyPrefix: `tf:rl:mem:${spec.keyPrefix}`,
      points,
      duration: spec.durationSec,
    }),
  });
}

export function createRateLimiters(redis: Redis, scale: number): RateLimiters {
  const entries = Object.entries(LIMITS).map(([name, spec]) => [
    name,
    createLimiter(redis, spec, scale),
  ]);
  return Object.fromEntries(entries) as RateLimiters;
}

export function isRateLimitRejection(value: unknown): value is RateLimiterRes {
  return value instanceof RateLimiterRes;
}

export function retryAfterSeconds(res: RateLimiterRes): number {
  return Math.max(1, Math.ceil(res.msBeforeNext / 1000));
}
