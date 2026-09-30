import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';

export function createPrismaClient(databaseUrl: string) {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({
    adapter,
    omit: { user: { passwordHash: true } },
  });
}

export type Db = ReturnType<typeof createPrismaClient>;

/** The client handed to interactive `$transaction` callbacks. */
export type Tx = Omit<Db, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
