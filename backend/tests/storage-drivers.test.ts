import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { afterAll, describe, expect, it } from 'vitest';
import { LocalDiskDriver } from '../src/storage/local.driver';
import { S3Driver } from '../src/storage/s3.driver';
import { StorageObjectNotFoundError, type StorageDriver } from '../src/storage/storage.driver';

/** The same behaviour is required from every driver. */
function storageContract(name: string, create: () => StorageDriver) {
  describe(`${name} storage driver`, () => {
    const driver = create();
    const prefix = `images/contract-${randomUUID()}/`;

    afterAll(async () => {
      const keys: string[] = [];
      for await (const object of driver.list(prefix)) keys.push(object.key);
      await driver.delete(keys);
      driver.close?.();
    });

    it('writes, reads, lists and deletes objects', async () => {
      const key = `${prefix}${randomUUID()}.webp`;
      await driver.put(key, Buffer.from('hello'), 'image/webp');

      expect(await driver.exists(key)).toBe(true);
      expect(await text(await driver.getStream(key))).toBe('hello');

      const listed = [];
      for await (const object of driver.list(prefix)) listed.push(object);
      expect(listed.map((object) => object.key)).toContain(key);
      expect(listed[0]!.lastModified).toBeInstanceOf(Date);

      await driver.delete([key]);
      expect(await driver.exists(key)).toBe(false);
    });

    it('reports missing objects and deletes idempotently', async () => {
      const missing = `${prefix}${randomUUID()}.webp`;
      await expect(driver.getStream(missing)).rejects.toBeInstanceOf(StorageObjectNotFoundError);
      await expect(driver.delete([missing])).resolves.toBeUndefined();
      expect(await driver.exists(missing)).toBe(false);
    });

    it('passes its health check', async () => {
      await expect(driver.healthCheck()).resolves.toBeUndefined();
    });
  });
}

const localRoot = path.join(tmpdir(), `taskflow-driver-${randomUUID()}`);
storageContract('local', () => new LocalDiskDriver(localRoot));
afterAll(() => rm(localRoot, { recursive: true, force: true }));

describe('local storage driver safety', () => {
  it('refuses keys that escape the storage root', async () => {
    const driver: StorageDriver = new LocalDiskDriver(localRoot);
    await expect(driver.put('../escape.webp', Buffer.from('x'), 'image/webp')).rejects.toThrow(
      /escapes the storage root/,
    );
    await expect(driver.getStream('images/../../etc/passwd')).rejects.toThrow(
      /escapes the storage root/,
    );
  });
});

// Runs against SeaweedFS/MinIO/AWS when configured, e.g.
// S3_TEST_ENDPOINT=http://localhost:8333 (docker compose --profile s3 up -d).
const s3Endpoint = process.env.S3_TEST_ENDPOINT;
if (s3Endpoint) {
  storageContract(
    's3',
    () =>
      new S3Driver({
        name: 's3',
        endpoint: s3Endpoint,
        bucket: process.env.S3_TEST_BUCKET ?? 'taskflow',
        region: process.env.S3_TEST_REGION ?? 'us-east-1',
        forcePathStyle: true,
        accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID ?? 'taskflow',
        secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY ?? 'taskflow-secret',
      }),
  );
} else {
  describe.skip('s3 storage driver (set S3_TEST_ENDPOINT to run)', () => {
    it('is skipped', () => {});
  });
}
