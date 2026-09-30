import { tmpdir } from 'node:os';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

const fileEnv = loadDotenv({ path: '.env', quiet: true }).parsed ?? {};
const testDatabaseUrl = process.env.DATABASE_URL_TEST ?? fileEnv.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error('DATABASE_URL_TEST must be set (see backend/.env.example) to run backend tests');
}

const redisUrl = new URL(
  process.env.REDIS_URL ?? fileEnv.REDIS_URL ?? 'redis://:taskflow@localhost:6379/0',
);
redisUrl.pathname = '/1';

/**
 * `TEST_STORAGE_DRIVER=s3 S3_TEST_ENDPOINT=http://localhost:8333 npm test` runs the
 * API tests against an S3-compatible service (SeaweedFS from `docker compose --profile s3`).
 */
function s3TestEnv(): Record<string, string> {
  const endpoint = process.env.S3_TEST_ENDPOINT;
  if (process.env.TEST_STORAGE_DRIVER !== 's3' || !endpoint) return {};
  return {
    STORAGE_DRIVER: 's3',
    S3_ENDPOINT: endpoint,
    S3_FORCE_PATH_STYLE: 'true',
    S3_BUCKET: process.env.S3_TEST_BUCKET ?? 'taskflow',
    S3_REGION: process.env.S3_TEST_REGION ?? 'us-east-1',
    S3_ACCESS_KEY_ID: process.env.S3_TEST_ACCESS_KEY_ID ?? 'taskflow',
    S3_SECRET_ACCESS_KEY: process.env.S3_TEST_SECRET_ACCESS_KEY ?? 'taskflow-secret',
  };
}

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['tests/setup/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      ...fileEnv,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      FRONTEND_URL: 'http://localhost:5173',
      TRUST_PROXY: 'loopback',
      DATABASE_URL: testDatabaseUrl,
      REDIS_URL: redisUrl.toString(),
      HIBP_ENABLED: 'false',
      RATE_LIMIT_SCALE: '1000',
      COOKIE_SECURE: 'false',
      STORAGE_DRIVER: 'local',
      STORAGE_LOCAL_ROOT: path.join(tmpdir(), 'taskflow-test-storage'),
      ...s3TestEnv(),
      IMAGE_RETENTION_DAYS: '7',
      UPLOAD_MAX_FILE_MB: '5',
      USER_STORAGE_QUOTA_MB: '100',
    },
  },
});
