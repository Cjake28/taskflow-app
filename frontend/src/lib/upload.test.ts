import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from './api-client';
import {
  checkImageFiles,
  formatFileSize,
  isAcceptedImageType,
  isPermanentUploadError,
  uploadTaskImages,
} from './upload';

const MB = 1024 * 1024;

function file(name: string, type: string, size = 1000): File {
  const blob = new File(['x'], name, { type });
  Object.defineProperty(blob, 'size', { value: size });
  return blob;
}

describe('client-side image checks', () => {
  it('accepts the formats the server decodes', () => {
    expect(isAcceptedImageType(file('a.jpg', 'image/jpeg'))).toBe(true);
    expect(isAcceptedImageType(file('a.avif', 'image/avif'))).toBe(true);
    expect(isAcceptedImageType(file('a.svg', 'image/svg+xml'))).toBe(false);
    expect(isAcceptedImageType(file('a.heic', 'image/heic'))).toBe(false);
    // Some platforms leave the type empty: fall back to the extension.
    expect(isAcceptedImageType(file('photo.AVIF', ''))).toBe(true);
    expect(isAcceptedImageType(file('notes.txt', ''))).toBe(false);
  });

  it('rejects wrong types, large files and files beyond the free slots', () => {
    const result = checkImageFiles(
      [
        file('one.png', 'image/png'),
        file('doc.pdf', 'application/pdf'),
        file('big.jpg', 'image/jpeg', 6 * MB),
        file('two.webp', 'image/webp'),
        file('three.gif', 'image/gif'),
      ],
      2,
    );
    expect(result.accepted.map((f) => f.name)).toEqual(['one.png', 'two.webp']);
    expect(result.rejected.map((r) => [r.file.name, r.reason])).toEqual([
      ['doc.pdf', 'type'],
      ['big.jpg', 'size'],
      ['three.gif', 'count'],
    ]);
    expect(result.rejected[1]?.message).toBe('Larger than 5 MB.');
  });

  it('allows exactly the size limit and treats negative slots as none', () => {
    expect(checkImageFiles([file('a.png', 'image/png', 5 * MB)], 1).accepted).toHaveLength(1);
    expect(checkImageFiles([file('a.png', 'image/png')], -3).rejected[0]?.reason).toBe('count');
  });

  it('formats sizes', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(14 * 1024)).toBe('14 KB');
    expect(formatFileSize(2.45 * MB)).toBe('2.5 MB');
    expect(formatFileSize(12 * MB)).toBe('12 MB');
  });

  it('does not offer a retry for failures that would repeat', () => {
    const error = (code: string) => new ApiError({ status: 400, code: code as never, message: '' });
    expect(isPermanentUploadError(error('INVALID_IMAGE'))).toBe(true);
    expect(isPermanentUploadError(error('FILE_TOO_LARGE'))).toBe(true);
    expect(isPermanentUploadError(error('TOO_MANY_IMAGES'))).toBe(false);
    expect(isPermanentUploadError(new Error('boom'))).toBe(false);
  });
});

interface FakeResponse {
  status: number;
  body: unknown;
}

class FakeXhr {
  static queue: FakeResponse[] = [];
  static sent: FakeXhr[] = [];
  upload: { onprogress: ((event: Partial<ProgressEvent>) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  statusText = '';
  responseText = '';
  withCredentials = false;
  method = '';
  url = '';
  body: unknown = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader() {}
  getAllResponseHeaders() {
    return 'content-type: application/json\r\nx-request-id: req-1\r\n';
  }
  abort() {
    this.onabort?.();
  }
  send(body: unknown) {
    this.body = body;
    FakeXhr.sent.push(this);
    const next = FakeXhr.queue.shift() ?? { status: 500, body: {} };
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 40, total: 100 });
      this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
      this.status = next.status;
      this.responseText = JSON.stringify(next.body);
      this.onload?.();
    });
  }
}

const image = { id: 'img-1', url: '/api/v1/images/img-1' };

describe('uploadTaskImages', () => {
  afterEach(() => {
    FakeXhr.queue = [];
    FakeXhr.sent = [];
    vi.unstubAllGlobals();
  });

  it('posts the files as multipart and reports progress', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    FakeXhr.queue.push({ status: 201, body: { data: [image] } });
    const progress: number[] = [];

    const result = await uploadTaskImages('task-1', [file('a.png', 'image/png')], {
      onProgress: (value) => progress.push(value),
    });

    expect(result).toEqual([image]);
    expect(progress).toEqual([0.4, 1]);
    const [request] = FakeXhr.sent;
    expect(request?.method).toBe('POST');
    expect(request?.url).toBe('/api/v1/tasks/task-1/images');
    expect(request?.withCredentials).toBe(true);
    expect((request?.body as FormData).getAll('images')).toHaveLength(1);
  });

  it('refreshes the session once on an expired token and retries', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ data: { user: { id: 'u' }, accessTokenExpiresAt: '2026-10-01' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    FakeXhr.queue.push(
      {
        status: 401,
        body: { error: { code: 'TOKEN_EXPIRED', message: 'Expired', requestId: 'r' } },
      },
      { status: 201, body: { data: [image] } },
    );

    await expect(uploadTaskImages('task-1', [file('a.png', 'image/png')])).resolves.toEqual([
      image,
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0 as never])).toBe('/api/v1/auth/refresh');
    expect(FakeXhr.sent).toHaveLength(2);
  });

  it('turns error envelopes into ApiError without retrying other codes', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    FakeXhr.queue.push({
      status: 400,
      body: {
        error: {
          code: 'INVALID_IMAGE',
          message: 'This file is not a supported image.',
          requestId: 'r',
        },
      },
    });

    const failure = await uploadTaskImages('task-1', [file('a.png', 'image/png')]).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 400, code: 'INVALID_IMAGE', requestId: 'r' });
    expect(FakeXhr.sent).toHaveLength(1);
  });

  it('rejects with an AbortError when cancelled', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const controller = new AbortController();
    controller.abort();
    await expect(
      uploadTaskImages('task-1', [file('a.png', 'image/png')], { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
