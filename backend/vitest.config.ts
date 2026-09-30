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
      DATABASE_URL: testDatabaseUrl,
      REDIS_URL: redisUrl.toString(),
      HIBP_ENABLED: 'false',
      RATE_LIMIT_SCALE: '1000',
      COOKIE_SECURE: 'false',
    },
  },
});
