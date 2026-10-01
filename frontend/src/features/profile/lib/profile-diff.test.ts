import { describe, expect, it } from 'vitest';

import { buildProfileUpdate, profileFormValues } from './profile-diff';

const user = { firstName: 'Juan', lastName: 'Dela Cruz', username: 'juan' };

describe('buildProfileUpdate', () => {
  it('returns null when nothing changed (including whitespace and letter case)', () => {
    expect(buildProfileUpdate(user, profileFormValues(user))).toBeNull();
    expect(
      buildProfileUpdate(user, { firstName: ' Juan ', lastName: 'Dela Cruz', username: 'JUAN' }),
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
});
