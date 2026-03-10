import { describe, expect, it } from 'vitest';
import { generateDailySchedule } from './scheduler.service.js';

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
});
