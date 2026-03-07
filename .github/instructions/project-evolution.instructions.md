---
description: 'Evolution roadmap and architectural context for the Keepa Tracker project transition from CLI scripts to a Dockerized Express/Prisma server application with PostgreSQL persistence.'
applyTo: '**'
---

# Project Evolution Context

## Current State (v0.0.4) - CLI Script-Based

The project is currently a **Node.js CLI pipeline** that:

1. **Scrapes Keepa** (via `puppeteer-real-browser`) for Amazon deal ASINs, prices, discounts, and ratings
2. **Fetches product details** from the **Amazon Creators API** (OAuth 2.0 / Cognito)
3. **Generates user-friendly output files**:
   - JSON files (`deals.json`, `products-complete.json`)
   - Excel tracker (`tracker_outcome.xlsx`) with date-based sheets
   - HTML page saved to Desktop for social media copy-paste workflows
   - Image collages (top deals) via `sharp`

### Current Architecture

```text
src/
  index.js              → Main CLI entry point (orchestrates full pipeline)
  fetch-products.js     → Amazon fetch + enrichment + output generation
  config/index.js       → dotenv-based configuration with validation
  scrapers/keepa.js     → Puppeteer-based Keepa scraper
  services/amazon.js    → Amazon Creators API client (OAuth 2.0)
  utils/
    json-builder.js     → JSON read/write helpers
    excel-handler.js    → ExcelJS-based tracker management
    notes-generator.js  → HTML page generation for social posts
    image-generator.js  → Sharp-based image collage generation
  templates/
    product-page-template.html → HTML template for product pages
```

### Current Dependencies

| Package                  | Purpose                                   | Evolution Impact                                                  |
| ------------------------ | ----------------------------------------- | ----------------------------------------------------------------- |
| `axios`                  | HTTP client (Amazon API, image downloads) | **Keep** — still needed for external API calls                    |
| `dotenv`                 | Environment variable loading              | **Keep** — still useful, though Docker provides env vars natively |
| `exceljs`                | Excel file generation                     | **Remove** — replaced by PostgreSQL persistence                   |
| `puppeteer-real-browser` | Keepa web scraping                        | **Keep** — still needed for scraping, requires Chromium in Docker |
| `sharp`                  | Image processing (collages)               | **Evaluate** — may still be needed if collage feature is retained |

---

## Target State - Dockerized Express + Prisma + PostgreSQL

### High-Level Architecture

```text
┌─────────────────────────────────────────────────┐
│                Docker Compose                    │
│                                                  │
│  ┌────────────┐     ┌─────────────────────────┐ │
│  │ PostgreSQL  │◄────│  Express App (Node.js)  │ │
│  │  (Prisma)   │     │                         │ │
│  └────────────┘     │  Routes:                 │ │
│                      │  - /api/scrape (Keepa)   │ │
│                      │  - /api/products (CRUD)  │ │
│                      │  - /api/amazon (proxy)   │ │
│                      │  - /api/deals (queries)  │ │
│                      │                         │ │
│                      │  Services:              │ │
│                      │  - KeepaService         │ │
│                      │  - AmazonService        │ │
│                      │  - ProductService       │ │
│                      └─────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Key Transformation Goals

1. **Dockerization**
   - Multi-stage Docker build (build → production)
   - `docker-compose.yml` with `app` + `postgres` services
   - Chromium available inside the container for Puppeteer
   - Non-root user, health checks, resource limits
   - Environment variables via `.env` / Docker secrets

2. **PostgreSQL Persistence (via Prisma ORM)**
   - Replace JSON/Excel/HTML file output with database storage
   - Prisma schema for: `Product`, `Deal`, `PriceHistory`, `ScrapeRun`, `Category`
   - Prisma migrations for schema evolution
   - Queryable historical data (price trends, deal history)

3. **Express Server Application**
   - RESTful API replacing CLI entry points
   - Centralized HTTP handler for all external API calls (Amazon Creators API)
   - Scheduled scraping via cron-like mechanism (e.g., `node-cron`)
   - Proper error handling, request validation, structured logging

4. **Remove User-Friendly File Output**
   - Remove: Excel generation (`exceljs`, `excel-handler.js`)
   - Remove: HTML page generation (`notes-generator.js`, `product-page-template.html`)
   - Remove: Image collage generation (`image-generator.js`, `sharp`)
   - Remove: Desktop file save logic, `os.homedir()` references
   - Remove: macOS launcher script (`create-launcher.sh`, `bin/run-node.sh`)
   - Data is now consumed via API endpoints or direct DB queries

### TypeScript Migration

The project should migrate to **TypeScript** for:

- Type safety across the entire codebase (API responses, DB models, service interfaces)
- Better IDE support and refactoring confidence
- Prisma's native TypeScript integration (generated types from schema)
- Express request/response typing
- Compile-time error catching

### New Project Structure (Target)

```text
src/
  server.ts                → Express app bootstrap
  routes/
    scrape.routes.ts       → /api/scrape endpoints
    products.routes.ts     → /api/products CRUD
    amazon.routes.ts       → /api/amazon proxy endpoints
    deals.routes.ts        → /api/deals query endpoints
  services/
    keepa.service.ts       → Keepa scraper (refactored from scrapers/keepa.js)
    amazon.service.ts      → Amazon Creators API client (refactored)
    product.service.ts     → Business logic for product management
  config/
    index.ts               → Typed configuration with validation
    constants.ts           → Category mappings, marketplace data
  middleware/
    error-handler.ts       → Centralized error handling
    validation.ts          → Request validation (zod / joi)
  prisma/
    schema.prisma          → Database schema
    migrations/            → Prisma migrations
  types/
    index.ts               → Shared type definitions
docker/
  Dockerfile               → Multi-stage build
  docker-compose.yml       → App + PostgreSQL
  .dockerignore            → Build context exclusions
```

### New Dependencies (Target)

| Package                  | Purpose                              |
| ------------------------ | ------------------------------------ |
| `express`                | HTTP server framework                |
| `@prisma/client`         | Database ORM client                  |
| `prisma` (dev)           | Schema management and migrations     |
| `typescript` (dev)       | TypeScript compiler                  |
| `tsx` (dev)              | TypeScript execution for development |
| `zod`                    | Runtime schema validation            |
| `node-cron`              | Scheduled task execution             |
| `pino`                   | Structured logging                   |
| `axios`                  | HTTP client (retained)               |
| `puppeteer-real-browser` | Keepa scraping (retained)            |
| `dotenv`                 | Env var loading (retained)           |

### Migration Phases

**Phase 1 — Foundation**

- Initialize TypeScript configuration
- Set up Prisma with PostgreSQL schema
- Create Dockerfile and docker-compose.yml
- Migrate config to typed module

**Phase 2 — Core Services**

- Migrate `amazon.js` → `amazon.service.ts`
- Migrate `keepa.js` → `keepa.service.ts`
- Create `product.service.ts` with Prisma persistence

**Phase 3 — Express Server**

- Create Express app with routes
- Wire services to endpoints
- Add middleware (error handling, validation, logging)
- Add scheduled scraping

**Phase 4 — Cleanup**

- Remove `exceljs`, `sharp`, `excel-handler.js`, `notes-generator.js`, `image-generator.js`
- Remove HTML template and macOS launcher scripts
- Remove `json-builder.js` (replaced by Prisma)
- Update README and documentation

---

## Rules for AI During Evolution

- When modifying existing files, understand they will be refactored or removed soon
- New code should be written in **TypeScript**
- New data persistence should target **Prisma/PostgreSQL**, not JSON/Excel
- New API endpoints should follow **Express** patterns
- Docker considerations: avoid host-specific paths (`os.homedir()`, hardcoded macOS paths)
- Follow the instructions in `nodejs-javascript-vitest.instructions.md` for testing
- Follow the instructions in `containerization-docker-best-practices.instructions.md` for Docker
- Always answer in the user's language (Italian) but write code, comments, and docs in English
