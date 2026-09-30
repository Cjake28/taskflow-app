export interface UserDto {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  hasPassword: boolean;
  /** False until the address is confirmed through the emailed link (OAuth emails count as verified). */
  emailVerified: boolean;
  createdAt: string;
}

export interface SessionPayload {
  user: UserDto;
  accessTokenExpiresAt: string;
}

export interface SessionDto {
  id: string;
  /** Friendly name such as "Chrome on Windows". */
  device: string;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  current: boolean;
}
