/**
 * Runs background tasks on an interval. A task never overlaps itself: the next run is
 * scheduled only after the previous one finishes. Errors are logged, never thrown, so one
 * failed poll does not stop future polls.
 */
export class Scheduler {
  #logger;
  #timers;
  #tasks = [];
  #handles = new Map();
  #running = false;

  /**
   * @param {import('./Logger.js').Logger} logger
   * @param {{ setTimeout?: typeof setTimeout, clearTimeout?: typeof clearTimeout }} [timers]
   */
  constructor(logger, timers = { setTimeout, clearTimeout }) {
    this.#logger = logger;
    this.#timers = timers;
  }

  /**
   * @param {string} name
   * @param {number} intervalMs
   * @param {() => Promise<unknown>} task
   */
  every(name, intervalMs, task) {
    this.#tasks.push({ name, intervalMs, task });
    if (this.#running) this.#schedule({ name, intervalMs, task }, 0);
    return this;
  }

  /** Starts every task immediately, then repeats each on its interval. */
  start() {
    this.#running = true;
    for (const entry of this.#tasks) this.#schedule(entry, 0);
  }

  stop() {
    this.#running = false;
    for (const handle of this.#handles.values()) this.#timers.clearTimeout(handle);
    this.#handles.clear();
  }

  #schedule(entry, delayMs) {
    const handle = this.#timers.setTimeout(async () => {
      try {
        await entry.task();
      } catch (error) {
        this.#logger.error('scheduled task failed', { task: entry.name, error });
      }
      if (this.#running) this.#schedule(entry, entry.intervalMs);
    }, delayMs);
    this.#handles.set(entry.name, handle);
  }
}
