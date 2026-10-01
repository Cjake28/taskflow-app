/**
 * TaskFlow on Cloudflare: this Worker serves the web app (static assets) at taskflow.boats and
 * forwards /api/* to the API running in a Cloudflare Container, so the browser sees one origin
 * (same cookies and CSRF origin check as in development). It also gives the container access to
 * the R2 image bucket through /__storage (see ./storage.ts), so no R2 keys are needed.
 */
import { Container } from '@cloudflare/containers';
import { handleStorageRequest, STORAGE_PATH } from './storage';

interface Env {
  API: DurableObjectNamespace<TaskflowApi>;
  ASSETS: Fetcher;
  IMAGES: R2Bucket;
  // Plain settings (wrangler.jsonc "vars").
  FRONTEND_URL: string;
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_SECURE: string;
  // Secrets (`wrangler secret put`).
  DATABASE_URL: string;
  JWT_ACCESS_SECRET: string;
  /** Shared between this Worker and the container for /__storage. */
  STORAGE_TOKEN: string;
  SMTP_USER: string;
  SMTP_PASS: string;
  MAIL_FROM: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

/** One always-on instance: the API, its background workers and a private Redis. */
const INSTANCE = 'main';

/** Storage key for the hash of the settings the running container was started with. */
const SETTINGS_KEY = 'settingsFingerprint';

/**
 * The database (Neon) is in us-east-2, so the API lives next to it in Eastern North America:
 * one trip across the ocean per request instead of one per query.
 */
function apiInstance(env: Env) {
  return env.API.get(env.API.idFromName(INSTANCE), { locationHint: 'enam' });
}

export class TaskflowApi extends Container<Env> {
  defaultPort = 4000;
  // The cron below pings it every few minutes, so in practice it never sleeps (reminders and
  // the daily summary are sent by its per-minute scheduler).
  sleepAfter = '1h';

  constructor(...args: ConstructorParameters<typeof Container<Env>>) {
    super(...args);
    const env = args[1];
    const optional = (value: string | undefined) => value ?? '';
    this.envVars = {
      NODE_ENV: 'production',
      PORT: '4000',
      LOG_LEVEL: 'info',
      // Only this Worker can reach the container; it sets X-Forwarded-For to the client's IP.
      TRUST_PROXY: 'true',
      COOKIE_SECURE: 'true',
      FRONTEND_URL: env.FRONTEND_URL,
      DATABASE_URL: env.DATABASE_URL,
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET,
      RUN_WORKER_IN_API: 'true',
      API_DOCS_ENABLED: 'true',
      // Images go to R2 through this Worker (handleStorageRequest below).
      STORAGE_DRIVER: 'http',
      STORAGE_HTTP_URL: `${env.FRONTEND_URL}${STORAGE_PATH}`,
      STORAGE_HTTP_TOKEN: env.STORAGE_TOKEN,
      SMTP_HOST: env.SMTP_HOST,
      SMTP_PORT: env.SMTP_PORT,
      SMTP_SECURE: env.SMTP_SECURE,
      SMTP_USER: env.SMTP_USER,
      SMTP_PASS: env.SMTP_PASS,
      MAIL_FROM: env.MAIL_FROM,
      GOOGLE_CLIENT_ID: optional(env.GOOGLE_CLIENT_ID),
      GOOGLE_CLIENT_SECRET: optional(env.GOOGLE_CLIENT_SECRET),
      GITHUB_CLIENT_ID: optional(env.GITHUB_CLIENT_ID),
      GITHUB_CLIENT_SECRET: optional(env.GITHUB_CLIENT_SECRET),
    };
    const [ctx] = args;
    ctx.blockConcurrencyWhile(() => this.restartIfSettingsChanged(ctx));
  }

  /**
   * A running container keeps the settings it was started with, even after a deploy or
   * `wrangler secret put` (only this Durable Object restarts). Compare a hash of the settings
   * with the one the container was started with and restart it when they differ, so new secrets
   * apply on their own.
   */
  private async restartIfSettingsChanged(ctx: DurableObjectState): Promise<void> {
    const bytes = new TextEncoder().encode(JSON.stringify(this.envVars));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const fingerprint = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    if ((await ctx.storage.get<string>(SETTINGS_KEY)) === fingerprint) return;
    if (ctx.container?.running) await this.destroy();
    await ctx.storage.put(SETTINGS_KEY, fingerprint);
  }
}

function forwardToApi(request: Request, env: Env): Promise<Response> {
  const headers = new Headers(request.headers);
  const clientIp = request.headers.get('cf-connecting-ip');
  if (clientIp) headers.set('x-forwarded-for', clientIp);
  headers.set('x-forwarded-proto', 'https');
  return apiInstance(env).fetch(new Request(request, { headers }));
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    // One canonical address: the API's origin check and the cookies expect FRONTEND_URL.
    const canonical = new URL(env.FRONTEND_URL);
    if (url.hostname !== canonical.hostname && url.hostname.endsWith(canonical.hostname)) {
      url.protocol = canonical.protocol;
      url.hostname = canonical.hostname;
      return Response.redirect(url.toString(), 301);
    }
    const { pathname } = url;
    if (pathname === '/api' || pathname.startsWith('/api/')) return forwardToApi(request, env);
    if (pathname.startsWith(`${STORAGE_PATH}/`)) {
      return handleStorageRequest(request, env.IMAGES, env.STORAGE_TOKEN);
    }
    // Everything else is the React app (unknown paths fall back to index.html).
    return env.ASSETS.fetch(request);
  },

  /** Keeps the API container running (and starts it after a deploy) even with no visitors. */
  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(apiInstance(env).fetch(new Request(`${env.FRONTEND_URL}/api/v1/health`)));
  },
} satisfies ExportedHandler<Env>;
