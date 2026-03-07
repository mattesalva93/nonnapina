---
description: 'General project context and conventions for the Keepa Tracker codebase. Apply to all files to ensure consistent patterns, naming, and architecture decisions.'
applyTo: '**'
---

# Keepa Tracker — Project Context

## What This Project Is

Keepa Tracker is a Node.js application that automates Amazon affiliate deal discovery by scraping the Keepa website and enriching products via the Amazon Creators API. It is currently a CLI-based pipeline (v0.0.4) being transitioned to a Dockerized Express/Prisma/PostgreSQL server application.

## Current Architecture (v0.0.4)

- **Entry point:** `src/index.js` — orchestrates scraping and product fetching
- **Scraper:** `src/scrapers/keepa.js` — Puppeteer-based Keepa deal extraction
- **Amazon API client:** `src/services/amazon.js` — OAuth 2.0 + Creators API
- **Config:** `src/config/index.js` — dotenv-based configuration with validation
- **Utilities:** `src/utils/` — JSON, Excel, HTML, and image output generators

## Project Conventions

### Language

- User interaction: **Italian** (the project owner's language)
- Code, comments, documentation, variable names: **English**

### Code Style

- ES Modules (`import`/`export`) — the project uses `"type": "module"`
- Async/await for all asynchronous operations
- New code must be written in **TypeScript**
- Prefer functions over classes (except where classes are already established, e.g., `AmazonService`)
- Never use `null` — use `undefined` for optional values
- No unnecessary comments — code should be self-explanatory

### File Organization

- Source code in `src/`
- Configuration in `src/config/`
- Services (external API clients) in `src/services/`
- Routes (Express endpoints) in `src/routes/`
- Middleware in `src/middleware/`
- Shared types in `src/types/`
- Database schema in `prisma/`
- Docker configuration in project root

### Testing

- Use **Vitest** for all tests
- Tests for all new features and bug fixes
- Never modify source code solely to make testing easier

### Data Flow

```
Keepa (scrape) → Enrich with Amazon API → Persist to PostgreSQL (via Prisma)
                                                    ↓
                                            Expose via REST API
```

### Key Domain Concepts

| Term         | Description                                                     |
| ------------ | --------------------------------------------------------------- |
| ASIN         | Amazon Standard Identification Number — unique product ID       |
| Deal         | A product with a notable discount found on Keepa                |
| Partner Tag  | Amazon affiliate tracking identifier                            |
| Creators API | Amazon's OAuth 2.0 product data API for affiliates              |
| Deep Link    | Universal affiliate link that opens the Amazon app if installed |
| Storefront   | Optional Amazon storefront page for the affiliate               |

### Environment Variables (Required)

- `AMAZON_ACCESS_KEY` — Amazon Creators API key
- `AMAZON_SECRET_KEY` — Amazon Creators API secret
- `AMAZON_PARTNER_TAG` — Affiliate partner tag
- `KEEPA_CATEGORIES` — Comma-separated Keepa category IDs
- `DATABASE_URL` — PostgreSQL connection string (new, for Prisma)

### Dependencies Philosophy

- Minimize external dependencies — prefer Node.js built-in modules
- Ask before adding new dependencies
- Dependencies being removed during transition: `exceljs`, `sharp`
- Dependencies being added: `express`, `@prisma/client`, `typescript`, `zod`, `pino`, `node-cron`
