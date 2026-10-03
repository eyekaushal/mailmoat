const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const STEP_MINUTES = 30;
const DEFAULTS = Object.freeze({ days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' });

/**
 * The user's working hours in their own time zone (PRD F7.5), with the time arithmetic the
 * meeting feature needs: resolving a wall-clock time to an instant and finding free slots.
 * Everything is computed through `Intl`, so daylight-saving changes are handled by the runtime.
 */
export class WorkingHours {
  #days;
  #startMinutes;
  #endMinutes;
  #timeZone;
  #format;

  /**
   * @param {{ days?: number[], start?: string, end?: string, timeZone: string }} options
   *   `days` are JavaScript weekdays (0 = Sunday); `start`/`end` are "HH:MM"
   */
  constructor({ days = DEFAULTS.days, start = DEFAULTS.start, end = DEFAULTS.end, timeZone }) {
    this.#days = new Set(days);
    this.#startMinutes = WorkingHours.#minutes(start);
    this.#endMinutes = WorkingHours.#minutes(end);
    if (this.#endMinutes <= this.#startMinutes)
      throw new RangeError('Working hours must end after they start');
    this.#timeZone = timeZone;
    this.#format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
  }

  /**
   * @param {Pick<import('../db/repositories/SettingsRepository.js').SettingsRepository, 'get'>} settings
   * @param {string} timeZone
   */
  static fromSettings(settings, timeZone) {
    return new WorkingHours({ ...settings.get('workingHours', DEFAULTS), timeZone });
  }

  get timeZone() {
    return this.#timeZone;
  }

  /**
   * An ISO 8601 date-time as the Reader or the user writes it: with an offset it is exact; without
   * one it is wall-clock time in the user's zone.
   * @param {string} iso
   * @returns {Date}
   */
  resolve(iso) {
    if (/(Z|[+-]\d{2}:?\d{2})$/i.test(iso)) return new Date(iso);
    const [, y, mo, d, h = '0', mi = '0', s = '0'] =
      /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(iso) ?? [];
    if (!y) throw new RangeError('Not an ISO 8601 date-time');
    const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
    // Two passes: the offset at the guessed instant, then at the corrected one (DST edges).
    const first = wall - this.#offsetAt(new Date(wall));
    return new Date(wall - this.#offsetAt(new Date(first)));
  }

  /** Whether [start, end) lies inside working hours on one working day. */
  contains(start, end) {
    const from = this.#local(start);
    const to = this.#local(end);
    return (
      this.#days.has(from.weekday) &&
      from.day === to.day &&
      from.minutes >= this.#startMinutes &&
      to.minutes <= this.#endMinutes &&
      end > start
    );
  }

  /**
   * The next free slots inside working hours, on half-hour boundaries of the user's clock.
   * @param {{ from: Date, durationMinutes: number, busy: { start: Date, end: Date }[], count?: number, horizonDays?: number }} query
   * @returns {{ start: Date, end: Date }[]}
   */
  nextSlots({ from, durationMinutes, busy, count = 3, horizonDays = 14 }) {
    const slots = [];
    const duration = durationMinutes * MINUTE_MS;
    const stop = from.getTime() + horizonDays * DAY_MS;
    const skew = (STEP_MINUTES - (this.#local(from).minutes % STEP_MINUTES)) % STEP_MINUTES;
    for (
      let t = from.getTime() + skew * MINUTE_MS;
      t < stop && slots.length < count;
      t += STEP_MINUTES * MINUTE_MS
    ) {
      const start = new Date(t);
      const end = new Date(t + duration);
      if (this.contains(start, end) && !WorkingHours.isBusy(start, end, busy))
        slots.push({ start, end });
    }
    return slots;
  }

  /** @param {Date} start @param {Date} end @param {{ start: Date, end: Date }[]} busy */
  static isBusy(start, end, busy) {
    return busy.some((slot) => slot.start < end && slot.end > start);
  }

  #local(date) {
    const parts = Object.fromEntries(
      this.#format.formatToParts(date).map((p) => [p.type, p.value]),
    );
    return {
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
      day: `${parts.year}-${parts.month}-${parts.day}`,
      minutes: Number(parts.hour) * 60 + Number(parts.minute),
      wall: Date.UTC(
        +parts.year,
        +parts.month - 1,
        +parts.day,
        +parts.hour,
        +parts.minute,
        +parts.second,
      ),
    };
  }

  /** Zone offset at `date`, in ms (positive east of UTC). */
  #offsetAt(date) {
    return this.#local(date).wall - date.getTime();
  }

  static #minutes(hhmm) {
    const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
    if (!match) throw new RangeError(`Not a time of day: ${hhmm}`);
    return Number(match[1]) * 60 + Number(match[2]);
  }
}
