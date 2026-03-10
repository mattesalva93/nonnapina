# [TASK008] - Create "Minimo Storico" Alternative Posts Service

**Status:** Pending
**Added:** 2026-03-09
**Updated:** 2026-03-09

## Original Request

Create a dedicated service for alternative posts with special "minimo storico" headlines, for deals where `isLowest=true`. These posts use the same scoring formula and enrichment as regular posts but have different headline templates selected from a pool:

1. "{nome prodotto riassunto} al nuovo minimo storico"
2. "Calo per {nome prodotto} al minimo storico"
3. "🔥 Prezzo più basso di sempre per {nome prodotto}"
4. "📉 {nome prodotto}: mai così economico"
5. "⚡ Minimo storico raggiunto: {nome prodotto}"

Scheduling: same time slots as regular posts, but randomly choose between regular (85%) and minimo storico (15%) posts.

## Implementation Plan

- [ ] 1.1 Create `src/services/lowest-deal.service.ts` with deal selection, scoring, post building
- [ ] 1.2 Update `scheduler.service.ts` to randomly dispatch regular vs lowest-deal cycles (85/15 split)
- [ ] 1.3 Add preview/manual trigger endpoints in publish routes
- [ ] 1.4 Add tests for the new service

## Progress Log

### 2026-03-09

- Task created
