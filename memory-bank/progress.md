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

### Phase 4 — Cleanup (Pending)

- [ ] Remove exceljs, sharp, excel-handler.ts, notes-generator.ts, image-generator.ts
- [ ] Remove HTML template and macOS launcher scripts (create-launcher.sh, bin/run-node.sh)
- [ ] Remove json-builder.ts (replaced by Prisma)
- [ ] Update README

## Known Issues

- Phase 4 cleanup not yet done: legacy utility files and CLI launchers still present
- Prisma migrations not yet applied to a real DB (needs Docker environment to test)
- No CI/CD pipeline
