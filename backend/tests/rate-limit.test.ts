import express from 'express';
import supertest from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { errorHandler } from '../src/common/middleware/error-handler';
import { rateLimit } from '../src/common/middleware/rate-limit';
import { LoginThrottle } from '../src/common/security/login-throttle';
import { createLimiter, LIMITS } from '../src/common/security/rate-limiters';
import { createHarness, type Harness } from './setup/harness';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

describe('rateLimit middleware', () => {
  it('rejects requests over the limit with 429 and Retry-After', async () => {
    const limiter = createLimiter(
      h.container.redis,
      { keyPrefix: 'test', points: 2, durationSec: 60 },
      1,
    );
    const app = express();
    app.get('/limited', rateLimit(limiter), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);
    const agent = supertest(app);

    expect((await agent.get('/limited')).status).toBe(200);
    expect((await agent.get('/limited')).status).toBe(200);
    const blocked = await agent.get('/limited');

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(blocked.body.error.message).toMatch(
      /^Too many attempts\. Try again in \d+ (second|minute)s?\.$/,
    );
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('createLimiter', () => {
  it('scales budgets except for limiters marked as unscaled', () => {
    const scaled = createLimiter(
      h.container.redis,
      { keyPrefix: 'a', points: 5, durationSec: 60 },
      1000,
    );
    const fixed = createLimiter(
      h.container.redis,
      { keyPrefix: 'b', points: 5, durationSec: 60, scaled: false },
      1000,
    );
    expect(scaled.points).toBe(5000);
    expect(fixed.points).toBe(5);
  });
});

describe('LoginThrottle', () => {
  it('blocks an identifier+IP pair after five failures without affecting other IPs', async () => {
    const throttle = new LoginThrottle(createLimiter(h.container.redis, LIMITS.loginFailures, 1));
    for (let i = 0; i < 5; i += 1) await throttle.recordFailure('ana', '203.0.113.5');

    await expect(throttle.assertAllowed('ana', '203.0.113.5')).rejects.toMatchObject({
      status: 429,
    });
    await expect(throttle.assertAllowed('ana', '198.51.100.7')).resolves.toBeUndefined();

    await throttle.reset('ana', '203.0.113.5');
    await expect(throttle.assertAllowed('ana', '203.0.113.5')).resolves.toBeUndefined();
  });
});
