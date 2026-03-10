# [TASK013] - DRY Refactor: Extract Shared Channel Dispatch and Scoring

**Status:** Pending
**Added:** 2026-03-10
**Updated:** 2026-03-10
**Priority:** HIGH
**Category:** Code Quality / Spaghetti Code

## Original Request

Audit finding: **massive code duplication** across three publish service files. The same patterns, interfaces, functions, and constants are copy-pasted across `publish.service.ts`, `lowest-deal.service.ts`, and `top5.service.ts`.

## Detailed Analysis

### Duplicated Elements

| Duplicated Item                  | Files                                                       |
| -------------------------------- | ----------------------------------------------------------- |
| `publishToTelegram()` function   | publish.service.ts, lowest-deal.service.ts, top5.service.ts |
| `publishToWhatsApp()` function   | publish.service.ts, lowest-deal.service.ts, top5.service.ts |
| `getActiveChannels()` function   | publish.service.ts, lowest-deal.service.ts                  |
| `ChannelResult` interface        | publish.service.ts, lowest-deal.service.ts, top5.service.ts |
| `ChannelPayload` interface       | publish.service.ts, lowest-deal.service.ts                  |
| `ChannelDef` interface           | publish.service.ts, lowest-deal.service.ts, top5.service.ts |
| `formatPrice()` function         | publish.service.ts, lowest-deal.service.ts, top5.service.ts |
| `TELEGRAM_CAPTION_LIMIT`         | publish.service.ts, lowest-deal.service.ts, top5.service.ts |
| `computeDealScore()` + constants | publish.service.ts, top5.service.ts (identical)             |
| Publication recording logic      | publish.service.ts, lowest-deal.service.ts, top5.service.ts |
| Deal published marking logic     | publish.service.ts, lowest-deal.service.ts                  |

### Impact

- **Maintenance burden**: Every bug fix/change must be applied in 3 places
- **Inconsistency risk**: Divergent behavior when one copy is updated but not others
- **Code bloat**: ~300 lines of pure duplication across files

### Proposed Architecture

```
services/
  channels/
    channel.types.ts        ← ChannelResult, ChannelPayload, ChannelDef, ChannelName
    telegram.channel.ts     ← publishToTelegram() (single implementation)
    whatsapp.channel.ts     ← publishToWhatsApp() (single implementation)
    channel.registry.ts     ← getActiveChannels(), dispatchToChannels()
  scoring.ts                ← computeDealScore(), constants (single implementation)
  publish.service.ts        ← uses channel registry + scoring (simplified)
  lowest-deal.service.ts    ← uses channel registry + scoring (simplified)
  top5.service.ts           ← uses channel registry + scoring (simplified)

utils/
  format.ts                 ← formatPrice() (single implementation)
```

## Implementation Plan

- [ ] Create `src/services/channels/` directory with shared types and dispatchers
- [ ] Extract `computeDealScore()` to `src/services/scoring.ts`
- [ ] Extract `formatPrice()` to `src/utils/format.ts`
- [ ] Refactor `publish.service.ts` to use shared modules
- [ ] Refactor `lowest-deal.service.ts` to use shared modules
- [ ] Refactor `top5.service.ts` to use shared modules
- [ ] Extract publication recording + deal marking to a shared helper
- [ ] Ensure all existing tests still pass
- [ ] Add tests for new shared modules

## Progress Tracking

**Overall Status:** Not Started - 0%

### Subtasks

| ID    | Description                                | Status      | Updated | Notes |
| ----- | ------------------------------------------ | ----------- | ------- | ----- |
| 13.1  | Create channel types and shared interfaces | Not Started |         |       |
| 13.2  | Extract Telegram dispatcher                | Not Started |         |       |
| 13.3  | Extract WhatsApp dispatcher                | Not Started |         |       |
| 13.4  | Create channel registry                    | Not Started |         |       |
| 13.5  | Extract scoring module                     | Not Started |         |       |
| 13.6  | Extract formatPrice utility                | Not Started |         |       |
| 13.7  | Refactor publish.service.ts                | Not Started |         |       |
| 13.8  | Refactor lowest-deal.service.ts            | Not Started |         |       |
| 13.9  | Refactor top5.service.ts                   | Not Started |         |       |
| 13.10 | Extract shared publication recording logic | Not Started |         |       |
| 13.11 | Verify all tests pass                      | Not Started |         |       |

## Progress Log

### 2026-03-10

- Task created from comprehensive codebase audit
