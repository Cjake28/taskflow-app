import { Redis } from 'ioredis';
import { LoginThrottle } from './common/security/login-throttle';
import {
  HibpPasswordChecker,
  noopBreachChecker,
  type PasswordBreachChecker,
} from './common/security/password-breach';
import { createRateLimiters, type RateLimiters } from './common/security/rate-limiters';
import { systemClock, type Clock } from './common/utils/clock';
import { createLogger, type Logger } from './common/utils/logger';
import { AccessTokenService } from './common/utils/tokens';
import { loadEnv, type Env } from './config/env';
import { createPrismaClient, type Db } from './database/prisma';
import { BullJobQueue, InlineJobQueue, type JobQueue } from './jobs/job-queue';
import type { JobProcessors } from './jobs/job-types';
import { createJobProcessors } from './jobs/processors';
import { registerSchedules } from './jobs/schedules';
import { startWorkers, type WorkerHandle } from './jobs/worker';
import { AccountEmailsService } from './mail/account-emails.service';
import { SmtpMailTransport, type MailTransport } from './mail/mail.transport';
import { ActivityService } from './modules/activities/activity.service';
import { AuthCleanupService } from './modules/auth/auth-cleanup.service';
import { AuthService } from './modules/auth/auth.service';
import { PasswordResetService } from './modules/auth/password-reset.service';
import { RegistrationService } from './modules/auth/registration.service';
import { SessionsService } from './modules/auth/sessions.service';
import { DashboardService } from './modules/dashboard/dashboard.service';
import { AvatarImportService } from './modules/images/avatar-import.service';
import { ImageProcessor } from './modules/images/image-processor';
import { ImagesService } from './modules/images/images.service';
import { OAuthService } from './modules/oauth/oauth.service';
import type { OAuthProvider } from './modules/oauth/providers/oauth-provider';
import { createOAuthProviders } from './modules/oauth/providers/provider-registry';
import { TasksService } from './modules/tasks/tasks.service';
import { EmailChangeService } from './modules/users/email-change.service';
import { UsersService } from './modules/users/users.service';
import { createRedis } from './redis/redis';
import { createStorageDriver } from './storage/create-storage';
import type { StorageDriver } from './storage/storage.driver';

export interface ContainerOverrides {
  env?: Env;
  clock?: Clock;
  logger?: Logger;
  breachChecker?: PasswordBreachChecker;
  mailTransport?: MailTransport;
  storage?: StorageDriver;
  oauthProviders?: OAuthProvider[];
  /** Used to download OAuth profile pictures. */
  fetch?: typeof fetch;
  /** `inline` runs jobs synchronously (tests); `bullmq` uses Redis-backed queues (default). */
  jobs?: 'inline' | 'bullmq';
}

export interface Container {
  env: Env;
  clock: Clock;
  logger: Logger;
  prisma: Db;
  redis: Redis;
  limiters: RateLimiters;
  accessTokens: AccessTokenService;
  sessions: SessionsService;
  users: UsersService;
  breachChecker: PasswordBreachChecker;
  auth: AuthService;
  registration: RegistrationService;
  jobs: JobQueue;
  mailTransport: MailTransport;
  accountEmails: AccountEmailsService;
  passwordReset: PasswordResetService;
  emailChange: EmailChangeService;
  authCleanup: AuthCleanupService;
  activities: ActivityService;
  tasks: TasksService;
  storage: StorageDriver;
  images: ImagesService;
  dashboard: DashboardService;
  avatarImport: AvatarImportService;
  oauth: OAuthService;
  processors: JobProcessors;
  /** Starts BullMQ workers and cron schedules in this process. */
  startWorkers(): Promise<void>;
  close(): Promise<void>;
}

export async function createContainer(overrides: ContainerOverrides = {}): Promise<Container> {
  const env = overrides.env ?? loadEnv();
  const clock = overrides.clock ?? systemClock;
  const logger = overrides.logger ?? createLogger(env);
  const prisma = createPrismaClient(env.DATABASE_URL);
  const redis = createRedis(env.REDIS_URL, logger);
  await redis.connect();

  const jobsMode = overrides.jobs ?? 'bullmq';
  // BullMQ requires its own connection with maxRetriesPerRequest: null.
  const bullConnection =
    jobsMode === 'bullmq' ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }) : null;
  const jobs: JobQueue = bullConnection ? new BullJobQueue(bullConnection) : new InlineJobQueue();

  const limiters = createRateLimiters(redis, env.RATE_LIMIT_SCALE);
  const accessTokens = new AccessTokenService(
    env.JWT_ACCESS_SECRET,
    env.ACCESS_TOKEN_TTL_MINUTES,
    clock,
  );
  const sessions = new SessionsService(prisma, redis, accessTokens, clock, logger, {
    accessTtlMinutes: env.ACCESS_TOKEN_TTL_MINUTES,
    refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    rememberTtlDays: env.REFRESH_TOKEN_REMEMBER_TTL_DAYS,
  });
  const breachChecker =
    overrides.breachChecker ??
    (env.HIBP_ENABLED ? new HibpPasswordChecker(logger) : noopBreachChecker);
  const mailTransport =
    overrides.mailTransport ??
    new SmtpMailTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.MAIL_FROM,
    });
  const accountEmails = new AccountEmailsService(prisma, mailTransport, {
    frontendUrl: env.FRONTEND_URL,
    resetTtlMinutes: env.PASSWORD_RESET_TTL_MINUTES,
  });
  const users = new UsersService(prisma, sessions, jobs, breachChecker, clock);
  // Emailed 6-digit codes share these limits (sign-up and email change).
  const otpSettings = {
    otpTtlMinutes: env.OTP_TTL_MINUTES,
    maxAttempts: 5,
    resendCooldownSeconds: 60,
    maxSends: 5,
  };
  const emailChange = new EmailChangeService(prisma, redis, jobs, accountEmails, clock, {
    ...otpSettings,
    otpSecret: `${env.JWT_ACCESS_SECRET}:email-change-otp`,
  });
  const auth = new AuthService(prisma, sessions, new LoginThrottle(limiters.loginFailures));
  const registration = new RegistrationService(
    prisma,
    redis,
    jobs,
    sessions,
    breachChecker,
    accountEmails,
    clock,
    logger,
    {
      ...otpSettings,
      // A purpose-specific key derived from the server secret.
      otpSecret: `${env.JWT_ACCESS_SECRET}:signup-otp`,
    },
  );
  const passwordReset = new PasswordResetService(
    prisma,
    jobs,
    sessions,
    accountEmails,
    breachChecker,
    clock,
    { ttlMinutes: env.PASSWORD_RESET_TTL_MINUTES, frontendUrl: env.FRONTEND_URL },
  );
  const authCleanup = new AuthCleanupService(prisma, clock);
  const activities = new ActivityService(prisma);
  const storage = overrides.storage ?? createStorageDriver(env);
  const images = new ImagesService(
    prisma,
    storage,
    new ImageProcessor(),
    activities,
    jobs,
    clock,
    logger,
    {
      quotaBytes: env.USER_STORAGE_QUOTA_MB * 1024 * 1024,
      retentionDays: env.IMAGE_RETENTION_DAYS,
      orphanGraceHours: env.ORPHAN_GRACE_HOURS,
    },
  );
  const tasks = new TasksService(prisma, activities, clock, {
    // Without a retention window, a deleted task's images are purged right away.
    afterTaskDeleted:
      env.IMAGE_RETENTION_DAYS === 0 ? () => jobs.enqueue('images.purge', {}) : undefined,
  });

  const dashboard = new DashboardService(prisma, clock);
  const avatarImport = new AvatarImportService(prisma, images, logger, overrides.fetch);
  const oauth = new OAuthService(
    prisma,
    redis,
    overrides.oauthProviders ?? createOAuthProviders(env),
    sessions,
    jobs,
    clock,
    logger,
  );

  const processors = createJobProcessors({
    logger,
    passwordReset,
    accountEmails,
    authCleanup,
    emailChange,
    registration,
    storage,
    images,
    avatarImport,
  });
  if (jobs instanceof InlineJobQueue) jobs.setProcessors(processors);

  let workers: WorkerHandle | null = null;

  return {
    env,
    clock,
    logger,
    prisma,
    redis,
    limiters,
    accessTokens,
    sessions,
    users,
    breachChecker,
    auth,
    jobs,
    mailTransport,
    accountEmails,
    passwordReset,
    emailChange,
    registration,
    authCleanup,
    activities,
    tasks,
    storage,
    images,
    dashboard,
    avatarImport,
    oauth,
    processors,
    async startWorkers() {
      if (!bullConnection || !(jobs instanceof BullJobQueue) || workers) return;
      workers = startWorkers(bullConnection, processors, logger);
      await registerSchedules(jobs);
    },
    async close() {
      await workers?.close();
      await jobs.close();
      storage.close?.();
      await Promise.allSettled([prisma.$disconnect(), redis.quit(), bullConnection?.quit()]);
    },
  };
}
