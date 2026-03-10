# [TASK021] - Increase Test Coverage

**Status:** Pending
**Added:** 2026-03-10
**Updated:** 2026-03-10
**Priority:** MEDIUM
**Category:** Quality / Testing

## Original Request

Audit finding: test coverage is very low. Only **4 test files** exist, covering only pure/utility functions. No route tests, no service integration tests, no mocking of external dependencies.

## Detailed Analysis

### Current Test Coverage

| File                                       | What's Tested                                                              | Coverage |
| ------------------------------------------ | -------------------------------------------------------------------------- | -------- |
| `src/config/index.test.ts`                 | `validateConfig()` only                                                    | Partial  |
| `src/scrapers/keepa.test.ts`               | `mergeLowestFlags()` only                                                  | Minimal  |
| `src/services/lowest-deal.service.test.ts` | `buildLowestPostContent()`                                                 | Good     |
| `src/services/top5.service.test.ts`        | `computeTop5Score()`, `normalizeTitleForDedup()`, `buildTop5PostContent()` | Good     |

### What's NOT Tested

| File/Module                         | Functions Missing Tests                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `src/services/amazon.ts`            | `getAccessToken()`, `getProductDetails()`, `formatProduct()`, `buildAffiliateLink()` |
| `src/services/product.service.ts`   | `saveProducts()`, `checkDealDuplicate()`, `getDeals()`, `markDealsAsLowest()`        |
| `src/services/publish.service.ts`   | `computeDealScore()`, `selectNextDeal()`, `buildPostContent()`, `runPublishCycle()`  |
| `src/services/scheduler.service.ts` | `generateDailySchedule()`, `getNextScheduledSlot()`                                  |
| `src/services/email.service.ts`     | `sendErrorAlert()`, `buildAlertHtml()`                                               |
| `src/services/image.service.ts`     | `generateTop5Image()`                                                                |
| `src/routes/*.ts`                   | No route/integration tests at all                                                    |
| `src/middleware/*.ts`               | No middleware tests                                                                  |
| `src/utils/date.ts`                 | `localISOString()`                                                                   |

### Priority Order for New Tests

1. **`buildPostContent()`** in publish.service.ts — core business logic, no external deps
2. **`computeDealScore()`** in publish.service.ts — pure function (already tested in top5 copy)
3. **`formatProduct()`** in amazon.ts — pure transformation, complex parsing logic
4. **`buildAffiliateLink()`** in amazon.ts — pure function
5. **`generateDailySchedule()`** — pure function, statistical properties testable
6. **`localISOString()`** — pure function
7. **Route tests** with supertest — mock service layer, test HTTP contract
8. **Middleware tests** — auth, rate limiter edge cases

## Implementation Plan

- [ ] Write tests for `buildPostContent()` in publish.service.ts
- [ ] Write tests for `computeDealScore()` in publish.service.ts
- [ ] Write tests for `formatProduct()` and `buildAffiliateLink()` in amazon.ts
- [ ] Write tests for `generateDailySchedule()` in scheduler.service.ts
- [ ] Write tests for `localISOString()` in date.ts
- [ ] Write tests for error-handler and rate-limiter middleware
- [ ] Write route integration tests using supertest (mock services)
- [ ] Set up coverage threshold in vitest config
- [ ] Target: >70% line coverage for business logic

## Progress Tracking

**Overall Status:** Not Started - 0%

### Subtasks

| ID   | Description                                                       | Status      | Updated | Notes |
| ---- | ----------------------------------------------------------------- | ----------- | ------- | ----- |
| 21.1 | Tests for publish.service.ts (buildPostContent, computeDealScore) | Not Started |         |       |
| 21.2 | Tests for amazon.ts (formatProduct, buildAffiliateLink)           | Not Started |         |       |
| 21.3 | Tests for scheduler.service.ts (generateDailySchedule)            | Not Started |         |       |
| 21.4 | Tests for date.ts (localISOString)                                | Not Started |         |       |
| 21.5 | Tests for middleware (error-handler, rate-limiter)                | Not Started |         |       |
| 21.6 | Route integration tests with supertest                            | Not Started |         |       |
| 21.7 | Set coverage threshold                                            | Not Started |         |       |

## Progress Log

### 2026-03-10

- Task created from comprehensive codebase audit
