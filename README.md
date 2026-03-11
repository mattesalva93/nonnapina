# Nonna Pina

Nonna Pina automates Amazon affiliate deal discovery by scraping deal aggregators and enriching products via the Amazon Creators API. Scraped data is persisted in PostgreSQL and exposed through a REST API. Deals are automatically published to Telegram and WhatsApp channels on a randomised daily schedule.

## Architecture

```
Deal aggregator (scrape) → Amazon Creators API (enrich) → PostgreSQL (Prisma)
                                                       ↓
                                               REST API (Express)
                                                       ↓
                                        Telegram / WhatsApp (publish)
```

## Prerequisites

- [Docker](https://www.docker.com/get-started) and Docker Compose v2+
- Amazon Creators API credentials (see [Amazon Creators API](#amazon-creators-api))
- A Telegram bot **or** WhatsApp account for deal publishing (see [Publishing channels](#publishing-channels))

## Quick start

```bash
# 1. Clone the repository
git clone <repo-url> && cd nonnapina-prod

# 2. Copy the environment file and fill in your values
cp .env.example .env
# Edit .env with your credentials (see Configuration below)

# 3. Build and start the application
docker compose up --build -d

# 4. Verify the service is healthy
curl http://localhost:3000/health
```

The database migrations run automatically on startup.

## Configuration

Copy `.env.example` to `.env` and fill in each section. All variables are documented below.

### Server and database

| Variable            | Required | Default                       | Description                                                        |
| ------------------- | -------- | ----------------------------- | ------------------------------------------------------------------ |
| `PORT`              | No       | `3000`                        | HTTP port the Express server listens on                            |
| `NODE_ENV`          | No       | `development`                 | Runtime environment (`development`, `production`, `test`)          |
| `LOG_LEVEL`         | No       | `debug` (dev) / `info` (prod) | Pino log level (`trace`, `debug`, `info`, `warn`, `error`)         |
| `DATABASE_URL`      | Yes      | —                             | PostgreSQL connection string (set automatically by Docker Compose) |
| `POSTGRES_PASSWORD` | Yes      | —                             | PostgreSQL password (used by Docker Compose)                       |
| `SCRAPE_CRON`       | No       | `15 8,20 * * *`               | Cron schedule for automatic deal scraping                          |

### Amazon Creators API

| Variable               | Required | Default | Description                              |
| ---------------------- | -------- | ------- | ---------------------------------------- |
| `AMAZON_ACCESS_KEY`    | Yes      | —       | OAuth 2.0 Client ID                      |
| `AMAZON_SECRET_KEY`    | Yes      | —       | OAuth 2.0 Client Secret                  |
| `AMAZON_PARTNER_TAG`   | Yes      | —       | Affiliate Partner Tag (e.g. `yourid-21`) |
| `AMAZON_MARKETPLACE`   | No       | `IT`    | Amazon marketplace code                  |
| `AMAZON_STOREFRONT_ID` | No       | —       | Storefront ID for store deep links       |

To obtain Amazon Creators API credentials:

1. Join the [Amazon Affiliate Program](https://programma-affiliazione.amazon.it)
2. Request Creators API access from the affiliate dashboard
3. Copy the Client ID, Client Secret and Partner Tag to your `.env`

### Deal scraper

| Variable                    | Required | Default | Description                           |
| --------------------------- | -------- | ------- | ------------------------------------- |
| `KEEPA_CATEGORIES`          | No       | `5`     | Comma-separated deal category IDs     |
| `MAX_PRODUCTS_PER_CATEGORY` | No       | `10`    | Max products to fetch per category    |
| `SCRAPING_DELAY_MS`         | No       | `2000`  | Delay between category requests in ms |

**Category IDs (Amazon.it)**

| ID  | Category                           |
| --- | ---------------------------------- |
| 1   | Alimentari e cura della casa       |
| 2   | Altro                              |
| 3   | App e Giochi                       |
| 4   | Auto e Moto                        |
| 5   | Bellezza                           |
| 6   | CD e Vinili                        |
| 7   | Cancelleria e prodotti per ufficio |
| 8   | Casa e cucina                      |
| 9   | Commercio, Industria e Scienza     |
| 10  | Elettronica                        |
| 11  | Fai da te                          |
| 12  | Film e TV                          |
| 13  | Giardino e giardinaggio            |
| 14  | Giochi e giocattoli                |
| 15  | Grandi elettrodomestici            |
| 16  | Illuminazione                      |
| 17  | Informatica                        |
| 18  | Libri                              |
| 19  | Moda                               |
| 20  | Musica Digitale                    |
| 21  | Prima infanzia                     |
| 22  | Prodotti per animali domestici     |
| 23  | Salute e cura della persona        |
| 24  | Software                           |
| 25  | Sport e tempo libero               |
| 26  | Strumenti musicali                 |
| 27  | Videogiochi                        |
| 28  | Amazon Luxury                      |

New categories that are not yet mapped are automatically saved to `output/missing-categories.json`.

### Publishing channels

Deals are published automatically via a randomised schedule (2–4 posts per hour, 06:00–23:00). A daily "Top 5 Deals" summary is published at 19:00 with an image collage.

#### Telegram

| Variable             | Required | Default | Description                                         |
| -------------------- | -------- | ------- | --------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN` | No       | —       | Bot token from [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID`   | No       | —       | Chat or channel ID where deals are posted           |

Setup steps:

1. Message [@BotFather](https://t.me/BotFather) on Telegram and create a new bot with `/newbot`
2. Copy the bot token to `TELEGRAM_BOT_TOKEN`
3. Add the bot as administrator to your target channel or group
4. Get the chat ID (use [@userinfobot](https://t.me/userinfobot) or the Telegram API `getUpdates` method)
5. Set `TELEGRAM_CHAT_ID` to the chat/channel ID (channels use format `-100xxxxxxxxxx`)

#### WhatsApp

| Variable                | Required | Default          | Description                                                |
| ----------------------- | -------- | ---------------- | ---------------------------------------------------------- |
| `WHATSAPP_CHANNEL_ID`   | No       | —                | Channel ID or name (get from `GET /api/whatsapp/channels`) |
| `WHATSAPP_SESSION_PATH` | No       | `./.wwebjs_auth` | Path to persist WhatsApp session data                      |

Setup steps:

1. Start the application without WhatsApp configuration
2. Visit `GET /api/whatsapp/qr` — the response will contain a QR code string
3. Scan the QR code with WhatsApp on your phone (Settings → Linked Devices → Link a Device)
4. Once authenticated, call `GET /api/whatsapp/channels` to list available channels
5. Copy the desired channel ID to `WHATSAPP_CHANNEL_ID`
6. The session is persisted in the `WHATSAPP_SESSION_PATH` directory, so re-authentication is only needed if the session expires

### Email alerts (SMTP)

Error alerts are sent via email **only when `NODE_ENV=production`** and SMTP credentials are configured.

| Variable           | Required | Default | Description                        |
| ------------------ | -------- | ------- | ---------------------------------- |
| `SMTP_HOST`        | No       | —       | SMTP server hostname               |
| `SMTP_PORT`        | No       | `587`   | SMTP server port                   |
| `SMTP_SECURE`      | No       | `false` | Use TLS (`true` for port 465)      |
| `SMTP_USER`        | No       | —       | SMTP authentication username       |
| `SMTP_PASS`        | No       | —       | SMTP authentication password       |
| `ALERT_EMAIL_FROM` | No       | —       | Sender address for alert emails    |
| `ALERT_EMAIL_TO`   | No       | —       | Recipient address for alert emails |
| `ALERT_EMAIL_CC`   | No       | —       | Comma-separated CC recipients      |

### Other options

| Variable                   | Required | Default                           | Description                                     |
| -------------------------- | -------- | --------------------------------- | ----------------------------------------------- |
| `INCLUDE_STOREFRONT_LINKS` | No       | `false`                           | Generate storefront links (needs storefront ID) |
| `OUTPUT_FILE`              | No       | `./output/deals.json`             | Path for deals JSON output                      |
| `PRODUCTS_OUTPUT_FILE`     | No       | `./output/products-complete.json` | Path for products JSON output                   |
| `DATE_FOR_POSTS`           | No       | today                             | Date for post generation (DD/MM/YYYY)           |
| `TOP_REVIEW_COUNT`         | No       | `5`                               | Number of top review products to feature        |
| `MIN_REVIEWS`              | No       | `10`                              | Minimum reviews for eligibility                 |
| `TOP_DEALS_COUNT`          | No       | `5`                               | Number of top deals for image collage           |

## API reference

Base URL: `http://localhost:3000`

All endpoints return JSON. Rate limit: 100 requests per minute per IP.

### Health

```
GET /health
```

Returns service and database connectivity status.

**Response (200):**

```json
{ "status": "ok", "timestamp": "2026-03-08T10:00:00.000+01:00", "db": "connected" }
```

**Response (503):** database unreachable.

### Scrape runs

| Method | Path              | Description                         |
| ------ | ----------------- | ----------------------------------- |
| `POST` | `/api/scrape`     | Trigger a new scrape (async, 202)   |
| `GET`  | `/api/scrape`     | List past scrape runs               |
| `GET`  | `/api/scrape/:id` | Get status of a specific scrape run |

**Trigger a scrape:**

```bash
curl -X POST http://localhost:3000/api/scrape
```

**Response (202):**

```json
{
  "scrapeRunId": "clxxx...",
  "status": "RUNNING",
  "message": "Scrape job started. Poll GET /api/scrape/:id for status."
}
```

**Response (409):** a scrape job is already running.

A scrape run goes through these statuses: `RUNNING` → `COMPLETED` or `FAILED`.

### Products

| Method | Path                  | Description                       |
| ------ | --------------------- | --------------------------------- |
| `GET`  | `/api/products`       | Paginated product list            |
| `GET`  | `/api/products/:asin` | Single product with last 10 deals |

Query parameters for `GET /api/products`:

| Parameter | Default | Max | Description       |
| --------- | ------- | --- | ----------------- |
| `limit`   | 50      | 200 | Results per page  |
| `offset`  | 0       | —   | Pagination offset |

ASIN format: exactly 10 alphanumeric uppercase characters (e.g. `B0DHRQ2XGJ`).

### Deals

| Method | Path         | Description         |
| ------ | ------------ | ------------------- |
| `GET`  | `/api/deals` | Paginated deal list |

Query parameters:

| Parameter     | Default | Description                |
| ------------- | ------- | -------------------------- |
| `limit`       | 50      | Results per page (max 200) |
| `offset`      | 0       | Pagination offset          |
| `category`    | —       | Filter by category name    |
| `scrapeRunId` | —       | Filter by scrape run ID    |

### Publishing

| Method | Path                        | Description                                 |
| ------ | --------------------------- | ------------------------------------------- |
| `GET`  | `/api/publish`              | List past publications (most recent first)  |
| `GET`  | `/api/publish/next`         | Preview the next deal to be published       |
| `POST` | `/api/publish`              | Manually trigger one publish cycle          |
| `GET`  | `/api/publish/top5/preview` | Preview today's top 5 deals                 |
| `POST` | `/api/publish/top5`         | Manually trigger today's top 5 summary post |

**`GET /api/publish/next` response:**

```json
{
  "deal": { "id": "...", "asin": "B0DHRQ2XGJ", "discount": 40, "...": "..." },
  "postPreview": "💬 Product Title\n\n💰 A soli 29,99€ invece di ...",
  "nextScheduledAt": "2026-03-08T14:23:00.000+01:00",
  "todaySchedule": ["06:12", "06:34", "06:47", "07:03", "..."]
}
```

**`POST /api/publish` response (200):**

```json
{
  "dealId": "...",
  "asin": "B0DHRQ2XGJ",
  "postContent": "...",
  "channels": [
    { "channel": "TELEGRAM", "success": true },
    { "channel": "WHATSAPP", "success": true }
  ],
  "allSucceeded": true
}
```

**Response (204):** no unpublished deals available.

### WhatsApp

| Method | Path                     | Description                                        |
| ------ | ------------------------ | -------------------------------------------------- |
| `GET`  | `/api/whatsapp/status`   | Current connection state                           |
| `GET`  | `/api/whatsapp/qr`       | QR code for initial authentication                 |
| `GET`  | `/api/whatsapp/channels` | List channels visible to the authenticated account |

**Connection states:** `disconnected` → `initializing` → `qr_pending` → `ready`.

## Scheduling behaviour

### Scraping

The deal scraper runs on the schedule defined by `SCRAPE_CRON` (default: 08:15 and 20:15 daily). An initial scrape also runs at server startup to populate the database. If a scrape is already running, the scheduled or initial scrape is skipped.

### Publishing

Deal publishing uses a randomised schedule to simulate natural posting behaviour:

- **Window:** 06:00–23:00 (configurable via constants in `scheduler.service.ts`)
- **Frequency:** 2–4 posts per hour, with exact minutes randomly chosen each day
- **Top 5 summary:** daily at 19:00 with a generated image collage
- **Schedule regeneration:** daily at midnight
- **Selection algorithm:** deals are scored using a weighted formula combining discount (60%) and review confidence (40%), then one deal is randomly picked from the top 5 scored candidates

## Development

```bash
# Install dependencies
npm install

# Start PostgreSQL (required for local dev)
docker compose up postgres -d

# Run Prisma migrations
npx prisma migrate dev

# Start the server in watch mode
npm run server:dev

# Run tests
npm test

# Type-check
npm run typecheck

# Build for production
npm run build
```

A running PostgreSQL instance with `DATABASE_URL` set in `.env` is required for local development.

### Makefile

The project includes a Makefile for common Docker operations:

```bash
make help           # Show all available commands
make up             # Build and start all services (detached)
make down           # Stop and remove all containers
make restart        # Full restart (down + build + up)
make logs           # Follow app logs
make logs-db        # Follow database logs
make shell          # Open a shell inside the app container
make db-shell       # Open psql inside the database container
make migrate        # Run pending Prisma migrations
make migrate-status # Show migration status
make clean          # Stop containers and remove orphans
make clean-volumes  # Stop and remove containers AND volumes (DB data lost)
make prod           # Production deploy with .env.production
make prod-logs      # Follow production app logs
make prod-stop      # Stop production containers
```

## Project structure

```
src/
  server.ts              → Express app entry point
  config/
    index.ts             → Typed configuration with Zod validation
    index.test.ts        → Config validation tests
  middleware/
    error-handler.ts     → Centralised Express error handler
    rate-limiter.ts      → In-memory rate limiter (100 req/min per IP)
    request-logger.ts    → HTTP request logging (Pino)
  routes/
    scrape.routes.ts     → /api/scrape — trigger and monitor scraping
    products.routes.ts   → /api/products — product CRUD
    deals.routes.ts      → /api/deals — deal queries with filtering
    publish.routes.ts    → /api/publish — publishing and preview
    whatsapp.routes.ts   → /api/whatsapp — WhatsApp status and QR
  scrapers/
    keepa.ts             → Puppeteer-based deal scraper
  services/
    amazon.ts            → Amazon Creators API client (OAuth 2.0)
    product.service.ts   → Database persistence (Prisma)
    publish.service.ts   → Deal selection, scoring, and channel dispatch
    top5.service.ts      → Top 5 daily summary selection and publishing
    scheduler.service.ts → Randomised publish schedule generation
    whatsapp.service.ts  → WhatsApp Web client (whatsapp-web.js)
    email.service.ts     → SMTP email alerts for errors
    image.service.ts     → Top 5 image collage generation (Sharp)
  types/
    index.ts             → Shared TypeScript type definitions
  utils/
    logger.ts            → Pino logger with component child loggers
    date.ts              → Local ISO 8601 timestamp helper
prisma/
  schema.prisma          → Database schema (Product, Deal, ScrapeRun, Publication)
  migrations/            → Prisma migration history
prisma.config.ts         → Prisma v7 datasource configuration
Dockerfile               → Multi-stage Node 22 + Chromium build
docker-compose.yml       → App + PostgreSQL services
Makefile                 → Docker operation shortcuts
```

## Docker notes

- The image uses a **multi-stage build**: the first stage compiles TypeScript, the second stage contains only production dependencies and the compiled output.
- System Chromium (`/usr/bin/chromium`) is installed for `puppeteer-real-browser`. Path is set via `ENV CHROMIUM_PATH=/usr/bin/chromium`.
- The container runs as a **non-root user** (`appuser`, UID 1001).
- Timezone is set to `Europe/Rome` via `TZ=Europe/Rome`.
- A health check polls `GET /health` every 30 seconds with a 60-second start period.
- On startup, `npx prisma migrate deploy` runs pending migrations before starting the server.
- PostgreSQL data, application output, and WhatsApp session data are persisted in named Docker volumes.

## Security

- **Rate limiting:** 100 requests per minute per IP address
- **Security headers:** `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Content-Security-Policy`, `Permissions-Policy`, `Strict-Transport-Security` (production only)
- **Input validation:** ASIN format validation, query parameter bounds checking, request body size limit (100 KB)
- **Non-root container:** the Docker image runs as `appuser` (UID 1001), not root
- **Database isolation:** PostgreSQL port is bound to `127.0.0.1` only, not accessible from external networks
- **Secret management:** all credentials are loaded from environment variables, never hardcoded
- **Email alerts:** critical errors (scrape failures, health check failures) trigger email notifications in production

## Troubleshooting

### Container not starting

```bash
# Check container logs
docker compose logs app

# Verify environment variables are set
docker compose config
```

### Database connection issues

```bash
# Check PostgreSQL is healthy
docker compose ps postgres

# Open a psql shell to verify connectivity
make db-shell
```

### WhatsApp authentication

- If the QR code is not appearing, wait a few seconds and retry `GET /api/whatsapp/qr` — the client needs time to initialize
- If the session expires, delete the WhatsApp session volume and re-authenticate:
  ```bash
  docker compose down
  docker volume rm nonnapina-prod_whatsapp_session
  docker compose up -d
  ```

### Scrape runs stuck in RUNNING status

If a scrape run is stuck (e.g. due to a crash), it blocks new scrapes. Check the run status:

```bash
curl http://localhost:3000/api/scrape
```

If needed, manually update the status via the database:

```bash
make db-shell
# Then in psql:
UPDATE "ScrapeRun" SET status = 'FAILED', "completedAt" = NOW(), "errorMessage" = 'Manually reset' WHERE status = 'RUNNING';
```

### Chromium crashes inside Docker

Ensure the container has sufficient memory (at least 512 MB). If using Docker Desktop, check the resource limits in Settings → Resources.
