import type { SessionPayload } from '@taskflow/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  ClientErrorCode,
  api,
  formatRetryAfter,
  getErrorMessage,
  refreshSession,
  request,
  requestEnvelope,
  setAuthHooks,
  toApiError,
} from './api-client';

const session: SessionPayload = {
  user: {
    id: '0199a1b2-0000-7000-8000-000000000001',
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    username: 'juan',
    email: 'juan@example.com',
    avatarUrl: null,
    hasPassword: true,
    createdAt: '2026-09-29T08:00:00.000Z',
  },
  accessTokenExpiresAt: '2026-10-01T10:15:00.000Z',
};

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function apiErrorBody(code: string, message: string, extra: Record<string, unknown> = {}) {
  return { error: { code, message, requestId: 'req-123', ...extra } };
}

const tokenExpired = () => json(401, apiErrorBody('TOKEN_EXPIRED', 'Access token expired'));

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function mockFetch(handler: Handler) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init ?? {})),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const callsTo = (fetchMock: ReturnType<typeof mockFetch>, path: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url) === `/api/v1${path}`);

let unregister: () => void = () => {};

beforeEach(() => {
  unregister = setAuthHooks({});
});

afterEach(() => {
  unregister();
  vi.unstubAllGlobals();
});

describe('single-flight refresh', () => {
  it('shares one refresh between five concurrent TOKEN_EXPIRED responses and retries each request once', async () => {
    let refreshed = false;
    let releaseRefresh: () => void = () => {};
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });

    const fetchMock = mockFetch(async (url) => {
      if (url === '/api/v1/auth/refresh') {
        await refreshGate; // keep the refresh in flight while the other 401s arrive
        refreshed = true;
        return json(200, { data: session });
      }
      const id = url.split('/').pop();
      return refreshed ? json(200, { data: { id } }) : tokenExpired();
    });

    const onRefreshed = vi.fn();
    unregister = setAuthHooks({ onRefreshed });

    const pending = [1, 2, 3, 4, 5].map((id) => api.get<{ id: string }>(`/tasks/${id}`));
    // Let every original request fail with 401 before the refresh resolves.
    await vi.waitFor(() => expect(callsTo(fetchMock, '/auth/refresh')).toHaveLength(1));
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/tasks/'))).toHaveLength(
        5,
      ),
    );
    releaseRefresh();

    const results = await Promise.all(pending);

    expect(results.map((result) => result.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(callsTo(fetchMock, '/auth/refresh')).toHaveLength(1);
    for (const id of [1, 2, 3, 4, 5]) {
      expect(callsTo(fetchMock, `/tasks/${id}`)).toHaveLength(2); // original + one retry
    }
    expect(onRefreshed).toHaveBeenCalledTimes(1);
    expect(onRefreshed).toHaveBeenCalledWith(session);
  });

  it('starts a new refresh once the previous one has settled', async () => {
    const fetchMock = mockFetch(() => json(200, { data: session }));
    await refreshSession();
    await refreshSession();
    expect(callsTo(fetchMock, '/auth/refresh')).toHaveLength(2);
  });

  it('reports an invalid session and rejects every waiting request when the refresh fails', async () => {
    const fetchMock = mockFetch((url) =>
      url === '/api/v1/auth/refresh'
        ? json(401, apiErrorBody('UNAUTHENTICATED', 'Session expired'))
        : tokenExpired(),
    );
    const onSessionInvalid = vi.fn();
    unregister = setAuthHooks({ onSessionInvalid });

    const results = await Promise.allSettled([1, 2, 3].map((id) => api.get(`/tasks/${id}`)));

    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    const reasons = results.map((result) => (result as PromiseRejectedResult).reason as ApiError);
    expect(reasons.every((reason) => reason instanceof ApiError && reason.status === 401)).toBe(
      true,
    );
    expect(callsTo(fetchMock, '/auth/refresh')).toHaveLength(1);
    expect(onSessionInvalid).toHaveBeenCalled();
    // No retry happened: each request was sent exactly once.
    for (const id of [1, 2, 3]) expect(callsTo(fetchMock, `/tasks/${id}`)).toHaveLength(1);
  });

  it('does not refresh for other 401 codes', async () => {
    const fetchMock = mockFetch(() =>
      json(401, apiErrorBody('INVALID_CREDENTIALS', 'Invalid email/username or password.')),
    );
    await expect(
      api.post('/auth/login', { identifier: 'juan', password: 'x' }),
    ).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
    expect(callsTo(fetchMock, '/auth/refresh')).toHaveLength(0);
  });

  it('retries only once, even if the retried request expires again', async () => {
    const fetchMock = mockFetch((url) =>
      url === '/api/v1/auth/refresh' ? json(200, { data: session }) : tokenExpired(),
    );
    const onSessionInvalid = vi.fn();
    unregister = setAuthHooks({ onSessionInvalid });

    await expect(api.get('/users/me')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(callsTo(fetchMock, '/users/me')).toHaveLength(2);
    expect(callsTo(fetchMock, '/auth/refresh')).toHaveLength(1);
    expect(onSessionInvalid).toHaveBeenCalledTimes(1);
  });

  it('can opt out of the refresh-and-retry', async () => {
    const fetchMock = mockFetch(() => tokenExpired());
    await expect(request('/users/me', { retryOnExpired: false })).rejects.toBeInstanceOf(ApiError);
    expect(callsTo(fetchMock, '/auth/refresh')).toHaveLength(0);
  });
});

describe('request and error parsing', () => {
  it('sends JSON with credentials and unwraps the data envelope', async () => {
    const fetchMock = mockFetch(() => json(201, { data: { ok: true } }));

    await expect(api.post('/auth/register', { email: 'a@b.co' })).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/auth/register');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect(init?.body).toBe(JSON.stringify({ email: 'a@b.co' }));
    const headers = new Headers(init?.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Accept')).toBe('application/json');
  });

  it('returns meta for paginated responses', async () => {
    const meta = { page: 2, pageSize: 10, total: 57, totalPages: 6 };
    mockFetch(() => json(200, { data: [{ id: 1 }], meta }));
    await expect(requestEnvelope('/tasks?page=2')).resolves.toEqual({ data: [{ id: 1 }], meta });
  });

  it('resolves 204 responses with undefined', async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    await expect(api.post('/auth/logout')).resolves.toBeUndefined();
  });

  it('parses the error envelope into an ApiError', async () => {
    mockFetch(() =>
      json(
        409,
        apiErrorBody('USERNAME_TAKEN', 'Username is already taken', {
          details: [{ field: 'username', message: 'Username is already taken' }],
        }),
      ),
    );

    const error = await api.post('/auth/register', {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'USERNAME_TAKEN',
      message: 'Username is already taken',
      details: [{ field: 'username', message: 'Username is already taken' }],
      requestId: 'req-123',
    });
  });

  it('reads Retry-After on 429 responses', async () => {
    mockFetch(() =>
      json(429, apiErrorBody('RATE_LIMITED', 'Too many requests'), { 'Retry-After': '720' }),
    );
    const error = (await api
      .post('/auth/login', {})
      .catch((caught: unknown) => caught)) as ApiError;
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.retryAfterSeconds).toBe(720);
    expect(getErrorMessage(error)).toBe('Too many attempts. Try again in 12 minutes.');
  });

  it('maps non-JSON failures (e.g. a proxy error page) by status', async () => {
    const error = await toApiError(
      new Response('<html>Bad gateway</html>', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'X-Request-Id': 'req-proxy' },
      }),
    );
    expect(error).toMatchObject({
      status: 502,
      code: 'SERVICE_UNAVAILABLE',
      requestId: 'req-proxy',
    });
    expect((await toApiError(new Response('', { status: 404 }))).code).toBe('NOT_FOUND');
    expect((await toApiError(new Response('', { status: 500 }))).code).toBe('INTERNAL_ERROR');
    expect((await toApiError(new Response('', { status: 418 }))).code).toBe(
      ClientErrorCode.UNEXPECTED_RESPONSE,
    );
  });

  it('turns network failures into NETWORK_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(api.get('/users/me')).rejects.toMatchObject({
      status: 0,
      code: ClientErrorCode.NETWORK_ERROR,
    });
  });

  it('lets aborts through untouched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new DOMException('The operation was aborted.', 'AbortError'))),
    );
    await expect(api.get('/users/me')).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('formatRetryAfter', () => {
  it('describes the wait in friendly units', () => {
    expect(formatRetryAfter(null)).toBe('in a moment');
    expect(formatRetryAfter(30)).toBe('in 30 seconds');
    expect(formatRetryAfter(60)).toBe('in 1 minute');
    expect(formatRetryAfter(61)).toBe('in 2 minutes');
  });
});
