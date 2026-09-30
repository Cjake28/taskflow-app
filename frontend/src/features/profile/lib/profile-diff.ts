import type { UpdateProfileInput, UserDto } from '@taskflow/shared';

export interface ProfileFormValues {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  currentPassword?: string;
}

type ProfileIdentity = Pick<UserDto, 'firstName' | 'lastName' | 'username' | 'email'>;

/** Same normalisation as the shared schemas: usernames and emails are trimmed and lower-cased. */
export function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

export function isEmailChange(user: Pick<UserDto, 'email'>, email: string): boolean {
  const next = normalizeIdentifier(email);
  return next.length > 0 && next !== user.email;
}

/**
 * The PATCH /users/me body: only the fields that actually changed, and `currentPassword` only
 * when the email changes (the one sensitive field). Returns null when nothing changed.
 */
export function buildProfileUpdate(
  user: ProfileIdentity,
  values: ProfileFormValues,
): UpdateProfileInput | null {
  const update: UpdateProfileInput = {};

  const firstName = values.firstName.trim();
  if (firstName !== user.firstName) update.firstName = firstName;

  const lastName = values.lastName.trim();
  if (lastName !== user.lastName) update.lastName = lastName;

  const username = normalizeIdentifier(values.username);
  if (username !== user.username) update.username = username;

  const email = normalizeIdentifier(values.email);
  if (email !== user.email) {
    update.email = email;
    if (values.currentPassword) update.currentPassword = values.currentPassword;
  }

  return Object.keys(update).length > 0 ? update : null;
}

/** Form defaults for a user (also used by "Discard"). */
export function profileFormValues(user: ProfileIdentity): Required<ProfileFormValues> {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    currentPassword: '',
  };
}
