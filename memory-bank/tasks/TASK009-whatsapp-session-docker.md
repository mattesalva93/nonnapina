# [TASK009] - Fix WhatsApp Session Persistence in Docker

**Status:** Pending
**Added:** 2026-03-09
**Updated:** 2026-03-09

## Original Request

Fix the bug where stopping and restarting Docker containers requires manual deletion of the WhatsApp session directory. The session should persist across container restarts without manual intervention. If cleanup is needed, it must be automated.

## Thought Process

The WhatsApp session is stored via `LocalAuth` in `.wwebjs_auth`. Docker Compose already mounts a named volume `whatsapp_session:/app/.wwebjs_auth`. The issue is likely stale lock files (e.g., `SingletonLock`, `SingletonCookie`, `SingletonSocket`) left by the Chromium process inside the session directory when the container is stopped abruptly. On restart, Puppeteer/Chromium fails because it detects a "running" instance.

Solution: On app startup, before initializing WhatsApp, clean up these stale Chromium lock files from the session directory.

## Implementation Plan

- [ ] 1.1 Add startup cleanup in `whatsapp.service.ts` to remove stale Chromium lock files
- [ ] 1.2 Add `auth_failure` handler that clears session and retries initialization
- [ ] 1.3 Test with container restart cycle

## Progress Log

### 2026-03-09

- Task created
