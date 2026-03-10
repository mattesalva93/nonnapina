# [TASK022] - Health Check Email Flood Prevention

**Status:** Pending
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

**Overall Status:** Not Started - 0%

### Subtasks

| ID   | Description                                        | Status      | Updated | Notes |
| ---- | -------------------------------------------------- | ----------- | ------- | ----- |
| 22.1 | Add debounce/throttle to health check alert        | Not Started |         |       |
| 22.2 | Add configurable cooldown constant                 | Not Started |         |       |
| 22.3 | Optional: add recovery email on healthy transition | Not Started |         |       |
| 22.4 | Test the debounce behavior                         | Not Started |         |       |

## Progress Log

### 2026-03-10

- Task created from comprehensive codebase audit
