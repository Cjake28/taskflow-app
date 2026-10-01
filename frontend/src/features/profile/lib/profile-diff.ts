import type { UpdateProfileInput, UserDto } from '@taskflow/shared';

export interface ProfileFormValues {
  firstName: string;
  lastName: string;
  username: string;
}

type ProfileIdentity = Pick<UserDto, 'firstName' | 'lastName' | 'username'>;

/** Same normalisation as the shared schema: usernames are trimmed and lower-cased. */
export function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * The PATCH /users/me body: only the fields that actually changed, or null when nothing did.
 * (The email has its own confirmed flow: see ChangeEmailDialog.)
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

  return Object.keys(update).length > 0 ? update : null;
}

/** Form defaults for a user (also used by "Discard"). */
export function profileFormValues(user: ProfileIdentity): ProfileFormValues {
  return { firstName: user.firstName, lastName: user.lastName, username: user.username };
}
