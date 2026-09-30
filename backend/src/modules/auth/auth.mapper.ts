import type { SessionPayload, UserDto } from '@taskflow/shared';
import type { SignedToken } from '../../common/utils/tokens';

export function toSessionPayload(user: UserDto, access: SignedToken): SessionPayload {
  return { user, accessTokenExpiresAt: access.expiresAt.toISOString() };
}
