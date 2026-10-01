#!/bin/sh
# Container entrypoint: private Redis, database migrations, then the API (with its workers).
set -e

# In-memory Redis on loopback only: no persistence (nothing in it outlives a restart by design).
redis-server --bind 127.0.0.1 --port 6379 --save '' --appendonly no --daemonize yes \
  --dir /tmp --logfile /tmp/redis.log
until redis-cli -h 127.0.0.1 ping >/dev/null 2>&1; do sleep 0.2; done

npx prisma migrate deploy
exec npx tsx src/server.ts
