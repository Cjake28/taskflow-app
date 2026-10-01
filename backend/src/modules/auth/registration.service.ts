import {
  ErrorCode,
  SIGNUP_OTP_LENGTH,
  type PendingRegistrationDto,
  type RegisterData,
} from '@taskflow/shared';
import type { Redis } from 'ioredis';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  TooManyRequestsException,
  ValidationException,
} from '../../common/exceptions';
import type { SessionMeta } from '../../common/http/request-meta';
import {
  BREACHED_PASSWORD_MESSAGE,
  type PasswordBreachChecker,
} from '../../common/security/password-breach';
import type { Clock } from '../../common/utils/clock';
import type { Logger } from '../../common/utils/logger';
import { hashPassword } from '../../common/utils/password';
import { isUniqueViolation, type Db } from '../../database/prisma';
import type { JobQueue } from '../../jobs/job-queue';
import type { AccountEmailsService } from '../../mail/account-emails.service';
import { assertEmailAndUsernameAvailable } from '../users/user-uniqueness';
import type { AuthResult } from './auth.service';
import type { SessionsService } from './sessions.service';

export interface RegistrationConfig {
  /** How long an emailed code stays valid. */
  otpTtlMinutes: number;
  /** Key for hashing codes (derived from a server secret, never sent to clients). */
  otpSecret: string;
  maxAttempts: number;
  resendCooldownSeconds: number;
  /** Codes that can be sent for one sign-up (the first one included). */
  maxSends: number;
}

/** Pending sign-up kept in Redis until the emailed code is confirmed. */
interface PendingRegistration {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  passwordHash: string;
  otpHash: string | null;
  expiresAt: number;
  lastSentAt: number;
  sends: number;
}

const recordKey = (id: string) => `tf:signup:${id}`;
const attemptsKey = (id: string) => `tf:signup:${id}:attempts`;
const emailKey = (email: string) => `tf:signup-email:${email}`;
/** Redis keeps the record a little longer than the code is valid; expiry is decided by the clock. */
const REDIS_GRACE_SECONDS = 60;

const EXPIRED_MESSAGE = 'This code has expired. Request a new one or start again.';

/**
 * Sign-up with an emailed one-time code. The account is created only after
 * the code is confirmed, so an email address or username is never taken by
 * someone who cannot read that inbox.
 */
export class RegistrationService {
  constructor(
    private readonly prisma: Db,
    private readonly redis: Redis,
    private readonly jobs: JobQueue,
    private readonly sessions: SessionsService,
    private readonly breachChecker: PasswordBreachChecker,
    private readonly emails: AccountEmailsService,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly config: RegistrationConfig,
  ) {}

  /** Validates everything that can be checked up front, then emails a code. */
  async start(input: RegisterData): Promise<PendingRegistrationDto> {
    await assertEmailAndUsernameAvailable(this.prisma, {
      email: input.email,
      username: input.username,
    });
    if (await this.breachChecker.isBreached(input.password)) {
      throw new ValidationException([{ field: 'password', message: BREACHED_PASSWORD_MESSAGE }]);
    }

    const now = this.clock.now().getTime();
    const registrationId = randomUUID();
    const record: PendingRegistration = {
      firstName: input.firstName,
      lastName: input.lastName,
      username: input.username,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      otpHash: null,
      expiresAt: now + this.config.otpTtlMinutes * 60_000,
      lastSentAt: now,
      sends: 1,
    };

    // Starting again with the same email replaces the earlier pending sign-up.
    const previous = await this.redis.get(emailKey(input.email));
    if (previous) await this.redis.del(recordKey(previous), attemptsKey(previous));

    await this.save(registrationId, record);
    await this.redis.set(emailKey(input.email), registrationId, 'EX', this.ttlSeconds());
    await this.jobs.enqueue('email.signup-otp', { registrationId });
    return this.toDto(registrationId, record);
  }

  /** Runs in the background worker: the raw code only ever exists in the email. */
  async sendCode(registrationId: string): Promise<void> {
    const record = await this.load(registrationId);
    if (!record) return;

    const code = randomInt(0, 10 ** SIGNUP_OTP_LENGTH)
      .toString()
      .padStart(SIGNUP_OTP_LENGTH, '0');
    await this.save(registrationId, { ...record, otpHash: this.hashCode(registrationId, code) });
    await this.redis.del(attemptsKey(registrationId));
    await this.emails.sendSignupCode(record, code, this.config.otpTtlMinutes);
  }

  async resend(registrationId: string): Promise<PendingRegistrationDto> {
    const record = await this.load(registrationId);
    if (!record) throw this.expired();

    const now = this.clock.now().getTime();
    const waitMs = record.lastSentAt + this.config.resendCooldownSeconds * 1000 - now;
    if (waitMs > 0) throw new TooManyRequestsException(Math.ceil(waitMs / 1000));
    if (record.sends >= this.config.maxSends) {
      await this.discard(registrationId, record.email);
      throw new BadRequestException(
        'Too many codes were sent for this sign-up. Please start again.',
        ErrorCode.OTP_ATTEMPTS_EXCEEDED,
      );
    }

    const next: PendingRegistration = {
      ...record,
      // The previous code stops working as soon as a new one is requested.
      otpHash: null,
      expiresAt: now + this.config.otpTtlMinutes * 60_000,
      lastSentAt: now,
      sends: record.sends + 1,
    };
    await this.save(registrationId, next);
    await this.redis.expire(emailKey(record.email), this.ttlSeconds());
    await this.jobs.enqueue('email.signup-otp', { registrationId });
    return this.toDto(registrationId, next);
  }

  /** Confirms the code, creates the account and signs the user in. */
  async verify(registrationId: string, code: string, meta: SessionMeta): Promise<AuthResult> {
    const record = await this.load(registrationId);
    if (!record) throw this.expired();

    // Atomic counter: parallel guesses cannot exceed the limit.
    const attempts = await this.redis.incr(attemptsKey(registrationId));
    await this.redis.expire(attemptsKey(registrationId), this.ttlSeconds());
    if (attempts > this.config.maxAttempts) {
      await this.discard(registrationId, record.email);
      throw new BadRequestException(
        'Too many incorrect codes. Please start again.',
        ErrorCode.OTP_ATTEMPTS_EXCEEDED,
      );
    }

    if (!record.otpHash || !this.matches(record.otpHash, this.hashCode(registrationId, code))) {
      const left = this.config.maxAttempts - attempts;
      if (left <= 0) {
        await this.discard(registrationId, record.email);
        throw new BadRequestException(
          'Too many incorrect codes. Please start again.',
          ErrorCode.OTP_ATTEMPTS_EXCEEDED,
        );
      }
      throw new BadRequestException(
        `That code is incorrect. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`,
        ErrorCode.INVALID_OTP,
        [{ field: 'code', message: 'That code is incorrect' }],
      );
    }

    // Single use: only the request that deletes the record creates the account.
    const claimed = await this.redis.del(recordKey(registrationId));
    if (claimed !== 1) throw this.expired();
    await this.redis.del(attemptsKey(registrationId), emailKey(record.email));

    const identity = { email: record.email, username: record.username };
    const user = await this.prisma.user
      .create({
        data: {
          firstName: record.firstName,
          lastName: record.lastName,
          username: record.username,
          email: record.email,
          passwordHash: record.passwordHash,
          emailVerifiedAt: this.clock.now(),
        },
        omit: { passwordHash: false },
      })
      .catch(async (err: unknown) => {
        if (isUniqueViolation(err)) {
          // Someone confirmed the same email or username first.
          await assertEmailAndUsernameAvailable(this.prisma, identity);
          throw new HttpException(409, ErrorCode.CONFLICT, 'This account already exists.');
        }
        throw err;
      });

    const session = await this.sessions.create(user.id, { persistent: false, ...meta });
    this.logger.info({ userId: user.id }, 'Account created after email confirmation');
    return { user, session };
  }

  private async load(registrationId: string): Promise<PendingRegistration | null> {
    const raw = await this.redis.get(recordKey(registrationId));
    if (!raw) return null;
    const record = JSON.parse(raw) as PendingRegistration;
    return record.expiresAt > this.clock.now().getTime() ? record : null;
  }

  private async save(registrationId: string, record: PendingRegistration): Promise<void> {
    await this.redis.set(
      recordKey(registrationId),
      JSON.stringify(record),
      'EX',
      this.ttlSeconds(),
    );
  }

  private async discard(registrationId: string, email: string): Promise<void> {
    await this.redis.del(recordKey(registrationId), attemptsKey(registrationId), emailKey(email));
  }

  private ttlSeconds(): number {
    return this.config.otpTtlMinutes * 60 + REDIS_GRACE_SECONDS;
  }

  private hashCode(registrationId: string, code: string): string {
    // Keyed and bound to this sign-up: a leaked hash cannot be brute-forced offline.
    return createHmac('sha256', this.config.otpSecret)
      .update(`${registrationId}:${code}`)
      .digest('hex');
  }

  private matches(expected: string, actual: string): boolean {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(actual, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private expired(): BadRequestException {
    return new BadRequestException(EXPIRED_MESSAGE, ErrorCode.OTP_EXPIRED);
  }

  private toDto(registrationId: string, record: PendingRegistration): PendingRegistrationDto {
    return {
      registrationId,
      email: record.email,
      expiresAt: new Date(record.expiresAt).toISOString(),
      resendAvailableAt: new Date(
        record.lastSentAt + this.config.resendCooldownSeconds * 1000,
      ).toISOString(),
    };
  }
}
