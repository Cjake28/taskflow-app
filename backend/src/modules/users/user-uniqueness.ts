import { ErrorCode, type FieldError } from '@taskflow/shared';
import { HttpException } from '../../common/exceptions';
import type { Db } from '../../database/prisma';

export async function assertEmailAndUsernameAvailable(
  prisma: Db,
  fields: { email?: string; username?: string },
  excludeUserId?: string,
): Promise<void> {
  const conditions = [
    ...(fields.email ? [{ email: fields.email }] : []),
    ...(fields.username ? [{ username: fields.username }] : []),
  ];
  if (conditions.length === 0) return;

  const existing = await prisma.user.findMany({
    where: { OR: conditions, ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}) },
    select: { email: true, username: true },
  });

  const details: FieldError[] = [];
  if (fields.email && existing.some((user) => user.email === fields.email)) {
    details.push({ field: 'email', message: 'Email is already registered' });
  }
  if (fields.username && existing.some((user) => user.username === fields.username)) {
    details.push({ field: 'username', message: 'Username is already taken' });
  }

  const [first] = details;
  if (!first) return;
  const code = first.field === 'email' ? ErrorCode.EMAIL_TAKEN : ErrorCode.USERNAME_TAKEN;
  throw new HttpException(409, code, first.message, details);
}
