import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';

const base = {
  FRONTEND_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://taskflow:taskflow@localhost:5432/taskflow',
  REDIS_URL: 'redis://:taskflow@localhost:6379/0',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(base);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      ACCESS_TOKEN_TTL_MINUTES: 15,
      REFRESH_TOKEN_TTL_DAYS: 7,
      REFRESH_TOKEN_REMEMBER_TTL_DAYS: 30,
      COOKIE_SECURE: false,
      HIBP_ENABLED: true,
      RATE_LIMIT_SCALE: 1,
      TRUST_PROXY: 'loopback',
    });
  });

  it('parses booleans and numbers from strings', () => {
    const env = loadEnv({ ...base, COOKIE_SECURE: 'true', HIBP_ENABLED: 'false', PORT: '8080' });
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.HIBP_ENABLED).toBe(false);
    expect(env.PORT).toBe(8080);
  });

  it('rejects a JWT secret shorter than 32 characters', () => {
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects a missing database URL', () => {
    const { DATABASE_URL: _omit, ...rest } = base;
    expect(() => loadEnv(rest)).toThrow(/DATABASE_URL/);
  });
});
