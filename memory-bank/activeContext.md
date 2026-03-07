# Active Context - Keepa Tracker

## Current Work Focus

Phases 1–3 of the v1.0.0 migration are complete. The application is a fully-structured Express/Prisma/TypeScript server with Docker support. Next focus: Phase 4 cleanup (remove legacy utils, CLI launchers, update README).

## Recent Changes

- Completed TypeScript migration (all .js → .ts, 0 compile errors, 5/5 tests)
- Added Prisma 5.22.0 schema (Product, Deal, ScrapeRun models)
- Created Express server (src/server.ts) with routes, middleware, node-cron
- Added structured logging with pino
- Created Dockerfile (multi-stage, Node 22 bookworm-slim + Chromium)
- Created docker-compose.yml (app + postgres:16-alpine services)
- Updated package.json: added `server`, `server:dev` scripts; build now runs `prisma generate` first
- Updated .env.example with PORT, DATABASE_URL, POSTGRES_PASSWORD, SCRAPE_CRON
- Version bumped to 0.1.0

## Current State

- All Phases 1–3 complete and verified (tsc --noEmit: 0 errors, vitest: 5/5 pass)
- Docker infrastructure ready; migrations need a running postgres to be applied
- CLI pipeline (src/index.ts, src/fetch-products.ts) still functional alongside Express server
- Legacy utility files (excel-handler.ts, notes-generator.ts, image-generator.ts, json-builder.ts) still present

## Next Steps

**Phase 4 — Cleanup:**

1. Remove legacy utils: exceljs dep, excel-handler.ts, notes-generator.ts, image-generator.ts, json-builder.ts
2. Remove macOS launchers: create-launcher.sh, bin/run-node.sh, src/templates/product-page-template.html
3. Update README to document Docker setup and API endpoints
4. Test Docker build end-to-end with `docker compose up --build`

## Active Decisions and Considerations

- Prisma 5 (not v7): v7 broke `url = env("DATABASE_URL")` in schema (requires adapter setup); v5 LTS is stable
- Express v5 installed (package.json shows ^5.2.1)
- Keep CLI entry points until Phase 4 cleanup removes them deliberately
