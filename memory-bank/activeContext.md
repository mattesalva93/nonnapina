# Active Context - Keepa Tracker

## Current Work Focus

TASK011, TASK012, TASK014, TASK022, TASK015, TASK013 completed. Next priorities: TASK016 (N+1 queries), TASK018 (logging), TASK020 (Docker).

## Recent Changes

- **TASK015 Completed (2026-03-11):** Graceful shutdown: SIGTERM/SIGINT handlers, HTTP server close, cron jobs stopped (scrapeCronTask + stopAllCronTasks()), WhatsApp destroyed, active ScrapeRun marked FAILED, Prisma disconnected. 15s force-exit timeout.
- **TASK013 Completed (2026-03-11):** DRY refactor: extracted shared channel dispatch into `services/channels/` (4 files), `services/scoring.ts`, `utils/format.ts`. ~300 lines of duplication removed across publish.service, lowest-deal.service, top5.service.
- **TASK022 Completed (2026-03-10):** Health check email throttled with 15-min cooldown. Recovery email on DB restoration.
- **TASK014 Completed (2026-03-10):** Config now parsed through zod schema at startup. `validateConfig()` removed.
- **TASK011 Completed (2026-03-10):** npm overrides fix all 9 vulnerabilities.
- **TASK012 Completed (2026-03-10):** Bearer token auth on all /api/\* routes.

## Current State

- All Tasks 1–15 + 22 complete: 0 tsc errors, 54/54 tests pass
- Docker containers running healthy: app on :3000, postgres on :5432
- 4 Prisma migrations applied (init, deal_published, publication, is_lowest)
- npm audit: **0 vulnerabilities**
- Config validated at startup via zod (fail-fast on missing required vars)
- Graceful shutdown: SIGTERM/SIGINT properly handled
- Channel dispatch code fully deduplicated via shared modules

## Next Steps

1. Execute TASK016 (optimize N+1 DB queries) — MEDIUM
2. Execute TASK018 (improve logging with request ID/IP) — MEDIUM
3. Execute TASK020 (Docker improvements) — MEDIUM
4. Execute remaining tasks by descending priority

## Active Decisions and Considerations

- Prisma v7.4.2 with PrismaPg adapter: `url` moved from schema.prisma to prisma.config.ts (v7 breaking change)
- Express v5 (package.json shows ^5.2.1)
- No CLI entry points: all scraping triggered via `POST /api/scrape` or cron
- Channel architecture: shared types + dispatchers in `services/channels/`, single scoring in `services/scoring.ts`
