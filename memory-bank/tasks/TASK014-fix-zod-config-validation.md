# [TASK014] - Fix Zod Config Validation (Schema is Dead Code)

**Status:** Pending
**Added:** 2026-03-10
**Updated:** 2026-03-10
**Priority:** HIGH
**Category:** Security / Code Quality

## Original Request

Audit finding: the zod `configSchema` defined in `src/config/index.ts` is **never used to parse the config**. The raw config object is exported directly without validation, making the entire schema dead code.

## Detailed Analysis

### Current Code (Broken Pattern)

```typescript
const configSchema = z.object({ ... });  // ← Defined but never called
export type AppConfig = z.infer<typeof configSchema>;
const rawConfig = { ... };               // ← Manual object construction
export const config: AppConfig = rawConfig; // ← Type assertion, no runtime validation
```

### What Should Happen

```typescript
const configSchema = z.object({ ... });
export type AppConfig = z.infer<typeof configSchema>;
export const config: AppConfig = configSchema.parse(rawConfig);  // ← Runtime validation
```

### Impact

- **No runtime validation**: Invalid env vars (wrong types, missing values) only cause errors at the point of use, not at startup
- `database.url` defaults to `""` without warning — the app starts and crashes later on first DB query
- `parseInt()` calls on env vars can produce `NaN` without being caught
- The `validateConfig()` function only checks 3 of the ~25 config values, providing a false sense of safety

### Recommended Fix

1. Use `configSchema.parse(rawConfig)` instead of direct assignment
2. Remove the separate `validateConfig()` function — let zod handle all validation at startup
3. Ensure `database.url` is required in production/development (can be optional in test)
4. Fail fast: if config parsing fails, log the errors and exit the process

## Implementation Plan

- [ ] Replace `export const config: AppConfig = rawConfig` with `configSchema.parse(rawConfig)`
- [ ] Remove `validateConfig()` function and its usage in `server.ts`
- [ ] Make `database.url` required (non-empty) for production/development
- [ ] Add `.env` validation for all critical fields at startup
- [ ] Update config tests to cover the new validation behavior
- [ ] Ensure app fails fast with clear error messages on missing config

## Progress Tracking

**Overall Status:** Not Started - 0%

### Subtasks

| ID   | Description                                    | Status      | Updated | Notes |
| ---- | ---------------------------------------------- | ----------- | ------- | ----- |
| 14.1 | Parse config through zod schema                | Not Started |         |       |
| 14.2 | Remove standalone validateConfig()             | Not Started |         |       |
| 14.3 | Make database.url required                     | Not Started |         |       |
| 14.4 | Update server.ts to remove validateConfig call | Not Started |         |       |
| 14.5 | Update tests                                   | Not Started |         |       |

## Progress Log

### 2026-03-10

- Task created from comprehensive codebase audit
