# Deploying TaskFlow to Cloudflare

The live site, **https://taskflow.boats**, runs on Cloudflare Workers and Containers. Only the database is elsewhere (Neon), because Cloudflare has no hosted PostgreSQL.

```
browser ── https://taskflow.boats ──► Worker (src/index.ts)
                                        ├─ static assets: the React build (frontend/dist)
                                        ├─ /api/*      ──► Container: Express API + BullMQ workers + private Redis
                                        │                     └─ PostgreSQL on Neon (us-east-2)
                                        └─ /__storage/* ─► R2 bucket "taskflow-images" (binding)
```

| Piece           | Where                                           | Notes                                                                                                                          |
| --------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Web app         | Worker static assets                            | SPA fallback to `index.html`; `www` redirects to the apex                                                                      |
| API             | Cloudflare Container (`basic`: 1/4 vCPU, 1 GiB) | `Dockerfile` here; `start.sh` starts Redis, applies the migrations, then runs the API                                          |
| Background jobs | Same container                                  | Emails, the per-minute notification tick, daily cleanups                                                                       |
| Redis           | Inside the container, in memory, on `127.0.0.1` | Only short-lived data (session cache, rate limits, queues, pending sign-up codes); PostgreSQL is the source of truth           |
| Images          | R2 bucket `taskflow-images`                     | The API uses `STORAGE_DRIVER=http` against the Worker's `/__storage` API (`src/storage.ts`), so the container needs no R2 keys |
| Database        | Neon PostgreSQL 17, us-east-2                   | The container is pinned to Eastern North America (`constraints.regions`, `locationHint`) to sit next to it                     |
| Email           | Gmail SMTP                                      | App password set as a secret                                                                                                   |

## Why this shape

- **One origin.** The browser only talks to `taskflow.boats`, so the cookies, the CSRF origin check and the Vite proxy setup behave exactly as in development. The Worker forwards `/api/*` with `X-Forwarded-For` set from `CF-Connecting-IP`, which keeps the per-IP rate limits working.
- **Always on.** A cron trigger pings the API every 5 minutes, so the container never sleeps and reminders go out on time. A `basic` instance running all month costs about $7 on top of the Workers Paid plan.
- **No R2 keys.** The container stores images through the Worker, which holds the bucket binding. The API is protected by a random bearer token (`STORAGE_TOKEN`), shared with the container through its environment.

## Deploying

Requirements: the Workers Paid plan (for Containers), Wrangler logged in to the account (`npx wrangler login`), and a Docker engine for the image build. Any engine works: Docker Desktop, or Docker in WSL with `DOCKER_HOST` pointing at it.

```bash
cd deploy/cloudflare
npm install
npm run build:web                          # builds frontend/dist
npx wrangler deploy --secrets-file secrets.json --containers-rollout immediate
```

`secrets.json` (never commit it) holds the secrets. They stay on Cloudflare, so later deploys can leave the file out:

```json
{
  "DATABASE_URL": "postgresql://…neon.tech/neondb?sslmode=verify-full&channel_binding=require",
  "JWT_ACCESS_SECRET": "<48+ random bytes, base64url>",
  "STORAGE_TOKEN": "<48+ random bytes, base64url>",
  "SMTP_USER": "you@gmail.com",
  "SMTP_PASS": "<Gmail app password>",
  "MAIL_FROM": "TaskFlow <you@gmail.com>",
  "GOOGLE_CLIENT_ID": "",
  "GOOGLE_CLIENT_SECRET": ""
}
```

The non-secret settings (`FRONTEND_URL`, SMTP host and port) are `vars` in `wrangler.jsonc`.

**Database:** the container applies pending migrations when it starts. To load the demo accounts, run the seed from a machine with the repository:

```bash
# in backend/: DATABASE_URL points at Neon; images go through the live Worker into R2
DATABASE_URL=… STORAGE_DRIVER=http STORAGE_HTTP_URL=https://taskflow.boats/__storage \
STORAGE_HTTP_TOKEN=<STORAGE_TOKEN> npx tsx prisma/seed.ts
```

**Domain:** `taskflow.boats` uses zone routes (`taskflow.boats/*`, `www.taskflow.boats/*`) on its proxied DNS records. Removing those records lets you switch to Workers custom domains instead.

**Google sign-in:** add `https://taskflow.boats/api/v1/auth/oauth/google/callback` to the Google client's redirect URIs.

## Operating it

- **Logs:** Cloudflare dashboard → Workers & Pages → taskflow → Logs (Worker) and Containers → taskflow-taskflowapi (API output). `npx wrangler tail` streams the Worker's logs.
- **Health:** https://taskflow.boats/api/v1/health reports the database, Redis and storage.
- **API docs:** https://taskflow.boats/api/docs
