import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');
const optionalString = z.string().trim().default('');

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

  STORAGE_DRIVER: z.enum(['local', 's3', 'r2']).default('local'),
  STORAGE_LOCAL_ROOT: z.string().min(1).default('./storage'),
  S3_BUCKET: optionalString,
  S3_REGION: optionalString,
  S3_ENDPOINT: optionalString,
  S3_FORCE_PATH_STYLE: booleanString.default(false),
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  R2_ACCOUNT_ID: optionalString,
  R2_BUCKET: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,

  UPLOAD_MAX_FILE_MB: z.coerce.number().positive().max(50).default(5),
  USER_STORAGE_QUOTA_MB: z.coerce.number().positive().default(100),
  IMAGE_RETENTION_DAYS: z.coerce.number().int().min(0).default(7),
  ORPHAN_GRACE_HOURS: z.coerce.number().positive().default(24),
});

/** Variables each storage driver needs; checked at startup so a bad setup fails fast. */
const DRIVER_REQUIREMENTS = {
  local: [],
  s3: ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'],
  r2: ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'],
} as const satisfies Record<string, ReadonlyArray<keyof z.infer<typeof envSchema>>>;

const refinedSchema = envSchema.superRefine((env, ctx) => {
  for (const key of DRIVER_REQUIREMENTS[env.STORAGE_DRIVER]) {
    if (!env[key]) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `is required when STORAGE_DRIVER=${env.STORAGE_DRIVER}`,
      });
    }
  }
  if (env.S3_ENDPOINT && !URL.canParse(env.S3_ENDPOINT)) {
    ctx.addIssue({ code: 'custom', path: ['S3_ENDPOINT'], message: 'must be a URL' });
  }
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Env {
  const result = refinedSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
