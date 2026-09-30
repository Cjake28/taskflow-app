import { ErrorCode, type RegisterData } from '@taskflow/shared';
import { HttpException, ValidationException } from '../../common/exceptions';
import type { SessionMeta } from '../../common/http/request-meta';
import type { LoginThrottle } from '../../common/security/login-throttle';
import {
  BREACHED_PASSWORD_MESSAGE,
  type PasswordBreachChecker,
} from '../../common/security/password-breach';
import { hashPassword } from '../../common/utils/password';
import { isUniqueViolation, type Db } from '../../database/prisma';
import { assertEmailAndUsernameAvailable } from '../users/user-uniqueness';
import type { UserRecord } from '../users/users.mapper';
import type { IssuedSession, SessionsService } from './sessions.service';

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
    return { user, session };
  }
}
