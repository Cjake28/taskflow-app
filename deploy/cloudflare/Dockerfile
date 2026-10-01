# TaskFlow API for Cloudflare Containers. Built by `wrangler deploy` from the repository root
# (image_build_context in wrangler.jsonc).
#
# One container runs the API, its BullMQ workers and a private Redis. Redis only holds
# short-lived data (session cache, rate limits, job queues, pending sign-up codes); PostgreSQL
# is the source of truth, so losing Redis on a restart is harmless.
FROM node:24-bookworm-slim AS base
# OpenSSL for Prisma's migration engine; Redis runs next to the API on 127.0.0.1.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl redis-server \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
# Only the API's dependency tree (tsx and the Prisma CLI are needed at runtime).
RUN npm ci --workspace @taskflow/backend --workspace @taskflow/shared --include-workspace-root=false \
  && npm cache clean --force

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY backend ./backend
COPY deploy/cloudflare/start.sh /app/start.sh
WORKDIR /app/backend
# prisma.config.ts reads DATABASE_URL; generating the client does not connect to it.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate \
  && mkdir -p storage && chown -R node:node storage /app/start.sh
USER node
EXPOSE 4000
CMD ["sh", "/app/start.sh"]
