# TaskFlow — Implementation Plan (Roadmap)

**Spec:** [`docs/design-spec.md`](design-spec.md)

The spec covers several subsystems (backend API, background jobs, file storage, frontend, OAuth). Building them all at once would mean writing code for later phases against guesses about earlier ones. Instead, the work is split into **six phases**. Each phase ends with working, tested software, and each later phase builds on the real code of the ones before it.

## Phases

| # | Phase | Spec phases (§21) | Deliverable | Status |
|---|---|---|---|---|
| 1 | Foundation and authentication API | 0, 1, 2 | Monorepo, Docker services, shared package, backend foundation, register / login / refresh / logout / logout-all / `GET /users/me`, rate limiting, origin checks — all covered by tests | Done (PRs #1–#3) |
| 2 | Jobs, email, password reset and account API | 3, 4 | Jobs module (email/media/maintenance queues, worker), Mailpit email, forgot / verify / reset password, profile update, change/set password, sessions list/revoke, `auth.cleanup` | Done (PRs #4–#5) |
| 3 | Tasks, images and dashboard API | 5, 6, 7 | Task CRUD / list / move / activity, storage drivers (local, S3, R2), sharp pipeline, task images and avatars, retention and orphan-sweep jobs, dashboard stats, activity feed | Done (PRs #6–#9) |
| 4 | Frontend foundation and auth screens | 8, 9 | Vite + React 19 + Tailwind 4 tokens + shadcn, router, API client with single-flight refresh, token scheduler, auth context and guards, layouts, login / register / forgot / reset screens | Done (PRs #10, #12) |
| 5 | Application screens | 10–15 | Dashboard, tasks list / board / details / dialog, images UI, profile, states, dark mode, hotkeys, responsive and accessibility passes | Done (PRs #17, #20, #22) |
| 6 | OAuth and finish | 16, 17 | Google and GitHub sign-in, account linking, avatar import, seed data with images, Swagger, CI, README completion | Done (PRs #11, #13–#16, #21, #23); CI workflow and Docker app image pending (see below) |

Each phase was built on its own branch and merged through a pull request with tests. The two biggest frontend parts (Tasks; Dashboard and Profile) were built on separate branches in parallel, against shared modules merged first (`lib/query-keys.ts`, `lib/due-date.ts`, `lib/activity.ts`).

## Changes from the original plan

- **OAuth library:** `arctic` was replaced by a small in-house PKCE client after npm deprecated it; Google ID tokens are verified with `jose`.
- **S3 testing** uses SeaweedFS instead of MinIO (MinIO images are no longer published).
- **Email verification** (a bonus in the assessment) became one-time codes: sign-up and email changes are confirmed with a 6-digit code sent by email (PRs #26–#27).

## Added after the six phases

| Feature | PRs |
|---|---|
| Calendar and activity history pages | #29 |
| UI refinements: Log out on the profile, flat stat tiles, card radius | #30–#34 |
| Notifications: task reminders, due soon, daily summary, new sign-in alerts (bell and email) | #35 |
| One-command setup (`npm run quickstart`) and `SETUP.md` | #36–#40 |
| Production deployment at https://taskflow.boats (Cloudflare Workers and Containers, R2, Neon) | #41–#42 |

## Pending

- The GitHub Actions workflow (`ci/github-actions` branch) needs a GitHub token with the `workflow` scope to be pushed.
- The full-app Docker images (draft PR #19) built successfully but were not run end to end before the local Docker installation failed.

## Conventions

- **Branches:** one branch per phase or feature (`chore/scaffold`, `feat/backend-foundation`, `feat/auth`, …), merged into `main` through a pull request with a **merge commit** (never squash).
- **Commits:** Conventional Commits, one logical unit per commit.
- **Before every pull request:** `npm run typecheck`, `npm run lint` and `npm run test` must pass, with Docker services running.
- **Secrets:** never committed; every variable is documented in `backend/.env.example`.
