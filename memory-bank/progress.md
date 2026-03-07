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

### Phase 1 — Foundation (Not Started)

- [ ] TypeScript configuration
- [ ] Prisma schema + PostgreSQL setup
- [ ] Dockerfile + docker-compose.yml
- [ ] Typed config module
- [ ] Vitest setup

### Phase 2 — Core Services (Not Started)

- [ ] Migrate amazon.js → amazon.service.ts
- [ ] Migrate keepa.js → keepa.service.ts
- [ ] Create product.service.ts with Prisma persistence

### Phase 3 — Express Server (Not Started)

- [ ] Express app with routes
- [ ] Wire services to endpoints
- [ ] Middleware (error handling, validation, logging)
- [ ] Scheduled scraping (node-cron)

### Phase 4 — Cleanup (Not Started)

- [ ] Remove exceljs, sharp, excel-handler.js, notes-generator.js, image-generator.js
- [ ] Remove HTML template and macOS launcher scripts
- [ ] Remove json-builder.js (replaced by Prisma)
- [ ] Update README

## Known Issues

- `config/index.js` uses `null` for `storefrontId` (should use `undefined` per coding standards)
- No test coverage exists
- No CI/CD pipeline
- macOS-specific launcher scripts won't work in Docker
