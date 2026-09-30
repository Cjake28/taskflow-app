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

  it('defaults to local storage with a 7-day image retention', () => {
    expect(loadEnv(base)).toMatchObject({
      STORAGE_DRIVER: 'local',
      STORAGE_LOCAL_ROOT: './storage',
      UPLOAD_MAX_FILE_MB: 5,
      USER_STORAGE_QUOTA_MB: 100,
      IMAGE_RETENTION_DAYS: 7,
      ORPHAN_GRACE_HOURS: 24,
    });
  });

  it('requires the settings of the selected storage driver', () => {
    expect(() => loadEnv({ ...base, STORAGE_DRIVER: 's3', S3_BUCKET: 'b' })).toThrow(
      /S3_REGION: is required when STORAGE_DRIVER=s3/,
    );
    expect(() => loadEnv({ ...base, STORAGE_DRIVER: 'r2' })).toThrow(/R2_ACCOUNT_ID/);
    expect(
      loadEnv({
        ...base,
        STORAGE_DRIVER: 'r2',
        R2_ACCOUNT_ID: 'acc',
        R2_BUCKET: 'taskflow',
        R2_ACCESS_KEY_ID: 'key',
        R2_SECRET_ACCESS_KEY: 'secret',
      }).STORAGE_DRIVER,
    ).toBe('r2');
    expect(() =>
      loadEnv({
        ...base,
        STORAGE_DRIVER: 's3',
        S3_BUCKET: 'b',
        S3_REGION: 'us-east-1',
        S3_ACCESS_KEY_ID: 'k',
        S3_SECRET_ACCESS_KEY: 's',
        S3_ENDPOINT: 'not a url',
      }),
    ).toThrow(/S3_ENDPOINT: must be a URL/);
  });
});
