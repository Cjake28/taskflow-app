import sharp from 'sharp';
import type supertest from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';
import { createUser } from './setup/factories';
import { createHarness, type Harness } from './setup/harness';
import { jpeg, noisyPng, png, SVG } from './setup/images';

const DAY = 24 * 60 * 60 * 1000;

async function cookieFor(h: Harness, userId: string) {
  const session = await h.container.sessions.create(userId, {
    persistent: false,
    userAgent: 'vitest',
    ip: '127.0.0.1',
  });
  return `tf_access=${session.access.token}`;
}

async function signIn(h: Harness) {
  const { user } = await createUser(h.container.prisma);
  return { user, cookie: await cookieFor(h, user.id) };
}

async function createTask(h: Harness, cookie: string, title = 'With images') {
  const res = await h.post('/api/v1/tasks').set('Cookie', cookie).send({ title });
  return res.body.data.id as string;
}

/** Collects a binary response body (supertest leaves unknown types unparsed). */
function binary(test: supertest.Test): supertest.Test {
  return test.buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  });
}

async function upload(
  h: Harness,
  cookie: string,
  taskId: string,
  files: Array<{ data: Buffer; name: string }>,
) {
  let req = h.post(`/api/v1/tasks/${taskId}/images`).set('Cookie', cookie);
  for (const file of files) req = req.attach('images', file.data, file.name);
  return req;
}

async function objectCount(h: Harness): Promise<number> {
  let count = 0;
  for await (const _ of h.container.storage.list('images/')) count += 1;
  return count;
}

describe('task images', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  beforeEach(() => h.reset());
  afterAll(() => h.close());

  it('uploads images as WebP and lists them on the task', async () => {
    const { cookie } = await signIn(h);
    const taskId = await createTask(h, cookie);

    const res = await upload(h, cookie, taskId, [
      { data: await jpeg(2400, 1200), name: 'Beach photo.jpg' },
      { data: await png(), name: 'diagram.png' },
    ]);

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(2);
    const [first] = res.body.data;
    expect(first).toMatchObject({
      url: `/api/v1/images/${first.id}`,
      thumbUrl: `/api/v1/images/${first.id}?variant=thumb`,
      width: 1600,
      height: 800,
      originalName: 'Beach photo.jpg',
    });
    expect(await objectCount(h)).toBe(4);

    const details = await h.get(`/api/v1/tasks/${taskId}`).set('Cookie', cookie);
    expect(details.body.data.images.map((image: { id: string }) => image.id)).toEqual(
      res.body.data.map((image: { id: string }) => image.id),
    );
    const list = await h.get('/api/v1/tasks').set('Cookie', cookie);
    expect(list.body.data[0]).toMatchObject({
      imageCount: 2,
      coverThumbUrl: first.thumbUrl,
    });

    const activity = await h.get(`/api/v1/tasks/${taskId}/activities`).set('Cookie', cookie);
    expect(activity.body.data[0]).toMatchObject({
      action: 'IMAGE_ADDED',
      changes: { images: { count: 2 } },
    });
  });

  it('serves images only to their owner, with safe caching headers', async () => {
    const { cookie } = await signIn(h);
    const other = await signIn(h);
    const taskId = await createTask(h, cookie);
    const [image] = (await upload(h, cookie, taskId, [{ data: await jpeg(), name: 'a.jpg' }])).body
      .data;

    const res = await binary(h.get(image.url).set('Cookie', cookie));
    expect(res.status).toBe(200);
    expect(res.headers).toMatchObject({
      'content-type': 'image/webp',
      'cache-control': 'private, no-cache',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cross-origin-resource-policy': 'same-origin',
      etag: `"${image.id}-display"`,
    });
    expect((await sharp(res.body as Buffer).metadata()).format).toBe('webp');

    const thumb = await binary(h.get(image.thumbUrl).set('Cookie', cookie));
    expect(thumb.headers.etag).toBe(`"${image.id}-thumb"`);
    expect(await sharp(thumb.body as Buffer).metadata()).toMatchObject({ width: 400, height: 400 });

    const cached = await h
      .get(image.url)
      .set('Cookie', cookie)
      .set('If-None-Match', res.headers.etag!);
    expect(cached.status).toBe(304);

    expect((await h.get(image.url)).status).toBe(401);
    expect((await h.get(image.url).set('Cookie', other.cookie)).status).toBe(404);
    // A revalidation from someone else must not get a 304 either.
    const foreign304 = await h
      .get(image.url)
      .set('Cookie', other.cookie)
      .set('If-None-Match', res.headers.etag!);
    expect(foreign304.status).toBe(404);
  });

  it('rejects files that are not supported images', async () => {
    const { cookie } = await signIn(h);
    const taskId = await createTask(h, cookie);

    const svg = await upload(h, cookie, taskId, [{ data: SVG, name: 'logo.png' }]);
    expect(svg.status).toBe(400);
    expect(svg.body.error.code).toBe('INVALID_IMAGE');

    const html = await upload(h, cookie, taskId, [
      { data: Buffer.from('<script>alert(1)</script>'), name: 'photo.jpg' },
    ]);
    expect(html.body.error.code).toBe('INVALID_IMAGE');
    expect(await objectCount(h)).toBe(0);
  });

  it('enforces size, count and content-type limits', async () => {
    const { cookie } = await signIn(h);
    const taskId = await createTask(h, cookie);

    const tooBig = await upload(h, cookie, taskId, [
      { data: Buffer.alloc(5 * 1024 * 1024 + 1), name: 'big.jpg' },
    ]);
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.error.code).toBe('FILE_TOO_LARGE');

    const small = await png(20, 20);
    const six = Array.from({ length: 6 }, (_, i) => ({ data: small, name: `${i}.png` }));
    const tooMany = await upload(h, cookie, taskId, six);
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error.code).toBe('TOO_MANY_IMAGES');

    const json = await h
      .post(`/api/v1/tasks/${taskId}/images`)
      .set('Cookie', cookie)
      .send({ images: [] });
    expect(json.status).toBe(415);

    const empty = await h
      .post(`/api/v1/tasks/${taskId}/images`)
      .set('Cookie', cookie)
      .field('note', 'hello');
    expect(empty.status).toBe(400);
  });

  it('allows at most 10 active images per task', async () => {
    const { cookie } = await signIn(h);
    const taskId = await createTask(h, cookie);
    const small = await png(20, 20);
    const five = Array.from({ length: 5 }, (_, i) => ({ data: small, name: `${i}.png` }));

    expect((await upload(h, cookie, taskId, five)).status).toBe(201);
    expect((await upload(h, cookie, taskId, five)).status).toBe(201);
    const eleventh = await upload(h, cookie, taskId, [{ data: small, name: 'x.png' }]);
    expect(eleventh.status).toBe(400);
    expect(eleventh.body.error.code).toBe('TOO_MANY_IMAGES');
  });

  it("returns 404 when uploading to another user's task", async () => {
    const owner = await signIn(h);
    const intruder = await signIn(h);
    const taskId = await createTask(h, owner.cookie);
    const res = await upload(h, intruder.cookie, taskId, [{ data: await png(), name: 'a.png' }]);
    expect(res.status).toBe(404);
    expect(await objectCount(h)).toBe(0);
  });

  it('soft-deletes, restores within the retention window and then purges', async () => {
    const { cookie, user } = await signIn(h);
    const taskId = await createTask(h, cookie);
    const [image] = (await upload(h, cookie, taskId, [{ data: await png(), name: 'plan.png' }]))
      .body.data;
    const base = `/api/v1/tasks/${taskId}/images/${image.id}`;

    expect((await h.del(base).set('Cookie', cookie)).status).toBe(204);
    expect((await h.get(image.url).set('Cookie', cookie)).status).toBe(404);
    const activity = await h.get(`/api/v1/tasks/${taskId}/activities`).set('Cookie', cookie);
    expect(activity.body.data[0]).toMatchObject({
      action: 'IMAGE_REMOVED',
      changes: { image: { name: 'plan.png' } },
    });

    const restored = await h.post(`${base}/restore`).set('Cookie', cookie);
    expect(restored.status).toBe(200);
    const afterRestore = await h.get(`/api/v1/tasks/${taskId}/activities`).set('Cookie', cookie);
    expect(afterRestore.body.data[0]).toMatchObject({
      action: 'IMAGE_ADDED',
      changes: { images: { count: 1, restored: true } },
    });
    expect((await h.get(image.url).set('Cookie', cookie)).status).toBe(200);

    await h.del(base).set('Cookie', cookie);
    h.clock.advance(8 * DAY);
    const later = await cookieFor(h, user.id);
    expect((await h.post(`${base}/restore`).set('Cookie', later)).status).toBe(404);

    expect(await h.container.images.purgeExpired()).toBe(1);
    expect(await h.container.prisma.image.count()).toBe(0);
    expect(await objectCount(h)).toBe(0);
  });

  it('hides the images of a deleted task and purges them after retention', async () => {
    const { cookie } = await signIn(h);
    const taskId = await createTask(h, cookie);
    const [image] = (await upload(h, cookie, taskId, [{ data: await png(), name: 'a.png' }])).body
      .data;

    await h.del(`/api/v1/tasks/${taskId}`).set('Cookie', cookie);
    expect((await h.get(image.url).set('Cookie', cookie)).status).toBe(404);

    expect(await h.container.images.purgeExpired()).toBe(0);
    h.clock.advance(7 * DAY + 1);
    expect(await h.container.images.purgeExpired()).toBe(1);
    expect(await objectCount(h)).toBe(0);
  });

  it('sweeps stored objects that no row references after the grace period', async () => {
    const { cookie, user } = await signIn(h);
    const taskId = await createTask(h, cookie);
    await upload(h, cookie, taskId, [{ data: await png(), name: 'kept.png' }]);
    await h.container.storage.put(`images/${user.id}/orphan.webp`, Buffer.from('x'), 'image/webp');

    expect(await h.container.images.sweepOrphans()).toBe(0);
    h.clock.advance(25 * 60 * 60 * 1000);
    expect(await h.container.images.sweepOrphans()).toBe(1);
    expect(await h.container.storage.exists(`images/${user.id}/orphan.webp`)).toBe(false);
    expect(await objectCount(h)).toBe(2);
  });
});

describe('avatars', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });
  beforeEach(() => h.reset());
  afterAll(() => h.close());

  it('sets, replaces and removes the profile picture', async () => {
    const { cookie } = await signIn(h);

    const first = await h
      .put('/api/v1/users/me/avatar')
      .set('Cookie', cookie)
      .attach('image', await jpeg(800, 600), 'me.jpg');
    expect(first.status).toBe(200);
    const firstUrl = first.body.data.avatarUrl as string;
    expect(firstUrl).toMatch(/^\/api\/v1\/images\/[0-9a-f-]{36}$/);

    const served = await binary(h.get(firstUrl).set('Cookie', cookie));
    expect(await sharp(served.body as Buffer).metadata()).toMatchObject({
      format: 'webp',
      width: 256,
      height: 256,
    });

    const second = await h
      .put('/api/v1/users/me/avatar')
      .set('Cookie', cookie)
      .attach('image', await png(), 'new.png');
    expect(second.body.data.avatarUrl).not.toBe(firstUrl);
    expect((await h.get(firstUrl).set('Cookie', cookie)).status).toBe(404);

    expect((await h.del('/api/v1/users/me/avatar').set('Cookie', cookie)).status).toBe(204);
    const me = await h.get('/api/v1/users/me').set('Cookie', cookie);
    expect(me.body.data.avatarUrl).toBeNull();
    expect((await h.del('/api/v1/users/me/avatar').set('Cookie', cookie)).status).toBe(204);
  });

  it('accepts exactly one file in the "image" field', async () => {
    const { cookie } = await signIn(h);
    const small = await png(20, 20);
    const two = await h
      .put('/api/v1/users/me/avatar')
      .set('Cookie', cookie)
      .attach('image', small, 'a.png')
      .attach('image', small, 'b.png');
    expect(two.status).toBe(400);
    expect(two.body.error.code).toBe('TOO_MANY_IMAGES');

    const wrongField = await h
      .put('/api/v1/users/me/avatar')
      .set('Cookie', cookie)
      .attach('avatar', small, 'a.png');
    expect(wrongField.status).toBe(400);
    expect(wrongField.body.error.details).toContainEqual({
      field: 'avatar',
      message: 'Use the "image" field',
    });
  });
});

describe('with a tiny storage quota and no retention window', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness({
      env: loadEnv({ ...process.env, USER_STORAGE_QUOTA_MB: '0.1', IMAGE_RETENTION_DAYS: '0' }),
    });
  });
  beforeEach(() => h.reset());
  afterAll(() => h.close());

  it('rejects uploads over the per-user quota', async () => {
    const { cookie } = await signIn(h);
    const taskId = await createTask(h, cookie);
    const res = await upload(h, cookie, taskId, [
      { data: await noisyPng(512, 512), name: 'noise.png' },
    ]);
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('STORAGE_QUOTA_EXCEEDED');
    expect(await objectCount(h)).toBe(0);
  });

  it('purges removed images immediately', async () => {
    const { cookie } = await signIn(h);
    const taskId = await createTask(h, cookie);
    const [image] = (await upload(h, cookie, taskId, [{ data: await png(), name: 'a.png' }])).body
      .data;

    await h.del(`/api/v1/tasks/${taskId}/images/${image.id}`).set('Cookie', cookie);
    expect(await h.container.prisma.image.count()).toBe(0);
    expect(await objectCount(h)).toBe(0);
  });
});
