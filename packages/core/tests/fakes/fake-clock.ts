import type { Clock } from "../../src/clock";

interface ScheduledTimer {
  readonly id: number;
  readonly fireAtMs: number;
  readonly callback: () => void;
}

/**
 * Deterministic clock for tests. Time only advances when `advance(ms)` is
 * called. Timers fire synchronously during `advance` if their fire time is
 * within the advanced range.
 */
export class FakeClock implements Clock {
  private nowMs: number;
  private nextTimerId = 1;
  private timers: ScheduledTimer[] = [];

  constructor(initialMs = 0) {
    this.nowMs = initialMs;
  }

  now(): number {
    return this.nowMs / 1000;
  }

  setTimer(callback: () => void, delayMs: number): () => void {
    const id = this.nextTimerId++;
    const fireAtMs = this.nowMs + Math.max(0, delayMs);
    this.timers.push({ id, fireAtMs, callback });
    this.timers.sort((a, b) => a.fireAtMs - b.fireAtMs);
    return () => {
      this.timers = this.timers.filter((t) => t.id !== id);
    };
  }

  /**
   * Advance time by `ms` milliseconds, firing any scheduled timers whose
   * deadline falls within the advanced range. Timers may schedule new timers;
   * those will fire if their new deadline is also within the range.
   */
  advance(ms: number): void {
    const target = this.nowMs + ms;
    while (true) {
      const next = this.timers[0];
      if (!next || next.fireAtMs > target) break;
      this.timers.shift();
      this.nowMs = next.fireAtMs;
      next.callback();
    }
    this.nowMs = target;
  }

  get pendingTimers(): number {
    return this.timers.length;
  }
}
