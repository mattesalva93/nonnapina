import { describe, expect, it } from 'vitest';
import { localISOString } from './date.js';

describe('localISOString', () => {
  it('returns an ISO 8601 string with timezone offset', () => {
    const date = new Date('2026-03-08T17:30:45.123Z');
    const result = localISOString(date);

    // Must match ISO pattern with offset (not "Z")
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
  });

  it('preserves local date components', () => {
    const date = new Date(2026, 2, 8, 14, 5, 9, 7); // local time
    const result = localISOString(date);

    expect(result).toContain('2026-03-08');
    expect(result).toContain('T14:05:09.007');
  });

  it('pads single-digit values with leading zeros', () => {
    const date = new Date(2026, 0, 2, 3, 4, 5, 6); // Jan 2, 03:04:05.006
    const result = localISOString(date);

    expect(result).toContain('2026-01-02');
    expect(result).toContain('T03:04:05.006');
  });

  it('defaults to current Date when no argument provided', () => {
    const before = Date.now();
    const result = localISOString();
    const after = Date.now();

    // Parse back and verify it falls in the expected window
    const parsed = new Date(result).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
    expect(parsed).toBeLessThanOrEqual(after + 1000);
  });

  it('handles midnight correctly', () => {
    const date = new Date(2026, 5, 15, 0, 0, 0, 0);
    const result = localISOString(date);

    expect(result).toContain('T00:00:00.000');
  });

  it('handles end of day correctly', () => {
    const date = new Date(2026, 11, 31, 23, 59, 59, 999);
    const result = localISOString(date);

    expect(result).toContain('T23:59:59.999');
  });
});
