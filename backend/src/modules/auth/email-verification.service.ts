import { ErrorCode } from '@taskflow/shared';
import { BadRequestException } from '../../common/exceptions';
import type { Clock } from '../../common/utils/clock';
import type { Logger } from '../../common/utils/logger';
import { generateSecret, sha256Hex } from '../../common/utils/tokens';
import type { Db } from '../../database/prisma';
import { TokenType } from '../../generated/prisma/client';
import type { JobQueue } from '../../jobs/job-queue';
import type { AccountEmailsService } from '../../mail/account-emails.service';

const INVALID_TOKEN_MESSAGE = 'This confirmation link is invalid or has already been used.';
const EXPIRED_TOKEN_MESSAGE = 'This confirmation link has expired. Send yourself a new one.';

/**
 * Email confirmation after registration and after an email change. It is a
 * soft check: unverified users can use the app and see a reminder.
 */
export class EmailVerificationService {
  constructor(
    private readonly prisma: Db,
    private readonly jobs: JobQueue,
    private readonly emails: AccountEmailsService,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly config: { ttlHours: number; frontendUrl: string },
  ) {}

  /** Never fails the caller's request: the user can always resend from the app. */
  async requestVerification(userId: string): Promise<void> {
    try {
      await this.jobs.enqueue('email.verify-email', { userId });
    } catch (err) {
      this.logger.error({ err }, 'Could not enqueue the verification email');
    }
  }

  /** Runs in the background worker; the raw token only ever exists in the email. */
  async processVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, emailVerifiedAt: true },
    });
    if (!user || user.emailVerifiedAt) return;

    const raw = generateSecret();
    const expiresAt = new Date(this.clock.now().getTime() + this.config.ttlHours * 60 * 60_000);
    await this.prisma.$transaction([
      this.prisma.verificationToken.deleteMany({
        where: { userId, type: TokenType.EMAIL_VERIFICATION, usedAt: null },
      }),
      this.prisma.verificationToken.create({
        data: {
          userId,
          type: TokenType.EMAIL_VERIFICATION,
          tokenHash: sha256Hex(raw),
          expiresAt,
        },
      }),
    ]);

    const verifyUrl = new URL('/verify-email', this.config.frontendUrl);
    verifyUrl.searchParams.set('token', raw);
    await this.emails.sendEmailVerification(user, verifyUrl.toString(), this.config.ttlHours);
  }

  async verify(rawToken: string): Promise<void> {
    const tokenHash = sha256Hex(rawToken);
    const now = this.clock.now();
    const token = await this.prisma.verificationToken.findUnique({ where: { tokenHash } });
    if (!token || token.type !== TokenType.EMAIL_VERIFICATION || token.usedAt) {
      throw new BadRequestException(INVALID_TOKEN_MESSAGE, ErrorCode.INVALID_VERIFICATION_TOKEN);
    }
    if (token.expiresAt <= now) {
      throw new BadRequestException(EXPIRED_TOKEN_MESSAGE, ErrorCode.VERIFICATION_TOKEN_EXPIRED);
    }

    await this.prisma.$transaction(async (tx) => {
      // Single use, even under concurrent clicks.
      const claimed = await tx.verificationToken.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException(INVALID_TOKEN_MESSAGE, ErrorCode.INVALID_VERIFICATION_TOKEN);
      }
      await tx.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: now } });
    });
  }

  /** Outstanding links stop working when the address they were sent to is replaced. */
  async invalidatePending(userId: string): Promise<void> {
    await this.prisma.verificationToken.deleteMany({
      where: { userId, type: TokenType.EMAIL_VERIFICATION, usedAt: null },
    });
  }
}
