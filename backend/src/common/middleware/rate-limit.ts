import type { Request, RequestHandler } from 'express';
import type { RateLimiterAbstract } from 'rate-limiter-flexible';
import { TooManyRequestsException } from '../exceptions';
import { isRateLimitRejection, retryAfterSeconds } from '../security/rate-limiters';

export const byIp = (req: Request): string => req.ip ?? 'unknown';
export const byUser = (req: Request): string => req.user?.id ?? byIp(req);

export function rateLimit(
  limiter: RateLimiterAbstract,
  keyFn: (req: Request) => string = byIp,
): RequestHandler {
  return async (req, _res, next) => {
    try {
      await limiter.consume(keyFn(req));
    } catch (err) {
      if (isRateLimitRejection(err)) throw new TooManyRequestsException(retryAfterSeconds(err));
      throw err;
    }
    next();
  };
}
