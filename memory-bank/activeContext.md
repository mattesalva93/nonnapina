# Active Context - Keepa Tracker

## Current Work Focus

TASK011, TASK012, TASK013, TASK014, TASK015, TASK016, TASK018, TASK022 completed. Next priorities: TASK020 (Docker), TASK021 (test coverage).

## Recent Changes

- **TASK016 Completed (2026-03-10):** N+1 query optimization: `markDealsAsLowest()` replaced N×2 loop with single `updateMany`; `saveProducts()` pre-fetches deals in one query + wrapped in `$transaction`.
- **TASK018 Completed (2026-03-10):** Request-ID middleware (UUID + X-Request-Id header), IP + body logging, /health log suppression, ~75 Keepa scraper logs converted to structured pino objects.
- **TASK015 Completed (2026-03-11):** Graceful shutdown: SIGTERM/SIGINT handlers, HTTP server close, cron jobs stopped, WhatsApp destroyed, active ScrapeRun marked FAILED, Prisma disconnected.
- **TASK013 Completed (2026-03-11):** DRY refactor: extracted shared channel dispatch into `services/channels/` (4 files), `services/scoring.ts`, `utils/format.ts`.

## Current State

- All Tasks 1–18 + 22 complete: 0 tsc errors, 54/54 tests pass
- Docker containers running healthy: app on :3000, postgres on :5432
- 4 Prisma migrations applied (init, deal_published, publication, is_lowest)
- npm audit: **0 vulnerabilities**
- Config validated at startup via zod (fail-fast on missing required vars)
- Graceful shutdown: SIGTERM/SIGINT properly handled
- Channel dispatch code fully deduplicated via shared modules
- DB queries optimized: N+1 eliminated in saveProducts and markDealsAsLowest
- Structured logging with request correlation IDs

## Next Steps

1. Execute TASK020 (Docker improvements) — MEDIUM
2. Execute TASK021 (increase test coverage) — MEDIUM
3. Execute remaining LOW tasks (TASK017, TASK019, TASK023, TASK024)

## Active Decisions and Considerations

- Prisma v7.4.2 with PrismaPg adapter: `url` moved from schema.prisma to prisma.config.ts (v7 breaking change)
- Express v5 (package.json shows ^5.2.1)
- No CLI entry points: all scraping triggered via `POST /api/scrape` or cron
- Channel architecture: shared types + dispatchers in `services/channels/`, single scoring in `services/scoring.ts`
