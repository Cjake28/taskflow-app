import {
  containsPersonalInfo,
  ErrorCode,
  type ChangePasswordData,
  type SessionDto,
  type UpdateProfileData,
  type UserDto,
} from '@taskflow/shared';
import {
  BadRequestException,
  HttpException,
  NotFoundException,
  ValidationException,
} from '../../common/exceptions';
import {
  BREACHED_PASSWORD_MESSAGE,
  type PasswordBreachChecker,
} from '../../common/security/password-breach';
import type { Clock } from '../../common/utils/clock';
import { describeDevice, displayIp } from '../../common/utils/device';
import { hashPassword, verifyPassword } from '../../common/utils/password';
import { isUniqueViolation, type Db } from '../../database/prisma';
import type { JobQueue } from '../../jobs/job-queue';
import type { SessionsService } from '../auth/sessions.service';
import { assertEmailAndUsernameAvailable } from './user-uniqueness';
import { toUserResponse } from './users.mapper';

const WRONG_CURRENT_PASSWORD = 'Current password is incorrect';

export class UsersService {
  constructor(
    private readonly prisma: Db,
    private readonly sessions: SessionsService,
    private readonly jobs: JobQueue,
    private readonly breachChecker: PasswordBreachChecker,
    private readonly clock: Clock,
  ) {}

  async getProfile(userId: string): Promise<UserDto> {
    return toUserResponse(await this.findWithPassword(userId));
  }

  async updateProfile(userId: string, input: UpdateProfileData): Promise<UserDto> {
    const user = await this.findWithPassword(userId);
    const emailChanged = input.email !== undefined && input.email !== user.email;
    const usernameChanged = input.username !== undefined && input.username !== user.username;

    if (emailChanged) {
      if (!user.passwordHash) {
        throw new BadRequestException(
          'Set a password before changing your email.',
          ErrorCode.PASSWORD_NOT_SET,
          [{ field: 'currentPassword', message: 'Set a password before changing your email' }],
        );
      }
      await this.assertCurrentPassword(user.passwordHash, input.currentPassword, 'email');
    }

    const identity = {
      ...(emailChanged ? { email: input.email } : {}),
      ...(usernameChanged ? { username: input.username } : {}),
    };
    await assertEmailAndUsernameAvailable(this.prisma, identity, userId);

    const updated = await this.prisma.user
      .update({
        where: { id: userId },
        data: {
          ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
          ...(usernameChanged ? { username: input.username } : {}),
          ...(emailChanged ? { email: input.email } : {}),
        },
        omit: { passwordHash: false },
      })
      .catch(async (err: unknown) => {
        if (isUniqueViolation(err)) {
          await assertEmailAndUsernameAvailable(this.prisma, identity, userId);
          throw new HttpException(409, ErrorCode.CONFLICT, 'This value is already in use.');
        }
        throw err;
      });
    return toUserResponse(updated);
  }

  async changePassword(
    userId: string,
    currentSessionId: string,
    input: ChangePasswordData,
  ): Promise<void> {
    const user = await this.findWithPassword(userId);
    if (user.passwordHash) {
      await this.assertCurrentPassword(user.passwordHash, input.currentPassword, 'password');
      if (await verifyPassword(user.passwordHash, input.newPassword)) {
        throw new ValidationException([
          { field: 'newPassword', message: 'Choose a password different from your current one' },
        ]);
      }
    }
    if (containsPersonalInfo(input.newPassword, user)) {
      throw new ValidationException([
        { field: 'newPassword', message: 'Password must not contain your username or email' },
      ]);
    }
    if (await this.breachChecker.isBreached(input.newPassword)) {
      throw new ValidationException([{ field: 'newPassword', message: BREACHED_PASSWORD_MESSAGE }]);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
    await this.sessions.revokeAllForUser(userId, { exceptSessionId: currentSessionId });
    await this.jobs.enqueue('email.password-changed', { userId });
  }

  async listSessions(userId: string, currentSessionId: string): Promise<SessionDto[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: this.clock.now() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastUsedAt: true },
    });
    return sessions.map((session) => ({
      id: session.id,
      device: describeDevice(session.userAgent),
      ipAddress: displayIp(session.ipAddress),
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
      current: session.id === currentSessionId,
    }));
  }

  /** Returns true when the revoked session was the caller's own. */
  async revokeSession(
    userId: string,
    sessionId: string,
    currentSessionId: string,
  ): Promise<boolean> {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
      select: { id: true },
    });
    if (!session) throw new NotFoundException('Session');
    await this.sessions.revoke(session.id);
    return session.id === currentSessionId;
  }

  private async findWithPassword(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      omit: { passwordHash: false },
    });
    if (!user) throw new NotFoundException('User');
    return user;
  }

  private async assertCurrentPassword(
    passwordHash: string,
    currentPassword: string | undefined,
    action: 'email' | 'password',
  ): Promise<void> {
    if (!currentPassword) {
      throw new ValidationException([
        {
          field: 'currentPassword',
          message: `Enter your current password to change your ${action}`,
        },
      ]);
    }
    // 400 (not 401): the client treats 401 as an expired session and would try to refresh.
    if (!(await verifyPassword(passwordHash, currentPassword))) {
      throw new BadRequestException(
        `${WRONG_CURRENT_PASSWORD}.`,
        ErrorCode.INVALID_CURRENT_PASSWORD,
        [{ field: 'currentPassword', message: WRONG_CURRENT_PASSWORD }],
      );
    }
  }
}
