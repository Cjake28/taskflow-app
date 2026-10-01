import {
  ErrorCode,
  SIGNUP_OTP_LENGTH,
  type ChangeEmailData,
  type PendingEmailChangeDto,
  type UserDto,
} from '@taskflow/shared';
import type { Redis } from 'ioredis';
import {
  BadRequestException,
  HttpException,
  TooManyRequestsException,
  ValidationException,
} from '../../common/exceptions';
import { generateOtp, hashOtp, otpHashesMatch } from '../../common/security/otp';
import type { Clock } from '../../common/utils/clock';
import { isUniqueViolation, type Db } from '../../database/prisma';
import type { JobQueue } from '../../jobs/job-queue';
import type { AccountEmailsService } from '../../mail/account-emails.service';
import { assertCurrentPassword } from './current-password';
import { assertEmailAndUsernameAvailable } from './user-uniqueness';
import { toUserResponse } from './users.mapper';

export interface EmailChangeConfig {
  otpTtlMinutes: number;
  otpSecret: string;
  maxAttempts: number;
  resendCooldownSeconds: number;
  maxSends: number;
}

interface PendingEmailChange {
  email: string;
  otpHash: string | null;
  expiresAt: number;
  lastSentAt: number;
  sends: number;
}

const recordKey = (userId: string) => `tf:email-change:${userId}`;
const attemptsKey = (userId: string) => `tf:email-change:${userId}:attempts`;
const REDIS_GRACE_SECONDS = 60;

const EXPIRED_MESSAGE = 'This code has expired. Request a new one or start again.';

/**
 * Changing the account email: a code goes to the NEW address and the email
 * only changes once that code is entered, so an account can never be moved
 * to an inbox its owner does not control. The old address is told afterwards.
 */
export class EmailChangeService {
  constructor(
    private readonly prisma: Db,
    private readonly redis: Redis,
    private readonly jobs: JobQueue,
    private readonly emails: AccountEmailsService,
    private readonly clock: Clock,
    private readonly config: EmailChangeConfig,
  ) {}

  async start(userId: string, input: ChangeEmailData): Promise<PendingEmailChangeDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, passwordHash: true },
    });
    if (input.email === user.email) {
      throw new ValidationException([{ field: 'email', message: 'This is already your email' }]);
    }
    if (!user.passwordHash) {
      throw new BadRequestException(
        'Set a password before changing your email.',
        ErrorCode.PASSWORD_NOT_SET,
        [{ field: 'currentPassword', message: 'Set a password before changing your email' }],
      );
    }
    await assertCurrentPassword(user.passwordHash, input.currentPassword, 'email');
    await assertEmailAndUsernameAvailable(this.prisma, { email: input.email }, userId);

    const now = this.clock.now().getTime();
    const record: PendingEmailChange = {
      email: input.email,
      otpHash: null,
      expiresAt: now + this.config.otpTtlMinutes * 60_000,
      lastSentAt: now,
      sends: 1,
    };
    // A new request replaces any earlier pending change.
    await this.save(userId, record);
    await this.redis.del(attemptsKey(userId));
    await this.jobs.enqueue('email.email-change-otp', { userId });
    return this.toDto(record);
  }

  /** Runs in the background worker: the raw code only ever exists in the email. */
  async sendCode(userId: string): Promise<void> {
    const record = await this.load(userId);
    if (!record) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true },
    });
    if (!user) return;

    const code = generateOtp(SIGNUP_OTP_LENGTH);
    await this.save(userId, { ...record, otpHash: this.hashCode(userId, record.email, code) });
    await this.redis.del(attemptsKey(userId));
    await this.emails.sendEmailChangeCode(
      { firstName: user.firstName, email: record.email },
      code,
      this.config.otpTtlMinutes,
    );
  }

  async pending(userId: string): Promise<PendingEmailChangeDto | null> {
    const record = await this.load(userId);
    return record ? this.toDto(record) : null;
  }

  async resend(userId: string): Promise<PendingEmailChangeDto> {
    const record = await this.load(userId);
    if (!record) throw this.expired();

    const now = this.clock.now().getTime();
    const waitMs = record.lastSentAt + this.config.resendCooldownSeconds * 1000 - now;
    if (waitMs > 0) throw new TooManyRequestsException(Math.ceil(waitMs / 1000));
    if (record.sends >= this.config.maxSends) {
      await this.cancel(userId);
      throw new BadRequestException(
        'Too many codes were sent for this change. Please start again.',
        ErrorCode.OTP_ATTEMPTS_EXCEEDED,
      );
    }

    const next: PendingEmailChange = {
      ...record,
      otpHash: null,
      expiresAt: now + this.config.otpTtlMinutes * 60_000,
      lastSentAt: now,
      sends: record.sends + 1,
    };
    await this.save(userId, next);
    await this.jobs.enqueue('email.email-change-otp', { userId });
    return this.toDto(next);
  }

  async verify(userId: string, code: string): Promise<UserDto> {
    const record = await this.load(userId);
    if (!record) throw this.expired();

    const attempts = await this.redis.incr(attemptsKey(userId));
    await this.redis.expire(attemptsKey(userId), this.ttlSeconds());
    const left = this.config.maxAttempts - attempts;
    const correct =
      record.otpHash !== null &&
      otpHashesMatch(record.otpHash, this.hashCode(userId, record.email, code));

    if (left < 0 || (!correct && left <= 0)) {
      await this.cancel(userId);
      throw new BadRequestException(
        'Too many incorrect codes. Please start again.',
        ErrorCode.OTP_ATTEMPTS_EXCEEDED,
      );
    }
    if (!correct) {
      throw new BadRequestException(
        `That code is incorrect. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`,
        ErrorCode.INVALID_OTP,
        [{ field: 'code', message: 'That code is incorrect' }],
      );
    }

    // Single use: only the request that deletes the record applies the change.
    if ((await this.redis.del(recordKey(userId))) !== 1) throw this.expired();
    await this.redis.del(attemptsKey(userId));

    const previous = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });
    const updated = await this.prisma.user
      .update({
        where: { id: userId },
        data: { email: record.email, emailVerifiedAt: this.clock.now() },
        omit: { passwordHash: false },
      })
      .catch(async (err: unknown) => {
        if (isUniqueViolation(err)) {
          // Someone registered the address while the code was pending.
          await assertEmailAndUsernameAvailable(this.prisma, { email: record.email }, userId);
          throw new HttpException(409, ErrorCode.CONFLICT, 'This email is already in use.');
        }
        throw err;
      });

    await this.jobs.enqueue('email.email-changed', { userId, previousEmail: previous.email });
    return toUserResponse(updated);
  }

  async cancel(userId: string): Promise<void> {
    await this.redis.del(recordKey(userId), attemptsKey(userId));
  }

  private async load(userId: string): Promise<PendingEmailChange | null> {
    const raw = await this.redis.get(recordKey(userId));
    if (!raw) return null;
    const record = JSON.parse(raw) as PendingEmailChange;
    return record.expiresAt > this.clock.now().getTime() ? record : null;
  }

  private async save(userId: string, record: PendingEmailChange): Promise<void> {
    await this.redis.set(recordKey(userId), JSON.stringify(record), 'EX', this.ttlSeconds());
  }

  private ttlSeconds(): number {
    return this.config.otpTtlMinutes * 60 + REDIS_GRACE_SECONDS;
  }

  /** Bound to the user AND the target address: a code cannot confirm a different email. */
  private hashCode(userId: string, email: string, code: string): string {
    return hashOtp(this.config.otpSecret, `email-change:${userId}:${email}`, code);
  }

  private expired(): BadRequestException {
    return new BadRequestException(EXPIRED_MESSAGE, ErrorCode.OTP_EXPIRED);
  }

  private toDto(record: PendingEmailChange): PendingEmailChangeDto {
    return {
      email: record.email,
      expiresAt: new Date(record.expiresAt).toISOString(),
      resendAvailableAt: new Date(
        record.lastSentAt + this.config.resendCooldownSeconds * 1000,
      ).toISOString(),
    };
  }
}
