import { describe, expect, it } from 'vitest';

import { buildProfileUpdate, isEmailChange, profileFormValues } from './profile-diff';

const user = {
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  username: 'juan',
  email: 'juan@example.com',
};

describe('buildProfileUpdate', () => {
  it('returns null when nothing changed (including whitespace and letter case)', () => {
    expect(buildProfileUpdate(user, profileFormValues(user))).toBeNull();
    expect(
      buildProfileUpdate(user, {
        firstName: ' Juan ',
        lastName: 'Dela Cruz',
        username: 'JUAN',
        email: ' Juan@Example.com ',
        currentPassword: 'typed but unused',
      }),
    ).toBeNull();
  });

  it('sends only the fields that changed', () => {
    expect(
      buildProfileUpdate(user, {
        ...profileFormValues(user),
        firstName: 'Juana',
        username: 'Juana.D',
      }),
    ).toEqual({ firstName: 'Juana', username: 'juana.d' });
  });

  it('includes the current password only when the email changes', () => {
    expect(
      buildProfileUpdate(user, {
        ...profileFormValues(user),
        lastName: 'Santos',
        currentPassword: 'Secret#123',
      }),
    ).toEqual({ lastName: 'Santos' });

    expect(
      buildProfileUpdate(user, {
        ...profileFormValues(user),
        email: 'New@Example.com',
        currentPassword: 'Secret#123',
      }),
    ).toEqual({ email: 'new@example.com', currentPassword: 'Secret#123' });
  });

  it('leaves the password out when none was typed, so the server can explain it is required', () => {
    expect(
      buildProfileUpdate(user, { ...profileFormValues(user), email: 'new@example.com' }),
    ).toEqual({ email: 'new@example.com' });
  });
});

describe('isEmailChange', () => {
  it('compares normalised addresses and ignores an empty field', () => {
    expect(isEmailChange(user, 'JUAN@example.com ')).toBe(false);
    expect(isEmailChange(user, 'juan@example.org')).toBe(true);
    expect(isEmailChange(user, '   ')).toBe(false);
  });
});
