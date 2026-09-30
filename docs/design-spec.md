# TaskFlow — Design Specification

| | |
|---|---|
| **Status** | Approved design, ready for implementation planning |
| **Date** | 2026-10-01 |
| **Scope** | Full-stack Task Management System (authentication, task management, image uploads) |

This document records every product, architecture, security and design decision made before implementation, including the reasoning behind each. It is the source of truth for the implementation plan.

---

## Table of contents

1. [Goals and scope](#1-goals-and-scope)
2. [Technology stack](#2-technology-stack)
3. [Repository layout](#3-repository-layout)
4. [Backend architecture](#4-backend-architecture)
5. [Data model](#5-data-model)
6. [API design](#6-api-design)
7. [Authentication and sessions](#7-authentication-and-sessions)
8. [Password reset](#8-password-reset)
9. [OAuth (Google and GitHub)](#9-oauth-google-and-github)
10. [Images and file storage](#10-images-and-file-storage)
11. [Background jobs and email](#11-background-jobs-and-email)
12. [Security controls](#12-security-controls)
13. [Error handling](#13-error-handling)
14. [Frontend architecture](#14-frontend-architecture)
15. [Design system](#15-design-system)
16. [Screens inventory](#16-screens-inventory)
17. [Testing strategy](#17-testing-strategy)
18. [Local development](#18-local-development)
19. [Git workflow](#19-git-workflow)
20. [Seed data and demo accounts](#20-seed-data-and-demo-accounts)
21. [Implementation phases](#21-implementation-phases)
22. [Out of scope and future improvements](#22-out-of-scope-and-future-improvements)

---

## 1. Goals and scope

### 1.1 Goal

A registered user can securely manage their own tasks. The application has two areas:

1. **Authentication** — register, login, stay logged in across refreshes, forgot/reset password, logout.
2. **Task management** — dashboard statistics, task CRUD with search/filter/sort, task details with images, and a profile page with a profile picture.

### 1.2 Success criteria

- Every required feature works end-to-end against a real PostgreSQL database.
- Data ownership is enforced by the **backend** — a user can never read or modify another user's task or image, even by editing IDs in URLs or request bodies.
- Passwords, sessions, reset tokens and uploaded files follow current best practice (see §7, §8, §10, §12).
- Another developer can clone the repository and run it by following the README, with no cloud accounts required.
- The UI is clean, consistent, responsive (desktop and mobile), and handles empty, loading, error, confirmation and success states.
- The git history shows incremental progress.

### 1.3 Requirement → design traceability

| Requirement | Where it is covered |
|---|---|
| Registration with 6 fields and validation | §6.3, §12.5, shared `registerSchema` |
| Unique email and username | §5 (unique constraints), §13.3 (409 mapping) |
| Passwords never stored as plain text | §7.1 (argon2id) |
| Login, invalid-credential error, session on success | §6.3, §7 |
| Stay authenticated on refresh | §7.5 (silent refresh on boot) |
| Protected pages | §14.5 (`ProtectedRoute`) + backend `authenticate` |
| Forgot password without exposing account existence | §8.2 (enqueue-first, identical 202 response) |
| Reset token: secure, expiring, single-use; old password stops working | §8 |
| Logout makes protected pages inaccessible | §7.6 (server-side session revocation) |
| Dashboard, Tasks, Profile, Logout navigation | §14.3, §16 |
| Dashboard stats from the database | §6.7 (`groupBy` / `count`) |
| Task fields, statuses, priorities | §5 |
| Create, view, edit, delete with confirmation, details page | §6.5, §16 |
| Search by title, filter by status and priority | §6.5.1 query parameters |
| Profile view/update with uniqueness | §6.4 |
| Ownership enforced by the backend | §4.4, §12.4 |
| Structured REST API with proper status codes | §6 |
| Prisma schema: types, keys, uniques, relations, timestamps, nullability, migrations | §5 |
| Frontend: components, props, state, forms, API, loading/error, protected routes, reusable UI | §14, §15 |
| Graceful errors, no stack traces exposed | §13 |
| README, `.env.example`, no committed secrets | §18, §19 |

### 1.4 Bonus and additional features

| Feature | Decision |
|---|---|
| Pagination, task sorting | ✅ Included |
| Dark mode | ✅ Included |
| Change password while logged in | ✅ Included |
| Refresh-token authentication | ✅ Included (rotation + reuse detection) |
| Rate limiting for auth endpoints | ✅ Included (Redis-backed) |
| Drag-and-drop task status | ✅ Included (desktop Kanban) |
| Activity history | ✅ Included |
| Unit/API tests | ✅ Included |
| Docker configuration | ✅ Included (docker-compose for dependencies) |
| **Task images and profile pictures** | ✅ Included — every image converted to WebP with `sharp`, served only to its owner (§10) |
| **Pluggable storage: local disk, AWS S3, Cloudflare R2** | ✅ Included — selected by environment variable (§10.5) |
| **Background jobs** (email, media, scheduled maintenance) | ✅ Included (§11) |
| OAuth sign-in (Google, GitHub) | ✅ Included — implemented after the core is complete |
| OpenAPI / Swagger docs | ✅ Included — after the core is complete |
| Email verification | ❌ Deferred (schema is ready: `emailVerifiedAt`, `TokenType.EMAIL_VERIFICATION`) |
| Deployment | ❌ Deferred (architecture is deployment-ready, see §22) |

Bonus work starts only after all core requirements are working.

---

## 2. Technology stack

### 2.1 Required stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript, React Router 8, Tailwind CSS 4 |
| Backend | Node.js 24 + Express 5 + TypeScript |
| Database | PostgreSQL 17 + Prisma ORM 7 |

### 2.2 Full dependency list and rationale

**Shared (`packages/shared`)**

| Package | Purpose |
|---|---|
| `zod` 4.x | Single source of truth for request schemas, used by both backend and frontend |

**Backend**

| Package | Purpose / why this one |
|---|---|
| `express` 5.x | Required. v5 forwards rejected promises to the error handler natively — no `asyncHandler` wrapper needed |
| `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg` **7.10.0** | ORM. Prisma 7 requires a driver adapter |
| `argon2` | Password hashing with argon2id (OWASP's first recommendation) |
| `jose` | JWT signing/verification, typed, standards-compliant |
| `cookie-parser` | Reads auth cookies |
| `helmet`, `cors` | Security headers, strict CORS allowlist |
| `ioredis` | Redis client (required by BullMQ; shared with the rate limiter) |
| `rate-limiter-flexible` | Redis-backed rate limiting and brute-force protection with an in-memory fallback |
| `bullmq` | Background jobs: email, media and scheduled maintenance queues |
| `nodemailer` | SMTP delivery (Mailpit in development) |
| `pino`, `pino-http` | Structured logging with request IDs and field redaction |
| `sharp` **0.35.x** | Image decoding, validation, auto-orientation, resizing and WebP encoding (prebuilt binaries, including Windows x64) |
| `multer` **2.x** | Multipart parsing with strict size/count limits (memory storage) |
| `@aws-sdk/client-s3` **3.x** | S3-compatible storage driver (AWS S3, Cloudflare R2, MinIO) |
| `arctic` 3.x | Minimal OAuth 2.0 client (PKCE, state helpers); sessions stay ours |
| `bowser` | Friendly device names for the Active Sessions list ("Chrome on Windows") — MIT licensed (avoids `ua-parser-js` v2, which is AGPL) |
| `@asteasolutions/zod-to-openapi` + `swagger-ui-express` | Bonus API docs generated from the same Zod schemas (verify Zod 4 support; fall back to Zod 4's native `z.toJSONSchema()`) |

**Frontend**

| Package | Purpose / why this one |
|---|---|
| `react`, `react-dom` 19 | UI |
| `react-router` 8 | Routing (data mode, `createBrowserRouter`) |
| `@tanstack/react-query` 5 | Server state: caching, loading/error states, invalidation, optimistic updates |
| `react-hook-form` 7 + `@hookform/resolvers` 5 | Forms with Zod validation |
| `tailwindcss` 4 + `@tailwindcss/vite` | Styling via CSS-variable design tokens |
| shadcn/ui (Radix primitives), `clsx`, `tailwind-merge` | Accessible, owned component source |
| `lucide-react` | Icons |
| `sonner` | Toasts |
| `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | Kanban drag and drop (stable 6.x line) |
| `date-fns` 4 | Date formatting and local day boundaries |
| `@fontsource-variable/plus-jakarta-sans` | Self-hosted font |
| `@dicebear/core` + one CC0 style (e.g. `notionists`; license verified at implementation) | Deterministic fallback avatars generated locally, no network calls |

**Tooling**

| Package | Version / note |
|---|---|
| `typescript` | **6.0.3** — pinned (see traps below) |
| `tsx` | Backend dev runner |
| `tsdown` | Backend production bundle (inlines the shared package) |
| `vite` 8 | Frontend dev server and build |
| `vitest` + `supertest` + `@testing-library/react` | Tests |
| `eslint` 10 + `typescript-eslint` 8, `prettier` 3 | Lint and format |
| `concurrently` | Run backend and frontend together |

### 2.3 Version and compatibility traps found during research

| Trap | Consequence | Decision |
|---|---|---|
| `npm view prisma dist-tags` → `latest: 8.0.0-rc.19` | `npm i prisma` installs a release candidate | Pin `prisma@7.10.0` and matching packages |
| `typescript@latest` is 7.0.2 (native Go compiler); `typescript-eslint` peer range is `<6.1.0` | Linting breaks on TS 7 | Pin `typescript@6.0.3` |
| React Router v8 removed the `react-router-dom` package | Most tutorials are outdated | Import from `react-router`; `RouterProvider` from `react-router/dom` |
| Prisma 7: `prisma-client` generator requires `output`; datasource URL moved to `prisma.config.ts`; driver adapter required | Old setup guides fail | Follow the Prisma 7 layout (§5.1) |
| Zod 4 API differs from v3 (`z.email()`, `z.strictObject()`) | v3 snippets break | Use Zod 4 syntax throughout |
| BullMQ polls Redis continuously | Exhausts Upstash free-tier command quotas | Use a real Redis instance (local Docker; Railway/Render Key Value when deployed) |
| AWS SDK v3 (≥ 3.729) sends new default checksum headers | Some S3-compatible providers reject requests | For custom endpoints (R2, MinIO) set `requestChecksumCalculation` and `responseChecksumValidation` to `WHEN_REQUIRED` |
| Git on Windows with `core.autocrlf=true` | CRLF line endings break shell scripts and container entrypoints | Commit a `.gitattributes` with `* text=auto eol=lf` first |

---

## 3. Repository layout

npm workspaces monorepo:

```
taskflow/
├── package.json                  # workspaces + root scripts
├── tsconfig.base.json            # strict TS settings inherited by all workspaces
├── eslint.config.js
├── .prettierrc
├── .gitattributes                # * text=auto eol=lf
├── .gitignore
├── docker-compose.yml            # postgres + redis + mailpit (+ minio under the "s3" profile)
├── .github/workflows/ci.yml      # lint, typecheck, test, audit (bonus)
├── README.md
├── docs/
│   ├── design-spec.md            # this document
│   └── implementation-plan.md
├── packages/
│   └── shared/                   # "@taskflow/shared" — source-only, no build step
│       └── src/
│           ├── index.ts
│           ├── constants/        # TaskStatus, TaskPriority, OAuthProvider, ErrorCode, image limits
│           ├── schemas/          # auth, user, task, query schemas (Zod)
│           ├── rules/            # password policy, username rules, field limits
│           └── types/            # ApiSuccess, ApiErrorBody, DTOs, DashboardStats, ImageDto
├── backend/                      # "@taskflow/backend"
└── frontend/                     # "@taskflow/frontend"
```

**Shared package rules**

| In `@taskflow/shared` | Backend only | Frontend only |
|---|---|---|
| Field rules and limits, request schemas, enums, `ErrorCode`, image limits, response/DTO types | Prisma client and types, `.strict()` variants, HIBP and uniqueness checks, sharp pipeline | Form-specific shapes (e.g. date input strings), strength-meter UI, client-side upload pre-checks |

The shared package exports TypeScript source (`"exports": { ".": "./src/index.ts" }`). Vite and `tsx` compile it directly; the production backend build uses `tsdown` to bundle it. This avoids a separate watch process and stale types.

**Root scripts**

```
npm install              # installs all workspaces
npm run dev              # backend (API + in-process worker) + frontend (concurrently)
npm run worker           # standalone worker process (optional)
npm run db:migrate       # prisma migrate dev
npm run db:seed          # demo data (including generated images)
npm run db:studio        # prisma studio
npm run build            # all workspaces
npm run test             # all tests
npm run typecheck        # tsc --noEmit everywhere
npm run lint             # eslint
```

---

## 4. Backend architecture

### 4.1 Style

A **NestJS-inspired modular architecture on plain Express**: feature modules, class-based controllers and services, and **manual constructor dependency injection** wired in each module file. NestJS itself is not used — the required stack is Express.

| NestJS concept | TaskFlow equivalent |
|---|---|
| `@Module()` | `*.module.ts` — instantiates and wires the service, controller and router |
| `@Controller()` + route decorators | `*.controller.ts` (class) + `*.routes.ts` |
| `@Injectable()` service | `*.service.ts` (class, dependencies via constructor) |
| DTO + `ValidationPipe` | Zod schemas + `validate()` middleware |
| Guard | `authenticate` middleware |
| Exception filter | `error-handler.ts` + `HttpException` hierarchy |
| `app.module.ts` / `main.ts` | `app.ts` / `server.ts` |

Every external dependency sits behind an interface that can be swapped by configuration: the Prisma driver adapter, `StorageDriver` (local / S3 / R2), `JobQueue` (BullMQ / inline for tests), `MailTransport`, and OAuth providers.

### 4.2 Folder structure

```
backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/               # committed
│   └── seed.ts
├── prisma.config.ts              # Prisma 7 CLI config (datasource URL)
├── storage/                      # local driver root — gitignored
├── src/
│   ├── config/
│   │   └── env.ts                # Zod-validated environment; fail fast on startup
│   ├── common/
│   │   ├── exceptions/           # error codes, HttpException + subclasses
│   │   ├── http/                 # api-response types, respond helpers (ok, created, ...)
│   │   ├── middleware/           # authenticate, validate, rate-limit, verify-origin,
│   │   │                         # request-id, upload (multer), error-handler, not-found
│   │   ├── security/             # rate-limiters, password-policy (+HIBP), cookies
│   │   └── utils/                # password, tokens, logger, escape-html, dates
│   ├── database/
│   │   └── prisma.ts             # PrismaClient with PrismaPg adapter + global omit
│   ├── redis/
│   │   └── redis.ts              # ioredis client
│   ├── storage/
│   │   ├── storage-driver.ts     # interface
│   │   ├── local-disk.driver.ts
│   │   ├── s3.driver.ts          # AWS S3, MinIO; R2 via preset
│   │   └── storage.factory.ts    # picks the driver from env
│   ├── jobs/
│   │   ├── job-queue.ts          # JobQueue interface + BullMQ implementation
│   │   ├── job-types.ts          # typed map: job name → payload
│   │   ├── queues.ts             # email · media · maintenance
│   │   ├── schedules.ts          # cron job schedulers
│   │   ├── worker.ts             # registers processors
│   │   └── processors/           # email, avatar-import, storage-delete,
│   │                             # images-purge, orphan-sweep, auth-cleanup
│   ├── mail/
│   │   ├── mail.service.ts       # enqueues email jobs
│   │   ├── mail.transport.ts     # Nodemailer
│   │   └── templates/            # password-reset.ts, password-changed.ts
│   ├── modules/
│   │   ├── auth/                 # module, routes, controller, service, sessions.service, dto
│   │   ├── oauth/                # module, routes, controller, service, providers/
│   │   ├── users/                # profile, password, sessions, avatar, connected accounts
│   │   ├── tasks/                # CRUD, list, move, task images, mapper
│   │   ├── images/               # images.service, image-processor, serving route, mapper
│   │   ├── activities/           # activity feed + ActivityService (used by tasks)
│   │   ├── dashboard/            # stats
│   │   └── health/
│   ├── docs/                     # OpenAPI registry (bonus)
│   ├── generated/prisma/         # gitignored, produced by `prisma generate`
│   ├── types/express.d.ts        # Request augmentation (req.user, req.id)
│   ├── routes.ts                 # mounts modules under /api/v1
│   ├── app.ts                    # builds the Express app (no listen) — importable by tests
│   ├── server.ts                 # listen, optionally start the worker, graceful shutdown
│   └── worker.ts                 # standalone worker entry (`npm run worker`)
└── tests/
    ├── setup/                    # test DB reset, factories, fakes (FakeMailService,
    │                             # InlineJobQueue, image generator)
    └── *.test.ts
```

### 4.3 Layer responsibilities

```
Request
  → routes       URL + method + middleware chain (rateLimit → authenticate → verifyOrigin → upload? → validate)
  → controller   HTTP only: reads validated input, calls the service, sets cookies, responds
  → service      business logic + Prisma + storage/jobs; no req/res; throws HttpException subclasses
  → Prisma → PostgreSQL        StorageDriver → disk / S3 / R2        JobQueue → Redis

Any thrown error → error-handler → { error: { code, message, details?, requestId } }
```

- Controllers never import Prisma. Services never touch `req`/`res`.
- Controller methods are **arrow-function properties** so `this` stays bound when Express invokes them as callbacks.
- There is **no repository layer** — Prisma already abstracts data access; another layer would add indirection without value.

### 4.4 Ownership enforced by signature

Every task and image service method takes `userId` as its first parameter and scopes every query by it:

```ts
async findOne(userId: string, taskId: string) {
  const task = await this.prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) throw new NotFoundException('Task');
  return task;
}
```

No method accepts a bare `taskId` or `imageId`, so it is impossible to forget the ownership check. Updates and deletes use `updateMany`/`deleteMany` with `{ id, userId }` (or `findFirst` first) so a foreign ID behaves exactly like a missing one.

### 4.5 Module wiring example

```ts
// tasks.module.ts
const activityService = new ActivityService(prisma);
const imagesService = new ImagesService(prisma, storage, jobQueue, imageProcessor, activityService);
const tasksService = new TasksService(prisma, activityService, imagesService);
const tasksController = new TasksController(tasksService, imagesService);
export const tasksRouter = createTasksRouter(tasksController);
```

Dependency injection pays off in tests: the auth module receives a `MailService` backed by a `JobQueue`, so tests inject a `FakeMailService` and an `InlineJobQueue` that record the reset link synchronously.

---

## 5. Data model

### 5.1 Prisma 7 configuration

```ts
// backend/prisma.config.ts
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { seed: 'tsx prisma/seed.ts' },
  datasource: { url: env('DATABASE_URL') },
});
```

```ts
// backend/src/database/prisma.ts
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
export const prisma = new PrismaClient({
  adapter,
  omit: { user: { passwordHash: true } }, // never returned unless explicitly selected
});
```

### 5.2 Schema

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  COMPLETED

  @@map("task_status")
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH

  @@map("task_priority")
}

enum TokenType {
  PASSWORD_RESET
  EMAIL_VERIFICATION

  @@map("token_type")
}

enum ActivityAction {
  CREATED
  UPDATED
  STATUS_CHANGED
  DELETED
  IMAGE_ADDED
  IMAGE_REMOVED

  @@map("activity_action")
}

enum OAuthProvider {
  GOOGLE
  GITHUB

  @@map("oauth_provider")
}

enum ImageKind {
  AVATAR
  TASK

  @@map("image_kind")
}

model User {
  id              String    @id @default(uuid(7)) @db.Uuid
  firstName       String    @map("first_name") @db.VarChar(50)
  lastName        String    @map("last_name") @db.VarChar(50)
  username        String    @unique @db.VarChar(30)
  email           String    @unique @db.VarChar(255)
  passwordHash    String?   @map("password_hash")
  avatarImageId   String?   @unique @map("avatar_image_id") @db.Uuid
  emailVerifiedAt DateTime? @map("email_verified_at") @db.Timestamptz(3)
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt       DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)

  avatarImage   Image?              @relation("UserAvatar", fields: [avatarImageId], references: [id], onDelete: SetNull)
  images        Image[]             @relation("UserImages")
  tasks         Task[]
  sessions      Session[]
  tokens        VerificationToken[]
  activities    TaskActivity[]
  oauthAccounts OAuthAccount[]

  @@map("users")
}

model Session {
  id                String    @id @default(uuid(7)) @db.Uuid
  userId            String    @map("user_id") @db.Uuid
  refreshTokenHash  String    @map("refresh_token_hash") @db.Char(64)
  previousTokenHash String?   @map("previous_token_hash") @db.Char(64)
  rotatedAt         DateTime? @map("rotated_at") @db.Timestamptz(3)
  persistent        Boolean   @default(false)
  userAgent         String?   @map("user_agent") @db.VarChar(512)
  ipAddress         String?   @map("ip_address") @db.Inet
  expiresAt         DateTime  @map("expires_at") @db.Timestamptz(3)
  revokedAt         DateTime? @map("revoked_at") @db.Timestamptz(3)
  lastUsedAt        DateTime  @default(now()) @map("last_used_at") @db.Timestamptz(3)
  createdAt         DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("sessions")
}

model VerificationToken {
  id        String    @id @default(uuid(7)) @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  type      TokenType
  tokenHash String    @unique @map("token_hash") @db.Char(64)
  expiresAt DateTime  @map("expires_at") @db.Timestamptz(3)
  usedAt    DateTime? @map("used_at") @db.Timestamptz(3)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, type])
  @@map("verification_tokens")
}

model OAuthAccount {
  id                String        @id @default(uuid(7)) @db.Uuid
  userId            String        @map("user_id") @db.Uuid
  provider          OAuthProvider
  providerAccountId String        @map("provider_account_id") @db.VarChar(255)
  email             String?       @db.VarChar(255)
  createdAt         DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt         DateTime      @updatedAt @map("updated_at") @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@unique([userId, provider])
  @@map("oauth_accounts")
}

model Task {
  id          String       @id @default(uuid(7)) @db.Uuid
  userId      String       @map("user_id") @db.Uuid
  title       String       @db.VarChar(200)
  description String?      @db.Text
  status      TaskStatus   @default(TODO)
  priority    TaskPriority @default(MEDIUM)
  dueDate     DateTime?    @map("due_date") @db.Timestamptz(3)
  hasDueTime  Boolean      @default(false) @map("has_due_time")
  completedAt DateTime?    @map("completed_at") @db.Timestamptz(3)
  position    Float        @default(0)
  createdAt   DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt   DateTime     @updatedAt @map("updated_at") @db.Timestamptz(3)

  user       User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  activities TaskActivity[]
  images     Image[]

  @@index([userId, status, position])
  @@index([userId, dueDate])
  @@index([userId, createdAt])
  @@map("tasks")
}

model Image {
  id           String    @id @default(uuid(7)) @db.Uuid
  ownerId      String    @map("owner_id") @db.Uuid
  taskId       String?   @map("task_id") @db.Uuid
  kind         ImageKind
  storageKey   String    @unique @map("storage_key") @db.VarChar(255)
  thumbKey     String?   @unique @map("thumb_key") @db.VarChar(255)
  originalName String?   @map("original_name") @db.VarChar(255)
  sizeBytes    Int       @map("size_bytes")
  width        Int
  height       Int
  deletedAt    DateTime? @map("deleted_at") @db.Timestamptz(3)
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  owner    User  @relation("UserImages", fields: [ownerId], references: [id], onDelete: Cascade)
  task     Task? @relation(fields: [taskId], references: [id], onDelete: SetNull)
  avatarOf User? @relation("UserAvatar")

  @@index([ownerId, deletedAt])
  @@index([taskId, createdAt])
  @@index([deletedAt])
  @@map("images")
}

model TaskActivity {
  id        String         @id @default(uuid(7)) @db.Uuid
  userId    String         @map("user_id") @db.Uuid
  taskId    String?        @map("task_id") @db.Uuid
  action    ActivityAction
  taskTitle String         @map("task_title") @db.VarChar(200)
  changes   Json?
  createdAt DateTime       @default(now()) @map("created_at") @db.Timestamptz(3)

  user User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  task Task? @relation(fields: [taskId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@index([taskId, createdAt])
  @@map("task_activities")
}
```

`uuid(7)` is validated with `prisma validate` during setup; if unsupported, fall back to `uuid()` (v4).

### 5.3 Relationships

```
users ─┬─< tasks ─────┬───< task_activities
       │              └───< images (kind = TASK)
       ├─< images (every image, via owner_id)
       ├── avatar_image_id ──> images (kind = AVATAR, optional 1:1)
       ├─< sessions
       ├─< verification_tokens
       ├─< oauth_accounts
       └─< task_activities
```

Every child row cascades when its user is deleted. `task_activities.task_id` and `images.task_id` become `NULL` when a task is deleted, so history and soft-deleted images survive until they are purged.

### 5.4 Data-model decisions

| Decision | Reasoning |
|---|---|
| **UUIDv7** primary keys | Not guessable (defense in depth against ID probing) and time-ordered for index locality. The real protection is the `userId` scope (§4.4). |
| `@map`/`@@map` to snake_case | Idiomatic PostgreSQL names; readable raw SQL without quoting |
| `timestamptz(3)` everywhere | Unambiguous instants; PostgreSQL recommends against `timestamp without time zone` |
| Email and username stored **lowercase** | Normalised in the shared schema (`trim().toLowerCase()`), so `Juan@x.com` and `juan@x.com` are the same account without the `citext` extension |
| `passwordHash` **nullable** | OAuth-only users have no password until they set one |
| `description`, `dueDate` optional | Not every task has details or a deadline. A task without a due date is never overdue. |
| `dueDate` + `hasDueTime` | The UI picks a date and an optional time. Date-only due dates are stored as **end of that day in the user's local time zone**; `hasDueTime` tells the UI to show "End of day" instead of a clock time. Inferring this from the timestamp would break for viewers in other time zones. |
| `completedAt` | Set when status becomes `COMPLETED`, cleared when it leaves. Enables "completed in the last 7 days". |
| `position` (float) | Ordering within a Kanban column; new positions are midpoints between neighbours (§6.5.3) |
| Single `VerificationToken` table + `type` | Password reset and (future) email verification share the same properties: hashed, expiring, single-use |
| Tokens stored as **SHA-256 hashes** | A database leak does not expose usable tokens. SHA-256 (not argon2) is correct here: 256-bit random tokens cannot be brute-forced, and a deterministic hash allows an indexed lookup. |
| `Session` table + `persistent` | One row per login/device; supports revocation, refresh rotation, reuse detection, "remember me" and the Active Sessions list |
| `previousTokenHash` + `rotatedAt` | 30-second grace window for concurrent refreshes (§7.4) |
| `OAuthAccount` stores **no provider tokens** | OAuth is used only to sign in; storing tokens we never use would only add risk |
| One `Image` table for avatars and task images | Same pipeline, same authorization rule (owner only), same retention |
| `avatarImageId` instead of an external avatar URL | Every avatar — uploaded or imported from Google/GitHub — goes through the same pipeline and is served by our API; the browser never loads third-party image URLs |
| `Image.sizeBytes` | Stored bytes (display + thumbnail); summed for the per-user quota |
| `Image.deletedAt` (soft delete) | Implements the retention window and "Undo" (§10.7). Every image query filters `deletedAt: null`. |
| Hard delete for tasks | Keeps every query simple; `TaskActivity.taskTitle` preserves a readable history |
| Composite indexes lead with `userId`/`ownerId` | Every query is scoped by owner, so the ownership rule also drives index design |
| Enums sort by declaration order | `ORDER BY priority` yields `LOW < MEDIUM < HIGH` with no extra work |

---

## 6. API design

### 6.1 Conventions

- Base path: **`/api/v1`**
- JSON bodies (`Content-Type: application/json`), except upload endpoints, which accept `multipart/form-data`
- Dates are ISO 8601 UTC strings
- IDs are UUIDs; malformed IDs are rejected with `400` before reaching the database

**Success envelope**

```jsonc
{ "data": { } }
{ "data": [ ], "meta": { "page": 1, "pageSize": 10, "total": 57, "totalPages": 6 } }
```

**Error envelope**

```jsonc
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please fix the highlighted fields.",
    "details": [{ "field": "email", "message": "Email is already registered" }],
    "requestId": "01J9Z..."
  }
}
```

Clients branch on `code`, never on `message`. Every response carries an `X-Request-Id` header.

### 6.2 Error codes

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Schema validation failed; `details` lists fields |
| 400 | `INVALID_JSON` | Malformed request body |
| 400 | `INVALID_RESET_TOKEN` | Reset token unknown or already used |
| 400 | `RESET_TOKEN_EXPIRED` | Reset token past its expiry |
| 400 | `INVALID_CURRENT_PASSWORD` | Wrong current password on a sensitive change (400, **not** 401 — see note) |
| 400 | `PASSWORD_NOT_SET` | OAuth-only user attempts an action that requires a password |
| 400 | `CANNOT_UNLINK_LAST_METHOD` | Would leave the account with no way to sign in |
| 400 | `INVALID_IMAGE` | File is not a decodable JPEG, PNG, WebP, GIF or AVIF image, or exceeds the pixel limit |
| 400 | `TOO_MANY_IMAGES` | More than 5 files in one request or more than 10 images on a task |
| 401 | `UNAUTHENTICATED` | No valid session |
| 401 | `TOKEN_EXPIRED` | Access token expired — the client should refresh |
| 401 | `INVALID_CREDENTIALS` | Login failed (identical for unknown user and wrong password) |
| 403 | `FORBIDDEN` | Origin check failed (CSRF defense) |
| 404 | `NOT_FOUND` | Resource missing **or owned by someone else** (also soft-deleted images) |
| 409 | `EMAIL_TAKEN` / `USERNAME_TAKEN` | Uniqueness conflict |
| 409 | `ACCOUNT_ALREADY_LINKED` | Provider account already linked to another user |
| 413 | `PAYLOAD_TOO_LARGE` | JSON body over 10 kB |
| 413 | `FILE_TOO_LARGE` | Uploaded file over 5 MB |
| 413 | `STORAGE_QUOTA_EXCEEDED` | Upload would exceed the user's 100 MB quota |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Upload endpoint called without `multipart/form-data` |
| 429 | `RATE_LIMITED` | With `Retry-After` header |
| 500 | `INTERNAL_ERROR` | Anything unexpected — generic message only |
| 503 | `SERVICE_UNAVAILABLE` | Database, storage or queue unavailable |

OAuth callback errors are delivered as redirect query parameters (§9.4): `OAUTH_FAILED`, `OAUTH_EMAIL_UNVERIFIED`, `OAUTH_ACCOUNT_EXISTS`, `ACCOUNT_ALREADY_LINKED`, `OAUTH_PROVIDER_DISABLED`.

> **Why a wrong current password is `400`:** the frontend treats every `401` as "session expired, refresh and retry". Returning `401` for a typo would trigger a refresh loop or log the user out.

### 6.3 Auth — `/api/v1/auth`

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/register` | firstName, lastName, username, email, password, confirmPassword | `201` session payload + auth cookies (auto-login) | 400, 409, 429 |
| POST | `/login` | identifier (email or username), password, rememberMe? | `200` session payload + auth cookies | 400, 401, 429 |
| POST | `/refresh` | — (refresh cookie) | `200` session payload + rotated cookies | 401 |
| POST | `/logout` | — | `204`, cookies cleared (always succeeds) | — |
| POST | `/logout-all` | — | `204`, every session revoked | 401 |
| POST | `/forgot-password` | email | **`202`** with a fixed message | 400, 429, 503 |
| POST | `/reset-password/verify` | token | `204` | 400 (`INVALID_RESET_TOKEN` / `RESET_TOKEN_EXPIRED`) |
| POST | `/reset-password` | token, password, confirmPassword | `204` | 400 |

**Session payload:** `{ data: { user: UserDto, accessTokenExpiresAt: string } }` — the expiry lets the client refresh proactively (§7.5).

The reset token travels in the request **body**, never in a URL path, so it does not land in access logs.

### 6.4 Users — `/api/v1/users/me`

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/users/me` | — | `200` user | 401 |
| PATCH | `/users/me` | firstName?, lastName?, username?, email?, currentPassword (required when email changes) | `200` user | 400, 409 |
| PATCH | `/users/me/password` | currentPassword (omitted when no password is set), newPassword, confirmPassword | `204`; other sessions revoked | 400 |
| PUT | `/users/me/avatar` | multipart field `image` (1 file) | `200` user | 400, 413, 415 |
| DELETE | `/users/me/avatar` | — | `204` | — |
| GET | `/users/me/sessions` | — | `200` list with `current: true` flag and friendly `device` name | 401 |
| DELETE | `/users/me/sessions/:id` | — | `204` | 404 |
| GET | `/users/me/accounts` | — | `200` `{ hasPassword, providers: [{ provider, email, connectedAt }] }` | 401 |
| DELETE | `/users/me/accounts/:provider` | — | `204` | 400 `CANNOT_UNLINK_LAST_METHOD`, 404 |

User response shape: `{ id, firstName, lastName, username, email, avatarUrl, hasPassword, createdAt }`, where `avatarUrl` is `/api/v1/images/<avatarImageId>` or `null`. It is produced by an explicit mapper; `passwordHash` can never leak.

### 6.5 Tasks — `/api/v1/tasks`

| Method | Path | Body / query | Success | Errors |
|---|---|---|---|---|
| GET | `/tasks` | query parameters below | `200` list + meta | 400 |
| POST | `/tasks` | title, description?, status?, priority?, dueDate?, hasDueTime? | `201` task + `Location` | 400 |
| GET | `/tasks/:id` | — | `200` task **with `images`** | 400, 404 |
| PATCH | `/tasks/:id` | any subset of the create fields; `null` clears optional fields | `200` task | 400, 404 |
| PATCH | `/tasks/:id/move` | status, prevId?, nextId? | `200` task | 400, 404 |
| DELETE | `/tasks/:id` | — | `204` (its images are soft-deleted) | 404 |
| GET | `/tasks/:id/activities` | — | `200` list | 404 |
| POST | `/tasks/:id/images` | multipart field `images` (1–5 files) | `201` `ImageDto[]` | 400, 404, 413, 415 |
| DELETE | `/tasks/:id/images/:imageId` | — | `204` (soft delete) | 404 |
| POST | `/tasks/:id/images/:imageId/restore` | — | `200` `ImageDto` (within the retention window) | 400 `TOO_MANY_IMAGES`, 404 |

#### 6.5.1 List query parameters

| Param | Values | Default |
|---|---|---|
| `search` | Title substring, case-insensitive | — |
| `status` | Comma-separated: `TODO,IN_PROGRESS,COMPLETED` | all |
| `priority` | Comma-separated: `LOW,MEDIUM,HIGH` | all |
| `overdue` | `true` | — |
| `dueFrom`, `dueTo` | ISO datetimes (client computes local-day boundaries) | — |
| `sortBy` | `createdAt`, `updatedAt`, `dueDate`, `priority`, `title`, `position` | `createdAt` |
| `sortOrder` | `asc`, `desc` | `desc` |
| `page` | ≥ 1 | 1 |
| `pageSize` | 1–100 | 10 |

`dueDate` sorting places tasks without a due date last. The same endpoint serves every view:

| View | Request |
|---|---|
| Kanban column | `status=X&sortBy=position&sortOrder=asc&pageSize=50` (one request per column) |
| Dashboard agenda | `dueFrom=<local Monday 00:00>&dueTo=<local Sunday 23:59>&sortBy=dueDate&sortOrder=asc&pageSize=100` — grouped by local day on the client (week-strip dots + the selected day's timeline) |
| Dashboard "Due soon" | `status=TODO,IN_PROGRESS&dueTo=<now + 7 days>&sortBy=dueDate&sortOrder=asc&pageSize=6` — includes overdue items |
| Stat tile shortcuts | e.g. Overdue tile → `/tasks?overdue=true` |

#### 6.5.2 Task response shapes

- **List item:** all task columns + computed `isOverdue` (`dueDate < now && status !== COMPLETED`) + `imageCount` + `coverThumbUrl` (first image's thumbnail or `null`).
- **Details:** list item fields + `images: ImageDto[]` (oldest first).

`isOverdue` is calculated on the server so there is a single definition.

#### 6.5.3 Status, position and activity rules

- **New task** → placed at the top of its status column (`position = min(position) − 1`, or `0` if empty).
- **Status change via `PATCH /tasks/:id`** → moves to the top of the new column.
- **`PATCH /tasks/:id/move`** (board drag) → `prevId`/`nextId` are the cards above and below in the destination column; both must belong to the user and be in that status. Position = midpoint of the neighbours, `prev + 1`, `next − 1`, or `0`. If the gap becomes smaller than `1e-6`, the column is renumbered in the same transaction.
- **`completedAt`** is set when status becomes `COMPLETED` and cleared when it leaves.
- **Activity** is written in the **same transaction** as the change:
  - `CREATED` — no changes payload
  - `STATUS_CHANGED` — `{ status: { from, to } }`
  - `UPDATED` — `{ field: { from, to } }` for title, priority, due date; description changes are recorded as `{ description: { changed: true } }` to avoid storing large text twice
  - `IMAGE_ADDED` — `{ images: { count } }`; `IMAGE_REMOVED` — `{ image: { name } }`
  - `DELETED` — title snapshot; `taskId` becomes `NULL`
  - Position-only moves within the same column are not logged.

### 6.6 Images — `/api/v1/images`

| Method | Path | Success | Errors |
|---|---|---|---|
| GET | `/images/:id?variant=display\|thumb` | `200` WebP bytes, or `304` when the ETag matches | 401, 404 (missing, soft-deleted, or not the caller's) |

`ImageDto`: `{ id, url, thumbUrl, width, height, sizeBytes, originalName, createdAt }`, where `url` = `/api/v1/images/<id>` and `thumbUrl` = `/api/v1/images/<id>?variant=thumb`.

### 6.7 Dashboard and activity

| Method | Path | Success |
|---|---|---|
| GET | `/dashboard/stats` | `200` `{ total, byStatus: { TODO, IN_PROGRESS, COMPLETED }, byPriority: { LOW, MEDIUM, HIGH }, overdue, dueSoon, completedLast7Days, completionRate }` |
| GET | `/activities?limit=10` | `200` recent activity for the user |
| GET | `/health` | `200` `{ status, db, redis, storage }` (unauthenticated; used by Docker and future deployment) |

Stats are computed with `groupBy`/`count` in the database, never by loading all tasks into memory. `dueSoon` (next 7 days, not completed) and `completedLast7Days` are **rolling windows**, which are correct in every time zone without the server knowing the user's zone. `completionRate` is an integer percentage.

### 6.8 OAuth — `/api/v1/auth/oauth`

| Method | Path | Result |
|---|---|---|
| GET | `/providers` | `200 { data: ["google", "github"] }` — only providers with configured credentials |
| GET | `/:provider` | `302` to the provider (`?mode=link` when connecting from Profile) |
| GET | `/:provider/callback` | `302` back to the frontend |

### 6.9 API documentation (bonus)

`GET /api/docs` serves Swagger UI generated from the shared Zod schemas.

---

## 7. Authentication and sessions

### 7.1 Passwords

- Hashed with **argon2id** (library defaults meet OWASP guidance).
- Policy (shared by frontend and backend): 8–128 characters; at least one uppercase letter, lowercase letter, number and symbol; must not contain the username or the email's local part.
- **Breached-password check** (server-side): Have I Been Pwned range API with k-anonymity — only the first 5 characters of the SHA-1 hash leave the server. 2-second timeout; **fails open** (logs a warning) so an outage never blocks registration. Disabled in tests via `HIBP_ENABLED=false`.

### 7.2 Tokens and cookies

| | Access token | Refresh token |
|---|---|---|
| Format | JWT (HS256 via `jose`), claims: `sub` (user id), `sid` (session id), `iss`, `aud`, `iat`, `exp` | Opaque: `<sessionId>.<secret>`; secret = 32 random bytes, base64url |
| Lifetime | 15 minutes | 7 days, or **30 days with "Remember me"** |
| Stored server-side | No (stateless, validated against the session cache) | SHA-256 hash of the secret in `sessions` |
| Cookie | `tf_access` · `HttpOnly` · `SameSite=Lax` · `Secure` in production · `Path=/` | `tf_refresh` · `HttpOnly` · `SameSite=Lax` · `Secure` in production · `Path=/api/v1/auth` |
| Persistence | Max-Age 15 min | "Remember me": persistent (Max-Age 30 d). Otherwise a **session cookie** — survives page refresh, cleared when the browser closes. |

The JWT algorithm is pinned on verification (`algorithms: ['HS256']`) to prevent algorithm-confusion attacks. The signing secret must be at least 32 characters (enforced by `env.ts`).

**Why httpOnly cookies instead of `localStorage`:** JavaScript — including injected scripts — cannot read httpOnly cookies. The trade-off is CSRF exposure, which is mitigated in §12.2. Because the app is same-origin, the access cookie is also sent automatically with `<img src="/api/v1/images/…">`, which is what makes private images work without signed URLs (§10.6).

### 7.3 Request authentication

```
authenticate middleware
  1. read tf_access → verify JWT (expired → 401 TOKEN_EXPIRED; invalid → 401 UNAUTHENTICATED)
  2. session check: Redis GET tf:session:<sid>
       hit  → valid
       miss → DB: session exists, not revoked, not expired → SET tf:session:<sid> (TTL 15 min)
       Redis unavailable → DB check directly
  3. req.user = { id, sessionId }
```

This is an **allowlist cache with a database fallback**: if Redis is flushed, requests are still answered correctly (just slower). A denylist of revoked tokens would fail open if Redis lost its data.

### 7.4 Refresh with rotation, reuse detection and grace window

```
POST /auth/refresh  (cookie tf_refresh = <sessionId>.<secret>)
  load session by id → missing / revoked / expired → 401, clear cookies
  hash(secret) == refreshTokenHash
      → rotate: new secret; previousTokenHash = old hash; rotatedAt = now; lastUsedAt = now
      → new access token; set both cookies (same persistence as before)
  hash(secret) == previousTokenHash AND now − rotatedAt ≤ 30 s
      → grace: issue a new access token only; do NOT touch the refresh cookie
  otherwise
      → REUSE DETECTED: revoke the session, log a security warning, 401
```

The grace window exists because two tabs (or a retried request) can present the same refresh token within milliseconds. Without it, the second request looks like token theft and logs the user out. The same approach is used by Auth0 ("reuse interval").

### 7.5 Staying logged in and keeping the access token fresh

- **Boot:** the frontend calls `POST /auth/refresh` behind a splash screen. Success returns the user and `accessTokenExpiresAt` (status `authenticated`); `401` means `unauthenticated`. A logged-in user therefore never sees a flash of the login page, and every page load starts with a fresh access token.
- **Proactive refresh:** the client schedules a silent refresh 60 seconds before `accessTokenExpiresAt` (and immediately when a hidden tab becomes visible after expiry). This matters for images: an `<img>` element cannot retry a `401`, so the cookie must stay valid while the app is open.
- **Reactive refresh:** API calls that receive `401 TOKEN_EXPIRED` refresh once and retry; refreshes are **single-flight** inside a tab (§14.6).

### 7.6 Logout and revocation

| Action | Effect |
|---|---|
| Logout | Revoke the current session in the DB, delete its Redis cache key, clear both cookies. Protected API calls fail immediately afterwards — not just after the access token expires. |
| Logout all devices | Revoke every session of the user |
| Revoke one session (Profile) | Revoke that session (must belong to the user, otherwise 404) |
| Password reset | Revoke **all** sessions |
| Password change (logged in) | Revoke all sessions **except** the current one |

Revocations also delete the matching `tf:session:*` keys.

### 7.7 Sensitive changes

Changing the email or the password requires the current password (`INVALID_CURRENT_PASSWORD` on mismatch). OAuth-only users must set a password first before changing their email (`PASSWORD_NOT_SET`). Setting a first password does not require a current password.

---

## 8. Password reset

### 8.1 Token properties

| Property | Implementation |
|---|---|
| Securely generated | 32 bytes from `crypto.randomBytes`, base64url |
| Stored safely | SHA-256 hash only, in `verification_tokens` (`type = PASSWORD_RESET`) |
| Expiration | 30 minutes |
| Single-use | Atomic claim: `updateMany({ where: { tokenHash, type, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } })` must return `count === 1` — two concurrent submissions cannot both succeed |
| Superseded | Issuing a new token deletes the user's previous unused reset tokens |

### 8.2 Forgot password — enqueue-first

```
POST /auth/forgot-password { email }
  validate → rate limit (IP; per-email limit applied silently)
  enqueue job "email.password-reset-request" { email }   ← no database lookup in the request
  202 { message: "If an account with that email exists, password reset instructions have been sent." }

Worker
  find user by email → none: stop silently
  delete previous unused reset tokens; create a new token (hash stored)
  send the reset email (link: <FRONTEND_URL>/reset-password?token=<raw token>)
```

The API performs the same work for every email address, so neither the response body nor the response time reveals whether an account exists. If the queue is unavailable the endpoint returns `503`, which is safe because no lookup has happened.

### 8.3 Reset password

```
Reset page load → POST /auth/reset-password/verify { token }
  valid   → show the form
  expired → "This link has expired" state + "Send a new link"
  unknown/used → "This link is invalid or has already been used"

POST /auth/reset-password { token, password, confirmPassword }
  validate password policy (including breached-password check)
  transaction:
    atomic claim of the token (§8.1)
    update passwordHash
    revoke every session of the user
  delete the user's tf:session:* cache keys
  enqueue the "email.password-changed" notification
  204
```

Afterwards the old password no longer works and every existing session is signed out. The frontend strips the token from the address bar with `history.replaceState` and sets `<meta name="referrer" content="no-referrer">` on the reset page.

---

## 9. OAuth (Google and GitHub)

### 9.1 Principles

- Library: **`arctic`** — a thin OAuth client; sessions remain our own (§7).
- **Optional by configuration:** a provider is enabled only when its client ID and secret are present. The app runs normally without any OAuth credentials, and the frontend hides disabled buttons using `GET /auth/oauth/providers`.
- Users are matched by **provider account ID** (Google `sub`, GitHub numeric `id`) — never by email, which can change.

### 9.2 Flow (Authorization Code + PKCE)

```
GET /api/v1/auth/oauth/:provider[?mode=link]
  create state + PKCE code verifier
  Redis tf:oauth:<state> = { provider, codeVerifier, mode, userId? }   (TTL 10 min)
  cookie tf_oauth_state=<state> (HttpOnly, SameSite=Lax, 10 min, Path=/api/v1/auth/oauth)
  302 → provider consent screen

GET /api/v1/auth/oauth/:provider/callback?code&state
  state in query must equal the cookie               ← prevents login CSRF
  GETDEL tf:oauth:<state>                            ← single use
  exchange code + verifier for tokens                ← PKCE
  fetch and normalise the profile:
    { providerAccountId, email, emailVerified, firstName, lastName, avatarUrl }
  apply linking rules (§9.3)
  new user with a provider avatar → enqueue "avatar.import" (§10.8)
  create a session exactly like password login (SessionsService)
  302 → frontend
```

`SameSite=Lax` (not `Strict`) is required on the state cookie: the return from the provider is a cross-site top-level navigation, and browsers do not send `Strict` cookies on it.

| Provider | Scopes | Profile source |
|---|---|---|
| Google | `openid email profile` | ID token claims: `sub`, `email`, `email_verified`, `given_name`, `family_name`, `picture` |
| GitHub | `read:user user:email` | `GET /user` (id, login, name, avatar_url) + `GET /user/emails` → the **primary verified** email (`/user` may return `null` for private emails) |

GitHub has no separate first/last name: `name` is split on the last space; if absent, the first name is the login and the last name is empty until the user edits their profile.

### 9.3 Account linking rules

| Situation | Result |
|---|---|
| Provider account already linked | Log in |
| New email, no existing account | Create user (no password) + OAuthAccount. Username generated from the email/login, sanitised to `[a-z0-9._]`, with a random numeric suffix on collision |
| Email matches an existing account | **No auto-link.** Redirect with `OAUTH_ACCOUNT_EXISTS`: "Log in with your password, then connect Google from your Profile." |
| Provider email not verified | Reject (`OAUTH_EMAIL_UNVERIFIED`) |
| Logged-in user chooses "Connect" (`mode=link`) | Link to the current user |
| Provider account linked to a different user | Reject (`ACCOUNT_ALREADY_LINKED`) |
| Unlinking the last sign-in method | Reject (`CANNOT_UNLINK_LAST_METHOD`) |

**Why no automatic linking:** without email verification on local accounts, an attacker could register `victim@gmail.com` with their own password. If a later Google sign-in by the victim auto-linked to that account, the attacker would keep access through the password (pre-account takeover). Explicit linking from an authenticated session avoids this.

### 9.4 Redirect targets

| Outcome | Redirect |
|---|---|
| Login success | `/dashboard` |
| Link success | `/profile?tab=connected&linked=<provider>` |
| Login error | `/login?oauthError=<CODE>` |
| Link error | `/profile?tab=connected&oauthError=<CODE>` |

### 9.5 Structure

```
modules/oauth/
├── oauth.module.ts
├── oauth.routes.ts
├── oauth.controller.ts
├── oauth.service.ts             # find-or-create + linking rules
└── providers/
    ├── oauth-provider.ts        # interface: createAuthorizationUrl(), exchangeCode() → NormalizedProfile
    ├── google.provider.ts
    ├── github.provider.ts
    └── provider-registry.ts     # registers only configured providers
```

---

## 10. Images and file storage

### 10.1 Features

- **Task images:** attach up to 10 images per task (up to 5 per upload), view them in a gallery and lightbox, remove them with "Undo".
- **Profile picture:** upload, replace or remove; imported automatically from Google/GitHub on OAuth sign-up.
- **Every stored image is WebP**, produced by `sharp` from decoded pixels.
- **Private by default:** images are never publicly reachable; each request is authenticated and authorised.

### 10.2 Limits

| Limit | Value | Configurable |
|---|---|---|
| Max upload size | 5 MB per file | `UPLOAD_MAX_FILE_MB` |
| Accepted input formats | JPEG, PNG, WebP, GIF (first frame), AVIF | — |
| Rejected | SVG (can carry scripts), HEIC, TIFF, anything that does not decode | — |
| Max input pixels | 40 megapixels (decompression-bomb guard) | — |
| Files per request | 5 | — |
| Images per task | 10 | — |
| Storage quota per user | 100 MB (active images only) | `USER_STORAGE_QUOTA_MB` |
| Outputs | Display ≤ 1600 px longest side (WebP q80) · thumbnail 400 × 400 cover, attention crop (WebP q70) · avatar 256 × 256 cover, attention crop (WebP q85) | — |

### 10.3 Upload pipeline

```
POST /tasks/:id/images   (multipart, field "images")
  rateLimit(upload) → authenticate → verifyOrigin → upload middleware → validate :id
      upload middleware = multer memoryStorage with limits { fileSize: 5 MB, files: 5, fields: 0 }
      multer limit errors → 413 FILE_TOO_LARGE / 400 TOO_MANY_IMAGES; wrong content type → 415
  ImagesService.addTaskImages(userId, taskId, files)
    task = findFirst({ id: taskId, userId })              → 404 if missing or foreign
    existing active images + new files ≤ 10              → else 400 TOO_MANY_IMAGES
    for each file → ImageProcessor.process(buffer, 'task')
        sharp(buffer, { failOn: 'warning', limitInputPixels: 40_000_000, animated: false })
        metadata().format ∈ { jpeg, png, webp, gif, heif(AV1) }   → else 400 INVALID_IMAGE
        .autoOrient()                                    ← fixes phone photo rotation (EXIF)
        display: resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 })
        thumb:   resize(400, 400, { fit: 'cover', position: 'attention' }).webp({ quality: 70 })
    quota: active bytes + new bytes ≤ quota              → else 413 STORAGE_QUOTA_EXCEEDED
    write objects via StorageDriver.put()
    transaction: insert Image rows + IMAGE_ADDED activity
    if the transaction fails → delete the objects just written (compensating action)
  201 { data: ImageDto[] }
```

- The client's `Content-Type` and filename extension are **never trusted**; a file is accepted only if `sharp` decodes it as an allowed format.
- Processing is **synchronous** within the request: `sharp` runs on the libuv thread pool (it does not block the event loop), typical images take 50–300 ms, and the user expects to see the image immediately. Queuing it would require a processing state, polling, and temporarily storing unprocessed files. `ImageProcessor` is a pure function (buffer in, WebP buffers out), so it can move to a `media.process` job later if needed (e.g. video).
- Output metadata is stripped by default (sharp does not copy EXIF/XMP/IPTC), so **GPS location from phone photos is removed**.
- Re-encoding from decoded pixels also neutralises polyglot files (a valid image that also contains HTML or script).
- Original filenames are sanitised (basename only, control characters removed, max 255) and stored for display only.

**Avatar:** `PUT /users/me/avatar` uses the same pipeline with the `avatar` preset (single 256 × 256 output, no separate thumbnail). The previous avatar is soft-deleted in the same transaction that sets `avatarImageId`.

### 10.4 Storage layout

```
images/<ownerId>/<imageId>.webp          ← display (or the avatar)
images/<ownerId>/<imageId>_thumb.webp    ← thumbnail (task images only)
```

Keys are generated by the server from UUIDs; no user input is ever part of a key, which rules out path traversal. The local driver additionally verifies that every resolved path stays inside `STORAGE_LOCAL_ROOT`. The same layout is used by every driver.

### 10.5 Storage drivers (selected by `STORAGE_DRIVER`)

```ts
interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  getStream(key: string): Promise<Readable>;          // throws NotFound when missing
  delete(keys: string[]): Promise<void>;              // idempotent
  exists(key: string): Promise<boolean>;
  list(prefix: string): AsyncIterable<{ key: string; lastModified: Date }>;
  healthCheck(): Promise<void>;
}
```

| `STORAGE_DRIVER` | Implementation | Configuration |
|---|---|---|
| `local` (default) | `LocalDiskDriver` — files under `STORAGE_LOCAL_ROOT` (outside any static web root; gitignored) | `STORAGE_LOCAL_ROOT` |
| `s3` | `S3Driver` — AWS S3 or any S3-compatible service (MinIO) | `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` (empty for AWS), `S3_FORCE_PATH_STYLE`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` |
| `r2` | `S3Driver` with the Cloudflare R2 preset: endpoint `https://<account>.r2.cloudflarestorage.com`, region `auto`, checksum compatibility settings | `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` |

- `env.ts` validates driver-specific variables with a discriminated union — a misconfigured driver stops the server at startup rather than failing on the first upload.
- Buckets are **private** (no public access policy, no public URLs). S3 (SSE-S3) and R2 encrypt objects at rest by default.
- `healthCheck()` (write/read probe for local, `HeadBucket` for S3/R2) is part of `GET /health`.
- For local S3 testing, `docker compose --profile s3 up` starts **MinIO** and creates a private `taskflow` bucket (§18.2).

### 10.6 Serving images

```
GET /api/v1/images/:id?variant=display|thumb
  authenticate (access cookie)                                → 401
  image = findFirst({ id, ownerId: req.user.id, deletedAt: null })   → 404 (never 403)
  ETag = "<id>-<variant>"  (content for an id never changes)
  If-None-Match matches → 304
  headers:
    Content-Type: image/webp
    Cache-Control: private, no-cache      ← cached by the browser, but revalidated (and re-authorised) on every use
    ETag
    X-Content-Type-Options: nosniff
    Content-Security-Policy: default-src 'none'; sandbox
    Cross-Origin-Resource-Policy: same-origin
    Content-Disposition: inline; filename="<id>.webp"
  stream from StorageDriver.getStream()
```

- The API proxies every driver the same way, so authorisation and headers are identical for local, S3 and R2.
- Because the app is same-origin, `<img src="/api/v1/images/…">` automatically sends the httpOnly access cookie — no signed URLs are needed. A presigned-URL redirect is a possible future optimisation (§22) but is not the default: a presigned URL is a bearer credential for its lifetime.
- `private, no-cache` means a cached image is shown only after a cheap `304` revalidation that re-checks the session — after logout, cached images stop rendering.
- The frontend's `SecureImage` component retries once after a refresh if an image fails with `401`, as a fallback to proactive refresh (§7.5).

### 10.7 Deletion and retention

| Event | Behaviour |
|---|---|
| Image removed from a task | **Soft delete** (`deletedAt = now`). Immediately inaccessible (404), excluded from counts and quota. The UI offers **Undo** (`POST …/restore`). |
| Task deleted | Its images are soft-deleted in the same transaction; `taskId` becomes `NULL` |
| Avatar replaced or removed | The previous avatar is soft-deleted |
| Retention period passes (`IMAGE_RETENTION_DAYS`, default **7**) | The daily `images.purge` job deletes the objects (with retries) and then the rows |
| `IMAGE_RETENTION_DAYS=0` | Purge is enqueued immediately on delete |
| Orphaned objects (no matching row, older than `ORPHAN_GRACE_HOURS`, default 24) | Deleted by the daily `storage.orphan-sweep` job |
| Restore | Allowed while `deletedAt` is within the retention window, the task still exists, and the task has fewer than 10 active images |

**Ordering rule** (the database and object storage cannot share a transaction):
- Upload: write objects → insert rows; on failure, delete the objects.
- Delete/purge: soft-delete rows → later delete objects → delete rows.

The worst possible outcome is an orphaned object, which the sweep removes. A row pointing to a missing object can never be created by normal operation.

### 10.8 OAuth avatar import

On OAuth sign-up, when the provider supplies a picture and the user has no avatar, the `avatar.import` job:

1. Accepts only URLs on an allowlist (`lh3.googleusercontent.com`, `avatars.githubusercontent.com`) over HTTPS — defense against SSRF.
2. Downloads with a 5-second timeout and a 5 MB cap, without following redirects to other hosts.
3. Runs the `avatar` pipeline and sets `avatarImageId`.

Failures are logged and ignored; the UI falls back to the DiceBear avatar. Sign-in is never delayed by the download.

---

## 11. Background jobs and email

### 11.1 Jobs module

```
src/jobs/
├── job-queue.ts        # JobQueue interface: enqueue(name, payload, opts); BullMQ + Inline implementations
├── job-types.ts        # typed map of job names → payloads
├── queues.ts           # queue definitions and default job options
├── schedules.ts        # cron job schedulers (BullMQ job schedulers)
├── worker.ts           # registers processors
└── processors/
```

- **Worker mode:** `RUN_WORKER_IN_API=true` (default) runs the worker inside the API process — a single `npm run dev`. In production it can be set to `false` and the worker started separately with `npm run worker`; no code changes.
- Tests inject `InlineJobQueue`, which runs processors synchronously.

### 11.2 Queues and jobs

| Queue | Job | Trigger | Why it is a job | Retry |
|---|---|---|---|---|
| `email` | `email.password-reset-request` | Forgot password | Identical response timing (anti-enumeration); SMTP retries | 5 × exponential |
| `email` | `email.password-changed` | Password reset or change | The response should not wait for SMTP | 5 × exponential |
| `media` | `avatar.import` | OAuth sign-up | Sign-in must not wait for a third-party download | 3 × exponential |
| `media` | `storage.delete` | Image purge (and immediate purge when retention is 0) | Object storage calls can fail transiently | 5 × exponential |
| `maintenance` | `images.purge` | Daily 03:00 | Enforces `IMAGE_RETENTION_DAYS` | Next run |
| `maintenance` | `storage.orphan-sweep` | Daily 03:30 | Removes objects left behind by crashes | Next run |
| `maintenance` | `auth.cleanup` | Daily 04:00 | Deletes revoked/expired sessions and used/expired tokens older than 30 days | Next run |

Concurrency: `email` 5, `media` 4, `maintenance` 1. Completed jobs are removed; failed jobs are kept for 1 hour (email job payloads may contain a reset link, which expires after 30 minutes anyway).

### 11.3 Email delivery

| Environment | Delivery |
|---|---|
| Development and review | **Mailpit** (Docker): catches every message; inbox at `http://localhost:8025` |
| Production (future) | Any SMTP provider via the same environment variables |

- **Nodemailer** transport configured from `SMTP_*` variables — provider-agnostic.
- Templates are plain TypeScript functions returning `{ subject, html, text }` with inline styles and a plain-text alternative. User-supplied values are HTML-escaped. Emails are always light-themed.

| Template | Content |
|---|---|
| Password reset | Greeting, "Reset password" button, 30-minute expiry, single-use notice, "ignore if you didn't request this" |
| Password changed | Notice that the password changed and other devices were signed out; what to do if it wasn't them |

---

## 12. Security controls

### 12.1 HTTP layer

| Control | Implementation |
|---|---|
| Security headers | `helmet` (HSTS in production, `nosniff`, frame protection, `Referrer-Policy: no-referrer`, no `X-Powered-By`) |
| CORS | Allowlist of `FRONTEND_URL` only, `credentials: true`. In development the Vite proxy makes requests same-origin. |
| Body size | `express.json({ limit: '10kb' })`; uploads are limited separately by multer (§10.2) |
| Client IP | Correct `trust proxy` setting (`TRUST_PROXY`) — otherwise every user behind a proxy shares one IP and rate limiting breaks |
| Request IDs | Generated per request, logged, returned in `X-Request-Id` and error bodies |
| Query parsing | Express 5's default `simple` query parser (no nested objects) plus Zod validation |

### 12.2 CSRF

1. `SameSite=Lax` cookies — not sent on cross-site `POST`/`PATCH`/`PUT`/`DELETE` requests.
2. **Origin verification** on every state-changing method: the `Origin` (or `Referer`) header must match `FRONTEND_URL`, otherwise `403 FORBIDDEN`.
3. JSON-only bodies on regular endpoints — HTML forms cannot send them cross-site without a CORS preflight.

Upload endpoints accept `multipart/form-data`, which an HTML form *can* submit cross-site, so they rely on (1) and (2); both are always enforced.

### 12.3 Rate limiting and brute-force protection

`rate-limiter-flexible` with Redis (in-memory `insuranceLimiter` if Redis is down). Keys are prefixed `tf:rl:`.

| Endpoint | Key | Limit |
|---|---|---|
| Login — consecutive failures | identifier + IP | 5 failures → blocked 15 min; reset on success |
| Login — total | IP | 50 per 15 min |
| Register | IP | 5 per hour |
| Forgot password | IP / email | 5 per 15 min per IP; 3 per hour per email (**silent** — still returns 202) |
| Reset password (+ verify) | IP | 10 per 15 min |
| Refresh | IP | 30 per minute |
| Uploads (task images, avatar) | user ID | 30 per 15 min |
| Image reads (`GET /images/:id`) | user ID | 600 per minute (separate so galleries do not consume the general budget) |
| All other `/api` routes | user ID (or IP) | 300 per 15 min |

Exceeded limits return `429 RATE_LIMITED` with `Retry-After`. The lockout key combines identifier **and** IP so an attacker cannot lock a victim out of their own account.

### 12.4 Authorization and data ownership

- `userId`/`ownerId` scoping in every task and image query (§4.4); foreign IDs return `404`, indistinguishable from missing ones.
- Session and OAuth-account operations are scoped to the current user in the same way.
- **Mass-assignment protection:** backend schemas are strict (`z.strictObject`) — unknown fields such as `userId`, `completedAt` or `position` in a task body are rejected with `400`.

### 12.5 Input validation

- Every body, query and route parameter is validated with Zod before reaching a controller.
- Field limits match the database (`VarChar` sizes, description ≤ 2000 characters in the API).
- Username: 3–30 characters, `[a-z0-9._]`, starting and ending with a letter or number.
- Prisma parameterises every query; no raw SQL string interpolation is used.

### 12.6 File upload security

| Threat | Control |
|---|---|
| Malicious file disguised as an image | Accepted only if `sharp` decodes it as an allowed format; client MIME type and extension ignored |
| Polyglot / embedded payloads | Every stored file is a fresh WebP encoded from decoded pixels |
| SVG script injection | SVG rejected |
| Decompression bomb | 40-megapixel `limitInputPixels`, 5 MB file limit |
| Storage exhaustion | Per-task and per-request counts, per-user quota, upload rate limit |
| Path traversal | Server-generated keys only; resolved-path check in the local driver |
| Unauthorised access | Authenticated, owner-only serving; 404 for foreign or deleted images; private buckets |
| Content sniffing / rendering in page context | `nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cross-Origin-Resource-Policy: same-origin` |
| Privacy leak via metadata | EXIF/XMP/IPTC (including GPS) stripped |
| SSRF during avatar import | HTTPS host allowlist, no cross-host redirects, timeout and size cap |

### 12.7 Anti-enumeration summary

| Flow | Measure |
|---|---|
| Login | One generic error; when the user does not exist, the password is still verified against a dummy argon2 hash so timing matches |
| Forgot password | Enqueue-first — identical response and timing (§8.2) |
| Register | Must report duplicates (required by the specification); mitigated by rate limiting. Documented trade-off. |

### 12.8 Output, logging and secrets

- React escapes output by default; `dangerouslySetInnerHTML` is never used; descriptions render as plain text.
- `pino` redacts `password`, `currentPassword`, `newPassword`, `confirmPassword`, `token`, `authorization` and `cookie` fields.
- 5xx errors log the full stack server-side; clients receive only the generic message and request ID.
- `env.ts` validates configuration at startup (e.g. JWT secret ≥ 32 characters, storage driver variables) and exits on failure.
- No secrets in git; `.env.example` documents every variable.
- Redis is password-protected and, like every Docker service, bound to `127.0.0.1` only.
- CI (bonus) runs `npm audit --audit-level=high`.

---

## 13. Error handling

### 13.1 Exception hierarchy (`common/exceptions`)

```
HttpException(status, code, message, details?)
├── BadRequestException            400
├── ValidationException            400 VALIDATION_ERROR (with details)
├── UnauthorizedException          401
├── ForbiddenException             403
├── NotFoundException              404 — new NotFoundException('Task') → "Task not found"
├── ConflictException              409 — new ConflictException('EMAIL_TAKEN', 'email', 'Email is already registered')
├── PayloadTooLargeException       413 (PAYLOAD_TOO_LARGE, FILE_TOO_LARGE, STORAGE_QUOTA_EXCEEDED)
├── UnsupportedMediaTypeException  415
├── TooManyRequestsException       429 (retryAfterSeconds)
└── ServiceUnavailableException    503
```

### 13.2 Normalisation (`error-handler.ts`)

| Source | Response |
|---|---|
| `HttpException` | As-is |
| `ZodError` | 400 `VALIDATION_ERROR` with `details: [{ field, message }]` |
| `MulterError` `LIMIT_FILE_SIZE` | 413 `FILE_TOO_LARGE` |
| `MulterError` `LIMIT_FILE_COUNT` / `LIMIT_UNEXPECTED_FILE` | 400 `TOO_MANY_IMAGES` / 400 `VALIDATION_ERROR` |
| Prisma `P2002` (unique violation) | 409 — fallback only (see below) |
| Prisma `P2025` (record not found) | 404 |
| Prisma connection errors (`P1001`, initialisation errors) | 503 |
| Storage driver unavailable | 503 |
| Body-parser parse error | 400 `INVALID_JSON` |
| Body-parser size error | 413 `PAYLOAD_TOO_LARGE` |
| Anything else | 500 `INTERNAL_ERROR` — "Something went wrong. Please try again." |

### 13.3 Uniqueness: pre-check plus constraint

Services check for an existing email/username first to return a precise field error. Two simultaneous requests can both pass that check, so the database unique constraint remains the real guarantee and `P2002` is caught as a fallback. The field name is not taken from `P2002` metadata, whose shape varies between Prisma driver adapters.

### 13.4 Logging levels

- 4xx: `warn`, no stack
- 5xx: `error`, full stack (server logs only)

### 13.5 Other layers

- `not-found.ts`: unknown routes → `404 NOT_FOUND` "Route not found".
- Process level: `unhandledRejection`, `uncaughtException`, `SIGTERM`, `SIGINT` → log and graceful shutdown (stop accepting connections, finish in-flight requests, close the worker and queues, disconnect Prisma and Redis).
- Response helpers (`ok`, `created`, `accepted`, `paginated`, `noContent`) guarantee the envelope; controllers never build it by hand.
- Explicit mappers (`toTaskResponse`, `toUserResponse`, `toSessionResponse`, `toImageResponse`) define every outward-facing shape; Prisma records are never serialised directly.

---

## 14. Frontend architecture

### 14.1 Principles

- Function components and hooks (class components are legacy in React).
- **Feature folders mirror the backend modules** (`auth`, `tasks`, `dashboard`, `profile`, `images`).
- shadcn/ui primitives in `components/ui/` (owned source); domain components compose them.

### 14.2 Folder structure

```
frontend/src/
├── app/
│   ├── router.tsx               # createBrowserRouter, lazy routes, errorElement
│   ├── providers.tsx            # QueryClientProvider, AuthProvider, ThemeProvider, Toaster
│   └── query-client.ts
├── components/
│   ├── ui/                      # shadcn primitives
│   ├── layout/                  # AppLayout, Sidebar, MobileTabBar, AuthLayout, PageHeader
│   └── common/                  # EmptyState, ErrorState, ConfirmDialog, Pagination,
│                                # SearchInput, Alert, StatusBadge, PriorityIndicator,
│                                # DueLabel, Timeline, Avatar, LoadingScreen, IconArt
├── features/
│   ├── auth/                    # api, hooks, auth-context, token-scheduler, guards,
│   │                            # components, pages
│   ├── tasks/                   # api, hooks, query-keys, components (TaskTable, TaskCard,
│   │                            # TaskFormDialog, TaskFilters, KanbanBoard, MobileBoard,
│   │                            # MoveTaskSheet, TaskActivityList, TaskImages), pages
│   ├── images/                  # ImageDropzone, UploadQueue, ImageGallery, Lightbox,
│   │                            # SecureImage, AvatarUploader, hooks (useUploadImages)
│   ├── dashboard/               # StatTiles, CompletionCard, PriorityBreakdown,
│   │                            # AgendaCard, DueSoonList, RecentActivity
│   └── profile/                 # AccountForm, ChangePasswordForm, SessionsList,
│                                # ConnectedAccounts
├── lib/
│   ├── api-client.ts            # fetch wrapper, ApiError, single-flight refresh
│   ├── upload.ts                # XHR uploads with progress (fetch has no upload progress)
│   ├── form-errors.ts           # applyServerErrors(form, apiError)
│   ├── dates.ts                 # toEndOfDayISO, local week/day ranges, formatDue
│   └── utils.ts                 # cn()
├── hooks/                       # useDebounce, useMediaQuery, useHotkeys
├── styles/
│   └── globals.css              # design tokens (§15)
└── main.tsx
```

### 14.3 Routes

```
Public-only (authenticated users are redirected to /dashboard)
  /login                 (+ ?oauthError=… · ?reason=expired · ?reset=success)
  /register
  /forgot-password
  /reset-password?token=…

Protected (unauthenticated users are redirected to /login?redirect=…)
  /                      → /dashboard
  /dashboard
  /tasks                 (?view=list|board & filters & sort & page)
  /tasks/:id
  /profile               (?tab=account|security|connected)

*                        → 404 page
```

Create and edit use a dialog (`TaskFormDialog`) over the current page. Task details is a page so it has a shareable URL and room for images and the activity history. The `redirect` parameter only accepts same-origin paths (no open redirect).

### 14.4 State management

| State | Tool |
|---|---|
| Server data (tasks, images, stats, profile, sessions) | **TanStack Query** |
| Authentication status, current user, token expiry | React Context |
| Filters, search, sort, page, view, profile tab | **URL search params** — survive refresh, back button and sharing |
| Form state | React Hook Form + Zod resolvers from the shared package |
| Upload queue (files, progress, errors) | Local state inside `useUploadImages` |
| Theme | Context + `localStorage` (light / dark / system) |
| Local UI (dialog open, hover) | `useState` |

No Redux or Zustand: once server state lives in TanStack Query there is almost no global client state left. Query keys include the URL parameters (`['tasks', 'list', { status, page, … }]`), so every filter combination is cached independently.

### 14.5 Authentication on the client

- **Boot:** silent `POST /auth/refresh` behind a splash screen → `authenticated` (with user and `accessTokenExpiresAt`) or `unauthenticated`.
- **Token scheduler:** refreshes 60 s before expiry and when a tab becomes visible after expiry (§7.5).
- **Guards:** `ProtectedRoute` and `PublicOnlyRoute` wrap route groups.
- **Logout:** `POST /auth/logout` → `queryClient.clear()` (so the next user never sees cached data from the previous one) → `/login`.
- **Cross-tab sync:** `BroadcastChannel('tf-auth')` — logging out in one tab logs out every tab.
- **Session expiry:** a failed refresh clears the cache and redirects to `/login?reason=expired`.

### 14.6 API client

- Thin typed wrapper around `fetch` with `credentials: 'include'`; base path `/api/v1`.
- Error bodies are parsed into `ApiError { status, code, message, details, requestId }`.
- `401 TOKEN_EXPIRED` → call `/auth/refresh` → retry the original request once.
- **Single-flight refresh:** concurrent 401s share one in-flight refresh promise.
- `lib/upload.ts` uses `XMLHttpRequest` for per-file progress, with the same error parsing and refresh-and-retry behaviour.

### 14.7 Forms

- Schemas come from `@taskflow/shared`; frontend-only fields (date input strings, optional time) are transformed before submission.
- Server field errors (`details`) are mapped onto the matching inputs with `applyServerErrors()`.
- Submit buttons show a spinner and are disabled while pending.
- Password inputs have a show/hide toggle; the register, reset and change-password forms show a strength meter and live checklist driven by the shared policy.

### 14.8 Image UI

| Component | Behaviour |
|---|---|
| `ImageDropzone` | Drag and drop, click to browse, and paste from the clipboard. Pre-checks type, size and count on the client using the shared limits for instant feedback (the server remains authoritative). |
| `UploadQueue` | Local preview (object URLs, revoked on unmount), per-file progress bar, per-file error and retry |
| `ImageGallery` | Thumbnail grid on task details; remove with confirmation and an **Undo** toast |
| `Lightbox` | Full-size view with keyboard navigation (←, →, Esc) built on the shadcn Dialog |
| `SecureImage` | `<img>` wrapper with lazy loading, a skeleton while loading, and one refresh-and-retry on error |
| `AvatarUploader` | Preview, upload, replace and remove; the server crops to the focal point, so no crop UI |
| `Avatar` | Uploaded/imported avatar → DiceBear (from the user ID) → initials |
| Task card / row | 📎 image count; the board card shows the cover thumbnail |
| Create dialog | Images can be attached while creating; they upload right after the task is created |

### 14.9 UX behaviour

| Concern | Behaviour |
|---|---|
| Loading | Skeletons for lists, cards and images; spinners on buttons |
| Empty | Two distinct states: "No tasks yet" (with a create action) and "No tasks match your filters" (with "Clear filters") |
| Errors | `ErrorState` with **Try again** (refetch) and the request ID; route-level error boundary for crashes |
| Confirmation | `ConfirmDialog` for deleting a task, removing an image, revoking a session, disconnecting an account and logging out of all devices |
| Success | Toasts (with Undo for image removal) |
| Optimistic updates | Status changes, completion checkbox and board moves update immediately; on failure the change is rolled back with an error toast |
| Search | Debounced (300 ms) and written to the URL |
| Keyboard | `N` opens "New task"; `/` focuses search (ignored while typing in inputs) |
| Responsive | Desktop: floating sidebar. Mobile: bottom tab bar (Home, Tasks, +, Board, Profile); the task table becomes cards; the board becomes status tabs with a "Move to…" bottom sheet instead of drag and drop |
| Accessibility | Radix primitives handle focus trapping and ARIA; every input has a label; images have alt text (original name or "Task image N"); status and priority never rely on colour alone (icon + text); keyboard sensors for drag and drop; `prefers-reduced-motion` disables animations |

### 14.10 Development proxy

`vite.config.ts` proxies `/api` to `http://localhost:4000`, so the browser sees a single origin (`http://localhost:5173`). This removes CORS from development, keeps `SameSite` cookies simple, lets `<img>` tags carry the auth cookie, and gives stable OAuth redirect URIs (`http://localhost:5173/api/v1/auth/oauth/<provider>/callback`).

---

## 15. Design system

### 15.1 Direction

**"Soft Pastel+"** — a lavender-grey canvas with floating white cards, generous radii, pastel status tints, and colour delivered through solid accents (solid icon circles, gradient primary actions, a solid "current" item in timelines). Friendly and modern while staying calm and readable.

### 15.2 Token architecture

```
1. Primitive   raw palette values (hex / OKLCH)
2. Semantic    meaning:  --background, --card, --primary, --muted-foreground, --border,
               --status-todo, --status-progress, --status-done, --danger, --shadow-card …
3. Component   usage:    Button → bg-primary rounded-full · Card → rounded-3xl shadow-card
```

Components reference **semantic tokens only**. Dark mode redefines the semantic layer; no component changes. Tokens are CSS variables consumed by Tailwind 4 via `@theme inline`, extending shadcn's variable set.

### 15.3 Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#F3F4FC` | `#0E0F21` | Canvas |
| `--card` | `#FFFFFF` | `#181A31` | Cards, sidebar, dialogs |
| `--fill` (shadcn `--muted`/`--input`) | `#F0F1F9` | `#222442` | Inputs, subtle surfaces |
| `--border` | `#E3E5F0` | `#26284A` | Dividers, outlines |
| `--foreground` | `#1B1C3A` | `#EDEEFA` | Text (navy, not black) |
| `--muted-foreground` | `#858AA6` | `#9093B2` | Secondary text |
| `--primary` | `#5B5BF0` | `#7C7CF8` | Primary actions, highlights |
| `--primary-2` | `#8B5CF6` | `#A07CF8` | Gradient end for primary actions |
| `--status-todo` | `#5B5BF0` | `#8385F8` | To Do |
| `--status-progress` | `#F28B22` | `#F89B45` | In Progress |
| `--status-done` | `#14B87F` | `#34CD95` | Completed |
| `--danger` (shadcn `--destructive`) | `#F04E6A` | `#F46882` | Overdue, high priority, destructive actions |

Soft tints are derived, not hard-coded:

```css
--soft: 16%;          /* dark: 18% */
--soft-strong: 24%;   /* dark: 28% */
background: color-mix(in oklab, var(--status-progress) var(--soft), var(--card));
color: color-mix(in oklab, var(--status-progress) 80%, var(--foreground)); /* readable tint text */
```

One formula works in both themes because the tint mixes with whatever the card colour is. Text on solid orange surfaces uses a dark foreground (`--on-progress: #2E1F03`) to meet WCAG contrast.

### 15.4 Colour semantics

- **Colour encodes status** (lavender / orange / green).
- **Shape encodes priority** — a signal-bars icon (1, 2 or 3 bars), neutral colour except **High**, which is coral.
- **Coral is reserved for danger** — overdue, high priority, destructive actions. To Do is lavender, not pink, so new tasks never look alarming.
- Every coloured indicator also has an icon and a text label.

### 15.5 Typography, shape, elevation, motion

| Token | Value |
|---|---|
| Font | **Plus Jakarta Sans** (variable, self-hosted); headings 700–800, body 500; `tabular-nums` for figures |
| Scale | Display 30 / H1 28 / H2 22 / H3 16–18 / body 14–15 / small 12–13 |
| Radius | Cards 24 px · tiles 20 px · inputs 14 px · image thumbnails 16 px · buttons and chips fully rounded |
| Shadows | `--shadow-card`: soft, navy-tinted · `--shadow-glow`: coloured, only on primary actions and hero surfaces · `--shadow-pop`: dialogs and sheets |
| Motion | 150–200 ms transitions, dialog fade/zoom (`tw-animate-css`), skeleton shimmer; all disabled under `prefers-reduced-motion` |

### 15.6 Icons and imagery

| Need | Choice |
|---|---|
| UI icons | `lucide-react` |
| Status icons | Lucide icon in a solid colour circle (To Do `ClipboardList`, In Progress `Timer`, Completed `ClipboardCheck`, Overdue `TriangleAlert`) |
| Empty/error/success illustrations | **Icon compositions** — layered tinted circles, a solid core with a Lucide icon, optional sparkles. Token-driven, dark-mode ready, no external assets. |
| Auth brand panel | Primary gradient with floating mini UI cards (task card, stat, progress) built from the same components |
| Avatars | Uploaded or imported avatar (served by our API) → DiceBear (generated locally from the user ID) → initials |

### 15.7 Reference mockups

Static HTML mockups of every screen were produced and approved during design (dashboard, tasks list/board, task details, create dialog, auth, forgot/reset, profile, mobile, states, 404, splash, banners). Image-related UI follows the same tokens and components. The mockups are reference material, not production code.

---

## 16. Screens inventory

| Screen | Key contents |
|---|---|
| **Login** | Split layout (brand panel + form); email-or-username, password with show/hide, "Remember me", "Forgot password?", Google/GitHub buttons (only when enabled), banners for invalid credentials, expired session, OAuth errors and password-reset success |
| **Register** | First/last name, username, email, password with strength meter and checklist, confirm password, inline field errors including "already taken" |
| **Forgot password** | Email field; confirmation state "Check your email" with identical wording for every address |
| **Reset password** | Token verified on load; new password with meter/checklist and confirmation; states for success, expired and invalid links |
| **Dashboard** | Greeting with open-task count; stat tiles (Total, To Do, In Progress, Completed, Overdue — each links to the filtered list); completion-rate card; priority breakdown; agenda (week strip + timeline of tasks due that day); due-soon cards; recent activity |
| **Tasks — list** | Search, status/priority filters, overdue toggle, sort, list/board toggle; table with completion checkbox, status pill, priority bars, due label, 📎 image count, updated time, row actions; pagination; mobile cards |
| **Tasks — board** | Three columns with counts and quick add; cards with cover thumbnail; drag and drop between and within columns with drop placeholder and optimistic update; mobile status tabs + "Move to…" sheet |
| **Task details** | Title, status, priority, due; "Mark as completed", Edit, Delete (confirmation dialog); description; **images** (gallery, dropzone with upload progress, lightbox, remove with Undo); activity timeline with before → after changes; details panel (status, priority, due, created, updated, completed) |
| **Create / edit task** | Dialog: title (required), description (optional, counter), status and priority pickers, due date with optional time ("End of day" when omitted), optional images |
| **Profile** | Header (avatar with change/remove, name, username, email, badges); tabs: **Account** (names, username, email + current password when changing it), **Security** (change/set password, active sessions with revoke, log out of all other devices), **Connected accounts** (Google/GitHub connect/disconnect, password status) |
| **Navigation** | Sidebar: Dashboard, Tasks (count), Profile, user card, labelled **Log out**. Mobile: bottom tab bar; Profile holds theme and Log out |
| **System states** | Empty (two kinds), error with retry and request ID, skeletons, toasts, 404, boot splash |

---

## 17. Testing strategy

### 17.1 Backend — Vitest + Supertest against real PostgreSQL

Ownership, uniqueness, token lifecycles and file handling live in database and storage operations, so tests use a real database and a real (temporary) storage directory rather than mocks.

| Setup | Approach |
|---|---|
| Database | `taskflow_test`, migrated once; `TRUNCATE … CASCADE` before each test |
| Redis | Separate logical DB (`/1`), flushed before each test |
| Storage | Local driver with a temporary root per test run |
| Email | Injected `FakeMailService` records messages (and reset links) |
| Jobs | Injected `InlineJobQueue` runs processors synchronously |
| Test images | Generated at runtime with `sharp` (no binary fixtures) |
| Rate limits | High limits in the test environment, except the dedicated 429 test |
| HIBP | Disabled |
| Execution | Sequential (single worker) to share the database safely |

**Priority test cases**

1. **Ownership** — user B cannot GET/PATCH/DELETE/move user A's task, upload to it, or read A's images (404); lists only contain own tasks; `userId` in a body is rejected (400).
2. **Password reset** — identical 202 for existing and unknown emails; token works once; expired token → `RESET_TOKEN_EXPIRED`; old password fails after reset; all sessions revoked.
3. **Auth** — registration validation and duplicates (409); stored password is a hash; login sets cookies; invalid credentials → 401; refresh rotation; reuse detection revokes; grace window allows a concurrent refresh; after logout protected routes return 401.
4. **Images** — PNG/JPEG upload is stored as WebP (`RIFF…WEBP` signature) within size limits; EXIF is stripped; a renamed text file and an SVG are rejected (`INVALID_IMAGE`); files over 5 MB → 413; an 11th image → `TOO_MANY_IMAGES`; quota → `STORAGE_QUOTA_EXCEEDED`; unauthenticated read → 401; soft-deleted image → 404; restore within the window works; avatar replacement soft-deletes the old one; `images.purge` removes objects and rows after the retention period; `storage.orphan-sweep` removes only unreferenced old objects.
5. **Tasks** — CRUD; search, filters, sort and pagination meta; `isOverdue`; `completedAt` set/cleared; move positions; activity rows written; deleting a task soft-deletes its images.
6. **Dashboard** — counts per status, overdue, due soon, completion rate.
7. **Rate limiting** — sixth failed login → 429 with `Retry-After`.

**Storage driver contract tests** — one shared suite (put, getStream, delete, exists, list) runs against the local driver always, and against MinIO when `S3_TEST_ENDPOINT` is set (CI runs a MinIO service).

**Unit tests:** password policy, token helpers, position midpoint/renumbering, image processor presets, mappers.

### 17.2 Frontend — Vitest + Testing Library

- `api-client`: five concurrent 401 responses trigger exactly one refresh, then retries.
- `applyServerErrors`: maps API details to form fields.
- Password strength meter and checklist.
- `ImageDropzone`: rejects oversized and unsupported files before upload.

### 17.3 Not included

End-to-end browser tests (Playwright) — listed as a future improvement.

### 17.4 CI (bonus)

GitHub Actions with PostgreSQL, Redis and MinIO services: install → migrate → lint → typecheck → test → `npm audit --audit-level=high`.

---

## 18. Local development

### 18.1 Prerequisites

Node.js 24, npm 11, Docker Desktop. No cloud accounts are required.

### 18.2 `docker-compose.yml` services

| Service | Image | Host port (bound to `127.0.0.1`) | Notes |
|---|---|---|---|
| `postgres` | `postgres:17-alpine` | 5432 | Creates `taskflow` and `taskflow_test`; named volume; healthcheck |
| `redis` | `redis:8-alpine` | 6379 | `requirepass`; healthcheck |
| `mailpit` | `axllent/mailpit` (version pinned at setup) | 1025 (SMTP), 8025 (web inbox) | Catches all email |
| `minio` *(profile `s3`)* | `minio/minio` (version pinned at setup) | 9000 (S3 API), 9001 (console) | Optional; for testing `STORAGE_DRIVER=s3` |
| `minio-init` *(profile `s3`)* | `minio/mc` | — | Creates the private `taskflow` bucket, then exits |

```bash
docker compose up -d                  # postgres + redis + mailpit
docker compose --profile s3 up -d     # + minio (+ bucket bootstrap)
```

Ports are bound to `127.0.0.1` because Docker's default `0.0.0.0` binding bypasses the host firewall and exposes the services to the local network.

### 18.3 Application ports

| App | URL |
|---|---|
| Frontend (Vite) | `http://localhost:5173` |
| Backend (Express) | `http://localhost:4000` (reached through the Vite proxy) |
| Mailpit inbox | `http://localhost:8025` |
| MinIO console (optional) | `http://localhost:9001` |
| API docs (bonus) | `http://localhost:5173/api/docs` |

### 18.4 Environment variables (`backend/.env.example`)

```env
NODE_ENV=development
PORT=4000
LOG_LEVEL=info
TRUST_PROXY=loopback

FRONTEND_URL=http://localhost:5173

DATABASE_URL=postgresql://taskflow:taskflow@localhost:5432/taskflow
DATABASE_URL_TEST=postgresql://taskflow:taskflow@localhost:5432/taskflow_test
REDIS_URL=redis://:taskflow@localhost:6379/0

JWT_ACCESS_SECRET=change-me-to-a-random-string-of-at-least-32-chars
ACCESS_TOKEN_TTL_MINUTES=15
REFRESH_TOKEN_TTL_DAYS=7
REFRESH_TOKEN_REMEMBER_TTL_DAYS=30
PASSWORD_RESET_TTL_MINUTES=30
COOKIE_SECURE=false

# Background jobs
RUN_WORKER_IN_API=true

# Email
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM="TaskFlow <no-reply@taskflow.local>"

HIBP_ENABLED=true

# Storage: local | s3 | r2
STORAGE_DRIVER=local
STORAGE_LOCAL_ROOT=./storage

# STORAGE_DRIVER=s3 (AWS S3 or MinIO)
S3_BUCKET=
S3_REGION=
S3_ENDPOINT=
S3_FORCE_PATH_STYLE=false
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

# STORAGE_DRIVER=r2 (Cloudflare R2)
R2_ACCOUNT_ID=
R2_BUCKET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=

# Images
UPLOAD_MAX_FILE_MB=5
USER_STORAGE_QUOTA_MB=100
IMAGE_RETENTION_DAYS=7
ORPHAN_GRACE_HOURS=24

# Optional — OAuth providers are disabled when these are empty
OAUTH_REDIRECT_BASE_URL=http://localhost:5173/api/v1/auth/oauth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

The frontend needs no environment variables (it calls the relative `/api/v1`).

### 18.5 README must cover

Project overview · technologies · prerequisites · installation · environment variables · database setup · Prisma migrations · running backend and frontend · **testing forgot/reset password with Mailpit** · demo credentials · running tests · **storage drivers (local, MinIO, AWS S3, Cloudflare R2)** · background jobs and the worker · optional OAuth setup (Google Cloud Console, GitHub OAuth App) · architecture summary · challenges encountered · what I would improve.

---

## 19. Git workflow

| Aspect | Decision |
|---|---|
| Commit style | Conventional Commits (`feat(auth): …`, `fix(tasks): …`, `test: …`, `docs: …`, `chore: …`) |
| Granularity | One logical unit per commit — the history shows progress step by step |
| Branches | One feature branch per phase (`feat/auth`, `feat/tasks`, …) merged into `main` through a pull request |
| Merge strategy | **Merge commits** — no squash, so individual commits stay visible |
| Never committed | `.env`, generated Prisma client, `node_modules`, build output, `backend/storage/` |

---

## 20. Seed data and demo accounts

`npm run db:seed` creates:

| Account | Email | Username | Password | Data |
|---|---|---|---|---|
| Demo | `demo@taskflow.dev` | `demo` | `Demo@12345!` | ~24 tasks across all statuses and priorities, with due dates relative to "now" (overdue, today, this week, later, none), activity history, a generated avatar, and a few tasks with generated images |
| Second user | `alex@taskflow.dev` | `alex` | `Alex@12345!` | A few tasks and one image — lets reviewers confirm that one user cannot open another user's task or image by ID |

Seed images are generated with `sharp` (gradient placeholders) and stored through the configured storage driver. Seed passwords bypass the breached-password check. The README lists these credentials.

---

## 21. Implementation phases

High-level order; the implementation plan breaks each phase into small, test-driven tasks. Backend tests are written alongside each backend phase.

| # | Phase | Scope |
|---|---|---|
| 0 | Scaffolding | `.gitattributes`, workspaces, tooling, TypeScript/ESLint/Prettier, docker-compose, shared package, README skeleton |
| 1 | Backend foundation | env config, logger, Prisma schema + first migration, app/server, request IDs, error handling, response helpers, health |
| 2 | Authentication | Register, login, sessions, refresh rotation, logout, authenticate middleware, origin check, rate limiting |
| 3 | Jobs + email + password reset | Jobs module, BullMQ queues and worker, mail transport, templates, forgot/verify/reset, password-changed notification, `auth.cleanup` |
| 4 | Users | Profile get/update, change/set password, sessions list/revoke, logout-all |
| 5 | Tasks | CRUD, list filters/sort/pagination, move, activity logging |
| 6 | Storage + images | Storage drivers (local, S3/R2), image processor, upload pipeline, serving, task images, avatar, soft delete/restore, purge and orphan-sweep jobs |
| 7 | Dashboard | Stats, activity feed |
| 8 | Frontend foundation | Vite, Tailwind 4 + tokens, shadcn, fonts, router, providers, API client, token scheduler, auth context, guards, layouts |
| 9 | Auth screens | Login, register, forgot, reset, banners |
| 10 | Dashboard screen | All dashboard cards |
| 11 | Tasks screens | List, filters, dialog, details, delete confirmation |
| 12 | Board | Desktop drag and drop; mobile status tabs + move sheet |
| 13 | Images UI | Dropzone, upload queue, gallery, lightbox, secure image, avatar uploader |
| 14 | Profile screen | Account, security, sessions |
| 15 | Polish | Empty/error/loading states, 404, splash, toasts, dark mode, hotkeys, responsive pass, accessibility pass |
| 16 | OAuth | Backend flow + providers + avatar import; login buttons; connected accounts |
| 17 | Finish | Seed data (with images), Swagger, CI, README completion |

---

## 22. Out of scope and future improvements

- **Deployment** — planned later. The design is same-origin in every environment: a single container where Express also serves the built frontend, with managed PostgreSQL, a real Redis instance (e.g. Railway, or Render with Render Key Value; not Upstash because of BullMQ polling) and `STORAGE_DRIVER=r2` or `s3`.
- **Presigned-URL delivery** for S3/R2 (`302` to a 60-second URL) to offload image bandwidth from the API.
- **Queued media processing** (`media.process`) for large files or video.
- **Email verification** after registration — schema already supports it.
- **Verified email change** (confirm the new address before switching).
- **End-to-end tests** with Playwright.
- **Queue dashboard** (e.g. Bull Board) behind an admin role.
- **Trigram index** (`pg_trgm`) for fast substring search at scale.
- **Tags, subtasks, teams and sharing** — intentionally excluded (YAGNI).
- **Account deletion** and data export.
- **GeoIP** location for the Active Sessions list.
