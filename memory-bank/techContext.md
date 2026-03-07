# Tech Context - Keepa Tracker

## Technologies Used (Current)

| Technology             | Version   | Purpose                                   |
| ---------------------- | --------- | ----------------------------------------- |
| Node.js                | >= 22.0.0 | Runtime                                   |
| ES Modules             | ES2022    | Module system                             |
| axios                  | ^1.7.2    | HTTP client (Amazon API, image downloads) |
| dotenv                 | ^16.4.5   | Environment variable loading              |
| exceljs                | ^4.4.0    | Excel file generation (to be removed)     |
| puppeteer-real-browser | ^1.4.4    | Keepa scraping with Cloudflare bypass     |
| sharp                  | ^0.34.5   | Image collage generation (to be removed)  |

## Technologies Planned (Target)

| Technology       | Purpose                         |
| ---------------- | ------------------------------- |
| TypeScript       | Type safety, Prisma integration |
| Express          | HTTP server framework           |
| Prisma           | PostgreSQL ORM                  |
| PostgreSQL       | Database persistence            |
| Docker + Compose | Containerization and deployment |
| zod              | Runtime schema validation       |
| node-cron        | Scheduled tasks                 |
| pino             | Structured logging              |
| Vitest           | Testing framework               |

## Development Setup (Current)

- macOS with Xcode CLI tools
- Node.js 22+ via nvm
- Chromium/Chrome required for puppeteer-real-browser
- `.env` file with Amazon API credentials
- VS Code with custom launch configurations

## Technical Constraints

- Keepa requires real browser automation (Cloudflare protection)
- Amazon Creators API requires OAuth 2.0 tokens (55-min TTL)
- API rate limiting: 10 ASINs per request, 1 req/sec between batches
- Puppeteer needs Chromium available in Docker container
- Amazon marketplace currently hardcoded to IT (Italy)

## Dependencies to Remove During Transition

- `exceljs` → replaced by PostgreSQL persistence
- `sharp` → image collage feature removed
- macOS-specific scripts (`create-launcher.sh`, `bin/run-node.sh`)

## Dependencies to Keep

- `axios` → still needed for Amazon API calls and HTTP requests
- `dotenv` → environment variable management
- `puppeteer-real-browser` → still needed for Keepa scraping
