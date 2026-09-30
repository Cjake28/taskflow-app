import { randomUUID } from 'node:crypto';
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

async function signIn() {
  const { user } = await createUser(h.container.prisma);
  const session = await h.container.sessions.create(user.id, {
    persistent: false,
    userAgent: 'vitest',
    ip: '127.0.0.1',
  });
  return { user, cookie: `tf_access=${session.access.token}` };
}

async function createTask(cookie: string, body: Record<string, unknown>) {
  const res = await h.post('/api/v1/tasks').set('Cookie', cookie).send(body);
  expect(res.status).toBe(201);
  return res.body.data as { id: string; [key: string]: unknown };
}

const iso = (offsetMs: number) => new Date(h.clock.now().getTime() + offsetMs).toISOString();

describe('POST /api/v1/tasks', () => {
  it('creates a task with defaults and records a CREATED activity', async () => {
    const { cookie, user } = await signIn();
    const res = await h
      .post('/api/v1/tasks')
      .set('Cookie', cookie)
      .send({ title: '  Write report  ', description: '   ' });

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/tasks/${res.body.data.id}`);
    expect(res.body.data).toMatchObject({
      title: 'Write report',
      description: null,
      status: 'TODO',
      priority: 'MEDIUM',
      dueDate: null,
      hasDueTime: false,
      completedAt: null,
      isOverdue: false,
      imageCount: 0,
      coverThumbUrl: null,
      images: [],
    });

    const activity = await h.container.prisma.taskActivity.findMany({
      where: { userId: user.id },
    });
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({ action: 'CREATED', taskTitle: 'Write report' });
  });

  it('validates the body and rejects fields the client may not set', async () => {
    const { cookie } = await signIn();
    const res = await h
      .post('/api/v1/tasks')
      .set('Cookie', cookie)
      .send({ title: '', priority: 'URGENT', dueDate: 'tomorrow', userId: randomUUID() });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = (res.body.error.details as Array<{ field: string }>).map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['title', 'priority', 'dueDate', 'userId']));
  });

  it('stamps completedAt when created as completed and places new tasks on top', async () => {
    const { cookie } = await signIn();
    const first = await createTask(cookie, { title: 'First' });
    const second = await createTask(cookie, { title: 'Second' });
    const done = await createTask(cookie, { title: 'Done', status: 'COMPLETED' });

    expect(second.position as number).toBeLessThan(first.position as number);
    expect(done.completedAt).toBe(h.clock.now().toISOString());
  });

  it('requires authentication', async () => {
    const res = await h.post('/api/v1/tasks').send({ title: 'Nope' });
    expect(res.status).toBe(401);
  });
});

describe('ownership', () => {
  it("returns 404 for another user's task on every route", async () => {
    const owner = await signIn();
    const intruder = await signIn();
    const task = await createTask(owner.cookie, { title: 'Private' });
    const url = `/api/v1/tasks/${task.id}`;

    const responses = await Promise.all([
      h.get(url).set('Cookie', intruder.cookie),
      h.patch(url).set('Cookie', intruder.cookie).send({ title: 'Hacked' }),
      h.patch(`${url}/move`).set('Cookie', intruder.cookie).send({ status: 'COMPLETED' }),
      h.del(url).set('Cookie', intruder.cookie),
      h.get(`${url}/activities`).set('Cookie', intruder.cookie),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }

    const list = await h.get('/api/v1/tasks').set('Cookie', intruder.cookie);
    expect(list.body.data).toEqual([]);
    const stored = await h.container.prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.title).toBe('Private');
  });

  it('rejects malformed ids with 400', async () => {
    const { cookie } = await signIn();
    const res = await h.get('/api/v1/tasks/not-a-uuid').set('Cookie', cookie);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/v1/tasks/:id', () => {
  it('updates fields and records UPDATED with a change summary', async () => {
    const { cookie } = await signIn();
    const task = await createTask(cookie, { title: 'Draft', priority: 'LOW' });

    const res = await h
      .patch(`/api/v1/tasks/${task.id}`)
      .set('Cookie', cookie)
      .send({ title: 'Final', priority: 'HIGH', description: 'Notes' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ title: 'Final', priority: 'HIGH', description: 'Notes' });

    const activity = await h.get(`/api/v1/tasks/${task.id}/activities`).set('Cookie', cookie);
    expect(activity.body.data[0]).toMatchObject({
      action: 'UPDATED',
      taskTitle: 'Final',
      changes: {
        title: { from: 'Draft', to: 'Final' },
        priority: { from: 'LOW', to: 'HIGH' },
        description: { changed: true },
      },
    });
  });

  it('sets completedAt on completion and clears it when reopened', async () => {
    const { cookie } = await signIn();
    const task = await createTask(cookie, { title: 'Ship it' });
    const url = `/api/v1/tasks/${task.id}`;

    const done = await h.patch(url).set('Cookie', cookie).send({ status: 'COMPLETED' });
    expect(done.body.data.completedAt).toBe(h.clock.now().toISOString());

    const reopened = await h.patch(url).set('Cookie', cookie).send({ status: 'IN_PROGRESS' });
    expect(reopened.body.data.completedAt).toBeNull();

    const activity = await h.get(`${url}/activities`).set('Cookie', cookie);
    expect(activity.body.data.map((a: { action: string }) => a.action)).toEqual([
      'STATUS_CHANGED',
      'STATUS_CHANGED',
      'CREATED',
    ]);
    expect(activity.body.data[0].changes).toEqual({
      status: { from: 'COMPLETED', to: 'IN_PROGRESS' },
    });
  });

  it('clears the due date and its time flag together', async () => {
    const { cookie } = await signIn();
    const task = await createTask(cookie, {
      title: 'Meeting',
      dueDate: iso(24 * HOUR),
      hasDueTime: true,
    });
    const res = await h
      .patch(`/api/v1/tasks/${task.id}`)
      .set('Cookie', cookie)
      .send({ dueDate: null });
    expect(res.body.data).toMatchObject({ dueDate: null, hasDueTime: false });
  });

  it('writes nothing when the values are unchanged', async () => {
    const { cookie, user } = await signIn();
    const task = await createTask(cookie, { title: 'Same' });
    const res = await h.patch(`/api/v1/tasks/${task.id}`).set('Cookie', cookie).send({
      title: 'Same',
    });
    expect(res.status).toBe(200);
    expect(await h.container.prisma.taskActivity.count({ where: { userId: user.id } })).toBe(1);
  });

  it('rejects an empty body', async () => {
    const { cookie } = await signIn();
    const task = await createTask(cookie, { title: 'Task' });
    const res = await h.patch(`/api/v1/tasks/${task.id}`).set('Cookie', cookie).send({});
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/v1/tasks/:id', () => {
  it('deletes the task, keeps a DELETED activity and soft-deletes its images', async () => {
    const { cookie, user } = await signIn();
    const task = await createTask(cookie, { title: 'Old' });
    const image = await h.container.prisma.image.create({
      data: {
        ownerId: user.id,
        taskId: task.id,
        kind: 'TASK',
        storageKey: `tasks/${randomUUID()}.webp`,
        sizeBytes: 100,
        width: 10,
        height: 10,
      },
    });

    const res = await h.del(`/api/v1/tasks/${task.id}`).set('Cookie', cookie);
    expect(res.status).toBe(204);
    expect(await h.container.prisma.task.count({ where: { id: task.id } })).toBe(0);

    const storedImage = await h.container.prisma.image.findUniqueOrThrow({
      where: { id: image.id },
    });
    expect(storedImage.deletedAt).not.toBeNull();

    const recent = await h.get('/api/v1/activities').set('Cookie', cookie);
    expect(recent.body.data[0]).toMatchObject({
      action: 'DELETED',
      taskTitle: 'Old',
      taskId: null,
    });

    const again = await h.del(`/api/v1/tasks/${task.id}`).set('Cookie', cookie);
    expect(again.status).toBe(404);
  });
});

describe('GET /api/v1/tasks', () => {
  async function seed(cookie: string) {
    await createTask(cookie, { title: 'Buy groceries', priority: 'LOW' });
    await createTask(cookie, {
      title: 'Fix login bug',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      dueDate: iso(-2 * HOUR),
    });
    await createTask(cookie, {
      title: 'Plan sprint',
      priority: 'MEDIUM',
      dueDate: iso(48 * HOUR),
    });
    await createTask(cookie, {
      title: 'Release notes',
      priority: 'HIGH',
      status: 'COMPLETED',
      dueDate: iso(-5 * HOUR),
    });
  }

  const titles = (res: { body: { data: Array<{ title: string }> } }) =>
    res.body.data.map((task) => task.title);

  it('lists newest first with pagination meta', async () => {
    const { cookie } = await signIn();
    await seed(cookie);

    const res = await h.get('/api/v1/tasks?pageSize=3').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(['Release notes', 'Plan sprint', 'Fix login bug']);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 3, total: 4, totalPages: 2 });

    const page2 = await h.get('/api/v1/tasks?pageSize=3&page=2').set('Cookie', cookie);
    expect(titles(page2)).toEqual(['Buy groceries']);
  });

  it('searches titles case-insensitively', async () => {
    const { cookie } = await signIn();
    await seed(cookie);
    const res = await h.get('/api/v1/tasks?search=LOGIN').set('Cookie', cookie);
    expect(titles(res)).toEqual(['Fix login bug']);
  });

  it('filters by status and priority lists', async () => {
    const { cookie } = await signIn();
    await seed(cookie);

    const byStatus = await h.get('/api/v1/tasks?status=TODO,IN_PROGRESS').set('Cookie', cookie);
    expect(byStatus.body.meta.total).toBe(3);

    const both = await h
      .get('/api/v1/tasks?status=IN_PROGRESS,COMPLETED&priority=HIGH&sortBy=title&sortOrder=asc')
      .set('Cookie', cookie);
    expect(titles(both)).toEqual(['Fix login bug', 'Release notes']);
  });

  it('filters overdue tasks and flags them', async () => {
    const { cookie } = await signIn();
    await seed(cookie);
    const res = await h.get('/api/v1/tasks?overdue=true').set('Cookie', cookie);
    expect(titles(res)).toEqual(['Fix login bug']);
    expect(res.body.data[0].isOverdue).toBe(true);
  });

  it('sorts by due date with undated tasks last', async () => {
    const { cookie } = await signIn();
    await seed(cookie);
    const res = await h.get('/api/v1/tasks?sortBy=dueDate&sortOrder=asc').set('Cookie', cookie);
    expect(titles(res)).toEqual(['Release notes', 'Fix login bug', 'Plan sprint', 'Buy groceries']);
  });

  it('sorts by priority', async () => {
    const { cookie } = await signIn();
    await seed(cookie);
    const res = await h.get('/api/v1/tasks?sortBy=priority&sortOrder=desc').set('Cookie', cookie);
    expect(res.body.data.map((t: { priority: string }) => t.priority)).toEqual([
      'HIGH',
      'HIGH',
      'MEDIUM',
      'LOW',
    ]);
  });

  it('rejects invalid query values', async () => {
    const { cookie } = await signIn();
    const res = await h
      .get('/api/v1/tasks?status=DONE&pageSize=500&sortBy=password')
      .set('Cookie', cookie);
    expect(res.status).toBe(400);
    const fields = (res.body.error.details as Array<{ field: string }>).map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['status', 'pageSize', 'sortBy']));
  });

  it('reports image counts and a cover thumbnail', async () => {
    const { cookie, user } = await signIn();
    const task = await createTask(cookie, { title: 'With images' });
    const images = [];
    for (const name of ['a', 'b']) {
      images.push(
        await h.container.prisma.image.create({
          data: {
            ownerId: user.id,
            taskId: task.id,
            kind: 'TASK',
            storageKey: `tasks/${randomUUID()}-${name}.webp`,
            thumbKey: `tasks/${randomUUID()}-${name}-thumb.webp`,
            sizeBytes: 100,
            width: 10,
            height: 10,
          },
        }),
      );
    }
    const res = await h.get('/api/v1/tasks').set('Cookie', cookie);
    expect(res.body.data[0]).toMatchObject({
      imageCount: 2,
      coverThumbUrl: `/api/v1/images/${images[0]!.id}?variant=thumb`,
    });
  });
});

describe('PATCH /api/v1/tasks/:id/move', () => {
  async function column(cookie: string, status: string) {
    const res = await h
      .get(`/api/v1/tasks?status=${status}&sortBy=position&sortOrder=asc`)
      .set('Cookie', cookie);
    return res.body.data.map((task: { title: string }) => task.title) as string[];
  }

  it('reorders within a column using its neighbours', async () => {
    const { cookie } = await signIn();
    const c = await createTask(cookie, { title: 'C' });
    const b = await createTask(cookie, { title: 'B' });
    const a = await createTask(cookie, { title: 'A' });
    expect(await column(cookie, 'TODO')).toEqual(['A', 'B', 'C']);

    const res = await h
      .patch(`/api/v1/tasks/${a.id}/move`)
      .set('Cookie', cookie)
      .send({ status: 'TODO', prevId: b.id, nextId: c.id });
    expect(res.status).toBe(200);
    expect(await column(cookie, 'TODO')).toEqual(['B', 'A', 'C']);

    await h
      .patch(`/api/v1/tasks/${c.id}/move`)
      .set('Cookie', cookie)
      .send({ status: 'TODO', prevId: null, nextId: b.id });
    expect(await column(cookie, 'TODO')).toEqual(['C', 'B', 'A']);
  });

  it('moves across columns and records the status change', async () => {
    const { cookie } = await signIn();
    const task = await createTask(cookie, { title: 'Card' });
    const doneA = await createTask(cookie, { title: 'Done A', status: 'COMPLETED' });

    const res = await h
      .patch(`/api/v1/tasks/${task.id}/move`)
      .set('Cookie', cookie)
      .send({ status: 'COMPLETED', prevId: doneA.id });
    expect(res.body.data).toMatchObject({ status: 'COMPLETED' });
    expect(res.body.data.completedAt).not.toBeNull();
    expect(await column(cookie, 'COMPLETED')).toEqual(['Done A', 'Card']);

    const activity = await h.get(`/api/v1/tasks/${task.id}/activities`).set('Cookie', cookie);
    expect(activity.body.data[0]).toMatchObject({
      action: 'STATUS_CHANGED',
      changes: { status: { from: 'TODO', to: 'COMPLETED' } },
    });
  });

  it('renumbers the column when neighbours are too close', async () => {
    const { cookie, user } = await signIn();
    const a = await createTask(cookie, { title: 'A' });
    const b = await createTask(cookie, { title: 'B' });
    const moving = await createTask(cookie, { title: 'M' });
    await h.container.prisma.task.update({ where: { id: b.id }, data: { position: 1 } });
    await h.container.prisma.task.update({ where: { id: a.id }, data: { position: 1 + 1e-9 } });

    const res = await h
      .patch(`/api/v1/tasks/${moving.id}/move`)
      .set('Cookie', cookie)
      .send({ status: 'TODO', prevId: b.id, nextId: a.id });
    expect(res.status).toBe(200);
    expect(await column(cookie, 'TODO')).toEqual(['B', 'M', 'A']);

    const positions = await h.container.prisma.task.findMany({
      where: { userId: user.id },
      orderBy: { position: 'asc' },
      select: { position: true },
    });
    const gaps = positions.slice(1).map((row, i) => row.position - positions[i]!.position);
    expect(Math.min(...gaps)).toBeGreaterThan(0.1);
  });

  it("rejects neighbours from another column or another user's tasks", async () => {
    const { cookie } = await signIn();
    const other = await signIn();
    const task = await createTask(cookie, { title: 'Mine' });
    const todo = await createTask(cookie, { title: 'Todo' });
    const foreign = await createTask(other.cookie, { title: 'Theirs', status: 'COMPLETED' });

    const wrongColumn = await h
      .patch(`/api/v1/tasks/${task.id}/move`)
      .set('Cookie', cookie)
      .send({ status: 'COMPLETED', prevId: todo.id });
    expect(wrongColumn.status).toBe(400);

    const foreignNeighbour = await h
      .patch(`/api/v1/tasks/${task.id}/move`)
      .set('Cookie', cookie)
      .send({ status: 'COMPLETED', prevId: foreign.id });
    expect(foreignNeighbour.status).toBe(400);
  });
});

describe('GET /api/v1/activities', () => {
  it('returns the latest activity for the user only, honouring the limit', async () => {
    const { cookie } = await signIn();
    const other = await signIn();
    await createTask(other.cookie, { title: 'Not mine' });
    for (const title of ['One', 'Two', 'Three']) await createTask(cookie, { title });

    const res = await h.get('/api/v1/activities?limit=2').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.map((a: { taskTitle: string }) => a.taskTitle)).toEqual(['Three', 'Two']);

    const invalid = await h.get('/api/v1/activities?limit=0').set('Cookie', cookie);
    expect(invalid.status).toBe(400);
  });
});
