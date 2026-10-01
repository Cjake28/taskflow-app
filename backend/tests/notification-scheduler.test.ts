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

const tick = () => h.container.notificationScheduler.tick();

async function signIn(prefs: Record<string, unknown> = {}) {
  const { user } = await createUser(h.container.prisma, { firstName: 'Bea' });
  await h.container.prisma.notificationPreference.create({
    data: { userId: user.id, timezone: 'Asia/Manila', ...prefs },
  });
  return { user, cookie: await cookieFor(user.id) };
}

/** A fresh access cookie at the test clock's current time (they expire after 15 minutes). */
async function cookieFor(userId: string) {
  const session = await h.container.sessions.create(userId, {
    persistent: false,
    userAgent: 'vitest',
    ip: '127.0.0.1',
    // The same browser every time, so these sessions do not raise "new sign-in" alerts.
    deviceToken: 'test-device-token-000000000000000000000000000',
  });
  return `tf_access=${session.access.token}`;
}

async function createTask(cookie: string, body: Record<string, unknown>) {
  const res = await h.post('/api/v1/tasks').set('Cookie', cookie).send(body);
  expect(res.status).toBe(201);
  return res.body.data as { id: string };
}

const at = (offsetMs: number) => new Date(h.clock.now().getTime() + offsetMs).toISOString();
const notificationsOf = (userId: string, type?: 'DAILY_DIGEST') =>
  h.container.prisma.notification.findMany({
    where: { userId, ...(type ? { type } : {}) },
    orderBy: { id: 'asc' },
  });

describe('task reminders', () => {
  it('sends a due reminder once, in the app and by email, with the user’s message', async () => {
    const { user, cookie } = await signIn();
    const task = await createTask(cookie, {
      title: 'Call the bank',
      dueDate: at(3 * HOUR),
      hasDueTime: true,
      reminders: [{ kind: 'relative', offsetMinutes: 60, message: 'Ask about the fee' }],
    });

    expect((await tick()).reminders).toBe(0);
    h.clock.advance(2 * HOUR);
    expect((await tick()).reminders).toBe(1);
    expect((await tick()).reminders).toBe(0);

    const [notification] = await notificationsOf(user.id);
    expect(notification).toMatchObject({
      type: 'TASK_REMINDER',
      title: 'Reminder: Call the bank',
      body: 'Ask about the fee',
      taskId: task.id,
      inApp: true,
    });

    expect(h.mail.sent).toHaveLength(1);
    const email = h.mail.sent[0]!;
    expect(email.to).toBe(user.email);
    expect(email.subject).toBe('Reminder: Call the bank');
    expect(email.text).toContain('"Ask about the fee"');
    expect(email.text).toContain(`/tasks/${task.id}`);
    expect(email.text).toMatch(/\/unsubscribe\?token=[\w.-]+/);
    expect(email.headers?.['List-Unsubscribe']).toMatch(
      /^<http.+\/api\/v1\/notifications\/unsubscribe\/one-click\?token=[\w.-]+>$/,
    );
    expect(email.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');

    const details = await h.get(`/api/v1/tasks/${task.id}`).set('Cookie', await cookieFor(user.id));
    expect(details.body.data.reminders[0].status).toBe('sent');
    expect(details.body.data.reminderCount).toBe(0);
  });

  it('holds reminders while the task is completed', async () => {
    const { user, cookie } = await signIn();
    const task = await createTask(cookie, {
      title: 'Water the plants',
      status: 'COMPLETED',
      reminders: [{ kind: 'absolute', remindAt: at(30 * MINUTE) }],
    });
    h.clock.advance(31 * MINUTE);
    await tick();
    expect(await notificationsOf(user.id)).toHaveLength(0);

    await h
      .patch(`/api/v1/tasks/${task.id}`)
      .set('Cookie', await cookieFor(user.id))
      .send({ status: 'TODO' })
      .expect(200);
    await tick();
    expect(await notificationsOf(user.id)).toHaveLength(1);
  });

  it('skips reminders that are long overdue (e.g. after downtime)', async () => {
    const { user, cookie } = await signIn();
    const task = await createTask(cookie, {
      title: 'Old one',
      reminders: [{ kind: 'absolute', remindAt: at(10 * MINUTE) }],
    });
    h.clock.advance(3 * HOUR);
    await tick();
    expect(await notificationsOf(user.id)).toHaveLength(0);
    const details = await h.get(`/api/v1/tasks/${task.id}`).set('Cookie', await cookieFor(user.id));
    expect(details.body.data.reminders[0].status).toBe('missed');
  });

  it('follows the channel settings', async () => {
    const inAppOnly = await signIn({ taskReminderEmail: false });
    const off = await signIn({ taskReminderEmail: false, taskReminderInApp: false });
    for (const { cookie } of [inAppOnly, off]) {
      await createTask(cookie, {
        title: 'Stretch',
        reminders: [{ kind: 'absolute', remindAt: at(5 * MINUTE) }],
      });
    }
    h.clock.advance(6 * MINUTE);
    await tick();

    expect(await notificationsOf(inAppOnly.user.id)).toHaveLength(1);
    expect(await notificationsOf(off.user.id)).toHaveLength(0);
    expect(h.mail.sent).toHaveLength(0);
    // Turned off still counts as handled, so it is not retried later.
    expect(await h.container.prisma.taskReminder.count({ where: { sentAt: null } })).toBe(0);
  });
});

describe('due soon', () => {
  it('warns once before a task without its own reminders is due', async () => {
    const { user, cookie } = await signIn({ dueSoonLeadMinutes: 60 });
    const due = at(90 * MINUTE);
    const task = await createTask(cookie, { title: 'Ship it', dueDate: due, hasDueTime: true });
    await createTask(cookie, {
      title: 'Has a reminder',
      dueDate: due,
      hasDueTime: true,
      reminders: [{ kind: 'relative', offsetMinutes: 5 }],
    });

    expect((await tick()).dueSoon).toBe(0);
    h.clock.advance(31 * MINUTE);
    expect((await tick()).dueSoon).toBe(1);
    expect((await tick()).dueSoon).toBe(0);

    const [notification] = await notificationsOf(user.id);
    expect(notification).toMatchObject({
      type: 'DUE_SOON',
      title: 'Due soon: Ship it',
      taskId: task.id,
    });
    expect(h.mail.sent.map((mail) => mail.subject)).toEqual(['Due soon: Ship it']);

    // Moving the due date later arms a new warning for the new time.
    await h
      .patch(`/api/v1/tasks/${task.id}`)
      .set('Cookie', await cookieFor(user.id))
      .send({ dueDate: at(2 * HOUR), hasDueTime: true })
      .expect(200);
    h.clock.advance(61 * MINUTE);
    expect((await tick()).dueSoon).toBe(1);
  });

  it('ignores completed tasks and users who turned it off', async () => {
    const off = await signIn({ dueSoonInApp: false, dueSoonEmail: false });
    const on = await signIn();
    await createTask(off.cookie, { title: 'A', dueDate: at(30 * MINUTE), hasDueTime: true });
    await createTask(on.cookie, {
      title: 'B',
      dueDate: at(30 * MINUTE),
      hasDueTime: true,
      status: 'COMPLETED',
    });
    expect((await tick()).dueSoon).toBe(0);
  });
});

describe('daily summary', () => {
  it('goes out once at the chosen local time with what is due and overdue', async () => {
    // 07:59 in Manila.
    h.clock.set(new Date('2026-10-01T23:59:00Z'));
    const { user, cookie } = await signIn();
    await createTask(cookie, {
      title: 'Overdue report',
      dueDate: '2026-10-01T09:00:00Z',
      hasDueTime: true,
    });
    await createTask(cookie, {
      title: 'Team lunch',
      dueDate: '2026-10-02T04:00:00Z',
      hasDueTime: true,
    });
    await createTask(cookie, { title: 'Next week', dueDate: '2026-10-09T04:00:00Z' });

    expect((await tick()).digests).toBe(0);
    h.clock.advance(2 * MINUTE);
    expect((await tick()).digests).toBe(1);
    h.clock.advance(10 * MINUTE);
    expect((await tick()).digests).toBe(0);

    const [notification] = await notificationsOf(user.id);
    expect(notification).toMatchObject({
      type: 'DAILY_DIGEST',
      title: 'Your day: 1 due today, 1 overdue',
      data: expect.objectContaining({ date: '2026-10-02', dueToday: 1, overdue: 1 }),
    });
    const email = h.mail.sent[0]!;
    expect(email.subject).toBe('Your day in TaskFlow: 1 task due today and 1 overdue');
    expect(email.text).toContain('Overdue report (Overdue · was due');
    expect(email.text).toContain('Team lunch (Due Fri, Oct 2, 12:00 PM)');
  });

  it('stays quiet when nothing is due, and outside the hour after the chosen time', async () => {
    h.clock.set(new Date('2026-10-02T00:30:00Z')); // 08:30 in Manila
    const empty = await signIn();
    const late = await signIn({ dailyDigestTime: '07:00' });
    await createTask(late.cookie, { title: 'Due today', dueDate: '2026-10-02T09:00:00Z' });

    expect((await tick()).digests).toBe(0);
    expect(await notificationsOf(empty.user.id, 'DAILY_DIGEST')).toHaveLength(0);
    expect(await notificationsOf(late.user.id, 'DAILY_DIGEST')).toHaveLength(0);
  });
});
