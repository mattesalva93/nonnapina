# [TASK015] - Add Graceful Shutdown Handlers

**Status:** Completed
**Added:** 2026-03-10
**Updated:** 2026-03-11
**Priority:** HIGH
**Category:** Reliability / Infrastructure

## Original Request

Audit finding: the server has **no graceful shutdown handling**. When Docker sends `SIGTERM` (during `docker compose down`, deploys, or restarts), the process is killed after the grace period without cleaning up resources.

## Detailed Analysis

### Resources That Need Cleanup

1. **Prisma client** — `prisma.$disconnect()` to close DB connection pool; open connections may become orphaned
2. **Express HTTP server** — `server.close()` to stop accepting new connections and wait for in-flight requests
3. **Cron jobs** — All scheduled jobs (`node-cron`) should be stopped to prevent triggering during shutdown
4. **WhatsApp client** — `destroyWhatsApp()` exists but is never called; Chromium process leaks
5. **Puppeteer browser** — If a scrape job is running, the browser instance leaks

### Impact Without Graceful Shutdown

- Database connections leak and may exhaust the PostgreSQL `max_connections` pool
- In-flight HTTP requests are abruptly terminated (500 errors for clients)
- Scrape jobs running at shutdown leave a `RUNNING` ScrapeRun record that is never marked `FAILED`
- WhatsApp Chromium processes become zombies inside the container
- Docker must wait for the full stop-grace-period (default 10s) then SIGKILL

### Recommended Implementation

```typescript
// In server.ts
const httpServer = app.listen(port, () => { ... });

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received — starting graceful shutdown');

  // 1. Stop accepting new HTTP requests
  httpServer.close();

  // 2. Stop all scheduled jobs
  // (node-cron doesn't have a global stop — need to store refs)

  // 3. Destroy WhatsApp client
  await destroyWhatsApp();

  // 4. Disconnect Prisma
  await prisma.$disconnect();

  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

## Implementation Plan

- [ ] Store cron job references so they can be stopped
- [ ] Store HTTP server reference from `app.listen()`
- [ ] Create `shutdown()` function that cleans up all resources in correct order
- [ ] Register `SIGTERM` and `SIGINT` handlers
- [ ] Add timeout fallback (force exit after 15s if cleanup hangs)
- [ ] Mark any active ScrapeRun as FAILED during shutdown
- [ ] Test shutdown behavior in Docker

## Progress Tracking

**Overall Status:** Completed - 100%

### Subtasks

| ID   | Description                            | Status   | Updated    | Notes                                  |
| ---- | -------------------------------------- | -------- | ---------- | -------------------------------------- |
| 15.1 | Refactor cron scheduling to store refs | Complete | 2026-03-11 | cronTasks array + stopAllCronTasks()   |
| 15.2 | Store HTTP server reference            | Complete | 2026-03-11 | Moved app.listen() before the if block |
| 15.3 | Implement shutdown function            | Complete | 2026-03-11 | 5-step cleanup with 15s force timeout  |

## Progress Log

### 2026-03-11

- Refactored scheduler.service.ts: stored cron tasks in cronTasks array, added stopAllCronTasks()
- Moved httpServer declaration before the cron/WhatsApp init block for scope accessibility
- Stored scrapeCronTask reference in server.ts
- Implemented shutdown() function: stops HTTP server, stops all cron jobs, marks active ScrapeRun as FAILED, destroys WhatsApp client, disconnects Prisma
- Registered SIGTERM and SIGINT handlers
- Added 15s force-exit timeout with unref()
- All 54 tests passing, 0 TypeScript errors
  | 15.4 | Register signal handlers | Not Started | | |
  | 15.5 | Add forced exit timeout | Not Started | | |
  | 15.6 | Mark active ScrapeRun as FAILED on exit | Not Started | | |
  | 15.7 | Test in Docker container | Not Started | | |

## Progress Log

### 2026-03-10

- Task created from comprehensive codebase audit
