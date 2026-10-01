export interface UserDto {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  hasPassword: boolean;
  /** Confirmed with an emailed code at sign-up or email change (OAuth emails count as verified). */
  emailVerified: boolean;
  createdAt: string;
}

/** A sign-up waiting for its emailed code; the account is created only after verification. */
export interface PendingRegistrationDto {
  registrationId: string;
  email: string;
  /** When the current code stops working. */
  expiresAt: string;
  /** Earliest time a new code can be requested. */
  resendAvailableAt: string;
}

/** An email change waiting for the code sent to the new address. */
export interface PendingEmailChangeDto {
  email: string;
  expiresAt: string;
  resendAvailableAt: string;
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
