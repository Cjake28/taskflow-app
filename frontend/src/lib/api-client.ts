import {
  ErrorCode,
  type ApiErrorBody,
  type FieldError,
  type PaginationMeta,
  type SessionPayload,
} from '@taskflow/shared';

export const API_BASE_PATH = '/api/v1';

/** Codes produced by the client itself when no API error envelope is available. */
export const ClientErrorCode = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNEXPECTED_RESPONSE: 'UNEXPECTED_RESPONSE',
} as const;
export type ClientErrorCode = (typeof ClientErrorCode)[keyof typeof ClientErrorCode];

export type ApiErrorCode = ErrorCode | ClientErrorCode;

/** Normalised API failure. Branch on `code`, never on `message` (spec §6.1). */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: FieldError[];
  readonly requestId: string | null;
  /** Seconds from the `Retry-After` header on 429 responses. */
  readonly retryAfterSeconds: number | null;

  constructor(init: {
    status: number;
    code: ApiErrorCode;
    message: string;
    details?: FieldError[];
    requestId?: string | null;
    retryAfterSeconds?: number | null;
  }) {
    super(init.message);
    this.status = init.status;
    this.code = init.code;
    this.details = init.details ?? [];
    this.requestId = init.requestId ?? null;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
  }
}

export function isApiError(error: unknown, code?: ApiErrorCode): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

export interface ApiEnvelope<T> {
  data: T;
  meta?: PaginationMeta;
}

export interface RequestOptions extends Omit<RequestInit, 'body' | 'method'> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Serialised as JSON with the matching Content-Type. */
  json?: unknown;
  /** Raw body (e.g. FormData); mutually exclusive with `json`. */
  body?: BodyInit | null;
  /** Refresh and retry once on 401 TOKEN_EXPIRED (default true). */
  retryOnExpired?: boolean;
}

export interface AuthHooks {
  /** Called after every successful refresh (boot, scheduler or reactive). */
  onRefreshed?: (session: SessionPayload) => void;
  /** Called when an authenticated request proves the session is gone. */
  onSessionInvalid?: () => void;
}

let authHooks: AuthHooks = {};

/** Registered by the AuthProvider; the client stays framework-agnostic. */
export function setAuthHooks(hooks: AuthHooks): () => void {
  authHooks = hooks;
  return () => {
    if (authHooks === hooks) authHooks = {};
  };
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = (value as { error: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

function fallbackCode(status: number): ApiErrorCode {
  if (status === 404) return ErrorCode.NOT_FOUND;
  if (status === 429) return ErrorCode.RATE_LIMITED;
  if (status === 502 || status === 503 || status === 504) return ErrorCode.SERVICE_UNAVAILABLE;
  if (status >= 500) return ErrorCode.INTERNAL_ERROR;
  return ClientErrorCode.UNEXPECTED_RESPONSE;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Turns a non-2xx response into an ApiError, tolerating proxies that return HTML or nothing. */
export async function toApiError(response: Response): Promise<ApiError> {
  const body = await readJson(response);
  const retryAfterSeconds = parseRetryAfter(response.headers.get('Retry-After'));
  const headerRequestId = response.headers.get('X-Request-Id');

  if (isErrorBody(body)) {
    return new ApiError({
      status: response.status,
      code: body.error.code,
      message: body.error.message,
      details: Array.isArray(body.error.details) ? body.error.details : [],
      requestId: body.error.requestId ?? headerRequestId,
      retryAfterSeconds,
    });
  }

  return new ApiError({
    status: response.status,
    code: fallbackCode(response.status),
    message: response.statusText || `Request failed with status ${response.status}`,
    requestId: headerRequestId,
    retryAfterSeconds,
  });
}

function buildInit(options: RequestOptions): RequestInit {
  const { json, body, retryOnExpired: _retry, method = 'GET', headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  if (!finalHeaders.has('Accept')) finalHeaders.set('Accept', 'application/json');
  let finalBody: BodyInit | null | undefined = body;
  if (json !== undefined) {
    finalHeaders.set('Content-Type', 'application/json');
    finalBody = JSON.stringify(json);
  }
  return { ...rest, method, headers: finalHeaders, body: finalBody, credentials: 'include' };
}

/** One network round trip: no refresh logic. Resolves with the parsed envelope (or undefined for 204). */
async function send<T>(path: string, options: RequestOptions): Promise<ApiEnvelope<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_PATH}${path}`, buildInit(options));
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError({
      status: 0,
      code: ClientErrorCode.NETWORK_ERROR,
      message: "Can't reach the server. Check your connection and try again.",
    });
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return { data: undefined as T };

  const body = await readJson(response);
  if (typeof body === 'object' && body !== null && 'data' in body) {
    return body as ApiEnvelope<T>;
  }
  return { data: body as T };
}

let refreshInFlight: Promise<SessionPayload> | null = null;

/**
 * Rotates the refresh cookie and issues a new access token. Single-flight: concurrent callers
 * (parallel 401s, the scheduler, a tab becoming visible) share one request (spec §14.6).
 */
export function refreshSession(): Promise<SessionPayload> {
  refreshInFlight ??= send<SessionPayload>('/auth/refresh', { method: 'POST' })
    .then(({ data }) => {
      authHooks.onRefreshed?.(data);
      return data;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

function isExpired(error: unknown): boolean {
  return isApiError(error, ErrorCode.TOKEN_EXPIRED) && error.status === 401;
}

function isUnauthenticated(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 401 &&
    (error.code === ErrorCode.UNAUTHENTICATED || error.code === ErrorCode.TOKEN_EXPIRED)
  );
}

/** Full envelope, for paginated endpoints that return `meta`. */
export async function requestEnvelope<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiEnvelope<T>> {
  const { retryOnExpired = true } = options;
  try {
    return await send<T>(path, options);
  } catch (error) {
    if (!retryOnExpired || !isExpired(error)) {
      if (isUnauthenticated(error)) authHooks.onSessionInvalid?.();
      throw error;
    }
  }

  try {
    await refreshSession();
  } catch (refreshError) {
    if (refreshError instanceof ApiError && refreshError.status === 401) {
      authHooks.onSessionInvalid?.();
    }
    throw refreshError;
  }

  try {
    return await send<T>(path, options);
  } catch (retryError) {
    if (isUnauthenticated(retryError)) authHooks.onSessionInvalid?.();
    throw retryError;
  }
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return (await requestEnvelope<T>(path, options)).data;
}

type BodyOptions = Omit<RequestOptions, 'method' | 'json'>;

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, json?: unknown, options?: BodyOptions) =>
    request<T>(path, { ...options, method: 'POST', json }),
  put: <T>(path: string, json?: unknown, options?: BodyOptions) =>
    request<T>(path, { ...options, method: 'PUT', json }),
  patch: <T>(path: string, json?: unknown, options?: BodyOptions) =>
    request<T>(path, { ...options, method: 'PATCH', json }),
  delete: <T = void>(path: string, options?: BodyOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

/** Friendly copy for a failure, keyed by code; falls back to the server's message. */
export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  switch (error.code) {
    case ClientErrorCode.NETWORK_ERROR:
      return "Can't reach the server. Check your connection and try again.";
    case ErrorCode.RATE_LIMITED:
      return `Too many attempts. Try again ${formatRetryAfter(error.retryAfterSeconds)}.`;
    case ErrorCode.SERVICE_UNAVAILABLE:
      return 'The service is temporarily unavailable. Please try again shortly.';
    case ErrorCode.INTERNAL_ERROR:
    case ClientErrorCode.UNEXPECTED_RESPONSE:
      return 'Something went wrong on our side. Please try again.';
    default:
      return error.message;
  }
}

export function formatRetryAfter(seconds: number | null): string {
  if (seconds === null || seconds <= 1) return 'in a moment';
  if (seconds < 60) return `in ${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? 'in 1 minute' : `in ${minutes} minutes`;
}
