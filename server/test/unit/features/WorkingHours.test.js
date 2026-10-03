import { describe, expect, it } from 'vitest';
import { WorkingHours } from '../../../src/features/WorkingHours.js';

const kolkata = new WorkingHours({ timeZone: 'Asia/Kolkata' });

describe('WorkingHours.resolve', () => {
  it('keeps an explicit offset and reads a bare time as the user’s wall clock', () => {
    expect(kolkata.resolve('2026-10-09T17:00:00+05:30').toISOString()).toBe(
      '2026-10-09T11:30:00.000Z',
    );
    expect(kolkata.resolve('2026-10-09T17:00:00Z').toISOString()).toBe('2026-10-09T17:00:00.000Z');
    expect(kolkata.resolve('2026-10-09T17:00').toISOString()).toBe('2026-10-09T11:30:00.000Z');
    expect(kolkata.resolve('2026-10-09').toISOString()).toBe('2026-10-08T18:30:00.000Z');
    expect(() => kolkata.resolve('Friday at 5')).toThrow(RangeError);
  });

  it('follows daylight-saving time', () => {
    const london = new WorkingHours({ timeZone: 'Europe/London' });
    expect(london.resolve('2026-07-01T09:00').toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(london.resolve('2026-12-01T09:00').toISOString()).toBe('2026-12-01T09:00:00.000Z');
  });
});

describe('WorkingHours.contains', () => {
  it('accepts slots inside Mon–Fri 09:00–18:00 local time and rejects the rest', () => {
    const at = (iso) => kolkata.resolve(iso);
    expect(kolkata.contains(at('2026-10-09T17:00'), at('2026-10-09T17:30'))).toBe(true); // Fri
    expect(kolkata.contains(at('2026-10-09T17:30'), at('2026-10-09T18:00'))).toBe(true);
    expect(kolkata.contains(at('2026-10-09T17:45'), at('2026-10-09T18:15'))).toBe(false);
    expect(kolkata.contains(at('2026-10-09T08:30'), at('2026-10-09T09:00'))).toBe(false);
    expect(kolkata.contains(at('2026-10-10T10:00'), at('2026-10-10T10:30'))).toBe(false); // Sat
    expect(kolkata.contains(at('2026-10-09T17:00'), at('2026-10-09T17:00'))).toBe(false);
    const custom = new WorkingHours({
      days: [6],
      start: '10:00',
      end: '12:00',
      timeZone: 'Asia/Kolkata',
    });
    expect(custom.contains(at('2026-10-10T10:00'), at('2026-10-10T11:00'))).toBe(true);
    expect(() => new WorkingHours({ start: '18:00', end: '09:00', timeZone: 'UTC' })).toThrow(
      RangeError,
    );
    expect(() => new WorkingHours({ start: '9am', timeZone: 'UTC' })).toThrow(RangeError);
  });
});

describe('WorkingHours.nextSlots', () => {
  it('starts on the next half hour, skips busy time and non-working days, and stops at count', () => {
    // Friday 9 Oct 2026, 17:10 IST.
    const from = kolkata.resolve('2026-10-09T17:10');
    const busy = [
      { start: kolkata.resolve('2026-10-12T09:00'), end: kolkata.resolve('2026-10-12T09:30') },
    ];
    const slots = kolkata.nextSlots({ from, durationMinutes: 30, busy });
    expect(slots.map((s) => s.start.toISOString())).toEqual([
      '2026-10-09T12:00:00.000Z', // Fri 17:30 IST
      '2026-10-12T04:00:00.000Z', // Mon 09:30 IST (09:00 is busy; weekend skipped)
      '2026-10-12T04:30:00.000Z',
    ]);
    expect(slots[0].end.toISOString()).toBe('2026-10-09T12:30:00.000Z');
  });

  it('returns fewer slots when the horizon runs out', () => {
    const everything = [
      { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2027-01-01T00:00:00Z') },
    ];
    expect(
      kolkata.nextSlots({
        from: new Date('2026-10-09T00:00:00Z'),
        durationMinutes: 60,
        busy: everything,
      }),
    ).toEqual([]);
    const fiveDays = kolkata.nextSlots({
      from: new Date('2026-10-09T00:00:00Z'),
      durationMinutes: 60,
      busy: [],
      count: 100,
      horizonDays: 1,
    });
    expect(fiveDays.length).toBe(17); // Fri 09:00–18:00 in half-hour steps for a 1-hour meeting
  });

  it('isBusy detects any overlap', () => {
    const busy = [
      { start: new Date('2026-10-09T10:00:00Z'), end: new Date('2026-10-09T11:00:00Z') },
    ];
    expect(
      WorkingHours.isBusy(new Date('2026-10-09T10:30:00Z'), new Date('2026-10-09T11:30:00Z'), busy),
    ).toBe(true);
    expect(
      WorkingHours.isBusy(new Date('2026-10-09T11:00:00Z'), new Date('2026-10-09T11:30:00Z'), busy),
    ).toBe(false);
    expect(
      WorkingHours.isBusy(new Date('2026-10-09T09:30:00Z'), new Date('2026-10-09T10:00:00Z'), busy),
    ).toBe(false);
  });
});
