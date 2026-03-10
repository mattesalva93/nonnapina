#!/bin/sh
set -e

echo "Running Prisma migrations…"
npx prisma migrate deploy

echo "Migrations applied — starting server"
exec node dist/server.js
