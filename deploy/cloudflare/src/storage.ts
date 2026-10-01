/**
 * A small authenticated HTTP API over the Worker's R2 binding, used by the API container
 * (backend `STORAGE_DRIVER=http`). It lets the container store images in R2 without any R2 access
 * keys: only the Worker holds the binding.
 *
 *   PUT    {base}/objects/<key>   body = bytes, Content-Type kept     → 204
 *   GET    {base}/objects/<key>   → 200 bytes | 404
 *   HEAD   {base}/objects/<key>   → 200 | 404
 *   POST   {base}/delete          { "keys": string[] } (≤ 1000)        → 204
 *   GET    {base}/list?prefix=&cursor=  → { objects: [{ key, uploaded }], cursor: string | null }
 *   GET    {base}/health          → 204
 *
 * Every request needs `Authorization: Bearer <token>`. It has no Cloudflare-only types, so the
 * backend tests run this exact code in Node against an in-memory bucket.
 */

export interface BucketObject {
  key: string;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
}

/** The part of an R2 bucket binding this API uses. */
export interface BucketLike {
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<(BucketObject & { body: ReadableStream }) | null>;
  head(key: string): Promise<BucketObject | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ objects: BucketObject[]; truncated: boolean; cursor?: string }>;
}

export const STORAGE_PATH = '/__storage';
const MAX_DELETE = 1000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Same-length comparison that doesn't stop at the first difference. */
function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

/** `images%2Fa%2Fb.webp` style segments back to a key; rejects empty and ".." segments. */
function decodeKey(encoded: string): string | null {
  const segments = encoded.split('/').map((segment) => decodeURIComponent(segment));
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return null;
  }
  return segments.join('/');
}

export async function handleStorageRequest(
  request: Request,
  bucket: BucketLike,
  token: string,
): Promise<Response> {
  const presented = request.headers.get('authorization') ?? '';
  if (!token || !safeEqual(presented, `Bearer ${token}`)) {
    return json({ error: 'unauthorized' }, 401);
  }

  const url = new URL(request.url);
  const path = url.pathname.slice(STORAGE_PATH.length);

  if (path === '/health' && request.method === 'GET') {
    await bucket.list({ limit: 1 });
    return new Response(null, { status: 204 });
  }

  if (path === '/list' && request.method === 'GET') {
    const result = await bucket.list({
      prefix: url.searchParams.get('prefix') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: 1000,
    });
    return json({
      objects: result.objects.map((object) => ({
        key: object.key,
        uploaded: object.uploaded.toISOString(),
      })),
      cursor: result.truncated ? (result.cursor ?? null) : null,
    });
  }

  if (path === '/delete' && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as { keys?: unknown } | null;
    const keys = body?.keys;
    if (
      !Array.isArray(keys) ||
      keys.length > MAX_DELETE ||
      !keys.every((key) => typeof key === 'string' && key.length > 0)
    ) {
      return json({ error: 'keys must be 1–1000 strings' }, 400);
    }
    if (keys.length > 0) await bucket.delete(keys as string[]);
    return new Response(null, { status: 204 });
  }

  if (path.startsWith('/objects/')) {
    const key = decodeKey(path.slice('/objects/'.length));
    if (!key) return json({ error: 'invalid key' }, 400);

    switch (request.method) {
      case 'PUT': {
        const contentType = request.headers.get('content-type') ?? 'application/octet-stream';
        await bucket.put(key, await request.arrayBuffer(), { httpMetadata: { contentType } });
        return new Response(null, { status: 204 });
      }
      case 'GET': {
        const object = await bucket.get(key);
        if (!object) return new Response(null, { status: 404 });
        return new Response(object.body, {
          headers: {
            'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
          },
        });
      }
      case 'HEAD': {
        const object = await bucket.head(key);
        return new Response(null, { status: object ? 200 : 404 });
      }
    }
  }

  return json({ error: 'not found' }, 404);
}
