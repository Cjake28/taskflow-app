import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: z.string().min(1).default('loopback'),
  FRONTEND_URL: z.url(),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  REFRESH_TOKEN_REMEMBER_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: booleanString.default(false),
  HIBP_ENABLED: booleanString.default(true),
  RATE_LIMIT_SCALE: z.coerce.number().positive().default(1),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),

  RUN_WORKER_IN_API: booleanString.default(true),

  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: booleanString.default(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().min(3).default('TaskFlow <no-reply@taskflow.local>'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
