#!/bin/sh
set -e

echo "Cleaning up stale Chromium processes…"
pkill -f chromium 2>/dev/null || true
pkill -f chrome 2>/dev/null || true

# Start Xvfb (virtual display) for headed Chromium used by Keepa scraper.
# Running it here ensures the display is ready before any scrape triggers,
# avoiding cold-start delays and instability.
echo "Starting Xvfb on display :99…"
Xvfb :99 -screen 0 1280x800x24 -nolisten tcp &
export DISPLAY=:99

# Give Xvfb a moment to initialize
sleep 1

echo "Running Prisma migrations…"
npx prisma migrate deploy

echo "Migrations applied — starting server"
exec node dist/server.js
