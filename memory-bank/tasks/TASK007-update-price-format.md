# [TASK007] - Update Price Format in Posts

**Status:** Pending
**Added:** 2026-03-09
**Updated:** 2026-03-09

## Original Request

Modify the price display in both individual deal posts and Top 5 posts:

- New format: "💰 Solo 115,99€ invece di 297,56€ (-61%)"
- Add disclaimer line below: "📊 Il prezzo pieno è calcolato sulla media degli ultimi 3 mesi"
- For Top 5: same price format, but disclaimer only once at the bottom before "🚚 Venduto e spedito da Amazon"

## Implementation Plan

- [ ] 1.1 Update `buildPostContent()` in `publish.service.ts` — change "A soli" to "Solo" and add disclaimer line
- [ ] 1.2 Update `buildTop5PostContent()` in `top5.service.ts` — change price format and add single disclaimer before Amazon shipping line
- [ ] 1.3 Update tests if applicable

## Progress Log

### 2026-03-09

- Task created
