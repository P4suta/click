/**
 * Monotonic clock interface used by the scheduler. Implementations may use
 * `performance.now()` (production) or a deterministic counter (tests).
 *
 * Times are reported in seconds, matching `AudioContext.currentTime`, while
 * timer delays are expressed in milliseconds, matching `setTimeout`.
 */
export interface Clock {
  /** Current time in seconds, monotonic, sub-millisecond precision. */
  now(): number;
  /**
   * Schedule `callback` to run after at least `delayMs` milliseconds.
   * Returns a function that cancels the timer if invoked before it fires.
   */
  setTimer(callback: () => void, delayMs: number): () => void;
}
