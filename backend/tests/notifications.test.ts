import supertest from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUser } from './setup/factories';
import { createHarness, type Harness } from './setup/harness';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

async function signIn() {
  const { user } = await createUser(h.container.prisma, { email: `bea${Date.now()}@example.com` });
  const session = await h.container.sessions.create(user.id, {
    persistent: false,
    userAgent: 'vitest',
    ip: '127.0.0.1',
  });
  return { user, cookie: `tf_access=${session.access.token}` };
}

async function seed(userId: string, count: number, extra: { inApp?: boolean } = {}) {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = await h.container.prisma.notification.create({
      data: {
        userId,
        type: 'TASK_REMINDER',
        title: `Reminder ${index + 1}`,
        inApp: extra.inApp ?? true,
      },
    });
    ids.push(row.id);
  }
  return ids;
}

describe('GET /api/v1/notifications', () => {
  it('lists in-app notifications newest first, by cursor, with the unread count', async () => {
    const { user, cookie } = await signIn();
    const other = await signIn();
    await seed(user.id, 3);
    await seed(user.id, 1, { inApp: false });
    await seed(other.user.id, 2);

    const first = await h.get('/api/v1/notifications?limit=2').set('Cookie', cookie);
    expect(first.status).toBe(200);
    expect(first.body.data.map((item: { title: string }) => item.title)).toEqual([
      'Reminder 3',
      'Reminder 2',
    ]);
    expect(first.body.meta).toEqual({ nextCursor: first.body.data[1].id, unreadCount: 3 });

    const second = await h
      .get(`/api/v1/notifications?limit=2&cursor=${first.body.meta.nextCursor}`)
      .set('Cookie', cookie);
    expect(second.body.data.map((item: { title: string }) => item.title)).toEqual(['Reminder 1']);
    expect(second.body.meta.nextCursor).toBeNull();
  });

  it('marks chosen or all notifications as read, only for their owner', async () => {
    const { user, cookie } = await signIn();
    const other = await signIn();
    const [a, b] = await seed(user.id, 3);
    const [theirs] = await seed(other.user.id, 1);

    const some = await h
      .post('/api/v1/notifications/read')
      .set('Cookie', cookie)
      .send({ ids: [a, theirs] });
    expect(some.body.data).toEqual({ unreadCount: 2 });
    expect(await h.container.prisma.notification.count({ where: { readAt: { not: null } } })).toBe(
      1,
    );

    const unread = await h.get('/api/v1/notifications?unread=true').set('Cookie', cookie);
    expect(unread.body.data.map((item: { id: string }) => item.id)).not.toContain(a);
    expect(unread.body.data.map((item: { id: string }) => item.id)).toContain(b);

    const all = await h.post('/api/v1/notifications/read').set('Cookie', cookie).send({});
    expect(all.body.data).toEqual({ unreadCount: 0 });
    const count = await h.get('/api/v1/notifications/unread-count').set('Cookie', cookie);
    expect(count.body.data).toEqual({ count: 0 });
    const otherCount = await h
      .get('/api/v1/notifications/unread-count')
      .set('Cookie', other.cookie);
    expect(otherCount.body.data).toEqual({ count: 1 });
  });

  it('requires sign-in', async () => {
    await h.get('/api/v1/notifications').expect(401);
    await h.post('/api/v1/notifications/read').send({}).expect(401);
  });
});

describe('notification preferences', () => {
  it('starts from the defaults and saves partial changes', async () => {
    const { cookie } = await signIn();
    const initial = await h.get('/api/v1/notifications/preferences').set('Cookie', cookie);
    expect(initial.body.data).toEqual({
      timezone: 'UTC',
      timezoneAuto: true,
      taskReminder: { inApp: true, email: true },
      dueSoon: { inApp: true, email: true, leadMinutes: 60 },
      dailyDigest: { inApp: true, email: true, time: '08:00' },
      newSignIn: { inApp: true, email: true },
    });

    const saved = await h
      .patch('/api/v1/notifications/preferences')
      .set('Cookie', cookie)
      .send({ timezone: 'Asia/Manila', dailyDigest: { time: '07:30', email: false } });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({
      timezone: 'Asia/Manila',
      dailyDigest: { inApp: true, email: false, time: '07:30' },
    });

    const again = await h
      .patch('/api/v1/notifications/preferences')
      .set('Cookie', cookie)
      .send({ dueSoon: { leadMinutes: 1440 } });
    expect(again.body.data).toMatchObject({
      timezone: 'Asia/Manila',
      dueSoon: { leadMinutes: 1440 },
      dailyDigest: { email: false, time: '07:30' },
    });
  });

  it('rejects unknown time zones and lead times', async () => {
    const { cookie } = await signIn();
    const res = await h
      .patch('/api/v1/notifications/preferences')
      .set('Cookie', cookie)
      .send({ timezone: 'Mars/Olympus', dueSoon: { leadMinutes: 7 } });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((detail: { field: string }) => detail.field)).toEqual([
      'timezone',
      'dueSoon.leadMinutes',
    ]);
  });
});

describe('email unsubscribe', () => {
  async function reminderEmailFor(userId: string) {
    const task = await h.container.prisma.task.create({ data: { userId, title: 'Stand-up' } });
    const created = await h.container.notifications.notify({
      userId,
      type: 'TASK_REMINDER',
      title: 'Reminder: Stand-up',
      taskId: task.id,
    });
    expect(created).not.toBeNull();
    return h.mail.sent.at(-1)!;
  }

  const tokenFrom = (text: string) => text.match(/unsubscribe\?token=([\w.-]+)/)![1]!;

  it('turns off that type of email with the link from the email, without signing in', async () => {
    const { user, cookie } = await signIn();
    const email = await reminderEmailFor(user.id);

    const res = await h
      .post('/api/v1/notifications/unsubscribe')
      .send({ token: tokenFrom(email.text) });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      type: 'TASK_REMINDER',
      email: `${user.email[0]}***@example.com`,
    });

    const prefs = await h.get('/api/v1/notifications/preferences').set('Cookie', cookie);
    expect(prefs.body.data.taskReminder).toEqual({ inApp: true, email: false });
    expect(prefs.body.data.dueSoon.email).toBe(true);

    // Later reminders still show in the app but are not emailed.
    h.mail.clear();
    const lunch = await h.container.prisma.task.create({
      data: { userId: user.id, title: 'Lunch' },
    });
    const later = await h.container.notifications.notify({
      userId: user.id,
      type: 'TASK_REMINDER',
      title: 'Reminder: Lunch',
      taskId: lunch.id,
    });
    expect(later).toMatchObject({ inApp: true });
    expect(h.mail.sent).toHaveLength(0);
  });

  it('supports one-click unsubscribe from mail providers (no Origin header)', async () => {
    const { user } = await signIn();
    const email = await reminderEmailFor(user.id);
    const url = email.headers!['List-Unsubscribe']!.slice(1, -1);
    const path = new URL(url).pathname + new URL(url).search;

    const res = await supertest(h.app).post(path);
    expect(res.status).toBe(200);
    const prefs = await h.container.notificationPreferences.get(user.id);
    expect(prefs.taskReminderEmail).toBe(false);
  });

  it('rejects tampered or foreign tokens', async () => {
    const { user } = await signIn();
    const token = tokenFrom((await reminderEmailFor(user.id)).text);
    const [payload] = token.split('.');
    const forged = `${Buffer.from(`${user.id}.NEW_SIGN_IN`).toString('base64url')}.${token.split('.')[1]}`;

    for (const bad of [`${payload}.AAAA`, forged, 'not-a-token-at-all']) {
      const res = await h.post('/api/v1/notifications/unsubscribe').send({ token: bad });
      expect(res.status).toBe(400);
    }
    const prefs = await h.container.notificationPreferences.get(user.id);
    expect(prefs.taskReminderEmail).toBe(true);
    expect(prefs.newSignInEmail).toBe(true);
  });
});
