# Active Context - Keepa Tracker

## Current Work Focus

TASK011 (dependency vulnerabilities) and TASK012 (API authentication) completed on 2026-03-10. Next priorities: TASK022 (health check email flood), TASK014 (config validation), TASK013 (DRY refactor).

## Recent Changes

- **TASK011 Completed (2026-03-10):** Added npm `overrides` for hono@4.12.6, @hono/node-server@1.19.11, lodash@4.17.23. Result: 0 vulnerabilities (was 9).
- **TASK012 Completed (2026-03-10):** Created `src/middleware/auth.ts` with Bearer token + timing-safe comparison. Applied to all `/api/*` routes. `/health` remains unauthenticated for Docker healthchecks. Added `API_SECRET` to config, .env.example, docker-compose.yml. 7 tests.
- **Codebase Audit (2026-03-10):** 14 audit-derived tasks (TASK011–TASK024) created.

## Current State

- All Tasks 1–10 complete: 0 tsc errors, 25/25 tests pass
- Docker containers running healthy: app on :3000, postgres on :5432
- 4 Prisma migrations applied (init, deal_published, publication, is_lowest)
- npm audit: 9 vulnerabilities (5 moderate, 4 high) — all from prisma transitive deps (hono, lodash)
- npm outdated: minor updates for @types/node, axios, dotenv, nodemailer

## Next Steps

1. Execute TASK022 (health check email flood) — HIGH, quick win
2. Execute TASK014 (fix zod config validation) — HIGH, quick win
3. Execute TASK015 (add graceful shutdown) — HIGH
4. Execute TASK013 (DRY refactor channel dispatch) — HIGH, significant code reduction
5. Execute remaining tasks by descending priority

## Active Decisions and Considerations

- Prisma v7.4.2 with PrismaPg adapter: `url` moved from schema.prisma to prisma.config.ts (v7 breaking change)
- Express v5 (package.json shows ^5.2.1)
- No CLI entry points: all scraping triggered via `POST /api/scrape` or cron
- 9 npm vulnerabilities are in prisma CLI transitive deps — not directly exploitable at runtime, but should still be addressed
