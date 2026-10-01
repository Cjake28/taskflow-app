import type { ImageDto } from '@taskflow/shared';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-client';

import { UploadQueueStore, type UploadFn } from './upload-queue-store';

const png = (name: string) => new File(['x'], name, { type: 'image/png' });

const imageFor = (file: File): ImageDto => ({
  id: file.name,
  url: `/api/v1/images/${file.name}`,
  thumbUrl: `/api/v1/images/${file.name}?variant=thumb`,
  width: 1,
  height: 1,
  sizeBytes: 1,
  originalName: file.name,
  createdAt: '2026-10-01T00:00:00.000Z',
});

function store(upload: UploadFn, concurrency = 2) {
  return new UploadQueueStore({
    upload,
    concurrency,
    createPreview: (file) => `blob:${file.name}`,
    revokePreview: vi.fn(),
  });
}

const statuses = (queue: UploadQueueStore) =>
  queue.getSnapshot().map((item) => `${item.file.name}:${item.status}`);

describe('UploadQueueStore', () => {
  it('keeps picked files ready until the task exists, then uploads them', async () => {
    const upload = vi.fn<UploadFn>((_task, files) => Promise.resolve(files.map(imageFor)));
    const onUploaded = vi.fn();
    const queue = store(upload);
    queue.setOnUploaded(onUploaded);

    queue.add([png('a.png'), png('b.png'), new File(['x'], 'c.txt', { type: 'text/plain' })], 10);
    expect(statuses(queue)).toEqual(['a.png:ready', 'b.png:ready', 'c.txt:error']);
    expect(queue.inFlightCount).toBe(2);
    expect(upload).not.toHaveBeenCalled();

    const summary = await queue.uploadAll('task-1');
    expect(summary).toEqual({ succeeded: 2, failed: 0 });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls.map(([taskId, files]) => [taskId, files[0]?.name])).toEqual([
      ['task-1', 'a.png'],
      ['task-1', 'b.png'],
    ]);
    expect(onUploaded).toHaveBeenCalledWith([imageFor(png('a.png'))], expect.anything(), 'task-1');
    expect(statuses(queue)).toEqual(['a.png:done', 'b.png:done', 'c.txt:error']);
  });

  it('counts files already waiting against the free slots', () => {
    const queue = store(() => new Promise(() => {}));
    queue.add([png('a.png'), png('b.png')], 3);
    queue.add([png('c.png'), png('d.png')], 3);
    expect(statuses(queue)).toEqual(['a.png:ready', 'b.png:ready', 'c.png:ready', 'd.png:error']);
  });

  it('runs at most `concurrency` uploads at a time', async () => {
    let active = 0;
    let peak = 0;
    const upload: UploadFn = async (_task, files) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return files.map(imageFor);
    };
    const queue = store(upload, 2);
    queue.add(
      ['a', 'b', 'c', 'd', 'e'].map((n) => png(`${n}.png`)),
      10,
    );
    await queue.uploadAll('task-1');
    expect(peak).toBe(2);
  });

  it('starts immediately with a task id, reports progress and failures, and retries', async () => {
    let fail = true;
    const upload: UploadFn = (_task, files, options) => {
      options.onProgress?.(0.5);
      if (fail) {
        fail = false;
        return Promise.reject(
          new ApiError({ status: 503, code: 'SERVICE_UNAVAILABLE', message: 'Down' }),
        );
      }
      return Promise.resolve(files.map(imageFor));
    };
    const queue = store(upload);
    const [item] = queue.add([png('a.png')], 10, 'task-1');
    expect(item?.status).toBe('queued');

    await vi.waitFor(() => expect(statuses(queue)).toEqual(['a.png:error']));
    const failed = queue.getSnapshot()[0];
    expect(failed?.retryable).toBe(true);
    expect(failed?.error).toMatch(/temporarily unavailable/);

    await queue.retry(failed?.id ?? '');
    expect(statuses(queue)).toEqual(['a.png:done']);
  });

  it('does not offer a retry for invalid images', async () => {
    const queue = store(() =>
      Promise.reject(new ApiError({ status: 400, code: 'INVALID_IMAGE', message: 'Not an image' })),
    );
    queue.add([png('a.png')], 10, 'task-1');
    await vi.waitFor(() => expect(queue.getSnapshot()[0]?.status).toBe('error'));
    expect(queue.getSnapshot()[0]).toMatchObject({ retryable: false, error: 'Not an image' });
  });

  it('cancels an upload and releases its preview when removed', async () => {
    const revoke = vi.fn();
    let signal: AbortSignal | undefined;
    const queue = new UploadQueueStore({
      createPreview: () => 'blob:a',
      revokePreview: revoke,
      upload: (_task, _files, options) => {
        signal = options.signal;
        return new Promise((_resolve, reject) =>
          options.signal?.addEventListener('abort', () =>
            reject(new DOMException('cancelled', 'AbortError')),
          ),
        );
      },
    });
    const [item] = queue.add([png('a.png')], 10, 'task-1');
    await vi.waitFor(() => expect(queue.getSnapshot()[0]?.status).toBe('uploading'));

    queue.remove(item?.id ?? '');
    expect(signal?.aborted).toBe(true);
    expect(revoke).toHaveBeenCalledWith('blob:a');
    expect(queue.getSnapshot()).toEqual([]);
  });
});
