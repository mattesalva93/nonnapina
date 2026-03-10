# [TASK018] - Improve Logging (Request ID, IP Tracking, Structured Context)

**Status:** Completed
**Added:** 2026-03-10
**Updated:** 2026-03-10
**Priority:** MEDIUM
**Category:** Observability / Security

## Original Request

Audit finding: the current logging setup lacks several best practices for production observability and security audit trails.

## Detailed Analysis

### Missing: Request Correlation ID

- No `X-Request-ID` header generation or propagation
- When a scrape job fails, there's no way to correlate the error with the HTTP request that triggered it
- Makes debugging multi-step flows (scrape → fetch → persist → publish) very difficult
- **Fix**: Generate a UUID for each request, attach to pino child logger, return in response headers

### Missing: Client IP in Request Logs

- `requestLogger` middleware logs method, URL, status, and duration
- Does **not** log `req.ip` or `X-Forwarded-For`
- Essential for security audit trail (who triggered what action, when)
- **Fix**: Add `ip` field to the request log

### Missing: Request Body Logging for Mutations

- POST/PUT/DELETE requests don't log the request body
- Makes it impossible to reproduce issues from logs alone
- **Fix**: Log sanitized request body for mutation endpoints (strip sensitive fields)

### Health Check Logs Are Noisy

- Every 30-second Docker healthcheck triggers a debug log and a full request log entry
- In production, this adds ~2880 log lines per day of pure noise
- **Fix**: Exclude `/health` from `requestLogger` or log at `trace` level

### Keepa Scraper Uses Emoji-Heavy Console Style

- The Keepa scraper uses emoji-prefixed `logger.info()` calls with string interpolation instead of structured logging
- Example: `logger.info(\` ✅ \${asin}\${priceInfo}\${reviewInfo}\`)`
- Should use structured pino objects: `logger.info({ asin, price, rating }, 'Product scraped')`
- Makes log parsing and monitoring tools (ELK, Grafana Loki) much less effective

## Implementation Plan

- [ ] Create request-id middleware that generates UUID and attaches to `req` and `res` headers
- [ ] Add `ip` field to request logger output
- [ ] Add sanitized body logging for POST/PUT/DELETE requests
- [ ] Exclude or downgrade `/health` endpoint logging
- [ ] Refactor Keepa scraper logs to use structured pino format
- [ ] Add `requestId` to component loggers for correlated tracing

## Progress Tracking

**Overall Status:** Completed - 100%

### Subtasks

| ID   | Description                                  | Status   | Updated    | Notes                                          |
| ---- | -------------------------------------------- | -------- | ---------- | ---------------------------------------------- |
| 18.1 | Create request-id middleware                 | Complete | 2026-03-10 | crypto.randomUUID, X-Request-Id header         |
| 18.2 | Add IP to request logger                     | Complete | 2026-03-10 | req.ip with socket.remoteAddress fallback      |
| 18.3 | Add body logging for mutations               | Complete | 2026-03-10 | POST/PUT/PATCH/DELETE; sensitive keys redacted |
| 18.4 | Suppress /health log noise                   | Complete | 2026-03-10 | Early return skips /health from request logger |
| 18.5 | Refactor Keepa scraper to structured logging | Complete | 2026-03-10 | ~75 emoji-based logs converted to pino objects |
| 18.6 | Propagate requestId through child loggers    | Complete | 2026-03-10 | requestId in request-logger + error-handler    |

## Progress Log

### 2026-03-10

- Task created from comprehensive codebase audit
- Created `src/middleware/request-id.ts`: generates UUID per request, reads existing X-Request-Id, sets on req.id and response header
- Added Express global augmentation for `req.id`
- Updated `request-logger.ts`: added IP (`req.ip`), requestId, sanitized body logging for mutations, skip /health route
- Updated `error-handler.ts`: includes `requestId` in error log objects
- Wired `requestId` middleware in `server.ts` (before requestLogger)
- Converted ~75 emoji-heavy string-interpolation logs in `keepa.ts` to structured pino objects: helper functions, scrapeAllCategories, collectLowestAsins, scrapeKeepaDeals
- All 54 tests pass, 0 TypeScript errors
