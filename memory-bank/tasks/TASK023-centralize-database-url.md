# [TASK023] - Centralize DATABASE_URL Usage via Config Module

**Status:** Pending
**Added:** 2026-03-10
**Updated:** 2026-03-10
**Priority:** LOW
**Category:** Code Quality / Consistency

## Original Request

Audit finding: `src/services/product.service.ts` reads `process.env.DATABASE_URL` directly instead of using the centralized config module. This bypasses any config validation and breaks the single-source-of-truth pattern.

## Detailed Analysis

### Current Code (product.service.ts)

```typescript
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
```

### Expected Pattern

```typescript
import { config } from '../config/index.js';

const adapter = new PrismaPg({ connectionString: config.database.url });
```

### Impact

- If `DATABASE_URL` is missing, the error surfaces as a cryptic Prisma connection failure rather than a clean config validation error
- The config module already has `database.url` defined — it's just not being used here
- Ties into TASK014 (fix zod config validation): once the schema is properly validated, all consumers should go through it

## Implementation Plan

- [ ] Replace `process.env.DATABASE_URL` with `config.database.url` in product.service.ts
- [ ] Verify no other files access `process.env.DATABASE_URL` directly (except config module itself)
- [ ] Ensure config.database.url is validated (depends on TASK014)

## Progress Tracking

**Overall Status:** Not Started - 0%

### Subtasks

| ID   | Description                                            | Status      | Updated | Notes |
| ---- | ------------------------------------------------------ | ----------- | ------- | ----- |
| 23.1 | Replace process.env.DATABASE_URL with config reference | Not Started |         |       |
| 23.2 | Audit for any other direct process.env usage           | Not Started |         |       |

## Progress Log

### 2026-03-10

- Task created from comprehensive codebase audit
