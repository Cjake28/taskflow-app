# TaskFlow — Design Specification

| | |
|---|---|
| **Status** | Approved design, ready for implementation planning |
| **Date** | 2026-10-01 |
| **Scope** | Full-stack Task Management System (authentication + task management) |

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
10. [Security controls](#10-security-controls)
11. [Email delivery](#11-email-delivery)
12. [Error handling](#12-error-handling)
13. [Frontend architecture](#13-frontend-architecture)
14. [Design system](#14-design-system)
15. [Screens inventory](#15-screens-inventory)
16. [Testing strategy](#16-testing-strategy)
17. [Local development](#17-local-development)
18. [Git workflow](#18-git-workflow)
19. [Seed data and demo accounts](#19-seed-data-and-demo-accounts)
20. [Implementation phases](#20-implementation-phases)
21. [Out of scope and future improvements](#21-out-of-scope-and-future-improvements)

---

## 1. Goals and scope

### 1.1 Goal

A registered user can securely manage their own tasks. The application has two areas:

1. **Authentication** — register, login, stay logged in across refreshes, forgot/reset password, logout.
2. **Task management** — dashboard statistics, task CRUD with search/filter/sort, task details, and a profile page.

### 1.2 Success criteria

- Every required feature works end-to-end against a real PostgreSQL database.
- Data ownership is enforced by the **backend** — a user can never read or modify another user's task, even by editing IDs in URLs or request bodies.
- Passwords, sessions and reset tokens follow current best practice (see §7, §8, §10).
- Another developer can clone the repository and run it by following the README.
- The UI is clean, consistent, responsive (desktop and mobile), and handles empty, loading, error, confirmation and success states.
- The git history shows incremental progress.

### 1.3 Requirement → design traceability

| Requirement | Where it is covered |
|---|---|
| Registration with 6 fields and validation | §6.3, §10.5, shared `registerSchema` |
| Unique email and username | §5 (unique constraints), §12.3 (409 mapping) |
| Passwords never stored as plain text | §7.1 (argon2id) |
| Login, invalid-credential error, session on success | §6.3, §7 |
| Stay authenticated on refresh | §7.5 (`GET /users/me` boot check + refresh cookie) |
| Protected pages | §13.5 (`ProtectedRoute`) + backend `authenticate` |
| Forgot password without exposing account existence | §8.2 (enqueue-first, identical 202 response) |
| Reset token: secure, expiring, single-use; old password stops working | §8 |
| Logout makes protected pages inaccessible | §7.6 (server-side session revocation) |
| Dashboard, Tasks, Profile, Logout navigation | §13.3, §15 |
| Dashboard stats from the database | §6.6 (`groupBy` / `count`) |
| Task fields, statuses, priorities | §5 |
| Create, view, edit, delete with confirmation, details page | §6.5, §15 |
| Search by title, filter by status and priority | §6.5 query parameters |
| Profile view/update with uniqueness | §6.4 |
| Ownership enforced by the backend | §4.4, §10.4 |
| Structured REST API with proper status codes | §6 |
| Prisma schema: types, keys, uniques, relations, timestamps, nullability, migrations | §5 |
| Frontend: components, props, state, forms, API, loading/error, protected routes, reusable UI | §13, §14 |
| Graceful errors, no stack traces exposed | §12 |
| README, `.env.example`, no committed secrets | §17, §18 |

### 1.4 Bonus features

| Bonus | Decision |
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
| OAuth sign-in (Google, GitHub) | ✅ Included — implemented after the core is complete |
| OpenAPI / Swagger docs | ✅ Included — after the core is complete |
| Email verification | ❌ Deferred (schema is ready: `emailVerifiedAt`, `TokenType.EMAIL_VERIFICATION`) |
| Deployment | ❌ Deferred (architecture is deployment-ready, see §21) |

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
| `bullmq` | Background email queue with retries |
| `nodemailer` | SMTP delivery (Mailpit in development) |
| `pino`, `pino-http` | Structured logging with request IDs and field redaction |
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
| `@dicebear/core` + one CC0 style (e.g. `notionists`; license verified at implementation) | Deterministic avatars generated locally, no network calls |

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

### 2.3 Version traps found during research

| Trap | Consequence | Decision |
|---|---|---|
| `npm view prisma dist-tags` → `latest: 8.0.0-rc.19` | `npm i prisma` installs a release candidate | Pin `prisma@7.10.0` and matching packages |
| `typescript@latest` is 7.0.2 (native Go compiler); `typescript-eslint` peer range is `<6.1.0` | Linting breaks on TS 7 | Pin `typescript@6.0.3` |
| React Router v8 removed the `react-router-dom` package | Most tutorials are outdated | Import from `react-router`; `RouterProvider` from `react-router/dom` |
| Prisma 7: `prisma-client` generator requires `output`; datasource URL moved to `prisma.config.ts`; driver adapter required | Old setup guides fail | Follow the Prisma 7 layout (§5.1) |
| Zod 4 API differs from v3 (`z.email()`, `z.strictObject()`) | v3 snippets break | Use Zod 4 syntax throughout |
| BullMQ polls Redis continuously | Exhausts Upstash free-tier command quotas | Use a real Redis instance (local Docker; Railway/Render Key Value when deployed) |

---

## 3. Repository layout

npm workspaces monorepo:

```
taskflow/
├── package.json                  # workspaces + root scripts
├── tsconfig.base.json            # strict TS settings inherited by all workspaces
├── eslint.config.js
├── .prettierrc
├── .gitignore
├── docker-compose.yml            # postgres + redis + mailpit
├── .github/workflows/ci.yml      # lint, typecheck, test, audit (bonus)
├── README.md
├── docs/
│   └── design-spec.md            # this document
├── packages/
│   └── shared/                   # "@taskflow/shared" — source-only, no build step
│       └── src/
│           ├── index.ts
│           ├── constants/        # TaskStatus, TaskPriority, OAuthProvider, ErrorCode
│           ├── schemas/          # auth, user, task, query schemas (Zod)
│           ├── rules/            # password policy, username rules, field limits
│           └── types/            # ApiSuccess, ApiErrorBody, DTOs, DashboardStats
├── backend/                      # "@taskflow/backend"
└── frontend/                     # "@taskflow/frontend"
```

**Shared package rules**

| In `@taskflow/shared` | Backend only | Frontend only |
|---|---|---|
| Field rules and limits, request schemas, enums, `ErrorCode`, response/DTO types | Prisma client and types, `.strict()` variants, HIBP and uniqueness checks | Form-specific shapes (e.g. date input strings), strength-meter UI |

The shared package exports TypeScript source (`"exports": { ".": "./src/index.ts" }`). Vite and `tsx` compile it directly; the production backend build uses `tsdown` to bundle it. This avoids a separate watch process and stale types.

**Root scripts**

```
npm install              # installs all workspaces
npm run dev              # backend + frontend (concurrently)
npm run db:migrate       # prisma migrate dev
npm run db:seed          # demo data
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

### 4.2 Folder structure

```
backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/               # committed
│   └── seed.ts
├── prisma.config.ts              # Prisma 7 CLI config (datasource URL)
├── src/
│   ├── config/
│   │   └── env.ts                # Zod-validated environment; fail fast on startup
│   ├── common/
│   │   ├── exceptions/           # error-codes re-export, HttpException + subclasses
│   │   ├── http/                 # api-response types, respond helpers (ok, created, ...)
│   │   ├── middleware/           # authenticate, validate, rate-limit, verify-origin,
│   │   │                         # request-id, error-handler, not-found
│   │   ├── security/             # rate-limiters, password-policy (+HIBP), cookies
│   │   └── utils/                # password, tokens, logger, escape-html, dates
│   ├── database/
│   │   └── prisma.ts             # PrismaClient with PrismaPg adapter + global omit
│   ├── redis/
│   │   └── redis.ts              # ioredis client
│   ├── mail/
│   │   ├── mail.service.ts       # enqueues jobs
│   │   ├── mail.queue.ts         # BullMQ queue
│   │   ├── mail.worker.ts        # processes jobs, sends via Nodemailer
│   │   ├── mail.transport.ts
│   │   └── templates/            # password-reset.ts, password-changed.ts
│   ├── modules/
│   │   ├── auth/                 # module, routes, controller, service, sessions.service, dto
│   │   ├── oauth/                # module, routes, controller, service, providers/
│   │   ├── users/                # profile, password, sessions, connected accounts
│   │   ├── tasks/                # CRUD, list, move, activities, mapper
│   │   ├── activities/           # activity feed + ActivityService (used by tasks)
│   │   ├── dashboard/            # stats
│   │   └── health/
│   ├── docs/                     # OpenAPI registry (bonus)
│   ├── generated/prisma/         # gitignored, produced by `prisma generate`
│   ├── types/express.d.ts        # Request augmentation (req.user, req.id)
│   ├── routes.ts                 # mounts modules under /api/v1
│   ├── app.ts                    # builds the Express app (no listen) — importable by tests
│   └── server.ts                 # listen, start worker, graceful shutdown
└── tests/
    ├── setup/                    # test DB reset, factories, fakes (FakeMailService, InlineQueue)
    └── *.test.ts
```

### 4.3 Layer responsibilities

```
Request
  → routes       URL + method + middleware chain (rateLimit → authenticate → validate)
  → controller   HTTP only: reads validated input, calls the service, sets cookies, responds
  → service      business logic + Prisma; no req/res; throws HttpException subclasses
  → Prisma → PostgreSQL

Any thrown error → error-handler → { error: { code, message, details?, requestId } }
```

- Controllers never import Prisma. Services never touch `req`/`res`.
- Controller methods are **arrow-function properties** so `this` stays bound when Express invokes them as callbacks.
- There is **no repository layer** — Prisma already abstracts data access; another layer would add indirection without value.

### 4.4 Ownership enforced by signature

Every task service method takes `userId` as its first parameter and scopes every query by it:

```ts
async findOne(userId: string, taskId: string) {
  const task = await this.prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) throw new NotFoundException('Task');
  return task;
}
```

No method accepts a bare `taskId`, so it is impossible to forget the ownership check. Updates and deletes use `updateMany`/`deleteMany` with `{ id, userId }` (or `findFirst` first) so a foreign ID behaves exactly like a missing one.

### 4.5 Module wiring example

```ts
// tasks.module.ts
const activityService = new ActivityService(prisma);
const tasksService = new TasksService(prisma, activityService);
const tasksController = new TasksController(tasksService);
export const tasksRouter = createTasksRouter(tasksController);
```

Dependency injection pays off in tests: the auth module receives a `MailService`, so tests inject a `FakeMailService` that records the reset link.

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

  @@map("activity_action")
}

enum OAuthProvider {
  GOOGLE
  GITHUB

  @@map("oauth_provider")
}

model User {
  id              String    @id @default(uuid(7)) @db.Uuid
  firstName       String    @map("first_name") @db.VarChar(50)
  lastName        String    @map("last_name") @db.VarChar(50)
  username        String    @unique @db.VarChar(30)
  email           String    @unique @db.VarChar(255)
  passwordHash    String?   @map("password_hash")
  avatarUrl       String?   @map("avatar_url") @db.VarChar(2048)
  emailVerifiedAt DateTime? @map("email_verified_at") @db.Timestamptz(3)
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt       DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)

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

  @@index([userId, status, position])
  @@index([userId, dueDate])
  @@index([userId, createdAt])
  @@map("tasks")
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
users ─┬─< tasks ─────────< task_activities
       ├─< sessions                 │
       ├─< verification_tokens      │  task_id is nullable (SET NULL) so history survives deletion
       ├─< oauth_accounts           │
       └─< task_activities >────────┘
```

Every child row cascades when its user is deleted.

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
| Hard delete for tasks | Keeps every query simple; `TaskActivity.taskTitle` preserves a readable history |
| Composite indexes lead with `userId` | Every query is scoped by owner, so the ownership rule also drives index design |
| Enums sort by declaration order | `ORDER BY priority` yields `LOW < MEDIUM < HIGH` with no extra work |

---

## 6. API design

### 6.1 Conventions

- Base path: **`/api/v1`**
- JSON only (`Content-Type: application/json` required on bodies)
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
| 401 | `UNAUTHENTICATED` | No valid session |
| 401 | `TOKEN_EXPIRED` | Access token expired — the client should refresh |
| 401 | `INVALID_CREDENTIALS` | Login failed (identical for unknown user and wrong password) |
| 403 | `FORBIDDEN` | Origin check failed (CSRF defense) |
| 404 | `NOT_FOUND` | Resource missing **or owned by someone else** |
| 409 | `EMAIL_TAKEN` / `USERNAME_TAKEN` | Uniqueness conflict |
| 409 | `ACCOUNT_ALREADY_LINKED` | Provider account already linked to another user |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 10 kB |
| 429 | `RATE_LIMITED` | With `Retry-After` header |
| 500 | `INTERNAL_ERROR` | Anything unexpected — generic message only |
| 503 | `SERVICE_UNAVAILABLE` | Database or queue unavailable |

OAuth callback errors are delivered as redirect query parameters (§9.4): `OAUTH_FAILED`, `OAUTH_EMAIL_UNVERIFIED`, `OAUTH_ACCOUNT_EXISTS`, `ACCOUNT_ALREADY_LINKED`, `OAUTH_PROVIDER_DISABLED`.

> **Why a wrong current password is `400`:** the frontend treats every `401` as "session expired, refresh and retry". Returning `401` for a typo would trigger a refresh loop or log the user out.

### 6.3 Auth — `/api/v1/auth`

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| POST | `/register` | firstName, lastName, username, email, password, confirmPassword | `201` user + auth cookies (auto-login) | 400, 409, 429 |
| POST | `/login` | identifier (email or username), password, rememberMe? | `200` user + auth cookies | 400, 401, 429 |
| POST | `/refresh` | — (refresh cookie) | `200` user + rotated cookies | 401 |
| POST | `/logout` | — | `204`, cookies cleared (always succeeds) | — |
| POST | `/logout-all` | — | `204`, every session revoked | 401 |
| POST | `/forgot-password` | email | **`202`** with a fixed message | 400, 429, 503 |
| POST | `/reset-password/verify` | token | `204` | 400 (`INVALID_RESET_TOKEN` / `RESET_TOKEN_EXPIRED`) |
| POST | `/reset-password` | token, password, confirmPassword | `204` | 400 |

The reset token travels in the request **body**, never in a URL path, so it does not land in access logs.

### 6.4 Users — `/api/v1/users/me`

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/users/me` | — | `200` user | 401 |
| PATCH | `/users/me` | firstName?, lastName?, username?, email?, currentPassword (required when email changes) | `200` user | 400, 409 |
| PATCH | `/users/me/password` | currentPassword (omitted when no password is set), newPassword, confirmPassword | `204`; other sessions revoked | 400 |
| GET | `/users/me/sessions` | — | `200` list with `current: true` flag and friendly `device` name | 401 |
| DELETE | `/users/me/sessions/:id` | — | `204` | 404 |
| GET | `/users/me/accounts` | — | `200` `{ hasPassword, providers: [{ provider, email, connectedAt }] }` | 401 |
| DELETE | `/users/me/accounts/:provider` | — | `204` | 400 `CANNOT_UNLINK_LAST_METHOD`, 404 |

User response shape: `{ id, firstName, lastName, username, email, avatarUrl, hasPassword, createdAt }` — produced by an explicit mapper; `passwordHash` can never leak.

### 6.5 Tasks — `/api/v1/tasks`

| Method | Path | Body / query | Success | Errors |
|---|---|---|---|---|
| GET | `/tasks` | query parameters below | `200` list + meta | 400 |
| POST | `/tasks` | title, description?, status?, priority?, dueDate?, hasDueTime? | `201` task + `Location` | 400 |
| GET | `/tasks/:id` | — | `200` task | 400, 404 |
| PATCH | `/tasks/:id` | any subset of the create fields; `null` clears optional fields | `200` task | 400, 404 |
| PATCH | `/tasks/:id/move` | status, prevId?, nextId? | `200` task | 400, 404 |
| DELETE | `/tasks/:id` | — | `204` | 404 |
| GET | `/tasks/:id/activities` | — | `200` list | 404 |

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

#### 6.5.2 Task response shape

All columns plus a computed `isOverdue` (`dueDate < now && status !== COMPLETED`), calculated on the server so there is a single definition.

#### 6.5.3 Status, position and activity rules

- **New task** → placed at the top of its status column (`position = min(position) − 1`, or `0` if empty).
- **Status change via `PATCH /tasks/:id`** → moves to the top of the new column.
- **`PATCH /tasks/:id/move`** (board drag) → `prevId`/`nextId` are the cards above and below in the destination column; both must belong to the user and be in that status. Position = midpoint of the neighbours, `prev + 1`, `next − 1`, or `0`. If the gap becomes smaller than `1e-6`, the column is renumbered in the same transaction.
- **`completedAt`** is set when status becomes `COMPLETED` and cleared when it leaves.
- **Activity** is written in the **same transaction** as the change:
  - `CREATED` — no changes payload
  - `STATUS_CHANGED` — `{ status: { from, to } }`
  - `UPDATED` — `{ field: { from, to } }` for title, priority, due date; description changes are recorded as `{ description: { changed: true } }` to avoid storing large text twice
  - `DELETED` — title snapshot; `taskId` becomes `NULL`
  - Position-only moves within the same column are not logged.

### 6.6 Dashboard and activity

| Method | Path | Success |
|---|---|---|
| GET | `/dashboard/stats` | `200` `{ total, byStatus: { TODO, IN_PROGRESS, COMPLETED }, byPriority: { LOW, MEDIUM, HIGH }, overdue, dueSoon, completedLast7Days, completionRate }` |
| GET | `/activities?limit=10` | `200` recent activity for the user |
| GET | `/health` | `200` `{ status, db, redis }` (unauthenticated; used by Docker and future deployment) |

Stats are computed with `groupBy`/`count` in the database, never by loading all tasks into memory. `dueSoon` (next 7 days, not completed) and `completedLast7Days` are **rolling windows**, which are correct in every time zone without the server knowing the user's zone. `completionRate` is an integer percentage.

### 6.7 OAuth — `/api/v1/auth/oauth`

| Method | Path | Result |
|---|---|---|
| GET | `/providers` | `200 { data: ["google", "github"] }` — only providers with configured credentials |
| GET | `/:provider` | `302` to the provider (`?mode=link` when connecting from Profile) |
| GET | `/:provider/callback` | `302` back to the frontend |

### 6.8 API documentation (bonus)

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

**Why httpOnly cookies instead of `localStorage`:** JavaScript — including injected scripts — cannot read httpOnly cookies. The trade-off is CSRF exposure, which is mitigated in §10.2.

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

The frontend additionally makes refreshes **single-flight** inside a tab (§13.6).

### 7.5 Staying logged in across refreshes

On boot the frontend calls `GET /users/me`. A `401 TOKEN_EXPIRED` triggers a refresh and one retry. While this runs, a splash screen is shown so a logged-in user never sees a flash of the login page.

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
  enqueue job "password-reset-request" { email }     ← no database lookup in the request
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
  enqueue the "password changed" notification email
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

## 10. Security controls

### 10.1 HTTP layer

| Control | Implementation |
|---|---|
| Security headers | `helmet` (HSTS in production, `nosniff`, frame protection, `Referrer-Policy: no-referrer`, no `X-Powered-By`) |
| CORS | Allowlist of `FRONTEND_URL` only, `credentials: true`. In development the Vite proxy makes requests same-origin. |
| Body size | `express.json({ limit: '10kb' })` |
| Client IP | Correct `trust proxy` setting (`TRUST_PROXY`) — otherwise every user behind a proxy shares one IP and rate limiting breaks |
| Request IDs | Generated per request, logged, returned in `X-Request-Id` and error bodies |
| Query parsing | Express 5's default `simple` query parser (no nested objects) plus Zod validation |

### 10.2 CSRF

1. `SameSite=Lax` cookies.
2. **Origin verification** on `POST`, `PATCH`, `PUT` and `DELETE`: the `Origin` (or `Referer`) header must match `FRONTEND_URL`, otherwise `403 FORBIDDEN`.
3. Only `application/json` bodies are accepted — HTML forms cannot send them cross-site without a CORS preflight.

### 10.3 Rate limiting and brute-force protection

`rate-limiter-flexible` with Redis (in-memory `insuranceLimiter` if Redis is down). Keys are prefixed `tf:rl:`.

| Endpoint | Key | Limit |
|---|---|---|
| Login — consecutive failures | identifier + IP | 5 failures → blocked 15 min; reset on success |
| Login — total | IP | 50 per 15 min |
| Register | IP | 5 per hour |
| Forgot password | IP / email | 5 per 15 min per IP; 3 per hour per email (**silent** — still returns 202) |
| Reset password (+ verify) | IP | 10 per 15 min |
| Refresh | IP | 30 per minute |
| All other `/api` routes | user ID (or IP) | 300 per 15 min |

Exceeded limits return `429 RATE_LIMITED` with `Retry-After`. The lockout key combines identifier **and** IP so an attacker cannot lock a victim out of their own account.

### 10.4 Authorization and data ownership

- `userId` scoping in every task query (§4.4); foreign IDs return `404`, indistinguishable from missing ones.
- Session and OAuth-account operations are scoped to the current user in the same way.
- **Mass-assignment protection:** backend schemas are strict (`z.strictObject`) — unknown fields such as `userId`, `completedAt` or `position` in a task body are rejected with `400`.

### 10.5 Input validation

- Every body, query and route parameter is validated with Zod before reaching a controller.
- Field limits match the database (`VarChar` sizes, description ≤ 2000 characters in the API).
- Username: 3–30 characters, `[a-z0-9._]`, starting and ending with a letter or number.
- Prisma parameterises every query; no raw SQL string interpolation is used.

### 10.6 Anti-enumeration summary

| Flow | Measure |
|---|---|
| Login | One generic error; when the user does not exist, the password is still verified against a dummy argon2 hash so timing matches |
| Forgot password | Enqueue-first — identical response and timing (§8.2) |
| Register | Must report duplicates (required by the specification); mitigated by rate limiting. Documented trade-off. |

### 10.7 Output, logging and secrets

- React escapes output by default; `dangerouslySetInnerHTML` is never used; descriptions render as plain text.
- User-supplied values in email templates are HTML-escaped.
- `pino` redacts `password`, `currentPassword`, `newPassword`, `confirmPassword`, `token`, `authorization` and `cookie` fields.
- 5xx errors log the full stack server-side; clients receive only the generic message and request ID.
- `env.ts` validates configuration at startup (e.g. JWT secret ≥ 32 characters) and exits on failure.
- No secrets in git; `.env.example` documents every variable.
- Redis is password-protected and, like every Docker service, bound to `127.0.0.1` only.
- CI (bonus) runs `npm audit --audit-level=high`.

---

## 11. Email delivery

| Environment | Delivery |
|---|---|
| Development and review | **Mailpit** (Docker): catches every message; inbox at `http://localhost:8025` |
| Production (future) | Any SMTP provider via the same environment variables |

- **Nodemailer** transport configured from `SMTP_*` variables — provider-agnostic.
- **BullMQ** queue `email`; the worker runs in-process with the API (can be split into its own process later).
- Jobs: `password-reset-request`, `password-changed`.
- Retries: 5 attempts with exponential backoff.
- Retention: `removeOnComplete: true`; failed jobs kept for 1 hour only — job payloads can contain a reset link, which expires after 30 minutes anyway.
- Templates are plain TypeScript functions returning `{ subject, html, text }` with inline styles and a plain-text alternative. Emails are always light-themed.

| Template | Content |
|---|---|
| Password reset | Greeting, "Reset password" button, 30-minute expiry, single-use notice, "ignore if you didn't request this" |
| Password changed | Notice that the password changed and other devices were signed out; what to do if it wasn't them |

---

## 12. Error handling

### 12.1 Exception hierarchy (`common/exceptions`)

```
HttpException(status, code, message, details?)
├── BadRequestException            400
├── ValidationException            400 VALIDATION_ERROR (with details)
├── UnauthorizedException          401
├── ForbiddenException             403
├── NotFoundException              404 — new NotFoundException('Task') → "Task not found"
├── ConflictException              409 — new ConflictException('EMAIL_TAKEN', 'email', 'Email is already registered')
├── TooManyRequestsException       429 (retryAfterSeconds)
└── ServiceUnavailableException    503
```

### 12.2 Normalisation (`error-handler.ts`)

| Source | Response |
|---|---|
| `HttpException` | As-is |
| `ZodError` | 400 `VALIDATION_ERROR` with `details: [{ field, message }]` |
| Prisma `P2002` (unique violation) | 409 — fallback only (see below) |
| Prisma `P2025` (record not found) | 404 |
| Prisma connection errors (`P1001`, initialisation errors) | 503 |
| Body-parser parse error | 400 `INVALID_JSON` |
| Body-parser size error | 413 `PAYLOAD_TOO_LARGE` |
| Anything else | 500 `INTERNAL_ERROR` — "Something went wrong. Please try again." |

### 12.3 Uniqueness: pre-check plus constraint

Services check for an existing email/username first to return a precise field error. Two simultaneous requests can both pass that check, so the database unique constraint remains the real guarantee and `P2002` is caught as a fallback. The field name is not taken from `P2002` metadata, whose shape varies between Prisma driver adapters.

### 12.4 Logging levels

- 4xx: `warn`, no stack
- 5xx: `error`, full stack (server logs only)

### 12.5 Other layers

- `not-found.ts`: unknown routes → `404 NOT_FOUND` "Route not found".
- Process level: `unhandledRejection`, `uncaughtException`, `SIGTERM`, `SIGINT` → log and graceful shutdown (stop accepting connections, finish in-flight requests, close the worker, disconnect Prisma and Redis).
- Response helpers (`ok`, `created`, `accepted`, `paginated`, `noContent`) guarantee the envelope; controllers never build it by hand.
- Explicit mappers (`toTaskResponse`, `toUserResponse`, `toSessionResponse`) define every outward-facing shape; Prisma records are never serialised directly.

---

## 13. Frontend architecture

### 13.1 Principles

- Function components and hooks (class components are legacy in React).
- **Feature folders mirror the backend modules** (`auth`, `tasks`, `dashboard`, `profile`).
- shadcn/ui primitives in `components/ui/` (owned source); domain components compose them.

### 13.2 Folder structure

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
│   ├── auth/                    # api, hooks, auth-context, guards, components, pages
│   ├── tasks/                   # api, hooks, query-keys, components (TaskTable, TaskCard,
│   │                            # TaskFormDialog, TaskFilters, KanbanBoard, MobileBoard,
│   │                            # MoveTaskSheet, TaskActivityList), pages
│   ├── dashboard/               # StatTiles, CompletionCard, PriorityBreakdown,
│   │                            # AgendaCard, DueSoonList, RecentActivity
│   └── profile/                 # AccountForm, ChangePasswordForm, SessionsList,
│                                # ConnectedAccounts
├── lib/
│   ├── api-client.ts            # fetch wrapper, ApiError, single-flight refresh
│   ├── form-errors.ts           # applyServerErrors(form, apiError)
│   ├── dates.ts                 # toEndOfDayISO, local week/day ranges, formatDue
│   └── utils.ts                 # cn()
├── hooks/                       # useDebounce, useMediaQuery, useHotkeys
├── styles/
│   └── globals.css              # design tokens (§14)
└── main.tsx
```

### 13.3 Routes

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

Create and edit use a dialog (`TaskFormDialog`) over the current page. Task details is a page so it has a shareable URL and room for the activity history. The `redirect` parameter only accepts same-origin paths (no open redirect).

### 13.4 State management

| State | Tool |
|---|---|
| Server data (tasks, stats, profile, sessions) | **TanStack Query** |
| Authentication status and current user | React Context built on the `me` query |
| Filters, search, sort, page, view, profile tab | **URL search params** — survive refresh, back button and sharing |
| Form state | React Hook Form + Zod resolvers from the shared package |
| Theme | Context + `localStorage` (light / dark / system) |
| Local UI (dialog open, hover) | `useState` |

No Redux or Zustand: once server state lives in TanStack Query there is almost no global client state left. Query keys include the URL parameters (`['tasks', 'list', { status, page, … }]`), so every filter combination is cached independently.

### 13.5 Authentication on the client

- **Boot:** `GET /users/me` behind a splash screen → `authenticated` or `unauthenticated`.
- **Guards:** `ProtectedRoute` and `PublicOnlyRoute` wrap route groups.
- **Logout:** `POST /auth/logout` → `queryClient.clear()` (so the next user never sees cached data from the previous one) → `/login`.
- **Cross-tab sync:** `BroadcastChannel('tf-auth')` — logging out in one tab logs out every tab.
- **Session expiry:** a failed refresh clears the cache and redirects to `/login?reason=expired`.

### 13.6 API client

- Thin typed wrapper around `fetch` with `credentials: 'include'`; base path `/api/v1`.
- Error bodies are parsed into `ApiError { status, code, message, details, requestId }`.
- `401 TOKEN_EXPIRED` → call `/auth/refresh` → retry the original request once.
- **Single-flight refresh:** concurrent 401s share one in-flight refresh promise.

### 13.7 Forms

- Schemas come from `@taskflow/shared`; frontend-only fields (date input strings, optional time) are transformed before submission.
- Server field errors (`details`) are mapped onto the matching inputs with `applyServerErrors()`.
- Submit buttons show a spinner and are disabled while pending.
- Password inputs have a show/hide toggle; the register, reset and change-password forms show a strength meter and live checklist driven by the shared policy.

### 13.8 UX behaviour

| Concern | Behaviour |
|---|---|
| Loading | Skeletons for lists and cards; spinners on buttons |
| Empty | Two distinct states: "No tasks yet" (with a create action) and "No tasks match your filters" (with "Clear filters") |
| Errors | `ErrorState` with **Try again** (refetch) and the request ID; route-level error boundary for crashes |
| Confirmation | `ConfirmDialog` for deleting a task, revoking a session, disconnecting an account and logging out of all devices |
| Success | Toasts |
| Optimistic updates | Status changes, completion checkbox and board moves update immediately; on failure the change is rolled back with an error toast |
| Search | Debounced (300 ms) and written to the URL |
| Keyboard | `N` opens "New task"; `/` focuses search (ignored while typing in inputs) |
| Responsive | Desktop: floating sidebar. Mobile: bottom tab bar (Home, Tasks, +, Board, Profile); the task table becomes cards; the board becomes status tabs with a "Move to…" bottom sheet instead of drag and drop |
| Accessibility | Radix primitives handle focus trapping and ARIA; every input has a label; status and priority never rely on colour alone (icon + text); keyboard sensors for drag and drop; `prefers-reduced-motion` disables animations |

### 13.9 Development proxy

`vite.config.ts` proxies `/api` to `http://localhost:4000`, so the browser sees a single origin (`http://localhost:5173`). This removes CORS from development, keeps `SameSite` cookies simple, and gives stable OAuth redirect URIs (`http://localhost:5173/api/v1/auth/oauth/<provider>/callback`).

---

## 14. Design system

### 14.1 Direction

**"Soft Pastel+"** — a lavender-grey canvas with floating white cards, generous radii, pastel status tints, and colour delivered through solid accents (solid icon circles, gradient primary actions, a solid "current" item in timelines). Friendly and modern while staying calm and readable.

### 14.2 Token architecture

```
1. Primitive   raw palette values (hex / OKLCH)
2. Semantic    meaning:  --background, --card, --primary, --muted-foreground, --border,
               --status-todo, --status-progress, --status-done, --danger, --shadow-card …
3. Component   usage:    Button → bg-primary rounded-full · Card → rounded-3xl shadow-card
```

Components reference **semantic tokens only**. Dark mode redefines the semantic layer; no component changes. Tokens are CSS variables consumed by Tailwind 4 via `@theme inline`, extending shadcn's variable set.

### 14.3 Colour tokens

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

One formula works in both themes because the tint mixes with whatever the card colour is. Text on solid amber/orange surfaces uses a dark foreground (`--on-progress: #2E1F03`) to meet WCAG contrast.

### 14.4 Colour semantics

- **Colour encodes status** (lavender / orange / green).
- **Shape encodes priority** — a signal-bars icon (1, 2 or 3 bars), neutral colour except **High**, which is coral.
- **Coral is reserved for danger** — overdue, high priority, destructive actions. To Do is lavender, not pink, so new tasks never look alarming.
- Every coloured indicator also has an icon and a text label.

### 14.5 Typography, shape, elevation, motion

| Token | Value |
|---|---|
| Font | **Plus Jakarta Sans** (variable, self-hosted); headings 700–800, body 500; `tabular-nums` for figures |
| Scale | Display 30 / H1 28 / H2 22 / H3 16–18 / body 14–15 / small 12–13 |
| Radius | Cards 24 px · tiles 20 px · inputs 14 px · buttons and chips fully rounded |
| Shadows | `--shadow-card`: soft, navy-tinted · `--shadow-glow`: coloured, only on primary actions and hero surfaces · `--shadow-pop`: dialogs and sheets |
| Motion | 150–200 ms transitions, dialog fade/zoom (`tw-animate-css`), skeleton shimmer; all disabled under `prefers-reduced-motion` |

### 14.6 Icons and imagery

| Need | Choice |
|---|---|
| UI icons | `lucide-react` |
| Status icons | Lucide icon in a solid colour circle (To Do `ClipboardList`, In Progress `Timer`, Completed `ClipboardCheck`, Overdue `TriangleAlert`) |
| Empty/error/success illustrations | **Icon compositions** — layered tinted circles, a solid core with a Lucide icon, optional sparkles. Token-driven, dark-mode ready, no external assets. |
| Auth brand panel | Primary gradient with floating mini UI cards (task card, stat, progress) built from the same components |
| Avatars | OAuth photo → DiceBear (generated locally from the user ID) → initials |

### 14.7 Reference mockups

Static HTML mockups of every screen were produced and approved during design (dashboard, tasks list/board, task details, create dialog, auth, forgot/reset, profile, mobile, states, 404, splash, banners). They are reference material, not production code.

---

## 15. Screens inventory

| Screen | Key contents |
|---|---|
| **Login** | Split layout (brand panel + form); email-or-username, password with show/hide, "Remember me", "Forgot password?", Google/GitHub buttons (only when enabled), banners for invalid credentials, expired session, OAuth errors and password-reset success |
| **Register** | First/last name, username, email, password with strength meter and checklist, confirm password, inline field errors including "already taken" |
| **Forgot password** | Email field; confirmation state "Check your email" with identical wording for every address |
| **Reset password** | Token verified on load; new password with meter/checklist and confirmation; states for success, expired and invalid links |
| **Dashboard** | Greeting with open-task count; stat tiles (Total, To Do, In Progress, Completed, Overdue — each links to the filtered list); completion-rate card; priority breakdown; agenda (week strip + timeline of tasks due that day); due-soon cards; recent activity |
| **Tasks — list** | Search, status/priority filters, overdue toggle, sort, list/board toggle; table with completion checkbox, status pill, priority bars, due label, updated time, row actions; pagination; mobile cards |
| **Tasks — board** | Three columns with counts and quick add; drag and drop between and within columns with drop placeholder and optimistic update; mobile status tabs + "Move to…" sheet |
| **Task details** | Title, status, priority, due; "Mark as completed", Edit, Delete (confirmation dialog); description; activity timeline with before → after changes; details panel (status, priority, due, created, updated, completed) |
| **Create / edit task** | Dialog: title (required), description (optional, counter), status and priority pickers, due date with optional time ("End of day" when omitted) |
| **Profile** | Header (avatar, name, username, email, badges); tabs: **Account** (names, username, email + current password when changing it), **Security** (change/set password, active sessions with revoke, log out of all other devices), **Connected accounts** (Google/GitHub connect/disconnect, password status) |
| **Navigation** | Sidebar: Dashboard, Tasks (count), Profile, user card, labelled **Log out**. Mobile: bottom tab bar; Profile holds theme and Log out |
| **System states** | Empty (two kinds), error with retry and request ID, skeletons, toasts, 404, boot splash |

---

## 16. Testing strategy

### 16.1 Backend — Vitest + Supertest against real PostgreSQL

Ownership, uniqueness and token lifecycles live in database queries, so tests hit a real database rather than a mocked Prisma client.

| Setup | Approach |
|---|---|
| Database | `taskflow_test`, migrated once; `TRUNCATE … CASCADE` before each test |
| Redis | Separate logical DB (`/1`), flushed before each test |
| Email | Injected `FakeMailService` records messages (and reset links) |
| Queue | Injected `InlineQueue` runs jobs synchronously |
| Rate limits | High limits in the test environment, except the dedicated 429 test |
| HIBP | Disabled |
| Execution | Sequential (single worker) to share the database safely |

**Priority test cases**

1. **Ownership** — user B cannot GET/PATCH/DELETE/move user A's task (404); lists only contain own tasks; `userId` in a body is rejected (400).
2. **Password reset** — identical 202 for existing and unknown emails; token works once; expired token → `RESET_TOKEN_EXPIRED`; old password fails after reset; all sessions revoked.
3. **Auth** — registration validation and duplicates (409); stored password is a hash; login sets cookies; invalid credentials → 401; refresh rotation; reuse detection revokes; grace window allows a concurrent refresh; after logout protected routes return 401.
4. **Tasks** — CRUD; search, filters, sort and pagination meta; `isOverdue`; `completedAt` set/cleared; move positions; activity rows written.
5. **Dashboard** — counts per status, overdue, due soon, completion rate.
6. **Rate limiting** — sixth failed login → 429 with `Retry-After`.

**Unit tests:** password policy, token helpers, position midpoint/renumbering, mappers.

### 16.2 Frontend — Vitest + Testing Library

- `api-client`: five concurrent 401 responses trigger exactly one refresh, then retries.
- `applyServerErrors`: maps API details to form fields.
- Password strength meter and checklist.

### 16.3 Not included

End-to-end browser tests (Playwright) — listed as a future improvement.

### 16.4 CI (bonus)

GitHub Actions with PostgreSQL and Redis services: install → migrate → lint → typecheck → test → `npm audit --audit-level=high`.

---

## 17. Local development

### 17.1 Prerequisites

Node.js 24, npm 11, Docker Desktop.

### 17.2 `docker-compose.yml` services

| Service | Image | Host port (bound to `127.0.0.1`) | Notes |
|---|---|---|---|
| `postgres` | `postgres:17-alpine` | 5432 | Creates `taskflow` and `taskflow_test`; named volume; healthcheck |
| `redis` | `redis:8-alpine` | 6379 | `requirepass`; healthcheck |
| `mailpit` | `axllent/mailpit` (version pinned at setup) | 1025 (SMTP), 8025 (web inbox) | Catches all email |

Ports are bound to `127.0.0.1` because Docker's default `0.0.0.0` binding bypasses the host firewall and exposes the services to the local network.

### 17.3 Application ports

| App | URL |
|---|---|
| Frontend (Vite) | `http://localhost:5173` |
| Backend (Express) | `http://localhost:4000` (reached through the Vite proxy) |
| Mailpit inbox | `http://localhost:8025` |
| API docs (bonus) | `http://localhost:5173/api/docs` |

### 17.4 Environment variables (`backend/.env.example`)

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

SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
MAIL_FROM="TaskFlow <no-reply@taskflow.local>"

HIBP_ENABLED=true

# Optional — OAuth providers are disabled when these are empty
OAUTH_REDIRECT_BASE_URL=http://localhost:5173/api/v1/auth/oauth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

The frontend needs no environment variables (it calls the relative `/api/v1`).

### 17.5 README must cover

Project overview · technologies · prerequisites · installation · environment variables · database setup · Prisma migrations · running backend and frontend · **testing forgot/reset password with Mailpit** · demo credentials · running tests · optional OAuth setup (Google Cloud Console, GitHub OAuth App) · architecture summary · challenges encountered · what I would improve.

---

## 18. Git workflow

| Aspect | Decision |
|---|---|
| Commit style | Conventional Commits (`feat(auth): …`, `fix(tasks): …`, `test: …`, `docs: …`, `chore: …`) |
| Granularity | One logical unit per commit — the history shows progress step by step |
| Branches | One feature branch per phase (`feat/auth`, `feat/tasks`, …) merged into `main` through a pull request |
| Merge strategy | **Merge commits** — no squash, so individual commits stay visible |
| Never committed | `.env`, generated Prisma client, `node_modules`, build output |

---

## 19. Seed data and demo accounts

`npm run db:seed` creates:

| Account | Email | Username | Password | Data |
|---|---|---|---|---|
| Demo | `demo@taskflow.dev` | `demo` | `Demo@12345!` | ~24 tasks across all statuses and priorities, with due dates relative to "now" (overdue, today, this week, later, none) and activity history |
| Second user | `alex@taskflow.dev` | `alex` | `Alex@12345!` | A few tasks — lets reviewers confirm that one user cannot open another user's task by ID |

Seed passwords bypass the breached-password check. The README lists these credentials.

---

## 20. Implementation phases

High-level order; the implementation plan breaks each phase into small, test-driven tasks.

| # | Phase | Scope |
|---|---|---|
| 0 | Scaffolding | Workspaces, tooling, TypeScript/ESLint/Prettier, docker-compose, shared package, README skeleton |
| 1 | Backend foundation | env config, logger, Prisma schema + first migration, app/server, request IDs, error handling, response helpers, health |
| 2 | Authentication | Register, login, sessions, refresh rotation, logout, authenticate middleware, origin check, rate limiting |
| 3 | Email + password reset | Mail transport, BullMQ queue/worker, templates, forgot/verify/reset, password-changed notification |
| 4 | Users | Profile get/update, change/set password, sessions list/revoke, logout-all |
| 5 | Tasks | CRUD, list filters/sort/pagination, move, activity logging |
| 6 | Dashboard | Stats, activity feed |
| 7 | Backend tests | Priority cases from §16.1 (written alongside each phase where practical) |
| 8 | Frontend foundation | Vite, Tailwind 4 + tokens, shadcn, fonts, router, providers, API client, auth context, guards, layouts |
| 9 | Auth screens | Login, register, forgot, reset, banners |
| 10 | Dashboard screen | All dashboard cards |
| 11 | Tasks screens | List, filters, dialog, details, delete confirmation |
| 12 | Board | Desktop drag and drop; mobile status tabs + move sheet |
| 13 | Profile screen | Account, security, sessions |
| 14 | Polish | Empty/error/loading states, 404, splash, toasts, dark mode, hotkeys, responsive pass, accessibility pass |
| 15 | OAuth | Backend flow + providers; login buttons; connected accounts |
| 16 | Finish | Seed data, Swagger, CI, README completion |

---

## 21. Out of scope and future improvements

- **Deployment** — planned later. The design is same-origin in every environment: a single container where Express also serves the built frontend, with managed PostgreSQL and a real Redis instance (e.g. Railway, or Render with Render Key Value; not Upstash because of BullMQ polling).
- **Email verification** after registration — schema already supports it.
- **Verified email change** (confirm the new address before switching).
- **End-to-end tests** with Playwright.
- **Trigram index** (`pg_trgm`) for fast substring search at scale.
- **Separate worker process** for the email queue.
- **Tags, subtasks, teams and sharing** — intentionally excluded (YAGNI).
- **Account deletion** and data export.
- **GeoIP** location for the Active Sessions list.
