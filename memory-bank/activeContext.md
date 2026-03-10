# Active Context - Keepa Tracker

## Current Work Focus

TASK011, TASK012, TASK014, TASK022 completed on 2026-03-10. Next priorities: TASK015 (graceful shutdown), TASK013 (DRY refactor).

## Recent Changes

- **TASK022 Completed (2026-03-10):** Health check email throttled with 15-min cooldown. Recovery email on DB restoration.
- **TASK014 Completed (2026-03-10):** Config now parsed through zod schema at startup. `validateConfig()` removed. DATABASE_URL and Amazon keys required in prod/dev, relaxed in test. 7 new config tests.
- **TASK011 Completed (2026-03-10):** npm overrides fix all 9 vulnerabilities.
- **TASK012 Completed (2026-03-10):** Bearer token auth on all /api/\* routes.

## Current State

- All Tasks 1–12 + 14 + 22 complete: 0 tsc errors, 54/54 tests pass
- Docker containers running healthy: app on :3000, postgres on :5432
- 4 Prisma migrations applied (init, deal_published, publication, is_lowest)
- npm audit: **0 vulnerabilities**
- Config validated at startup via zod (fail-fast on missing required vars)

## Next Steps

1. Execute TASK015 (add graceful shutdown) — HIGH
2. Execute TASK013 (DRY refactor channel dispatch) — HIGH, significant code reduction
3. Execute remaining tasks by descending priority

## Active Decisions and Considerations

- Prisma v7.4.2 with PrismaPg adapter: `url` moved from schema.prisma to prisma.config.ts (v7 breaking change)
- Express v5 (package.json shows ^5.2.1)
- No CLI entry points: all scraping triggered via `POST /api/scrape` or cron
- 9 npm vulnerabilities are in prisma CLI transitive deps — not directly exploitable at runtime, but should still be addressed
