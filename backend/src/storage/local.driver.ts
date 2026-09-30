import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import {
  StorageObjectNotFoundError,
  type StorageDriver,
  type StoredObject,
} from './storage.driver';

const isMissing = (err: unknown) =>
  typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT';

/** Stores objects as files under a root directory (kept outside any static web root). */
export class LocalDiskDriver implements StorageDriver {
  readonly name = 'local' as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    // Write then rename so readers never see a half-written file.
    const temp = `${target}.${randomUUID()}.tmp`;
    await writeFile(temp, body);
    await rename(temp, target);
  }

  async getStream(key: string): Promise<Readable> {
    const target = this.resolve(key);
    try {
      await stat(target);
    } catch (err) {
      if (isMissing(err)) throw new StorageObjectNotFoundError(key);
      throw err;
    }
    return createReadStream(target);
  }

  async delete(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => rm(this.resolve(key), { force: true })));
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await stat(this.resolve(key))).isFile();
    } catch (err) {
      if (isMissing(err)) return false;
      throw err;
    }
  }

  async *list(prefix: string): AsyncIterable<StoredObject> {
    const base = this.resolve(prefix);
    let entries;
    try {
      entries = await readdir(base, { recursive: true, withFileTypes: true });
    } catch (err) {
      if (isMissing(err)) return;
      throw err;
    }
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.endsWith('.tmp')) continue;
      const full = path.join(entry.parentPath, entry.name);
      const key = path.relative(this.root, full).split(path.sep).join('/');
      yield { key, lastModified: (await stat(full)).mtime };
    }
  }

  async healthCheck(): Promise<void> {
    const target = this.resolve(`.health/${randomUUID()}`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, 'ok');
    const content = await readFile(target, 'utf8');
    await rm(target, { force: true });
    if (content !== 'ok') throw new Error('Local storage probe failed');
  }

  /** Maps a key to a path and refuses anything that would escape the root. */
  private resolve(key: string): string {
    const target = path.resolve(this.root, key);
    if (target !== this.root && !target.startsWith(this.root + path.sep)) {
      throw new Error(`Storage key escapes the storage root: ${key}`);
    }
    return target;
  }
}
