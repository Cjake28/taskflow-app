import { ErrorCode, type LoginData } from '@taskflow/shared';
import { UnauthorizedException } from '../../common/exceptions';
import type { SessionMeta } from '../../common/http/request-meta';
import type { LoginThrottle } from '../../common/security/login-throttle';
import { verifyAgainstDummyHash, verifyPassword } from '../../common/utils/password';
import type { Db } from '../../database/prisma';
import type { UserRecord } from '../users/users.mapper';
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
    private readonly loginThrottle: LoginThrottle,
  ) {}

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
