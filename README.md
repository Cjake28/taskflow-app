# TaskFlow

A full-stack task management system: secure authentication, task management with images, and a dashboard.

> 🚧 Work in progress. This README is completed at the end of the project.

## Stack

React 19 · TypeScript · Tailwind CSS 4 · Express 5 · Prisma 7 · PostgreSQL 17 · Redis 8

## Prerequisites

- Node.js 24+
- Docker Desktop

## Getting started

```bash
npm install
cp backend/.env.example backend/.env    # then set JWT_ACCESS_SECRET to a long random value
docker compose up -d                    # PostgreSQL, Redis and Mailpit
npm run db:migrate                      # applies Prisma migrations
npm run dev                             # API on :4000 + web app on http://localhost:5173
```

Open <http://localhost:5173>. Health check: <http://localhost:4000/api/v1/health>

`npm run dev` starts the backend and the Vite dev server together (`concurrently`); `npm run dev:backend` and `npm run dev:frontend` run one side only. The Vite server proxies `/api` to the backend, so the browser sees a single origin: no CORS, and the httpOnly auth cookies just work.

If a default port is already in use on your machine, override it: Docker host ports through a root `.env` file (`TASKFLOW_POSTGRES_PORT`, `TASKFLOW_REDIS_PORT`, `TASKFLOW_SMTP_PORT`, `TASKFLOW_MAILPIT_UI_PORT`) and the API port through `PORT` in `backend/.env` (update `REDIS_URL`/`DATABASE_URL` to match). For the web app, create `frontend/.env.local` (see `frontend/.env.example`) with `WEB_PORT` (default 5173) and `API_PORT` (the proxy target, default 4000); keep the backend's `FRONTEND_URL` in sync with the web port.

### Tests

With the Docker services running:

```bash
npm run test         # shared + backend + frontend (backend tests use the taskflow_test database and Redis DB 1)
npm run test -w @taskflow/frontend   # frontend only (Vitest + Testing Library, no services needed)
npm run typecheck
npm run lint
```

### API so far

| Method | Path                      | Notes                                                   |
| ------ | ------------------------- | ------------------------------------------------------- |
| GET    | `/api/v1/health`          | Database and Redis status                               |
| POST   | `/api/v1/auth/register`   | Creates the account and signs in (httpOnly cookies)     |
| POST   | `/api/v1/auth/login`      | `identifier` = email or username; optional `rememberMe` |
| POST   | `/api/v1/auth/refresh`    | Rotates the refresh token                               |
| POST   | `/api/v1/auth/logout`     | Revokes the current session                             |
| POST   | `/api/v1/auth/logout-all` | Revokes every session                                   |
| GET    | `/api/v1/users/me`        | Current user                                            |

State-changing requests must send an `Origin` header matching `FRONTEND_URL` (browsers do this automatically). With curl, add `-H "Origin: http://localhost:5173"`.

## Design

See [`docs/design-spec.md`](docs/design-spec.md) and [`docs/implementation-plan.md`](docs/implementation-plan.md).
