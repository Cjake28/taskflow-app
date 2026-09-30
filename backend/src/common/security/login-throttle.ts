import type { RateLimiterAbstract } from 'rate-limiter-flexible';
import { TooManyRequestsException } from '../exceptions';
import { isRateLimitRejection, retryAfterSeconds } from './rate-limiters';

/** Counts failed logins per identifier + IP so an attacker cannot lock a victim out from elsewhere. */
export class LoginThrottle {
  constructor(private readonly limiter: RateLimiterAbstract) {}

  private key(identifier: string, ip: string): string {
    return `${identifier}|${ip}`;
  }

  async assertAllowed(identifier: string, ip: string): Promise<void> {
    const state = await this.limiter.get(this.key(identifier, ip));
    if (state && state.remainingPoints <= 0) {
      throw new TooManyRequestsException(retryAfterSeconds(state));
    }
  }

  async recordFailure(identifier: string, ip: string): Promise<void> {
    try {
      await this.limiter.consume(this.key(identifier, ip));
    } catch (err) {
      if (isRateLimitRejection(err)) throw new TooManyRequestsException(retryAfterSeconds(err));
      throw err;
    }
  }

  async reset(identifier: string, ip: string): Promise<void> {
    await this.limiter.delete(this.key(identifier, ip));
  }
}
