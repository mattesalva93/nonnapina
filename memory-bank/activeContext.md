# Active Context - Keepa Tracker

## Current Work Focus

All phases (1–4) of the v1.0.0 migration are complete. TASK006 (two-pass "minimo" scraping) has been implemented and verified in production.

## Recent Changes

- TASK006: Implemented two-pass scraping with Keepa "minimo" (isLowest) filter
  - Added `isLowest` Boolean column to Prisma Deal model (migration: `20260309141735_add_is_lowest_to_deal`)
  - Added `isLowest` to `KeepaProduct` type and `keepaIsLowest` to `EnrichedProduct` type
  - Extracted `clickFilterToggle()` from inline closure to module-level function
  - Extracted `scrapeAllCategories()` as reusable function for both passes
  - Pass 1: normal scraping → Pass 2: enables "minimo" filter and re-scrapes
  - Merge logic: products appearing in both passes get `isLowest=true`; pass2-only products added with `isLowest=true`
  - `alreadyScrapedAsins` Set prevents redundant product-page clicks in pass 2
- First production scrape run: 145 deals (112 isLowest=true, 33 isLowest=false)

## Current State

- All Tasks 1–6 complete: 0 tsc errors, 25/25 tests pass
- Docker containers running healthy: app on :3000, postgres on :5432
- 4 Prisma migrations applied (init, deal_published, publication, is_lowest)
- Two-pass scraping verified end-to-end with production data

## Next Steps

1. Monitor subsequent cron-triggered scrapes to ensure stability
2. Consider adding `isLowest` to API query filters (GET /api/deals)
3. Potential: use `isLowest` in deal scoring/ranking for publish prioritization

## Active Decisions and Considerations

- Prisma v7.4.2 with PrismaPg adapter: `url` moved from schema.prisma to prisma.config.ts (v7 breaking change)
- Express v5 (package.json shows ^5.2.1)
- No CLI entry points: all scraping triggered via `POST /api/scrape` or cron
- Two-pass scraping doubles scrape time (~8 min total) but provides important price-history-minimum data
