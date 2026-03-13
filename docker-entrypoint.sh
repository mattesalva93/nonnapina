#!/bin/sh
set -e

echo "Cleaning up stale Chromium processes…"
pkill -f chromium 2>/dev/null || true
pkill -f chrome 2>/dev/null || true

echo "Running Prisma migrations…"
npx prisma migrate deploy

echo "Migrations applied — starting server"
exec node dist/server.js
