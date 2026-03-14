import { describe, expect, it } from 'vitest';
import { config } from '../config/index.js';
import { generateDailySchedule, parseScrapeBlackoutMinutes } from './scheduler.service.js';

describe('generateDailySchedule', () => {
  it('returns a Set of "HH:MM" strings', () => {
    const schedule = generateDailySchedule();

    expect(schedule).toBeInstanceOf(Set);
    for (const slot of schedule) {
      expect(slot).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it('generates slots only within the publish window (06:00 – 22:59)', () => {
    const schedule = generateDailySchedule();

    for (const slot of schedule) {
      const hour = parseInt(slot.split(':')[0], 10);
      expect(hour).toBeGreaterThanOrEqual(6);
      expect(hour).toBeLessThanOrEqual(22);
    }
  });

  it('generates between 2 and 4 slots per hour (17 hours × 2–4)', () => {
    const schedule = generateDailySchedule();
    const totalHours = 22 - 6 + 1; // 17 hours

    expect(schedule.size).toBeGreaterThanOrEqual(totalHours * 2);
    expect(schedule.size).toBeLessThanOrEqual(totalHours * 4);
  });

  it('generates valid minutes (0–59)', () => {
    const schedule = generateDailySchedule();

    for (const slot of schedule) {
      const minute = parseInt(slot.split(':')[1], 10);
      expect(minute).toBeGreaterThanOrEqual(0);
      expect(minute).toBeLessThanOrEqual(59);
    }
  });

  it('produces unique slots (no duplicates)', () => {
    const schedule = generateDailySchedule();
    const asArray = [...schedule];

    expect(asArray.length).toBe(new Set(asArray).size);
  });

  it('produces different schedules on successive calls (randomness)', () => {
    const schedules = Array.from({ length: 5 }, () =>
      [...generateDailySchedule()].sort().join(',')
    );
    const unique = new Set(schedules);

    // With high probability, at least 2 out of 5 should differ
    expect(unique.size).toBeGreaterThan(1);
  });

  it('covers all hours in the publish window', () => {
    const schedule = generateDailySchedule();
    const hoursPresent = new Set<number>();

    for (const slot of schedule) {
      hoursPresent.add(parseInt(slot.split(':')[0], 10));
    }

    for (let h = 6; h <= 22; h++) {
      expect(hoursPresent.has(h)).toBe(true);
    }
  });

  it('does not generate slots inside scrape blackout windows', () => {
    const blackoutRanges = parseScrapeBlackoutMinutes(config.server.cronSchedule);
    // Skip test if no blackout windows overlap the publish window
    if (blackoutRanges.length === 0) return;

    for (let i = 0; i < 20; i++) {
      const schedule = generateDailySchedule();

      for (const slot of schedule) {
        const [hh, mm] = slot.split(':').map(Number);
        const totalMinutes = hh * 60 + mm;
        for (const [start, end] of blackoutRanges) {
          expect(
            totalMinutes < start || totalMinutes >= end,
            `Slot ${slot} falls in blackout window [${start}, ${end})`
          ).toBe(true);
        }
      }
    }
  });
});

describe('parseScrapeBlackoutMinutes', () => {
  it('parses standard cron with multiple hours', () => {
    const result = parseScrapeBlackoutMinutes('15 3,6,18 * * *');
    expect(result).toEqual([
      [3 * 60 + 15, 3 * 60 + 35],
      [6 * 60 + 15, 6 * 60 + 35],
      [18 * 60 + 15, 18 * 60 + 35],
    ]);
  });

  it('parses single-hour cron', () => {
    const result = parseScrapeBlackoutMinutes('0 8 * * *');
    expect(result).toEqual([[480, 500]]);
  });

  it('returns empty for invalid cron', () => {
    expect(parseScrapeBlackoutMinutes('')).toEqual([]);
    expect(parseScrapeBlackoutMinutes('invalid')).toEqual([]);
  });
});
