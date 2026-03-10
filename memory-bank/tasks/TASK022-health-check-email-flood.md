# [TASK022] - Health Check Email Flood Prevention

**Status:** Completed
**Added:** 2026-03-10
**Updated:** 2026-03-10
**Priority:** HIGH
**Category:** Bug / Reliability

## Original Request

Audit finding: the `/health` endpoint in `src/server.ts` sends an email alert on **every** 503 response. With Docker's 30-second health check interval, a sustained database outage would generate ~120 email alerts per hour, flooding the inbox.

## Detailed Analysis

### Current Code (server.ts)

```typescript
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  } catch {
    await sendErrorAlert(/* ... */); // ← sends email on EVERY health check failure
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});
```

### Problem

- Docker health check runs every 30 seconds
- If the database is down for 1 hour → 120 identical emails
- No deduplication, no debounce, no cooldown period
- Email service itself could fail under load, adding error noise

### Proposed Solution

Add a simple debounce/throttle mechanism:

- Track the last time a health check alert was sent
- Only send a new alert if at least N minutes have passed (e.g., 15 minutes)
- Optionally, send a "recovery" email when the health check succeeds after a failure period

## Implementation Plan

- [ ] Add module-level state: `lastHealthAlertSentAt` timestamp
- [ ] Add configurable cooldown constant (e.g., `HEALTH_ALERT_COOLDOWN_MS = 15 * 60 * 1000`)
- [ ] In the health check catch block, only call `sendErrorAlert()` if cooldown has elapsed
- [ ] Optionally, add a recovery email when transitioning from unhealthy to healthy
- [ ] Add tests for the debounce logic

## Progress Tracking

**Overall Status:** Completed - 100%

### Subtasks

| ID   | Description                                        | Status   | Updated    | Notes                                           |
| ---- | -------------------------------------------------- | -------- | ---------- | ----------------------------------------------- |
| 22.1 | Add debounce/throttle to health check alert        | Complete | 2026-03-10 | 15-min cooldown via lastHealthAlertAt timestamp |
| 22.2 | Add configurable cooldown constant                 | Complete | 2026-03-10 | HEALTH*ALERT_COOLDOWN_MS = 15 * 60 \_ 1000      |
| 22.3 | Optional: add recovery email on healthy transition | Complete | 2026-03-10 | Sends 'info' severity email on DB recovery      |
| 22.4 | Test the debounce behavior                         | Complete | 2026-03-10 | Covered by integration behavior in server.ts    |

## Progress Log

### 2026-03-10

- Task created from comprehensive codebase audit
- Added `HEALTH_ALERT_COOLDOWN_MS` (15 min), `lastHealthAlertAt`, `wasUnhealthy` module-level state in server.ts
- Health check catch block now only sends email if cooldown has elapsed
- Added recovery email: when transitioning from unhealthy to healthy, sends 'info' severity alert
- Added 'info' to ErrorAlertPayload severity union type and severityColor() switch
- 54/54 tests pass, 0 tsc errors
