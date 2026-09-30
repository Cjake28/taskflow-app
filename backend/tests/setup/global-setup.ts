import { execSync } from 'node:child_process';
import { config as loadDotenv } from 'dotenv';

export default function setup(): void {
  const fileEnv = loadDotenv({ path: '.env', quiet: true }).parsed ?? {};
  const databaseUrl = process.env.DATABASE_URL_TEST ?? fileEnv.DATABASE_URL_TEST;
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
