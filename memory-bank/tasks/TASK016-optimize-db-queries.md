# [TASK016] - Optimize Database Queries (N+1 in saveProducts and markDealsAsLowest)

**Status:** Pending
**Added:** 2026-03-10
**Updated:** 2026-03-10
**Priority:** MEDIUM
**Category:** Performance / Optimization

## Original Request

Audit finding: `saveProducts()` and `markDealsAsLowest()` in `product.service.ts` suffer from **N+1 query patterns**, making each scrape run execute hundreds of unnecessary database round trips.

## Detailed Analysis

### `saveProducts()` — 3 queries per product

For each product in the array (typically 100–145):

1. `prisma.product.upsert()` — 1 query
2. `prisma.deal.findFirst()` — 1 query (check existing deal)
3. `prisma.deal.update()` or `prisma.deal.create()` — 1 query

**Total: ~435 queries** per scrape run (145 products × 3).

### `markDealsAsLowest()` — 2 queries per ASIN

For each ASIN in the set:

1. `prisma.deal.findFirst()` — 1 query
2. `prisma.deal.update()` — 1 query (conditional)

**Total: ~224 queries** for 112 ASINs.

### Combined Impact

A single scrape run executes **~650+ individual queries** that could be reduced to ~10–20 with proper batching.

### Recommended Optimizations

1. **Wrap `saveProducts()` in a Prisma transaction** (`prisma.$transaction()`) to reduce round trips and ensure atomicity
2. **Use `prisma.deal.updateMany()`** in `markDealsAsLowest()` instead of per-ASIN find+update
3. **Batch product upserts** using `prisma.product.createMany()` with `skipDuplicates` for creates, then bulk update
4. **Pre-fetch existing deals** in a single query at the start of `saveProducts()` instead of per-product findFirst

## Implementation Plan

- [ ] Refactor `markDealsAsLowest()` to use `updateMany()` with `WHERE asin IN (...) AND isLowest = false`
- [ ] Refactor `saveProducts()` to pre-fetch all existing deals in one query
- [ ] Wrap `saveProducts()` in a `prisma.$transaction()` for atomicity
- [ ] Consider `createManyAndReturn` for batch deal creation
- [ ] Benchmark before/after query counts (use Prisma query logging)
- [ ] Ensure all existing tests still pass

## Progress Tracking

**Overall Status:** Not Started - 0%

### Subtasks

| ID   | Description                              | Status      | Updated | Notes |
| ---- | ---------------------------------------- | ----------- | ------- | ----- |
| 16.1 | Refactor markDealsAsLowest to updateMany | Not Started |         |       |
| 16.2 | Pre-fetch existing deals in saveProducts | Not Started |         |       |
| 16.3 | Wrap saveProducts in transaction         | Not Started |         |       |
| 16.4 | Benchmark query count improvement        | Not Started |         |       |
| 16.5 | Verify tests pass                        | Not Started |         |       |

## Progress Log

### 2026-03-10

- Task created from comprehensive codebase audit
