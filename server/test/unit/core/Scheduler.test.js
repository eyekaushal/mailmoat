import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '../../../src/core/Logger.js';
import { Scheduler } from '../../../src/core/Scheduler.js';

let errors;
let logger;

beforeEach(() => {
  vi.useFakeTimers();
  errors = [];
  logger = new Logger({ sink: (line) => errors.push(JSON.parse(line)) });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Scheduler', () => {
  it('runs immediately, then on the interval', async () => {
    const task = vi.fn(async () => {});
    const scheduler = new Scheduler(logger).every('poll', 60_000, task);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(task).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('never overlaps a slow task with itself', async () => {
    let running = 0;
    let maxRunning = 0;
    const task = async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 150_000));
      running -= 1;
    };
    const scheduler = new Scheduler(logger).every('slow', 60_000, task);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(500_000);
    expect(maxRunning).toBe(1);
    scheduler.stop();
  });

  it('keeps going after a task throws, and logs the error', async () => {
    const task = vi
      .fn()
      .mockRejectedValueOnce(new Error('Gmail down'))
      .mockResolvedValue(undefined);
    const scheduler = new Scheduler(logger).every('poll', 1_000, task);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(task).toHaveBeenCalledTimes(2);
    expect(errors[0]).toMatchObject({
      level: 'error',
      task: 'poll',
      error: { message: 'Gmail down' },
    });
    scheduler.stop();
  });

  it('stops cleanly', async () => {
    const task = vi.fn(async () => {});
    const scheduler = new Scheduler(logger).every('poll', 1_000, task);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
