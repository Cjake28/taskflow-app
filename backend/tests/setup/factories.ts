import { hashPassword } from '../../src/common/utils/password';
import type { Db } from '../../src/database/prisma';

export const DEFAULT_PASSWORD = 'Str0ng!Passw0rd';

let sequence = 0;

export async function createUser(
  prisma: Db,
  overrides: {
    firstName?: string;
    lastName?: string;
    username?: string;
    email?: string;
    password?: string | null;
  } = {},
) {
  sequence += 1;
  const password = overrides.password === undefined ? DEFAULT_PASSWORD : overrides.password;
  const user = await prisma.user.create({
    data: {
      firstName: overrides.firstName ?? 'Test',
      lastName: overrides.lastName ?? `User ${sequence}`,
      username: overrides.username ?? `user${sequence}`,
      email: overrides.email ?? `user${sequence}@example.com`,
      passwordHash: password === null ? null : await hashPassword(password),
    },
  });
  return { user, password };
}
