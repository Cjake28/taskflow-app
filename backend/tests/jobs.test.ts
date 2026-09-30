import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLogger } from '../src/common/utils/logger';
import { BullJobQueue } from '../src/jobs/job-queue';
import { startWorkers } from '../src/jobs/worker';
import { createUser } from './setup/factories';
import { createHarness, type Harness } from './setup/harness';

const DAY = 86_400_000;
let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

describe('BullMQ queue and workers', () => {
  it('delivers an enqueued job to its processor', async () => {
    const connection = new Redis(process.env.REDIS_URL as string, { maxRetriesPerRequest: null });
    const queue = new BullJobQueue(connection);
    let resolveHandled: (keys: string[]) => void = () => {};
    const handled = new Promise<string[]>((resolve) => {
      resolveHandled = resolve;
    });
    const workers = startWorkers(
      connection,
      { 'storage.delete': async ({ keys }) => resolveHandled(keys) },
      createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
    );

    try {
      await queue.enqueue('storage.delete', { keys: ['images/a.webp'] });
      await expect(handled).resolves.toEqual(['images/a.webp']);
    } finally {
      await workers.close();
      await queue.close();
      await connection.quit();
    }
  });
});

describe('auth cleanup', () => {
  it('deletes only sessions and tokens that ended more than 30 days ago', async () => {
    const { user } = await createUser(h.container.prisma);
    const now = h.clock.now().getTime();
    const ago = (days: number) => new Date(now - days * DAY);
    const session = (data: { expiresAt: Date; revokedAt?: Date }) =>
      h.container.prisma.session.create({
        data: { userId: user.id, refreshTokenHash: 'a'.repeat(64), ...data },
      });

    const oldRevoked = await session({ expiresAt: ago(-10), revokedAt: ago(40) });
    const oldExpired = await session({ expiresAt: ago(35) });
    const recentRevoked = await session({ expiresAt: ago(-10), revokedAt: ago(5) });
    const active = await session({ expiresAt: ago(-7) });

    await h.container.prisma.verificationToken.createMany({
      data: [
        {
          userId: user.id,
          type: 'PASSWORD_RESET',
          tokenHash: 'b'.repeat(64),
          expiresAt: ago(40),
        },
        {
          userId: user.id,
          type: 'PASSWORD_RESET',
          tokenHash: 'c'.repeat(64),
          expiresAt: ago(-1),
        },
      ],
    });

    const removed = await h.container.authCleanup.run();

    expect(removed).toEqual({ sessions: 2, tokens: 1 });
    const remaining = await h.container.prisma.session.findMany({ select: { id: true } });
    expect(remaining.map((s) => s.id).sort()).toEqual([recentRevoked.id, active.id].sort());
    expect(remaining.map((s) => s.id)).not.toContain(oldRevoked.id);
    expect(remaining.map((s) => s.id)).not.toContain(oldExpired.id);
  });
});
