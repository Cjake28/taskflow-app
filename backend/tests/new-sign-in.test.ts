import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setCookies } from './setup/cookies';
import { createUser, DEFAULT_PASSWORD } from './setup/factories';
import { createHarness, type Harness } from './setup/harness';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
beforeEach(() => h.reset());
afterAll(() => h.close());

const CHROME_ON_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const SAFARI_ON_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

function login(identifier: string, options: { userAgent: string; device?: string }) {
  const req = h
    .post('/api/v1/auth/login')
    .set('User-Agent', options.userAgent)
    .send({ identifier, password: DEFAULT_PASSWORD, rememberMe: false });
  return options.device ? req.set('Cookie', `tf_device=${options.device}`) : req;
}

const signInAlerts = (userId: string) =>
  h.container.prisma.notification.findMany({ where: { userId, type: 'NEW_SIGN_IN' } });

describe('new sign-in alerts', () => {
  it('remembers the first browser quietly and alerts for a new one', async () => {
    const { user } = await createUser(h.container.prisma, { firstName: 'Bea' });

    const first = await login(user.username, { userAgent: CHROME_ON_WINDOWS });
    expect(first.status).toBe(200);
    const device = setCookies(first).tf_device!;
    expect(device.value).toMatch(/^[\w-]{43}$/);
    expect(device.attributes).toMatch(/HttpOnly/i);
    expect(device.attributes).toMatch(/Path=\/api\/v1\/auth/);
    expect(await signInAlerts(user.id)).toHaveLength(0);

    // Same browser again: still quiet.
    await login(user.username, { userAgent: CHROME_ON_WINDOWS, device: device.value }).expect(200);
    expect(await signInAlerts(user.id)).toHaveLength(0);

    // A phone that never signed in before.
    await login(user.email, { userAgent: SAFARI_ON_IOS }).expect(200);
    const [alert] = await signInAlerts(user.id);
    expect(alert).toMatchObject({
      title: 'New sign-in from Safari on iOS',
      data: expect.objectContaining({ device: 'Safari on iOS' }),
    });
    expect(h.mail.sent.map((mail) => mail.subject)).toEqual([
      'New sign-in to TaskFlow from Safari on iOS',
    ]);
    expect(h.mail.sent[0]!.text).toContain('/profile?tab=security');
  });

  it('follows the new sign-in setting', async () => {
    const { user } = await createUser(h.container.prisma);
    await h.container.prisma.notificationPreference.create({
      data: { userId: user.id, newSignInInApp: false, newSignInEmail: false },
    });
    await login(user.username, { userAgent: CHROME_ON_WINDOWS }).expect(200);
    await login(user.username, { userAgent: SAFARI_ON_IOS }).expect(200);
    expect(await signInAlerts(user.id)).toHaveLength(0);
    expect(await h.container.prisma.knownDevice.count({ where: { userId: user.id } })).toBe(2);
  });

  it('ignores malformed device cookies', async () => {
    const { user } = await createUser(h.container.prisma);
    const res = await login(user.username, {
      userAgent: CHROME_ON_WINDOWS,
      device: 'x'.repeat(10),
    }).expect(200);
    expect(setCookies(res).tf_device!.value).toMatch(/^[\w-]{43}$/);
  });
});
