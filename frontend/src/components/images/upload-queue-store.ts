import type { ImageDto } from '@taskflow/shared';

import { getErrorMessage } from '@/lib/api-client';
import {
  checkImageFiles,
  isPermanentUploadError,
  uploadTaskImages,
  type UploadOptions,
} from '@/lib/upload';

/**
 * `ready`: picked but waiting for a task (create dialog) · `queued`: waiting for a free slot ·
 * `uploading`: sending bytes · `processing`: bytes sent, the server is converting the image ·
 * `done` · `error` (pre-check rejection or failed upload).
 */
export type UploadStatus = 'ready' | 'queued' | 'uploading' | 'processing' | 'done' | 'error';

export interface UploadItem {
  id: string;
  file: File;
  /** Object URL for the local preview; null for files that are not images. */
  previewUrl: string | null;
  status: UploadStatus;
  /** 0–1, request body only. */
  progress: number;
  error: string | null;
  /** False for pre-check rejections and failures that would fail again unchanged. */
  retryable: boolean;
}

export interface UploadSummary {
  succeeded: number;
  failed: number;
}

export type UploadFn = (
  taskId: string,
  files: File[],
  options: UploadOptions,
) => Promise<ImageDto[]>;

export interface UploadQueueOptions {
  /** Parallel uploads (one file per request, so progress and errors are per file). */
  concurrency?: number;
  upload?: UploadFn;
  createPreview?: (file: File) => string | null;
  revokePreview?: (url: string) => void;
  /** Remove finished items after this many ms (null keeps them). */
  removeDoneAfterMs?: number | null;
  onUploaded?: (images: ImageDto[], item: UploadItem, taskId: string) => void;
}

const IN_FLIGHT: ReadonlySet<UploadStatus> = new Set([
  'ready',
  'queued',
  'uploading',
  'processing',
]);

function defaultCreatePreview(file: File): string | null {
  if (!file.type.startsWith('image/') || typeof URL.createObjectURL !== 'function') return null;
  return URL.createObjectURL(file);
}

function defaultRevokePreview(url: string) {
  if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
}

let sequence = 0;
const nextId = () => `upload-${Date.now().toString(36)}-${(sequence += 1)}`;

/**
 * Per-file upload queue with a concurrency limit, progress, errors and retry.
 * Framework-agnostic; React subscribes through `useUploadQueue`.
 */
export class UploadQueueStore {
  private items: UploadItem[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly waiting: Array<{ id: string; taskId: string }> = [];
  private readonly controllers = new Map<string, AbortController>();
  private readonly settlers = new Map<string, () => void>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private running = 0;
  private lastTaskId: string | null = null;
  private options: Required<Omit<UploadQueueOptions, 'onUploaded'>> &
    Pick<UploadQueueOptions, 'onUploaded'>;

  constructor(options: UploadQueueOptions = {}) {
    this.options = {
      concurrency: options.concurrency ?? 2,
      upload: options.upload ?? uploadTaskImages,
      createPreview: options.createPreview ?? defaultCreatePreview,
      revokePreview: options.revokePreview ?? defaultRevokePreview,
      removeDoneAfterMs: options.removeDoneAfterMs ?? null,
      onUploaded: options.onUploaded,
    };
  }

  setOnUploaded(callback: UploadQueueOptions['onUploaded']) {
    this.options.onUploaded = callback;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): readonly UploadItem[] => this.items;

  /** Files that will occupy an image slot once uploaded. */
  get inFlightCount(): number {
    return this.items.filter((item) => IN_FLIGHT.has(item.status)).length;
  }

  /**
   * Adds picked files. `slotsLeft` is the task's free image slots before this queue; items already
   * waiting or uploading are subtracted. With `taskId` the accepted files upload immediately.
   */
  add(files: readonly File[], slotsLeft: number, taskId?: string | null): UploadItem[] {
    const { accepted, rejected } = checkImageFiles(files, slotsLeft - this.inFlightCount);
    const added: UploadItem[] = [
      ...accepted.map((file): UploadItem => ({
        id: nextId(),
        file,
        previewUrl: this.options.createPreview(file),
        status: taskId ? 'queued' : 'ready',
        progress: 0,
        error: null,
        retryable: true,
      })),
      ...rejected.map(({ file, message }): UploadItem => ({
        id: nextId(),
        file,
        previewUrl: null,
        status: 'error',
        progress: 0,
        error: message,
        retryable: false,
      })),
    ];
    if (added.length === 0) return added;
    this.commit([...this.items, ...added]);
    if (taskId) {
      void this.enqueue(
        added.filter((item) => item.status === 'queued').map((item) => item.id),
        taskId,
      );
    }
    return added;
  }

  /** Uploads every `ready` item to the task; resolves once all of them settled. */
  async uploadAll(taskId: string): Promise<UploadSummary> {
    const ids = this.items.filter((item) => item.status === 'ready').map((item) => item.id);
    this.commit(
      this.items.map((item) =>
        ids.includes(item.id) ? { ...item, status: 'queued' as const } : item,
      ),
    );
    await this.enqueue(ids, taskId);
    const settled = this.items.filter((item) => ids.includes(item.id));
    return {
      succeeded: settled.filter((item) => item.status === 'done').length,
      failed: settled.filter((item) => item.status === 'error').length,
    };
  }

  retry(id: string): Promise<void> {
    const item = this.find(id);
    const taskId = this.lastTaskId;
    if (!item || item.status !== 'error' || !item.retryable || !taskId) return Promise.resolve();
    this.patch(id, { status: 'queued', progress: 0, error: null });
    return this.enqueue([id], taskId).then(() => undefined);
  }

  /** Cancels (when uploading) and drops an item. */
  remove(id: string) {
    const item = this.find(id);
    if (!item) return;
    this.controllers.get(id)?.abort();
    const index = this.waiting.findIndex((entry) => entry.id === id);
    if (index >= 0) this.waiting.splice(index, 1);
    this.settle(id);
    if (item.previewUrl) this.options.revokePreview(item.previewUrl);
    this.commit(this.items.filter((entry) => entry.id !== id));
  }

  /** Drops finished and failed items (keeps anything still uploading). */
  clearSettled() {
    for (const item of this.items) {
      if (!IN_FLIGHT.has(item.status)) this.remove(item.id);
    }
  }

  /** Releases previews and timers; in-flight uploads keep running (their results still land). */
  dispose() {
    for (const item of this.items) {
      if (item.previewUrl) this.options.revokePreview(item.previewUrl);
    }
    this.items = this.items.map((item) => ({ ...item, previewUrl: null }));
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  private enqueue(ids: string[], taskId: string): Promise<void[]> {
    this.lastTaskId = taskId;
    const waits = ids.map(
      (id) =>
        new Promise<void>((resolve) => {
          this.settlers.set(id, resolve);
        }),
    );
    this.waiting.push(...ids.map((id) => ({ id, taskId })));
    this.pump();
    return Promise.all(waits);
  }

  private pump() {
    while (this.running < this.options.concurrency && this.waiting.length > 0) {
      const next = this.waiting.shift();
      if (!next) break;
      this.running += 1;
      void this.run(next.id, next.taskId).finally(() => {
        this.running -= 1;
        this.settle(next.id);
        this.pump();
      });
    }
  }

  private async run(id: string, taskId: string) {
    const item = this.find(id);
    if (!item || item.status !== 'queued') return;
    const controller = new AbortController();
    this.controllers.set(id, controller);
    this.patch(id, { status: 'uploading', progress: 0, error: null });

    try {
      const images = await this.options.upload(taskId, [item.file], {
        signal: controller.signal,
        onProgress: (fraction) =>
          this.patch(id, {
            progress: fraction,
            status: fraction >= 1 ? 'processing' : 'uploading',
          }),
      });
      this.patch(id, { status: 'done', progress: 1 });
      const done = this.find(id);
      if (done) this.options.onUploaded?.(images, done, taskId);
      if (this.options.removeDoneAfterMs !== null) {
        const timer = setTimeout(() => {
          this.timers.delete(timer);
          this.remove(id);
        }, this.options.removeDoneAfterMs);
        this.timers.add(timer);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.patch(id, {
        status: 'error',
        error: getErrorMessage(error),
        retryable: !isPermanentUploadError(error),
      });
    } finally {
      this.controllers.delete(id);
    }
  }

  private settle(id: string) {
    this.settlers.get(id)?.();
    this.settlers.delete(id);
  }

  private find(id: string) {
    return this.items.find((item) => item.id === id);
  }

  private patch(id: string, patch: Partial<UploadItem>) {
    if (!this.find(id)) return;
    this.commit(this.items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  private commit(items: UploadItem[]) {
    this.items = items;
    for (const listener of this.listeners) listener();
  }
}
