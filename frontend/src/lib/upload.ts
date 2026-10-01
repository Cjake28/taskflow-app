import { ACCEPTED_IMAGE_TYPES, ErrorCode, IMAGE_LIMITS, type ImageDto } from '@taskflow/shared';

import {
  API_BASE_PATH,
  ApiError,
  ClientErrorCode,
  isApiError,
  refreshSession,
  toApiError,
} from '@/lib/api-client';

/*
 * Image uploads use XMLHttpRequest because fetch cannot report upload progress (spec §14.6).
 * Errors are normalised into the same ApiError as the fetch client, and an expired access token
 * is refreshed (single-flight) and the upload retried once.
 */

export interface UploadOptions {
  /** Upload progress from 0 to 1 (the request body only; server processing follows). */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

function parseHeaders(raw: string): Headers {
  const headers = new Headers();
  for (const line of raw.trim().split(/[\r\n]+/)) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    try {
      headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    } catch {
      // Skip header lines the Headers class rejects.
    }
  }
  return headers;
}

const abortError = () => new DOMException('The upload was cancelled.', 'AbortError');

/** One multipart POST with progress events; resolves with the envelope's `data`. */
function send<T>(path: string, body: FormData, options: UploadOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(abortError());
      return;
    }

    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const cleanup = () => options.signal?.removeEventListener('abort', onAbort);

    xhr.open('POST', `${API_BASE_PATH}${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        options.onProgress?.(Math.min(1, event.loaded / event.total));
      }
    };

    xhr.onload = () => {
      cleanup();
      const response = new Response(xhr.status === 204 ? null : xhr.responseText, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: parseHeaders(xhr.getAllResponseHeaders()),
      });
      if (!response.ok) {
        void toApiError(response).then(reject, reject);
        return;
      }
      void response
        .text()
        .then((text) => {
          const parsed = text ? (JSON.parse(text) as unknown) : undefined;
          resolve(
            (typeof parsed === 'object' && parsed !== null && 'data' in parsed
              ? (parsed as { data: T }).data
              : parsed) as T,
          );
        })
        .catch(() =>
          reject(
            new ApiError({
              status: xhr.status,
              code: ClientErrorCode.UNEXPECTED_RESPONSE,
              message: 'The server sent an unexpected response.',
            }),
          ),
        );
    };

    xhr.onerror = () => {
      cleanup();
      reject(
        new ApiError({
          status: 0,
          code: ClientErrorCode.NETWORK_ERROR,
          message: "Can't reach the server. Check your connection and try again.",
        }),
      );
    };

    xhr.onabort = () => {
      cleanup();
      reject(abortError());
    };

    options.signal?.addEventListener('abort', onAbort, { once: true });
    xhr.send(body);
  });
}

/** POSTs multipart data, refreshing the session and retrying once on 401 TOKEN_EXPIRED. */
export async function uploadMultipart<T>(
  path: string,
  buildBody: () => FormData,
  options: UploadOptions = {},
): Promise<T> {
  try {
    return await send<T>(path, buildBody(), options);
  } catch (error) {
    if (!(isApiError(error, ErrorCode.TOKEN_EXPIRED) && error.status === 401)) throw error;
  }
  await refreshSession();
  options.onProgress?.(0);
  return send<T>(path, buildBody(), options);
}

/** Adds images to a task (multipart field `images`). */
export function uploadTaskImages(
  taskId: string,
  files: File[],
  options: UploadOptions = {},
): Promise<ImageDto[]> {
  return uploadMultipart<ImageDto[]>(
    `/tasks/${taskId}/images`,
    () => {
      const body = new FormData();
      for (const file of files) body.append('images', file, file.name);
      return body;
    },
    options,
  );
}

/* ---------------------------------------------------------------------------------------------
 * Client-side pre-checks (instant feedback; the server stays authoritative).
 * ------------------------------------------------------------------------------------------- */

export type ImageRejectionReason = 'type' | 'size' | 'count';

export interface ImageRejection {
  file: File;
  reason: ImageRejectionReason;
  message: string;
}

export interface ImageCheckResult {
  accepted: File[];
  rejected: ImageRejection[];
}

const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|webp|gif|avif)$/i;

export const ACCEPTED_IMAGE_LABEL = 'JPEG, PNG, WebP, GIF or AVIF';

/** Value for the file input's `accept` attribute. */
export const IMAGE_ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(',');

export function isAcceptedImageType(file: Pick<File, 'type' | 'name'>): boolean {
  if (file.type) return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type);
  // Some platforms report an empty type (e.g. AVIF on older systems): fall back to the name.
  return ACCEPTED_EXTENSIONS.test(file.name);
}

/**
 * Splits picked files into those worth uploading and those that would certainly be rejected:
 * unsupported type, over the per-file size, or beyond the task's remaining image slots.
 */
export function checkImageFiles(
  files: readonly File[],
  slotsLeft: number,
  maxFileMb: number = IMAGE_LIMITS.maxFileMb,
): ImageCheckResult {
  const accepted: File[] = [];
  const rejected: ImageRejection[] = [];
  let slots = Math.max(0, slotsLeft);

  for (const file of files) {
    if (!isAcceptedImageType(file)) {
      rejected.push({
        file,
        reason: 'type',
        message: `Not a supported image. Use ${ACCEPTED_IMAGE_LABEL}.`,
      });
    } else if (file.size > maxFileMb * 1024 * 1024) {
      rejected.push({ file, reason: 'size', message: `Larger than ${maxFileMb} MB.` });
    } else if (slots === 0) {
      rejected.push({
        file,
        reason: 'count',
        message: `A task can have up to ${IMAGE_LIMITS.perTask} images.`,
      });
    } else {
      accepted.push(file);
      slots -= 1;
    }
  }
  return { accepted, rejected };
}

/** Upload failures that will fail again unchanged, so "Retry" is not offered. */
export function isPermanentUploadError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === ErrorCode.INVALID_IMAGE ||
      error.code === ErrorCode.FILE_TOO_LARGE ||
      error.code === ErrorCode.UNSUPPORTED_MEDIA_TYPE ||
      error.code === ErrorCode.NOT_FOUND)
  );
}

/** "2.4 MB", "830 KB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}
