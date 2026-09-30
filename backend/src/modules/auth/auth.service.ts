import { ErrorCode, type LoginData, type RegisterData } from '@taskflow/shared';
import { HttpException, UnauthorizedException, ValidationException } from '../../common/exceptions';
import type { SessionMeta } from '../../common/http/request-meta';
import type { LoginThrottle } from '../../common/security/login-throttle';
import {
  BREACHED_PASSWORD_MESSAGE,
  type PasswordBreachChecker,
} from '../../common/security/password-breach';
import { hashPassword, verifyAgainstDummyHash, verifyPassword } from '../../common/utils/password';
import { isUniqueViolation, type Db } from '../../database/prisma';
import { assertEmailAndUsernameAvailable } from '../users/user-uniqueness';
import type { UserRecord } from '../users/users.mapper';
import type { EmailVerificationService } from './email-verification.service';
import type { IssuedSession, SessionsService } from './sessions.service';

export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email/username or password.';

export interface AuthResult {
  user: UserRecord;
  session: IssuedSession;
}

export class AuthService {
  constructor(
    private readonly prisma: Db,
    private readonly sessions: SessionsService,
    private readonly breachChecker: PasswordBreachChecker,
    private readonly loginThrottle: LoginThrottle,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  async register(input: RegisterData, meta: SessionMeta): Promise<AuthResult> {
    const identity = { email: input.email, username: input.username };
    await assertEmailAndUsernameAvailable(this.prisma, identity);

    if (await this.breachChecker.isBreached(input.password)) {
      throw new ValidationException([{ field: 'password', message: BREACHED_PASSWORD_MESSAGE }]);
    }

    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.user
      .create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          username: input.username,
          email: input.email,
          passwordHash,
        },
        omit: { passwordHash: false },
      })
      .catch(async (err: unknown) => {
        if (isUniqueViolation(err)) {
          // A concurrent registration won the race; report the precise field.
          await assertEmailAndUsernameAvailable(this.prisma, identity);
          throw new HttpException(409, ErrorCode.CONFLICT, 'This account already exists.');
        }
        throw err;
      });

    const session = await this.sessions.create(user.id, { persistent: false, ...meta });
    await this.emailVerification.requestVerification(user.id);
    return { user, session };
  }

  async login(input: LoginData, meta: SessionMeta): Promise<AuthResult> {
    const ip = meta.ip ?? 'unknown';
    await this.loginThrottle.assertAllowed(input.identifier, ip);

    const user = await this.prisma.user.findFirst({
      where: input.identifier.includes('@')
        ? { email: input.identifier }
        : { username: input.identifier },
      omit: { passwordHash: false },
    });

    const valid = user?.passwordHash
      ? await verifyPassword(user.passwordHash, input.password)
      : await verifyAgainstDummyHash(input.password);

    if (!user || !valid) {
      await this.loginThrottle.recordFailure(input.identifier, ip);
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE, ErrorCode.INVALID_CREDENTIALS);
    }

    await this.loginThrottle.reset(input.identifier, ip);
    const session = await this.sessions.create(user.id, {
      persistent: input.rememberMe,
      ...meta,
    });
    return { user, session };
  }
}
