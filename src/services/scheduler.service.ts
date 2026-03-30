import cron from 'node-cron';
import { localISOString } from '../utils/date.js';
import { createComponentLogger } from '../utils/logger.js';
import { sendErrorAlert, sendScheduleEmail } from './email.service.js';
import { runLowestDealCycle } from './lowest-deal.service.js';
import { getActiveRun } from './product.service.js';
import { runPublishCycle } from './publish.service.js';
import { isEnrichmentInProgress, runReviewEnrichment } from './review-enrichment.service.js';
import { runTop5PublishCycle } from './top5.service.js';

const logger = createComponentLogger('Scheduler');

// ─── Constants ────────────────────────────────────────────────────────────────
// Publish window: 06:00 – 22:59 (23:00 is the exclusive upper bound)
const PUBLISH_START_HOUR = 6;
const PUBLISH_END_HOUR = 22;
const MIN_POSTS_PER_HOUR = 2;
const MAX_POSTS_PER_HOUR = 4;

// Probability of picking the "minimo storico" variant over the regular post
const LOWEST_DEAL_PROBABILITY = 0.2; // 20%

// Minutes to keep clear after each scrape start time
const SCRAPE_BLACKOUT_MINUTES = 20;

// Hardcoded scrape schedule — runs at 05:00 and 17:00 Europe/Rome
export const SCRAPE_CRON = '0 5,17 * * *';

// All cron tasks use an explicit timezone to avoid DST transition bugs
const CRON_TIMEZONE = 'Europe/Rome';

// ─── State ────────────────────────────────────────────────────────────────────
let dailySchedule: Set<string> = new Set();

// ─── Scrape blackout windows ──────────────────────────────────────────────────
// Parse the scrape cron expression to extract (hour, minute) pairs, then build
// blackout ranges [start, start+SCRAPE_BLACKOUT_MINUTES) expressed in
// minutes-since-midnight. Slots falling inside any blackout are excluded.

export function parseScrapeBlackoutMinutes(cronExpr: string): Array<[number, number]> {
  // Expected format: "MM H1,H2,... * * *"  (standard cron, minute + hours list)
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 2) return [];

  const minute = parseInt(parts[0], 10);
  if (Number.isNaN(minute)) return [];

  const hours = parts[1]
    .split(',')
    .map(h => parseInt(h, 10))
    .filter(h => !Number.isNaN(h));

  return hours.map(h => {
    const start = h * 60 + minute;
    const end = start + SCRAPE_BLACKOUT_MINUTES;
    return [start, end] as [number, number];
  });
}

function isInBlackout(hour: number, minute: number, blackouts: Array<[number, number]>): boolean {
  const totalMinutes = hour * 60 + minute;
  return blackouts.some(([start, end]) => totalMinutes >= start && totalMinutes < end);
}

// ─── Schedule generation ──────────────────────────────────────────────────────
// For each hour in the window, pick a random count between MIN and MAX,
// then generate that many unique random minutes. The result is a set of
// "HH:MM" strings representing the exact minutes when a publish will fire.
// Slots that fall within a scrape blackout window are discarded.

export function generateDailySchedule(): Set<string> {
  const schedule = new Set<string>();
  const blackouts = parseScrapeBlackoutMinutes(SCRAPE_CRON);

  for (let hour = PUBLISH_START_HOUR; hour <= PUBLISH_END_HOUR; hour++) {
    const count =
      MIN_POSTS_PER_HOUR +
      Math.floor(Math.random() * (MAX_POSTS_PER_HOUR - MIN_POSTS_PER_HOUR + 1));

    const minutes = new Set<number>();
    // Cap attempts to avoid infinite loop if most of the hour is blacked out
    let attempts = 0;
    while (minutes.size < count && attempts < 120) {
      const candidate = Math.floor(Math.random() * 60);
      attempts++;
      if (isInBlackout(hour, candidate, blackouts)) continue;
      minutes.add(candidate);
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

const cronTasks: cron.ScheduledTask[] = [];

export function initPublishScheduler(): void {
  dailySchedule = generateDailySchedule();
  const sortedSlots = [...dailySchedule].sort();
  logger.info(
    { slots: sortedSlots, count: dailySchedule.size },
    'Daily publish schedule generated'
  );
  void sendScheduleEmail(sortedSlots, 'startup');

  // Regenerate at midnight for the new day
  cronTasks.push(
    cron.schedule(
      '0 0 * * *',
      () => {
        dailySchedule = generateDailySchedule();
        const slots = [...dailySchedule].sort();
        logger.info(
          { slots, count: dailySchedule.size },
          'Daily publish schedule regenerated (midnight)'
        );
        void sendScheduleEmail(slots, 'midnight');
      },
      { timezone: CRON_TIMEZONE }
    )
  );

  // Every minute, check if the current HH:MM matches a scheduled slot
  cronTasks.push(
    cron.schedule(
      '* * * * *',
      () => {
        const now = new Date();
        const hh = now.getHours().toString().padStart(2, '0');
        const mm = now.getMinutes().toString().padStart(2, '0');
        const slot = `${hh}:${mm}`;

        if (dailySchedule.has(slot)) {
          // 85% regular posts, 15% "minimo storico" posts
          const useLowest = Math.random() < LOWEST_DEAL_PROBABILITY;
          const variant = useLowest ? 'lowest-deal' : 'regular';
          logger.info({ slot, variant }, 'Publish slot matched — triggering publish cycle');

          void (async () => {
            try {
              // Defer publishing while a scrape job is running to avoid
              // two Chromium instances competing for memory (WhatsApp + Keepa).
              const activeRun = await getActiveRun();
              if (activeRun) {
                logger.warn(
                  { slot, variant, scrapeRunId: activeRun.id },
                  'Publish deferred — scrape job in progress'
                );
                return;
              }

              let result;
              if (useLowest) {
                // Try lowest-deal first; fall back to regular if none available
                result = await runLowestDealCycle();
                if (!result) {
                  logger.info({ slot }, 'No lowest-price deals — falling back to regular cycle');
                  result = await runPublishCycle();
                }
              } else {
                result = await runPublishCycle();
              }

              if (!result) {
                logger.warn({ slot, variant }, 'Scheduled publish skipped — no deals available');
                void sendErrorAlert({
                  errorMessage: `Scheduled publish at slot ${slot} (${variant}) found no deals to publish`,
                  component: 'ScheduledPublish',
                  severity: 'warning',
                  additionalData: { slot, variant },
                });
              } else if (!result.allSucceeded) {
                const failed = result.channels
                  .filter(ch => !ch.success)
                  .map(ch => `${ch.channel}: ${ch.error ?? 'unknown'}`)
                  .join('; ');
                logger.warn({ slot, variant, failed }, 'Scheduled publish partially failed');
                void sendErrorAlert({
                  errorMessage: `Scheduled publish at slot ${slot} (${variant}) partially failed: ${failed}`,
                  component: 'ScheduledPublish',
                  severity: 'error',
                  additionalData: { slot, variant, dealId: result.dealId, asin: result.asin },
                });
              }
            } catch (err) {
              const message = (err as Error).message;
              logger.error({ err: message, slot, variant }, 'Scheduled publish failed');
              void sendErrorAlert({
                errorMessage: `Scheduled publish failed at slot ${slot} (${variant}): ${message}`,
                errorStack: (err as Error).stack,
                component: 'ScheduledPublish',
                severity: 'error',
                additionalData: { slot, variant },
              });
            }
          })();
        }
      },
      { timezone: CRON_TIMEZONE }
    )
  );

  // Top 5 daily summary at 19:00
  cronTasks.push(
    cron.schedule(
      '0 19 * * *',
      () => {
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
      },
      { timezone: CRON_TIMEZONE }
    )
  );

  // Review enrichment every 3 hours during publish window (6–23)
  cronTasks.push(
    cron.schedule(
      '0 6,9,12,15,18,21 * * *',
      () => {
        logger.info('Scheduled review enrichment triggered');
        void (async () => {
          try {
            if (isEnrichmentInProgress()) {
              logger.info('Enrichment already running — skipping');
              return;
            }

            const result = await runReviewEnrichment();
            if (result.skippedReason) {
              logger.info({ reason: result.skippedReason }, 'Scheduled enrichment skipped');
            } else {
              logger.info(
                { enriched: result.enriched, total: result.total },
                'Scheduled enrichment complete'
              );
            }
          } catch (err) {
            const message = (err as Error).message;
            logger.error({ err: message }, 'Scheduled review enrichment failed');
            void sendErrorAlert({
              errorMessage: `Scheduled review enrichment failed: ${message}`,
              errorStack: (err as Error).stack,
              component: 'ScheduledEnrichment',
              severity: 'error',
            });
          }
        })();
      },
      { timezone: CRON_TIMEZONE }
    )
  );

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

export function stopAllCronTasks(): void {
  for (const task of cronTasks) {
    task.stop();
  }
  cronTasks.length = 0;
  logger.info('All cron tasks stopped');
}
