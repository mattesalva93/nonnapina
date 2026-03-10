# [TASK019] - Fix Package Placement and TypeScript Config

**Status:** Pending
**Added:** 2026-03-10
**Updated:** 2026-03-10
**Priority:** LOW
**Category:** Code Quality / Build Config

## Original Request

Audit finding: `pino-pretty` is listed as a production dependency but is only used in development, and `tsconfig.json` includes unnecessary DOM libs for a backend project.

## Detailed Analysis

### 1. `pino-pretty` Should Be a devDependency

**Current**: Listed in `dependencies` in package.json.

**Issue**: `pino-pretty` is only loaded when `NODE_ENV !== 'production'` (see `src/utils/logger.ts`). In the Docker production image, it is installed via `npm ci --omit=dev` would skip it IF it were in devDependencies. Currently it adds ~2MB to the production image unnecessarily.

**Fix**: Move to `devDependencies`. Pino's transport system handles the case where `pino-pretty` is not installed gracefully (it simply doesn't prettify).

### 2. `tsconfig.json` Includes DOM Libs

**Current**: `"lib": ["ES2022", "DOM", "DOM.Iterable"]`

**Issue**: This is a backend Node.js project. Including `DOM` and `DOM.Iterable`:

- Allows accidentally using browser APIs (`document`, `window`, `fetch`) without TypeScript errors
- `fetch` is available in Node 22 via the global, but the types should come from `@types/node`, not DOM
- Misleading for contributors who might think this is a frontend project

**Fix**: Remove `"DOM"` and `"DOM.Iterable"` from `lib`. If any browser-specific types are needed (unlikely), they should be explicit via `/// <reference />` directives.

**Note**: The Keepa scraper's `page.evaluate()` callbacks run in a browser context, but those types come from Puppeteer's type definitions, not from tsconfig `DOM` lib.

## Implementation Plan

- [ ] Move `pino-pretty` from `dependencies` to `devDependencies`
- [ ] Remove `"DOM"` and `"DOM.Iterable"` from tsconfig `lib`
- [ ] Fix any TypeScript errors that surface (likely `FormData`, `Blob` in top5.service.ts)
- [ ] Verify `npm run build` succeeds
- [ ] Verify Docker build succeeds
- [ ] Verify tests pass

## Progress Tracking

**Overall Status:** Not Started - 0%

### Subtasks

| ID   | Description                         | Status      | Updated | Notes |
| ---- | ----------------------------------- | ----------- | ------- | ----- |
| 19.1 | Move pino-pretty to devDependencies | Not Started |         |       |
| 19.2 | Remove DOM libs from tsconfig       | Not Started |         |       |
| 19.3 | Fix resulting TypeScript errors     | Not Started |         |       |
| 19.4 | Verify build and Docker             | Not Started |         |       |

## Progress Log

### 2026-03-10

- Task created from comprehensive codebase audit
