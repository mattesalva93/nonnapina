# Progress - Keepa Tracker

## What Works (v0.0.4)

- Keepa deals scraping (headless browser, Cloudflare bypass, category-based)
- Amazon Creators API integration (OAuth 2.0, batch fetching, affiliate links)
- JSON output (deals.json, products-complete.json)
- Excel tracker (date-based sheets, duplicate detection)
- HTML page generation (social media copy-paste with product cards)
- Image collage generation (top deals with discount badges)
- Configuration via .env with validation

## What's Left to Build (v1.0.0 Target)

### Phase 1 — Foundation ✅ COMPLETE

- [x] TypeScript configuration (tsconfig.json, all .js → .ts, 0 compile errors)
- [x] Prisma schema + PostgreSQL setup (prisma/schema.prisma, Prisma 5.22.0)
- [x] Dockerfile + docker-compose.yml (multi-stage, Node 22, Chromium, postgres:16-alpine)
- [x] Typed config module (src/config/index.ts with zod validation)
- [x] Vitest setup (5/5 tests passing)

### Phase 2 — Core Services ✅ COMPLETE

- [x] Migrate amazon.js → src/services/amazon.ts
- [x] Migrate keepa.js → src/scrapers/keepa.ts
- [x] Create src/services/product.service.ts with Prisma persistence

### Phase 3 — Express Server ✅ COMPLETE

- [x] Express app with routes (src/server.ts)
- [x] Routes: /api/scrape, /api/products, /api/deals, /health
- [x] Middleware: requestLogger, errorHandler (src/middleware/)
- [x] Scheduled scraping via node-cron (daily 08:00, override via SCRAPE_CRON)
- [x] Structured logging with pino + pino-pretty

### Phase 4 — Cleanup ✅ COMPLETE

- [x] Removed exceljs, sharp, excel-handler.ts, notes-generator.ts, image-generator.ts, json-builder.ts
- [x] Removed HTML template (src/templates/) and macOS launcher scripts (create-launcher.sh, bin/)
- [x] Removed CLI entry points (src/index.ts, src/fetch-products.ts)
- [x] Updated README for Docker/API-based usage
- [x] Updated package.json: removed obsolete scripts, main → dist/server.js

## Known Issues

- WhatsApp client Chromium profile lock (non-critical, pre-existing)
- No CI/CD pipeline
- 9 npm vulnerabilities from prisma transitive deps — **FIXED** via overrides (TASK011 ✅)
- No API authentication — **FIXED** via Bearer token middleware (TASK012 ✅)
- Health check sends email on every 503 (floods inbox during DB outages) — see TASK022
- Zod config schema defined but never used for runtime validation — see TASK014
- Massive DRY violation across publish.service, lowest-deal.service, top5.service — see TASK013
- N+1 query patterns in saveProducts() and markDealsAsLowest() — see TASK016
- No graceful shutdown handlers — see TASK015
- Low test coverage: only 4 test files, no route/integration tests — see TASK021

## Codebase Audit (2026-03-10)

Full audit completed. 14 tasks created (TASK011–TASK024):

| Task    | Title                                         | Priority | Category        |
| ------- | --------------------------------------------- | -------- | --------------- |
| TASK011 | Fix dependency vulnerabilities                | CRITICAL | Security        |
| TASK012 | Add API authentication middleware             | CRITICAL | Security        |
| TASK013 | DRY refactor: shared channel dispatch/scoring | HIGH     | Code Quality    |
| TASK014 | Fix zod config validation                     | HIGH     | Code Quality    |
| TASK015 | Add graceful shutdown handlers                | HIGH     | Reliability     |
| TASK016 | Optimize DB queries (N+1)                     | MEDIUM   | Optimization    |
| TASK017 | Remove dead code and legacy artifacts         | LOW      | Code Quality    |
| TASK018 | Improve logging (request ID, IP, structured)  | MEDIUM   | Observability   |
| TASK019 | Fix package placement and TypeScript config   | LOW      | Build/Config    |
| TASK020 | Docker improvements (entrypoint, limits, sec) | MEDIUM   | Infrastructure  |
| TASK021 | Increase test coverage                        | MEDIUM   | Testing         |
| TASK022 | Health check email flood prevention           | HIGH     | Bug/Reliability |
| TASK023 | Centralize DATABASE_URL usage via config      | LOW      | Code Quality    |
| TASK024 | Refactor AmazonService class to functions     | LOW      | Code Quality    |

## Post-v1.0.0 Enhancements

### TASK003 — Keepa Filter Modifications ✅ COMPLETE

- Updated Keepa scraper filters (date range, price variation, reviews, adult content, single variant)

### TASK004 — Per-Product Dedup ✅ COMPLETE

- Added `checkDealDuplicate()` to skip unchanged products during scraping (25/25 tests)

### TASK005 — Amazon API Deals Research ✅ COMPLETE

- Researched PA-API / Creators API for deal discovery — no browse-deals endpoint exists

### TASK006 — Two-Pass "Minimo" (isLowest) Scraping ✅ COMPLETE

- Added `isLowest` Boolean field to Deal model (Prisma migration applied)
- Extracted `scrapeAllCategories()` function for reuse across passes
- Pass 1: normal scraping; Pass 2: enables "minimo" filter and re-scrapes
- Merge: products in both passes get `isLowest=true`; pass2-only added with `isLowest=true`
- First run: 145 deals (112 isLowest=true, 33 isLowest=false)
