# [TASK013] - DRY Refactor: Extract Shared Channel Dispatch and Scoring

**Status:** Completed
**Added:** 2026-03-10
**Updated:** 2026-03-11
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

**Overall Status:** Completed - 100%

### Subtasks

| ID    | Description                                | Status   | Updated    | Notes                                         |
| ----- | ------------------------------------------ | -------- | ---------- | --------------------------------------------- |
| 13.1  | Create channel types and shared interfaces | Complete | 2026-03-11 | channel.types.ts                              |
| 13.2  | Extract Telegram dispatcher                | Complete | 2026-03-11 | telegram.channel.ts (URL + buffer variants)   |
| 13.3  | Extract WhatsApp dispatcher                | Complete | 2026-03-11 | whatsapp.channel.ts (URL + buffer variants)   |
| 13.4  | Create channel registry                    | Complete | 2026-03-11 | channel.registry.ts with dispatch + recording |
| 13.5  | Extract scoring module                     | Complete | 2026-03-11 | scoring.ts                                    |
| 13.6  | Extract formatPrice utility                | Complete | 2026-03-11 | utils/format.ts                               |
| 13.7  | Refactor publish.service.ts                | Complete | 2026-03-11 | ~265 → ~130 lines                             |
| 13.8  | Refactor lowest-deal.service.ts            | Complete | 2026-03-11 | ~260 → ~135 lines                             |
| 13.9  | Refactor top5.service.ts                   | Complete | 2026-03-11 | ~385 → ~220 lines                             |
| 13.10 | Extract shared publication recording logic | Complete | 2026-03-11 | In channel.registry.ts                        |
| 13.11 | Verify all tests pass                      | Complete | 2026-03-11 | 54/54 passing                                 |

## Progress Log

### 2026-03-11

- Created services/channels/ directory with 4 new files:
  - channel.types.ts: ChannelName, ChannelResult, ChannelPayload, BufferChannelPayload, ChannelDef, BufferChannelDef
  - telegram.channel.ts: publishToTelegram() + publishBufferToTelegram() (URL and buffer variants)
  - whatsapp.channel.ts: publishToWhatsApp() + publishBufferToWhatsApp()
  - channel.registry.ts: getActiveChannels(), dispatchToChannels(), dispatchToBufferChannels(), recordPublications(), markDealPublished()
- Created services/scoring.ts: single computeDealScore() implementation
- Created utils/format.ts: single formatPrice() implementation
- Refactored publish.service.ts: removed all channel dispatch code, uses shared modules via re-exports
- Refactored lowest-deal.service.ts: removed all channel/scoring duplication
- Refactored top5.service.ts: removed duplicated scoring constants and channel code, uses buffer channel variants
- Re-exported computeDealScore and ChannelName from publish.service.ts for backward compatibility
- Re-exported computeTop5Score from top5.service.ts as alias for computeDealScore
- All 54 tests passing, 0 TypeScript errors
- Estimated ~300 lines of pure duplication removed

### 2026-03-10

- Task created from comprehensive codebase audit
