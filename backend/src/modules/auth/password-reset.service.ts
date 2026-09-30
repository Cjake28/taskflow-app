import { containsPersonalInfo, ErrorCode } from '@taskflow/shared';
import { BadRequestException, ValidationException } from '../../common/exceptions';
import {
  BREACHED_PASSWORD_MESSAGE,
  type PasswordBreachChecker,
} from '../../common/security/password-breach';
import type { Clock } from '../../common/utils/clock';
import { hashPassword } from '../../common/utils/password';
import { generateSecret, sha256Hex } from '../../common/utils/tokens';
import type { Db } from '../../database/prisma';
import { TokenType } from '../../generated/prisma/client';
import type { JobQueue } from '../../jobs/job-queue';
import type { AccountEmailsService } from '../../mail/account-emails.service';
import type { SessionsService } from './sessions.service';

const INVALID_TOKEN_MESSAGE = 'This reset link is invalid or has already been used.';
const EXPIRED_TOKEN_MESSAGE = 'This reset link has expired.';

export class PasswordResetService {
  constructor(
    private readonly prisma: Db,
    private readonly jobs: JobQueue,
    private readonly sessions: SessionsService,
    private readonly emails: AccountEmailsService,
    private readonly breachChecker: PasswordBreachChecker,
    private readonly clock: Clock,
    private readonly config: { ttlMinutes: number; frontendUrl: string },
  ) {}

  /** Enqueue-first: the request does no lookup, so timing never reveals whether the email exists. */
  async requestReset(email: string): Promise<void> {
    await this.jobs.enqueue('email.password-reset-request', { email });
  }

  /** Runs in the background worker. */
  async processResetRequest(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true },
    });
    if (!user) return;

    const raw = generateSecret();
    const expiresAt = new Date(this.clock.now().getTime() + this.config.ttlMinutes * 60_000);
    await this.prisma.$transaction([
      this.prisma.verificationToken.deleteMany({
        where: { userId: user.id, type: TokenType.PASSWORD_RESET, usedAt: null },
      }),
      this.prisma.verificationToken.create({
        data: {
          userId: user.id,
          type: TokenType.PASSWORD_RESET,
          tokenHash: sha256Hex(raw),
          expiresAt,
        },
      }),
    ]);

    const resetUrl = new URL('/reset-password', this.config.frontendUrl);
    resetUrl.searchParams.set('token', raw);
    await this.emails.sendPasswordReset(user, resetUrl.toString());
  }

  async verify(rawToken: string): Promise<{ userId: string }> {
    const token = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: sha256Hex(rawToken) },
    });
    if (!token || token.type !== TokenType.PASSWORD_RESET || token.usedAt) {
      throw new BadRequestException(INVALID_TOKEN_MESSAGE, ErrorCode.INVALID_RESET_TOKEN);
    }
    if (token.expiresAt <= this.clock.now()) {
      throw new BadRequestException(EXPIRED_TOKEN_MESSAGE, ErrorCode.RESET_TOKEN_EXPIRED);
    }
    return { userId: token.userId };
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const { userId } = await this.verify(rawToken);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { username: true, email: true },
    });

    if (containsPersonalInfo(newPassword, user)) {
      throw new ValidationException([
        { field: 'password', message: 'Password must not contain your username or email' },
      ]);
    }
    if (await this.breachChecker.isBreached(newPassword)) {
      throw new ValidationException([{ field: 'password', message: BREACHED_PASSWORD_MESSAGE }]);
    }

    const passwordHash = await hashPassword(newPassword);
    const now = this.clock.now();

    const revokedSessionIds = await this.prisma.$transaction(async (tx) => {
      // Atomic single-use claim: of two concurrent submissions only one can succeed.
      const claimed = await tx.verificationToken.updateMany({
        where: {
          tokenHash: sha256Hex(rawToken),
          type: TokenType.PASSWORD_RESET,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) {
        throw new BadRequestException(INVALID_TOKEN_MESSAGE, ErrorCode.INVALID_RESET_TOKEN);
      }

      await tx.user.update({ where: { id: userId }, data: { passwordHash } });

      const active = await tx.session.findMany({
        where: { userId, revokedAt: null },
        select: { id: true },
      });
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      return active.map((session) => session.id);
    });

    await this.sessions.clearCache(revokedSessionIds);
    await this.jobs.enqueue('email.password-changed', { userId });
  }
}
