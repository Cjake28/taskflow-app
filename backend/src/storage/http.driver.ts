import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import {
  StorageObjectNotFoundError,
  type StorageDriver,
  type StoredObject,
} from './storage.driver';

export interface HttpDriverOptions {
  /** Base URL of the storage API, e.g. `https://taskflow.boats/__storage`. */
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
}

const DELETE_BATCH = 1000;

/** `images/a/b.webp` → `images/a/b.webp` with each segment percent-encoded. */
const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');

/**
 * Object storage behind a small authenticated HTTP API. In production the Cloudflare Worker in
 * front of the API container serves it from its R2 binding (deploy/cloudflare/src/storage.ts),
 * so the container needs no R2 access keys.
 */
export class HttpStorageDriver implements StorageDriver {
  readonly name = 'http';
  private readonly base: string;
  private readonly fetch: typeof fetch;

  constructor(private readonly options: HttpDriverOptions) {
    this.base = options.baseUrl.replace(/\/+$/, '');
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.request('PUT', `/objects/${encodeKey(key)}`, {
      body: new Uint8Array(body),
      headers: { 'content-type': contentType },
    });
  }

  async getStream(key: string): Promise<Readable> {
    const res = await this.request('GET', `/objects/${encodeKey(key)}`, {}, [404]);
    if (res.status === 404 || !res.body) throw new StorageObjectNotFoundError(key);
    return Readable.fromWeb(res.body as WebReadableStream<Uint8Array>);
  }

  async delete(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += DELETE_BATCH) {
      await this.request('POST', '/delete', {
        body: JSON.stringify({ keys: keys.slice(i, i + DELETE_BATCH) }),
        headers: { 'content-type': 'application/json' },
      });
    }
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.request('HEAD', `/objects/${encodeKey(key)}`, {}, [404]);
    return res.status === 200;
  }

  async *list(prefix: string): AsyncIterable<StoredObject> {
    let cursor: string | null = null;
    do {
      const query = new URLSearchParams({ prefix, ...(cursor ? { cursor } : {}) });
      const res = await this.request('GET', `/list?${query.toString()}`);
      const page = (await res.json()) as {
        objects: Array<{ key: string; uploaded: string }>;
        cursor: string | null;
      };
      for (const object of page.objects) {
        yield { key: object.key, lastModified: new Date(object.uploaded) };
      }
      cursor = page.cursor;
    } while (cursor);
  }

  async healthCheck(): Promise<void> {
    await this.request('GET', '/health');
  }

  private async request(
    method: string,
    path: string,
    init: { body?: RequestInit['body']; headers?: Record<string, string> } = {},
    allowed: number[] = [],
  ): Promise<Response> {
    const res = await this.fetch(`${this.base}${path}`, {
      method,
      body: init.body,
      headers: { authorization: `Bearer ${this.options.token}`, ...init.headers },
    });
    if (!res.ok && !allowed.includes(res.status)) {
      throw new Error(`Storage request failed: ${method} ${path.split('?')[0]} → ${res.status}`);
    }
    return res;
  }
}
