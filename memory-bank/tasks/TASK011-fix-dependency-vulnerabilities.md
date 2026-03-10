# [TASK011] - Fix Dependency Vulnerabilities

**Status:** Completed
**Added:** 2026-03-10
**Updated:** 2026-03-10
**Priority:** CRITICAL
**Category:** Security

## Original Request

Audit finding: `npm audit` reports **9 vulnerabilities** (5 moderate, 4 high) in the dependency tree.

## Detailed Analysis

### High Severity

1. **`@hono/node-server` (<1.19.10)** — Authorization bypass for protected static paths via encoded slashes in Serve Static Middleware (GHSA-wc8c-qw6v-h7f6). Transitive dependency of `prisma@^7.4.2`.
2. **`hono` (<=4.12.3)** — Multiple CVEs including XSS via ErrorBoundary, cache middleware ignoring `Cache-Control: private`, IPv4 validation bypass in IP Restriction Middleware, arbitrary key read in Serve Static, timing comparison issues in basicAuth/bearerAuth, Cookie attribute injection, SSE control field injection. **4 high-severity advisories.**

### Moderate Severity

3. **`lodash` (4.x)** — Prototype Pollution in `_.unset` and `_.omit` (GHSA-xxjr-mmjv-4gpg). Transitive via `chevrotain` → `@mrleebo/prisma-ast` → `@prisma/dev` → `prisma`.

### Root Cause

All vulnerabilities originate from **prisma@^7.4.2** and its internal tooling dependencies (`@prisma/dev`, `@mrleebo/prisma-ast`, `chevrotain`, `hono`). Keepa Tracker does not use hono or lodash directly.

## Implementation Plan

- [ ] Run `npm audit fix` to resolve non-breaking fixes (hono)
- [ ] Evaluate if `prisma` can be updated to a version that resolves lodash/hono transitive deps
- [ ] If prisma updates are blocked, document the accepted risk (these are CLI/dev-tool vulnerabilities, not runtime application vulnerabilities)
- [ ] Consider moving `prisma` CLI to `devDependencies` if Docker build can be restructured to run migrations from a separate init step instead of the `CMD`

## Progress Tracking

**Overall Status:** Completed - 100%

### Subtasks

| ID   | Description                            | Status      | Updated    | Notes                                                     |
| ---- | -------------------------------------- | ----------- | ---------- | --------------------------------------------------------- |
| 11.1 | Run `npm audit fix`                    | Complete    | 2026-03-10 | No non-breaking fixes available                           |
| 11.2 | Evaluate prisma version update         | Complete    | 2026-03-10 | v7.4.2 is latest stable; fixed via overrides              |
| 11.3 | Document accepted risk if unresolved   | Complete    | 2026-03-10 | All resolved via overrides                                |
| 11.4 | Move prisma CLI to devDeps if feasible | Not Started | 2026-03-10 | Deferred to TASK019/TASK020 (requires Dockerfile changes) |

## Progress Log

### 2026-03-10

- Task created from comprehensive codebase audit
- `npm audit fix` attempted — no non-breaking fixes available
- All 9 vulnerabilities traced to prisma@7.4.2 transitive deps (hono, @hono/node-server, lodash)
- Fixed versions exist: hono@4.12.6, @hono/node-server@1.19.11, lodash@4.17.23
- Added npm `overrides` in package.json to force fixed versions
- Result: 0 vulnerabilities, 52/52 tests pass, 0 tsc errors
- Moving prisma to devDependencies deferred (requires Dockerfile restructuring)
