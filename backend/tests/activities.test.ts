import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser } from './setup/factories';
import { createHarness, type Harness } from './setup/harness';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const DAY = 24 * 60 * 60 * 1000;

async function signIn() {
  const { user } = await createUser(h.container.prisma);
  const session = await h.container.sessions.create(user.id, {
    persistent: false,
    userAgent: 'vitest',
    ip: '127.0.0.1',
  });
  return { user, cookie: `tf_access=${session.access.token}` };
}

/** Activity rows at fixed times, newest last in the input. */
async function history(userId: string) {
  const now = Date.now();
  const rows = [
    { taskTitle: 'Write report', action: 'CREATED', at: now - 10 * DAY },
    { taskTitle: 'Write report', action: 'STATUS_CHANGED', at: now - 9 * DAY },
    { taskTitle: 'Plan offsite', action: 'CREATED', at: now - 3 * DAY },
    { taskTitle: 'Plan offsite', action: 'IMAGE_ADDED', at: now - 2 * DAY },
    { taskTitle: 'Old idea', action: 'DELETED', at: now - DAY },
    { taskTitle: 'Plan offsite', action: 'UPDATED', at: now - 60_000 },
  ] as const;
  await h.container.prisma.taskActivity.createMany({
    data: rows.map((row) => ({
      userId,
      taskId: null,
      taskTitle: row.taskTitle,
      action: row.action,
      createdAt: new Date(row.at),
    })),
  });
  return now;
}

const titles = (res: { body: { data: Array<{ taskTitle: string; action: string }> } }) =>
  res.body.data.map((row) => `${row.taskTitle}:${row.action}`);

describe('GET /api/v1/activities', () => {
  it('lists only the caller’s activity, newest first, with pagination meta', async () => {
    const { user, cookie } = await signIn();
    const other = await signIn();
    await history(user.id);
    await history(other.user.id);

    const res = await h.get('/api/v1/activities?pageSize=2').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(['Plan offsite:UPDATED', 'Old idea:DELETED']);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 2, total: 6, totalPages: 3 });

    const page3 = await h.get('/api/v1/activities?pageSize=2&page=3').set('Cookie', cookie);
    expect(titles(page3)).toEqual(['Write report:STATUS_CHANGED', 'Write report:CREATED']);
  });

  it('filters by activity type, date range and task title', async () => {
    const { user, cookie } = await signIn();
    const now = await history(user.id);

    const created = await h.get('/api/v1/activities?action=CREATED').set('Cookie', cookie);
    expect(titles(created)).toEqual(['Plan offsite:CREATED', 'Write report:CREATED']);

    const images = await h
      .get('/api/v1/activities?action=IMAGE_ADDED,IMAGE_REMOVED,DELETED')
      .set('Cookie', cookie);
    expect(titles(images)).toEqual(['Old idea:DELETED', 'Plan offsite:IMAGE_ADDED']);

    const lastWeek = new Date(now - 7 * DAY).toISOString();
    const recent = await h
      .get(`/api/v1/activities?from=${encodeURIComponent(lastWeek)}`)
      .set('Cookie', cookie);
    expect(recent.body.meta.total).toBe(4);

    const window = await h
      .get(
        `/api/v1/activities?from=${encodeURIComponent(new Date(now - 11 * DAY).toISOString())}&to=${encodeURIComponent(new Date(now - 5 * DAY).toISOString())}`,
      )
      .set('Cookie', cookie);
    expect(titles(window)).toEqual(['Write report:STATUS_CHANGED', 'Write report:CREATED']);

    const search = await h.get('/api/v1/activities?search=OFFSITE').set('Cookie', cookie);
    expect(search.body.meta.total).toBe(3);
  });

  it('rejects invalid filters', async () => {
    const { cookie } = await signIn();
    const res = await h
      .get('/api/v1/activities?action=EXPLODED&pageSize=500&from=yesterday')
      .set('Cookie', cookie);
    expect(res.status).toBe(400);
    const fields = (res.body.error.details as Array<{ field: string }>).map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['action', 'pageSize', 'from']));

    const backwards = await h
      .get('/api/v1/activities?from=2026-10-10T00:00:00Z&to=2026-10-01T00:00:00Z')
      .set('Cookie', cookie);
    expect(backwards.body.error.details).toContainEqual({
      field: 'to',
      message: 'The end date must be after the start date',
    });
  });

  it('requires authentication', async () => {
    expect((await h.get('/api/v1/activities')).status).toBe(401);
  });
});
