# [TASK012] - Add API Authentication Middleware

**Status:** Completed
**Added:** 2026-03-10
**Updated:** 2026-03-10
**Priority:** CRITICAL
**Category:** Security

## Original Request

Audit finding: all API endpoints are publicly accessible with **no authentication**. Any network-reachable client can trigger scrapes (`POST /api/scrape`), publish deals (`POST /api/publish`), and access all data. The existing rate limiter provides access throttling but not access control.

## Detailed Analysis

### Current State

- No auth middleware on any route
- All endpoints accept requests from any source
- `POST /api/scrape` can be triggered repeatedly, consuming resources
- `POST /api/publish` sends real messages to Telegram/WhatsApp
- No API key, token, or session validation

### Impact

- **Resource abuse**: Anyone can trigger costly scrape jobs (Puppeteer + Amazon API)
- **Spam risk**: Unauthorized publish triggers send real messages to channels
- **Data exposure**: Product/deal/scrape run data is fully accessible

### Recommended Approach

Given this is an internal API (not user-facing SaaS), a lightweight approach is appropriate:

1. **Bearer token auth** — A static API key set via `API_SECRET` env var, validated via middleware
2. Health endpoint (`/health`) should remain unauthenticated for Docker healthchecks
3. Optional: IP allowlist for production (container networking already limits access)

## Implementation Plan

- [ ] Create `src/middleware/auth.ts` with Bearer token validation
- [ ] Add `API_SECRET` to config schema and `.env.example`
- [ ] Apply auth middleware to all `/api/*` routes
- [ ] Exempt `/health` from authentication
- [ ] Add tests for auth middleware
- [ ] Update Docker compose to pass `API_SECRET`

## Progress Tracking

**Overall Status:** Completed - 100%

### Subtasks

| ID   | Description                            | Status   | Updated    | Notes                                      |
| ---- | -------------------------------------- | -------- | ---------- | ------------------------------------------ |
| 12.1 | Create auth middleware                 | Complete | 2026-03-10 | src/middleware/auth.ts with timing-safe compare |
| 12.2 | Add API_SECRET to config/env           | Complete | 2026-03-10 | Added to config schema, rawConfig, .env.example |
| 12.3 | Apply middleware to routes             | Complete | 2026-03-10 | Applied to all /api/* routes in server.ts   |
| 12.4 | Exempt /health from auth               | Complete | 2026-03-10 | /health is defined before route middleware  |
| 12.5 | Write tests                            | Complete | 2026-03-10 | 7 tests in auth.test.ts (all passing)       |
| 12.6 | Update docker-compose and .env.example | Complete | 2026-03-10 | API_SECRET required in docker-compose.yml   |

## Progress Log

### 2026-03-10

- Task created from comprehensive codebase audit
- Created src/middleware/auth.ts: Bearer token validation with timing-safe comparison (node:crypto timingSafeEqual)
- Added `apiSecret` to config schema and rawConfig (reads API_SECRET env var)
- Applied authMiddleware to all /api/* routes in server.ts (health endpoint exempt)
- If API_SECRET is empty, middleware logs a warning and allows all requests (dev-friendly)
- Added API_SECRET to .env.example and docker-compose.yml (required in production)
- Created auth.test.ts with 7 tests covering: valid token, missing header, invalid token, wrong scheme, empty token, no config, different-length token
- All 52 tests pass, 0 tsc errors
