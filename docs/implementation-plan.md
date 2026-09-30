# TaskFlow — Implementation Plan (Roadmap)

**Spec:** [`docs/design-spec.md`](design-spec.md)

The spec covers several subsystems (backend API, background jobs, file storage, frontend, OAuth). Implementing it from one giant plan would mean writing code for later phases against guesses about earlier ones. Instead, the work is split into **six plans**. Each plan ends with working, tested software, and each later plan is written against the real code produced by the plans before it.

## Plans

| # | Plan | Spec phases (§21) | Deliverable | File | Status |
|---|---|---|---|---|---|
| 1 | Foundation and authentication API | 0, 1, 2 | Monorepo, Docker services, shared package, backend foundation, register / login / refresh / logout / logout-all / `GET /users/me`, rate limiting, origin checks — all covered by tests | — | Ready |
| 2 | Jobs, email, password reset and account API | 3, 4 | Jobs module (email/media/maintenance queues, worker), Mailpit email, forgot / verify / reset password, profile update, change/set password, sessions list/revoke, `auth.cleanup` | `plans/02-jobs-email-and-account.md` | Written when Plan 1 is merged |
| 3 | Tasks, images and dashboard API | 5, 6, 7 | Task CRUD / list / move / activity, storage drivers (local, S3, R2), sharp pipeline, task images and avatars, retention and orphan-sweep jobs, dashboard stats, activity feed | `plans/03-tasks-images-and-dashboard.md` | Written when Plan 2 is merged |
| 4 | Frontend foundation and auth screens | 8, 9 | Vite + React 19 + Tailwind 4 tokens + shadcn, router, API client with single-flight refresh, token scheduler, auth context and guards, layouts, login / register / forgot / reset screens | `plans/04-frontend-foundation-and-auth.md` | Written when Plan 3 is merged |
| 5 | Application screens | 10–15 | Dashboard, tasks list / board / details / dialog, images UI, profile, states, dark mode, hotkeys, responsive and accessibility passes | `plans/05-application-screens.md` | Written when Plan 4 is merged |
| 6 | OAuth and finish | 16, 17 | Google and GitHub sign-in, account linking, avatar import, seed data with images, Swagger, CI, README completion | `plans/06-oauth-and-finish.md` | Written when Plan 5 is merged |

## Research to redo before writing each later plan

| Plan | Verify against current docs before writing |
|---|---|
| 2 | BullMQ **6.x** API (current `latest` is 6.3.x; peer `ioredis >= 5`) — queue/worker construction and job schedulers |
| 3 | `sharp` 0.35 presets, `multer` 2 limits and errors, `@aws-sdk/client-s3` 3.x streaming and checksum settings |
| 4 | shadcn CLI v4 with Tailwind 4 and Vite 8, React Router 8 data mode |
| 6 | `arctic` 3.x Google and GitHub providers |

## Execution conventions (all plans)

- **Branches:** one branch per spec phase (`chore/scaffold`, `feat/backend-foundation`, `feat/auth`, …), merged into `main` through a pull request with a **merge commit** (never squash).
- **Commits:** Conventional Commits, one logical unit per commit.
- **Before every pull request:** `npm run typecheck`, `npm run lint` and `npm run test` must pass, with Docker services running.
- **Secrets:** never committed; every variable is documented in `backend/.env.example`.
