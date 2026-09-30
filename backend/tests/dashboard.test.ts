import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser } from './setup/factories';
import { createHarness, type Harness } from './setup/harness';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function signIn() {
  const { user } = await createUser(h.container.prisma);
  const session = await h.container.sessions.create(user.id, {
    persistent: false,
    userAgent: 'vitest',
    ip: '127.0.0.1',
  });
  return { user, cookie: `tf_access=${session.access.token}` };
}

describe('GET /api/v1/dashboard/stats', () => {
  it('returns zeros for a new account', async () => {
    const { cookie } = await signIn();
    const res = await h.get('/api/v1/dashboard/stats').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      total: 0,
      byStatus: { TODO: 0, IN_PROGRESS: 0, COMPLETED: 0 },
      byPriority: { LOW: 0, MEDIUM: 0, HIGH: 0 },
      overdue: 0,
      dueSoon: 0,
      completedLast7Days: 0,
      completionRate: 0,
    });
  });

  it("counts only the caller's tasks from the database", async () => {
    const { user, cookie } = await signIn();
    const other = await signIn();
    const now = h.clock.now().getTime();
    const at = (offset: number) => new Date(now + offset);

    await h.container.prisma.task.createMany({
      data: [
        { userId: user.id, title: 'Overdue', status: 'TODO', priority: 'HIGH', dueDate: at(-DAY) },
        {
          userId: user.id,
          title: 'Due soon',
          status: 'IN_PROGRESS',
          priority: 'MEDIUM',
          dueDate: at(2 * DAY),
        },
        { userId: user.id, title: 'Later', status: 'TODO', priority: 'LOW', dueDate: at(30 * DAY) },
        {
          userId: user.id,
          title: 'Done recently',
          status: 'COMPLETED',
          priority: 'HIGH',
          dueDate: at(-2 * DAY),
          completedAt: at(-HOUR),
        },
        {
          userId: user.id,
          title: 'Done long ago',
          status: 'COMPLETED',
          priority: 'LOW',
          completedAt: at(-20 * DAY),
        },
        { userId: other.user.id, title: 'Not mine', status: 'TODO', dueDate: at(-DAY) },
      ],
    });

    const res = await h.get('/api/v1/dashboard/stats').set('Cookie', cookie);
    expect(res.body.data).toEqual({
      total: 5,
      byStatus: { TODO: 2, IN_PROGRESS: 1, COMPLETED: 2 },
      byPriority: { LOW: 2, MEDIUM: 1, HIGH: 2 },
      overdue: 1,
      dueSoon: 1,
      completedLast7Days: 1,
      completionRate: 40,
    });
  });

  it('requires authentication', async () => {
    expect((await h.get('/api/v1/dashboard/stats')).status).toBe(401);
  });
});
