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
