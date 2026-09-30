import type { UserDto } from '@taskflow/shared';

export interface UserRecord {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  passwordHash: string | null;
  avatarImageId: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

export function toUserResponse(user: UserRecord): UserDto {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarImageId ? `/api/v1/images/${user.avatarImageId}` : null,
    hasPassword: user.passwordHash !== null,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
  };
}
