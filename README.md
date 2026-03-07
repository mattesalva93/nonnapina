# Keepa Tracker

Keepa Tracker automates Amazon affiliate deal discovery by scraping the Keepa website and enriching products via the Amazon Creators API.

Scraped data is persisted in PostgreSQL and exposed through a REST API.

## Architecture

```
Keepa (scrape) → Amazon Creators API (enrich) → PostgreSQL (Prisma)
                                                       ↓
                                               REST API (Express)
```

## Prerequisites

- [Docker](https://www.docker.com/get-started) and Docker Compose
- Amazon Creators API credentials (see [Configuration](#configuration))

## Quick start

```bash
# 1. Copy the environment file and fill in your values
cp .env.example .env

# 2. Build and start the application
docker compose up --build -d

# 3. Verify the service is healthy
curl http://localhost:3000/health
```

The database migrations run automatically on startup.

## Configuration

Copy `.env.example` to `.env` and set the following variables.

### Amazon Creators API

| Variable               | Description                                      |
| ---------------------- | ------------------------------------------------ |
| `AMAZON_ACCESS_KEY`    | OAuth 2.0 Client ID                              |
| `AMAZON_SECRET_KEY`    | OAuth 2.0 Client Secret                          |
| `AMAZON_PARTNER_TAG`   | Affiliate Partner Tag (e.g. `yourid-21`)         |
| `AMAZON_MARKETPLACE`   | Amazon marketplace (default: `IT`)               |
| `AMAZON_STOREFRONT_ID` | Optional storefront ID for store deep links      |

To obtain Amazon Creators API credentials:

1. Join the [Amazon Affiliate Program](https://programma-affiliazione.amazon.it)
2. Request Creators API access from the affiliate dashboard
3. Copy the Client ID, Client Secret and Partner Tag to your `.env`

### Keepa scraper

| Variable                    | Description                                           |
| --------------------------- | ----------------------------------------------------- |
| `KEEPA_CATEGORIES`          | Comma-separated Keepa category IDs (default: `5`)     |
| `MAX_PRODUCTS_PER_CATEGORY` | Products to fetch per category (default: `10`)        |
| `SCRAPING_DELAY_MS`         | Delay between requests in ms (default: `2000`)        |

**Keepa category IDs (Amazon.it)**

| ID | Category                        |
| -- | ------------------------------- |
| 1  | Alimentari e cura della casa    |
| 2  | Altro                           |
| 3  | App e Giochi                    |
| 5  | Bellezza                        |
| 8  | Casa e cucina                   |
| 10 | Elettronica                     |
| 14 | Giochi e giocattoli             |
| 17 | Informatica                     |
| 22 | Prodotti per animali domestici  |
| 25 | Sport e tempo libero            |
| 27 | Videogiochi                     |

### Server and database

| Variable            | Description                                                        |
| ------------------- | ------------------------------------------------------------------ |
| `PORT`              | HTTP port (default: `3000`)                                        |
| `NODE_ENV`          | Runtime environment (`development` / `production`)                 |
| `DATABASE_URL`      | PostgreSQL connection string (set automatically by Docker Compose) |
| `POSTGRES_PASSWORD` | PostgreSQL password (required by Docker Compose)                   |
| `SCRAPE_CRON`       | Cron schedule for automatic scraping (default: `0 8 * * *`)        |

## API reference

Base URL: `http://localhost:3000`

### Health

```
GET /health
```

Returns service and database status.

### Scrape runs

| Method | Path               | Description                         |
| ------ | ------------------ | ----------------------------------- |
| `POST` | `/api/scrape`      | Trigger a new scrape (async, 202)   |
| `GET`  | `/api/scrape`      | List past scrape runs               |
| `GET`  | `/api/scrape/:id`  | Get status of a specific scrape run |

**Trigger a scrape:**

```bash
curl -X POST http://localhost:3000/api/scrape
# → { "scrapeRunId": "clxxx..." }
```

### Products

| Method | Path                   | Description                       |
| ------ | ---------------------- | --------------------------------- |
| `GET`  | `/api/products`        | Paginated product list            |
| `GET`  | `/api/products/:asin`  | Single product with last 10 deals |

Query parameters for `/api/products`: `limit` (max 200, default 50), `offset`.

### Deals

| Method | Path          | Description          |
| ------ | ------------- | -------------------- |
| `GET`  | `/api/deals`  | Paginated deal list  |

Query parameters: `limit`, `offset`, `category`, `scrapeRunId`.

## Development

```bash
# Install dependencies
npm install

# Start the server in watch mode
npm run server:dev

# Run tests
npm test

# Type-check
npm run typecheck
```

A running PostgreSQL instance with `DATABASE_URL` set in `.env` is required for local development.

## Project structure

```
src/
  server.ts           → Express app entry point
  config/             → Typed configuration (zod)
  middleware/         → Request logger, error handler
  routes/             → /api/scrape, /api/products, /api/deals
  scrapers/           → Keepa Puppeteer scraper
  services/           → Amazon API client, product persistence
  types/              → Shared TypeScript types
  utils/              → Logger (pino)
prisma/
  schema.prisma       → Database schema (Product, Deal, ScrapeRun)
prisma.config.ts      → Prisma v7 datasource configuration
Dockerfile            → Multi-stage Node 22 + Chromium build
docker-compose.yml    → App + PostgreSQL services
```

## Docker notes

The image installs system Chromium (`/usr/bin/chromium`) to support `puppeteer-real-browser` without downloading a separate browser binary. Chromium path is set via `ENV CHROMIUM_PATH=/usr/bin/chromium`.

The container runs as a non-root user (`appuser`).
