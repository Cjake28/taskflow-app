import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  handleStorageRequest,
  STORAGE_PATH,
  type BucketLike,
  type BucketObject,
} from '../../deploy/cloudflare/src/storage';
import { HttpStorageDriver } from '../src/storage/http.driver';
import { StorageObjectNotFoundError } from '../src/storage/storage.driver';

/** An in-memory stand-in for the R2 binding, returning small pages like a real bucket would. */
class MemoryBucket implements BucketLike {
  readonly objects = new Map<string, { data: Uint8Array; contentType?: string; uploaded: Date }>();

  constructor(private readonly pageSize = 2) {}

  async put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ) {
    this.objects.set(key, {
      data: new Uint8Array(value),
      contentType: options?.httpMetadata?.contentType,
      uploaded: new Date(),
    });
  }

  async get(key: string) {
    const object = this.objects.get(key);
    if (!object) return null;
    return { ...this.info(key), body: new Blob([object.data]).stream() };
  }

  async head(key: string) {
    return this.objects.has(key) ? this.info(key) : null;
  }

  async delete(keys: string | string[]) {
    for (const key of [keys].flat()) this.objects.delete(key);
  }

  async list({ prefix = '', cursor }: { prefix?: string; cursor?: string; limit?: number }) {
    const keys = [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const end = start + this.pageSize;
    return {
      objects: keys.slice(start, end).map((key) => this.info(key)),
      truncated: end < keys.length,
      ...(end < keys.length ? { cursor: String(end) } : {}),
    };
  }

  private info(key: string): BucketObject {
    const object = this.objects.get(key)!;
    return { key, uploaded: object.uploaded, httpMetadata: { contentType: object.contentType } };
  }
}

const TOKEN = 'test-storage-token-0123456789abcdef';
const bucket = new MemoryBucket();
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  // Node's http server in front of the Worker's real handler.
  server = createServer(async (req, res) => {
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const request = new Request(`http://127.0.0.1${req.url}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      ...(hasBody ? { body: Readable.toWeb(req) as ReadableStream, duplex: 'half' } : {}),
    } as RequestInit);
    const response = await handleStorageRequest(request, bucket, TOKEN);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}${STORAGE_PATH}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const driver = () => new HttpStorageDriver({ baseUrl, token: TOKEN });

describe('http storage driver (Cloudflare Worker R2 API)', () => {
  it('writes, reads, lists and deletes objects', async () => {
    const key = 'images/owner-1/image-1.webp';
    await driver().put(key, Buffer.from('hello'), 'image/webp');

    expect(await driver().exists(key)).toBe(true);
    expect(await text(await driver().getStream(key))).toBe('hello');
    expect(bucket.objects.get(key)?.contentType).toBe('image/webp');

    const listed = [];
    for await (const object of driver().list('images/owner-1/')) listed.push(object);
    expect(listed.map((object) => object.key)).toEqual([key]);
    expect(listed[0]!.lastModified).toBeInstanceOf(Date);

    await driver().delete([key]);
    expect(await driver().exists(key)).toBe(false);
  });

  it('reports missing objects and deletes idempotently', async () => {
    const missing = 'images/owner-1/missing.webp';
    await expect(driver().getStream(missing)).rejects.toBeInstanceOf(StorageObjectNotFoundError);
    await expect(driver().delete([missing])).resolves.toBeUndefined();
    await expect(driver().delete([])).resolves.toBeUndefined();
  });

  it('follows the cursor across pages when listing', async () => {
    const keys = [1, 2, 3, 4, 5].map((n) => `images/owner-2/${n}.webp`);
    for (const key of keys) await driver().put(key, Buffer.from(key), 'image/webp');
    const listed = [];
    for await (const object of driver().list('images/owner-2/')) listed.push(object.key);
    expect(listed).toEqual(keys);
    await driver().delete(keys);
  });

  it('passes its health check', async () => {
    await expect(driver().healthCheck()).resolves.toBeUndefined();
  });

  it('refuses requests without the right token and unsafe keys', async () => {
    const intruder = new HttpStorageDriver({ baseUrl, token: 'wrong-token' });
    await expect(intruder.healthCheck()).rejects.toThrow(/401/);
    await expect(intruder.put('images/x.webp', Buffer.from('x'), 'image/webp')).rejects.toThrow(
      /401/,
    );

    const res = await fetch(`${baseUrl}/objects/images/../secret`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect([400, 404]).toContain(res.status);
  });
});
