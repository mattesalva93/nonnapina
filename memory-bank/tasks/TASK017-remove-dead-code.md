# [TASK017] - Remove Dead Code and Legacy Artifacts

**Status:** Pending
**Added:** 2026-03-10
**Updated:** 2026-03-10
**Priority:** LOW
**Category:** Code Quality / Cleanup

## Original Request

Audit finding: several files contain dead code left over from earlier project phases, including unused type definitions, standalone test blocks in production files, and stale types.

## Detailed Analysis

### 1. Dead Types in `src/types/index.ts`

The following types are remnants of the removed CLI output generators (Phase 4 cleanup) and are not imported anywhere:

- `CollagePosition` — from removed `image-generator.ts`
- `CollageLayout` — from removed `image-generator.ts`
- `CollageProduct` — from removed `image-generator.ts`
- `NoteProduct` — from removed `notes-generator.ts`
- `NotesResult` — from removed `notes-generator.ts`

### 2. Standalone Test Blocks in Production Files

Both `amazon.ts` and `keepa.ts` end with `if (import.meta.url === ...)` blocks that execute test code when run directly. These:

- Are never used in the server application
- Contain hardcoded test ASINs (`B0DHRQ2XGJ`, `B08N5WRWNW`)
- Add confusion about entry points
- Should be replaced with proper Vitest tests

### 3. `AmazonProduct` Dead Fields

In `src/types/index.ts`, the `AmazonProduct` interface has fields permanently set to `undefined`:

```typescript
originalPrice: undefined; // Always undefined
discountAmount: undefined; // Always undefined
discountPercentage: undefined; // Always undefined
```

These were likely placeholders that were never implemented. They should be either removed or typed as `number | undefined`.

## Implementation Plan

- [ ] Remove dead types from `src/types/index.ts` (Collage*, Note*)
- [ ] Remove `if (import.meta.url ...)` blocks from `amazon.ts` and `keepa.ts`
- [ ] Fix `AmazonProduct` dead fields (remove or type properly)
- [ ] Verify no imports are broken after removal
- [ ] Run TypeScript check and tests

## Progress Tracking

**Overall Status:** Not Started - 0%

### Subtasks

| ID   | Description                           | Status      | Updated | Notes |
| ---- | ------------------------------------- | ----------- | ------- | ----- |
| 17.1 | Remove dead types from types/index.ts | Not Started |         |       |
| 17.2 | Remove standalone test blocks         | Not Started |         |       |
| 17.3 | Fix AmazonProduct dead fields         | Not Started |         |       |
| 17.4 | Verify TypeScript check passes        | Not Started |         |       |
| 17.5 | Verify tests pass                     | Not Started |         |       |

## Progress Log

### 2026-03-10

- Task created from comprehensive codebase audit
