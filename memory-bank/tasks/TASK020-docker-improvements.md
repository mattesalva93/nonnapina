# [TASK020] - Docker Improvements (Entrypoint Script, Resource Limits, Security)

**Status:** Pending
**Added:** 2026-03-10
**Updated:** 2026-03-10
**Priority:** MEDIUM
**Category:** Infrastructure / Security

## Original Request

Audit finding: several Docker configuration improvements needed for production robustness and security.

## Detailed Analysis

### 1. Migration in CMD Is Risky

**Current**: `CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]`

**Issue**:

- If migration fails, the container exits and Docker restarts it, causing an infinite restart loop
- `npx` invocation adds startup latency and potential network calls
- No opportunity for pre-migration health checks or rollback logic

**Fix**: Use a proper entrypoint script (`docker-entrypoint.sh`) that:

1. Runs migrations with error handling
2. Optionally waits for database readiness
3. Starts the application

### 2. No Resource Limits in docker-compose.yml

**Current**: No `deploy.resources` section.

**Issue**: Puppeteer + Chromium can consume 1–2GB RAM. A runaway browser or memory leak can exhaust host memory and crash other containers.

**Fix**: Add memory and CPU limits:

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: '2.0'
        reservations:
          memory: 512M
          cpus: '0.5'
```

### 3. Missing `stop_grace_period`

**Current**: Default Docker stop grace period (10s).

**Issue**: Scrape jobs take ~4–8 minutes. A 10s grace period means running scrapes are always killed.

**Fix**: Set `stop_grace_period: 60s` (or longer) to give active scrapes time to finish.

### 4. No `read_only` Filesystem

**Current**: Container filesystem is writable.

**Fix**: Add `read_only: true` with explicit `tmpfs` and volume mounts for writable paths:

- `/tmp` (tmpfs)
- `/app/output` (volume)
- `/app/.wwebjs_auth` (volume)

### 5. Missing `security_opt` and `cap_drop`

**Fix**: Add security hardening:

```yaml
security_opt:
  - no-new-privileges:true
cap_drop:
  - ALL
```

### 6. PostgreSQL Password in Compose Environment

**Current**: `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?...}` is visible in Docker inspect.

**Fix**: Use Docker secrets or at minimum ensure the env var is never logged.

## Implementation Plan

- [ ] Create `docker-entrypoint.sh` with migration + startup logic
- [ ] Update Dockerfile to use entrypoint script
- [ ] Add resource limits to docker-compose.yml
- [ ] Add `stop_grace_period: 60s`
- [ ] Add security hardening (cap_drop, no-new-privileges)
- [ ] Consider `read_only` filesystem with tmpfs mounts
- [ ] Test Docker build and deployment

## Progress Tracking

**Overall Status:** Not Started - 0%

### Subtasks

| ID   | Description                      | Status      | Updated | Notes |
| ---- | -------------------------------- | ----------- | ------- | ----- |
| 20.1 | Create docker-entrypoint.sh      | Not Started |         |       |
| 20.2 | Update Dockerfile ENTRYPOINT/CMD | Not Started |         |       |
| 20.3 | Add resource limits to compose   | Not Started |         |       |
| 20.4 | Add stop_grace_period            | Not Started |         |       |
| 20.5 | Add security_opt and cap_drop    | Not Started |         |       |
| 20.6 | Test Docker build and runtime    | Not Started |         |       |

## Progress Log

### 2026-03-10

- Task created from comprehensive codebase audit
