/**
 * TaskFlow on Cloudflare: this Worker serves the web app (static assets) at taskflow.boats and
 * forwards /api/* to the API running in a Cloudflare Container, so the browser sees one origin
 * (same cookies and CSRF origin check as in development).
 */
import { Container, getContainer } from '@cloudflare/containers';

interface Env {
  API: DurableObjectNamespace<TaskflowApi>;
  ASSETS: Fetcher;
  // Plain settings (wrangler.jsonc "vars").
  FRONTEND_URL: string;
  STORAGE_DRIVER: string;
  R2_ACCOUNT_ID: string;
  R2_BUCKET: string;
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_SECURE: string;
  // Secrets (`wrangler secret put`).
  DATABASE_URL: string;
  JWT_ACCESS_SECRET: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
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
      STORAGE_DRIVER: env.STORAGE_DRIVER,
      R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
      R2_BUCKET: env.R2_BUCKET,
      R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
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
  }
}

function forwardToApi(request: Request, env: Env): Promise<Response> {
  const headers = new Headers(request.headers);
  const clientIp = request.headers.get('cf-connecting-ip');
  if (clientIp) headers.set('x-forwarded-for', clientIp);
  headers.set('x-forwarded-proto', 'https');
  return getContainer(env.API, INSTANCE).fetch(new Request(request, { headers }));
}

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) return forwardToApi(request, env);
    // Everything else is the React app (unknown paths fall back to index.html).
    return env.ASSETS.fetch(request);
  },

  /** Keeps the API container running (and starts it after a deploy) even with no visitors. */
  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(
      getContainer(env.API, INSTANCE).fetch(new Request('https://taskflow.boats/api/v1/health')),
    );
  },
} satisfies ExportedHandler<Env>;
