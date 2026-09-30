import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, isUniqueViolation } from '../src/database/prisma';
import { truncateAll } from './setup/database';

const prisma = createPrismaClient(process.env.DATABASE_URL as string);

beforeEach(() => truncateAll(prisma));
afterAll(() => prisma.$disconnect());

const userData = {
  firstName: 'Ana',
  lastName: 'Reyes',
  username: 'ana',
  email: 'ana@example.com',
  passwordHash: 'not-a-real-hash',
};

describe('database', () => {
  it('omits passwordHash unless explicitly requested', async () => {
    const created = await prisma.user.create({ data: userData });
    expect(created).not.toHaveProperty('passwordHash');

    const withHash = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
      omit: { passwordHash: false },
    });
    expect(withHash.passwordHash).toBe('not-a-real-hash');
  });

  it('generates time-ordered UUID primary keys', async () => {
    const created = await prisma.user.create({ data: userData });
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('enforces unique emails', async () => {
    await prisma.user.create({ data: userData });
    const error = await prisma.user
      .create({ data: { ...userData, username: 'another' } })
      .catch((err: unknown) => err);
    expect(isUniqueViolation(error)).toBe(true);
  });
});
