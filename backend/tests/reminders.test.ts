import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser } from './setup/factories';
import { createHarness, type Harness } from './setup/harness';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

async function signIn(timezone?: string) {
  const { user } = await createUser(h.container.prisma);
  if (timezone) {
    await h.container.prisma.notificationPreference.create({ data: { userId: user.id, timezone } });
  }
  const session = await h.container.sessions.create(user.id, {
    persistent: false,
    userAgent: 'vitest',
    ip: '127.0.0.1',
  });
  return { user, cookie: `tf_access=${session.access.token}` };
}

const at = (offsetMs: number) => new Date(h.clock.now().getTime() + offsetMs).toISOString();

interface ReminderBody {
  id: string;
  kind: string;
  offsetMinutes: number | null;
  remindAt: string | null;
  message: string | null;
  sentAt: string | null;
  status: string;
}

async function createTask(cookie: string, body: Record<string, unknown>) {
  const res = await h.post('/api/v1/tasks').set('Cookie', cookie).send(body);
  expect(res.status).toBe(201);
  return res.body.data as { id: string; reminders: ReminderBody[]; reminderCount: number };
}

describe('task reminders', () => {
  it('saves relative and fixed-time reminders, sorted by when they fire', async () => {
    const { cookie } = await signIn();
    const due = at(48 * HOUR);
    const fixed = at(2 * HOUR);
    const task = await createTask(cookie, {
      title: 'Submit the report',
      dueDate: due,
      hasDueTime: true,
      reminders: [
        { kind: 'relative', offsetMinutes: 60, message: 'Attach the figures' },
        { kind: 'absolute', remindAt: fixed },
        { kind: 'relative', offsetMinutes: 1440 },
      ],
    });

    expect(task.reminderCount).toBe(3);
    expect(task.reminders.map((reminder) => reminder.remindAt)).toEqual([
      fixed,
      new Date(Date.parse(due) - 1440 * MINUTE).toISOString(),
      new Date(Date.parse(due) - 60 * MINUTE).toISOString(),
    ]);
    expect(task.reminders[2]).toMatchObject({
      kind: 'relative',
      offsetMinutes: 60,
      message: 'Attach the figures',
      sentAt: null,
      status: 'scheduled',
    });
    expect(task.reminders[0]).toMatchObject({ kind: 'absolute', offsetMinutes: null });

    const list = await h.get('/api/v1/tasks').set('Cookie', cookie);
    expect(list.body.data[0].reminderCount).toBe(3);
  });

  it('counts date-only tasks back from 9:00 in the user’s time zone', async () => {
    const { cookie } = await signIn('Asia/Manila');
    h.clock.set(new Date('2026-10-01T02:00:00Z'));
    // "Due Oct 5" from a browser in Manila: the end of that local day.
    const task = await createTask(cookie, {
      title: 'Renew the permit',
      dueDate: '2026-10-05T23:59:59.999+08:00',
      hasDueTime: false,
      reminders: [
        { kind: 'relative', offsetMinutes: 0 },
        { kind: 'relative', offsetMinutes: 1440 },
      ],
    });
    expect(task.reminders.map((reminder) => reminder.remindAt)).toEqual([
      '2026-10-04T01:00:00.000Z',
      '2026-10-05T01:00:00.000Z',
    ]);
  });

  it('rejects a fixed-time reminder in the past on the right field', async () => {
    const { cookie } = await signIn();
    const res = await h
      .post('/api/v1/tasks')
      .set('Cookie', cookie)
      .send({
        title: 'Too late',
        reminders: [
          { kind: 'absolute', remindAt: at(HOUR) },
          { kind: 'absolute', remindAt: at(-MINUTE) },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { field: 'reminders.1.remindAt', message: 'Pick a time in the future' },
    ]);
    expect(await h.container.prisma.task.count()).toBe(0);
  });

  it('allows at most five reminders and no duplicates', async () => {
    const { cookie } = await signIn();
    const six = [0, 10, 30, 60, 120, 1440].map((offsetMinutes) => ({
      kind: 'relative',
      offsetMinutes,
    }));
    const tooMany = await h
      .post('/api/v1/tasks')
      .set('Cookie', cookie)
      .send({ title: 'Busy', dueDate: at(10 * HOUR), reminders: six });
    expect(tooMany.status).toBe(400);

    const twice = await h
      .post('/api/v1/tasks')
      .set('Cookie', cookie)
      .send({
        title: 'Twice',
        dueDate: at(10 * HOUR),
        reminders: [
          { kind: 'relative', offsetMinutes: 60 },
          { kind: 'relative', offsetMinutes: 60 },
        ],
      });
    expect(twice.status).toBe(400);
    expect(twice.body.error.details[0]).toEqual({
      field: 'reminders.1',
      message: 'This reminder is already set',
    });
  });

  it('waits for a due date, then follows it when it changes', async () => {
    const { cookie } = await signIn();
    const task = await createTask(cookie, {
      title: 'Plan the offsite',
      reminders: [{ kind: 'relative', offsetMinutes: 30 }],
    });
    expect(task.reminders[0]).toMatchObject({ remindAt: null, status: 'needs-due-date' });

    const due = at(5 * HOUR);
    const dated = await h
      .patch(`/api/v1/tasks/${task.id}`)
      .set('Cookie', cookie)
      .send({ dueDate: due, hasDueTime: true });
    expect(dated.status).toBe(200);
    expect(dated.body.data.reminders[0]).toMatchObject({
      remindAt: new Date(Date.parse(due) - 30 * MINUTE).toISOString(),
      status: 'scheduled',
    });

    const cleared = await h
      .patch(`/api/v1/tasks/${task.id}`)
      .set('Cookie', cookie)
      .send({ dueDate: null });
    expect(cleared.body.data.reminders[0]).toMatchObject({
      remindAt: null,
      status: 'needs-due-date',
    });
  });

  it('replaces the set on update, keeping the sent state of unchanged reminders', async () => {
    const { cookie } = await signIn();
    const task = await createTask(cookie, {
      title: 'Pay rent',
      dueDate: at(3 * HOUR),
      hasDueTime: true,
      reminders: [
        { kind: 'relative', offsetMinutes: 120, message: 'Transfer first' },
        { kind: 'relative', offsetMinutes: 60 },
      ],
    });
    const [early, later] = task.reminders as [ReminderBody, ReminderBody];
    const sentAt = h.clock.now();
    await h.container.prisma.taskReminder.update({ where: { id: early.id }, data: { sentAt } });

    const res = await h
      .patch(`/api/v1/tasks/${task.id}`)
      .set('Cookie', cookie)
      .send({
        reminders: [
          // Same timing, new message: still sent.
          { id: early.id, kind: 'relative', offsetMinutes: 120, message: 'Transfer today' },
          // Same id, new timing: re-armed.
          { id: later.id, kind: 'relative', offsetMinutes: 10 },
          { kind: 'absolute', remindAt: at(HOUR) },
        ],
      });

    expect(res.status).toBe(200);
    const reminders = res.body.data.reminders as ReminderBody[];
    expect(reminders).toHaveLength(3);
    expect(reminders.find((reminder) => reminder.id === early.id)).toMatchObject({
      message: 'Transfer today',
      sentAt: sentAt.toISOString(),
      status: 'sent',
    });
    expect(reminders.find((reminder) => reminder.id === later.id)).toMatchObject({
      offsetMinutes: 10,
      sentAt: null,
      status: 'scheduled',
    });
    expect(res.body.data.reminderCount).toBe(2);

    const removed = await h
      .patch(`/api/v1/tasks/${task.id}`)
      .set('Cookie', cookie)
      .send({ reminders: [] });
    expect(removed.body.data.reminders).toEqual([]);
  });

  it('never takes over another task’s reminder by id', async () => {
    const owner = await signIn();
    const other = await signIn();
    const theirs = await createTask(owner.cookie, {
      title: 'Theirs',
      dueDate: at(10 * HOUR),
      reminders: [{ kind: 'relative', offsetMinutes: 60 }],
    });
    const mine = await createTask(other.cookie, { title: 'Mine', dueDate: at(10 * HOUR) });

    const res = await h
      .patch(`/api/v1/tasks/${mine.id}`)
      .set('Cookie', other.cookie)
      .send({ reminders: [{ id: theirs.reminders[0]!.id, kind: 'relative', offsetMinutes: 5 }] });
    expect(res.status).toBe(200);
    expect(res.body.data.reminders[0].id).not.toBe(theirs.reminders[0]!.id);

    const untouched = await h.container.prisma.taskReminder.findUnique({
      where: { id: theirs.reminders[0]!.id },
    });
    expect(untouched).toMatchObject({ taskId: theirs.id, offsetMinutes: 60 });
  });

  it('deletes reminders with their task', async () => {
    const { cookie } = await signIn();
    const task = await createTask(cookie, {
      title: 'Short-lived',
      dueDate: at(10 * HOUR),
      reminders: [{ kind: 'relative', offsetMinutes: 60 }],
    });
    await h.del(`/api/v1/tasks/${task.id}`).set('Cookie', cookie).expect(204);
    expect(await h.container.prisma.taskReminder.count()).toBe(0);
  });
});
