import cron from 'node-cron';
import { localISOString } from '../utils/date.js';
import { createComponentLogger } from '../utils/logger.js';
import { sendErrorAlert } from './email.service.js';
import { runPublishCycle } from './publish.service.js';
import { runTop5PublishCycle } from './top5.service.js';

const logger = createComponentLogger('Scheduler');

// ─── Constants ────────────────────────────────────────────────────────────────
// Publish window: 06:00 – 22:59 (23:00 is the exclusive upper bound)
const PUBLISH_START_HOUR = 6;
const PUBLISH_END_HOUR = 22;
const MIN_POSTS_PER_HOUR = 2;
const MAX_POSTS_PER_HOUR = 4;

// ─── State ────────────────────────────────────────────────────────────────────
let dailySchedule: Set<string> = new Set();

// ─── Schedule generation ──────────────────────────────────────────────────────
// For each hour in the window, pick a random count between MIN and MAX,
// then generate that many unique random minutes. The result is a set of
// "HH:MM" strings representing the exact minutes when a publish will fire.

export function generateDailySchedule(): Set<string> {
  const schedule = new Set<string>();

  for (let hour = PUBLISH_START_HOUR; hour <= PUBLISH_END_HOUR; hour++) {
    const count =
      MIN_POSTS_PER_HOUR +
      Math.floor(Math.random() * (MAX_POSTS_PER_HOUR - MIN_POSTS_PER_HOUR + 1));

    const minutes = new Set<number>();
    while (minutes.size < count) {
      minutes.add(Math.floor(Math.random() * 60));
    }

    for (const minute of minutes) {
      const hh = hour.toString().padStart(2, '0');
      const mm = minute.toString().padStart(2, '0');
      schedule.add(`${hh}:${mm}`);
    }
  }

  return schedule;
}

// ─── Scheduler bootstrap ─────────────────────────────────────────────────────

export function initPublishScheduler(): void {
  dailySchedule = generateDailySchedule();
  logger.info(
    { slots: [...dailySchedule].sort(), count: dailySchedule.size },
    'Daily publish schedule generated'
  );

  // Regenerate at midnight for the new day
  cron.schedule('0 0 * * *', () => {
    dailySchedule = generateDailySchedule();
    logger.info(
      { slots: [...dailySchedule].sort(), count: dailySchedule.size },
      'Daily publish schedule regenerated (midnight)'
    );
  });

  // Every minute, check if the current HH:MM matches a scheduled slot
  cron.schedule('* * * * *', () => {
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    const slot = `${hh}:${mm}`;

    if (dailySchedule.has(slot)) {
      logger.info({ slot }, 'Publish slot matched — triggering publish cycle');
      void (async () => {
        try {
          await runPublishCycle();
        } catch (err) {
          const message = (err as Error).message;
          logger.error({ err: message, slot }, 'Scheduled publish failed');
          void sendErrorAlert({
            errorMessage: `Scheduled publish failed at slot ${slot}: ${message}`,
            errorStack: (err as Error).stack,
            component: 'ScheduledPublish',
            severity: 'error',
            additionalData: { slot },
          });
        }
      })();
    }
  });

  // Top 5 daily summary at 19:00
  cron.schedule('0 19 * * *', () => {
    logger.info('Top 5 daily summary triggered (19:00)');
    void (async () => {
      try {
        await runTop5PublishCycle();
      } catch (err) {
        const message = (err as Error).message;
        logger.error({ err: message }, 'Scheduled top 5 publish failed');
        void sendErrorAlert({
          errorMessage: `Scheduled top 5 publish failed: ${message}`,
          errorStack: (err as Error).stack,
          component: 'ScheduledTop5Publish',
          severity: 'error',
        });
      }
    })();
  });

  logger.info('Publish scheduler initialized');
}

// ─── Public accessors (for status/debug endpoints) ───────────────────────────

export function getDailySchedule(): string[] {
  return [...dailySchedule].sort();
}

/**
 * Returns the next scheduled publish time as an ISO string, or undefined if
 * no more slots remain today (next fire will be tomorrow at the first slot
 * generated at midnight — not computable until then).
 */
export function getNextScheduledSlot(): string | undefined {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const upcoming = [...dailySchedule].sort().find(slot => {
    const [hh, mm] = slot.split(':').map(Number);
    return hh * 60 + mm > currentMinutes;
  });

  if (!upcoming) return undefined;

  const [hh, mm] = upcoming.split(':').map(Number);
  const next = new Date(now);
  next.setHours(hh, mm, 0, 0);
  return localISOString(next);
}
