# [TASK010] - Email Daily Schedule Notification

**Status:** Pending
**Added:** 2026-03-09
**Updated:** 2026-03-09

## Original Request

Every time the daily publishing schedule is generated (at startup and at midnight), send an email to `ALERT_EMAIL_TO` (with CC to `ALERT_EMAIL_CC`) containing the full list of scheduled time slots for the day.

## Implementation Plan

- [ ] 1.1 Add `sendScheduleEmail()` function in `email.service.ts` with a professional HTML template
- [ ] 1.2 Call it from `scheduler.service.ts` after each `generateDailySchedule()` invocation
- [ ] 1.3 Include schedule summary: total slots, time range, list of times

## Progress Log

### 2026-03-09

- Task created
