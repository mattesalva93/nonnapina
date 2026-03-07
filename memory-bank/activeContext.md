# Active Context - Keepa Tracker

## Current Work Focus

Starting the transition from CLI pipeline (v0.0.4) to Dockerized Express/Prisma/PostgreSQL server (v1.0.0).

## Recent Changes

- Project structure analyzed and documented in memory bank
- No code changes yet — transition planning phase

## Current State

- All existing CLI code is functional (no lint/compile errors)
- Codebase is JavaScript ES Modules (to migrate to TypeScript)
- No tests exist yet
- No Docker configuration exists yet
- No Prisma schema exists yet
- No Express server exists yet

## Next Steps

Begin **Phase 1 — Foundation** of the migration:

1. Initialize TypeScript configuration (`tsconfig.json`)
2. Set up Prisma with PostgreSQL schema
3. Create Dockerfile and docker-compose.yml
4. Migrate config to typed module
5. Set up Vitest for testing

## Active Decisions and Considerations

- TypeScript strict mode from the start
- Keep existing JS code working during transition (gradual migration)
- New code written in TypeScript only
- Docker setup must support Chromium for puppeteer-real-browser
