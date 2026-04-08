import { type Clock, ensures, requires } from "@click/core";

/**
 * Production clock using `performance.now()` for monotonic time and
 * `setTimeout` for scheduling. Used by the scheduler when not running in
 * a Web Worker context.
 */
export class RealClock implements Clock {
  now(): number {
    const result = performance.now() / 1000;
    ensures(Number.isFinite(result), "RealClock.now: must return a finite number of seconds");
    return result;
  }

  setTimer(callback: () => void, delayMs: number): () => void {
    requires(typeof callback === "function", "RealClock.setTimer: callback must be a function");
    requires(
      Number.isFinite(delayMs),
      "RealClock.setTimer: delayMs must be a finite number of milliseconds",
    );
    const id = setTimeout(callback, delayMs);
    return () => clearTimeout(id);
  }
}
