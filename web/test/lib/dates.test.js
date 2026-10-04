import { describe, expect, it } from 'vitest';
import { dayGroup, longDate, shortDate } from '../../src/lib/dates.js';

const now = new Date(2026, 9, 5, 12, 0, 0); // Monday 5 October 2026, local time

describe('dates', () => {
  it('shortens a date to the time today, day and month this year, and the year before that', () => {
    expect(shortDate(new Date(2026, 9, 5, 9, 41), now)).toMatch(/9:41/);
    expect(shortDate(new Date(2026, 9, 2, 9, 41), now)).toMatch(/Oct/);
    expect(shortDate(new Date(2026, 9, 2, 9, 41), now)).not.toMatch(/2026/);
    expect(shortDate(new Date(2025, 9, 2, 9, 41), now)).toMatch(/2025/);
  });

  it('groups rows under Today, Yesterday, then the weekday and date', () => {
    expect(dayGroup(new Date(2026, 9, 5, 0, 1), now)).toBe('Today');
    expect(dayGroup(new Date(2026, 9, 4, 23, 59), now)).toBe('Yesterday');
    expect(dayGroup(new Date(2026, 9, 1, 8, 0), now)).toMatch(/Thu/);
    expect(dayGroup(new Date(2026, 9, 1, 8, 0), now)).not.toMatch(/2026/);
    expect(dayGroup(new Date(2025, 11, 31, 8, 0), now)).toMatch(/2025/);
  });

  it('spells a calendar date out in full without shifting it by time zone', () => {
    expect(longDate('2026-10-05')).toMatch(/Monday/);
    expect(longDate('2026-10-05')).toMatch(/October/);
  });
});
