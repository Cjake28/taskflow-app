# TaskFlow — Implementation Plan (Roadmap)

**Spec:** [`docs/design-spec.md`](design-spec.md)

The spec covers several subsystems (backend API, background jobs, file storage, frontend, OAuth). Implementing it from one giant plan would mean writing code for later phases against guesses about earlier ones. Instead, the work is split into **six plans**. Each plan ends with working, tested software, and each later plan is written against the real code produced by the plans before it.

## Plans

| # | Plan | Spec phases (§21) | Deliverable | File | Status |
|---|---|---|---|---|---|
| 1 | Foundation and authentication API | 0, 1, 2 | Monorepo, Docker services, shared package, backend foundation, register / login / refresh / logout / logout-all / `GET /users/me`, rate limiting, origin checks — all covered by tests | — | Done (PRs #1–#3) |
| 2 | Jobs, email, password reset and account API | 3, 4 | Jobs module (email/media/maintenance queues, worker), Mailpit email, forgot / verify / reset password, profile update, change/set password, sessions list/revoke, `auth.cleanup` | — | Done (PRs #4–#5) |
| 3 | Tasks, images and dashboard API | 5, 6, 7 | Task CRUD / list / move / activity, storage drivers (local, S3, R2), sharp pipeline, task images and avatars, retention and orphan-sweep jobs, dashboard stats, activity feed | — | Done (PRs #6–#9) |
| 4 | Frontend foundation and auth screens | 8, 9 | Vite + React 19 + Tailwind 4 tokens + shadcn, router, API client with single-flight refresh, token scheduler, auth context and guards, layouts, login / register / forgot / reset screens | — | Done (PRs #10, #12) |
| 5 | Application screens | 10–15 | Dashboard, tasks list / board / details / dialog, images UI, profile, states, dark mode, hotkeys, responsive and accessibility passes | — | Done (PRs #17, #20, #22) |
| 6 | OAuth and finish | 16, 17 | Google and GitHub sign-in, account linking, avatar import, seed data with images, Swagger, CI, README completion | — | Done (PRs #11, #13–#16, #21, #23); CI workflow and Docker app image pending (see below) |

## How it was actually executed

Plans 2–6 were not written up as separate documents: after Plan 1, the remaining phases were implemented directly from the spec, each phase on its own branch and pull request with tests. Two parts of the frontend (Tasks; Dashboard and Profile) were built in parallel on separate branches against shared contracts merged first (`lib/query-keys.ts`, `lib/due-date.ts`, `lib/activity.ts`).

Changes from the original plan:

- **Email verification** (a bonus in the assessment) was added: confirmation link after registration and after an email change, soft enforcement with a reminder banner.
- **OAuth library:** `arctic` was replaced by a small in-house PKCE client after npm deprecated it; Google ID tokens are now verified with `jose`.
- **S3 testing** uses SeaweedFS instead of MinIO (MinIO images are no longer published).
- **Pending:** the GitHub Actions workflow (`ci/github-actions` branch) needs a GitHub token with the `workflow` scope to be pushed. The full-app Docker images (draft PR #19) built successfully but were not run end to end before the local Docker installation failed.

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
