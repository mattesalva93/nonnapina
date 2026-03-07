# System Patterns - Keepa Tracker

## Current Architecture (v0.0.4)

### Pattern: Sequential CLI Pipeline

```
index.js → keepa.js (scrape) → json-builder.js (save ASINs)
                                       ↓
fetch-products.js → amazon.js (API) → json-builder.js (save products)
                                       ↓
                                 excel-handler.js (tracker)
                                       ↓
                                 notes-generator.js (HTML) → image-generator.js (collage)
```

### Key Technical Decisions

| Decision                                  | Rationale                                  |
| ----------------------------------------- | ------------------------------------------ |
| ES Modules (`"type": "module"`)           | Modern JavaScript standard                 |
| `puppeteer-real-browser`                  | Bypasses Cloudflare protection on Keepa    |
| Amazon Creators API (OAuth 2.0 / Cognito) | Official affiliate product data access     |
| ExcelJS for tracking                      | Date-based sheets with duplicate detection |
| HTML generation for social posts          | Copy-paste workflow for WhatsApp/Telegram  |

### Design Patterns in Use

- **Service pattern:** `AmazonService` class with token caching and batch processing
- **Configuration module:** Centralized config with validation (`config/index.js`)
- **Utility modules:** Stateless helpers for JSON, Excel, HTML, and image operations
- **Category mapping:** Constants-based Keepa category ID → Italian name mapping

### Component Relationships

- `index.js` orchestrates scraping → fetching → output
- `config/index.js` provides validated configuration to all modules
- `services/amazon.js` handles all Amazon API communication (OAuth + product data)
- `scrapers/keepa.js` handles all browser automation for Keepa
- `utils/*` handle output generation (JSON, Excel, HTML, images)

## Target Architecture

See `.github/instructions/project-evolution.instructions.md` for full target architecture details.

### Key Changes

- Express server with route-based architecture
- Prisma ORM for PostgreSQL persistence
- TypeScript for type safety
- Docker Compose for deployment
- Remove file-based outputs (Excel, HTML, images)
