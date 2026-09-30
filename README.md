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
cp backend/.env.example backend/.env
docker compose up -d
npm run db:migrate
npm run dev
```

The API health check is available at <http://localhost:4000/api/v1/health>.

## Design

See [`docs/design-spec.md`](docs/design-spec.md) and [`docs/implementation-plan.md`](docs/implementation-plan.md).
