import { ensures, requires } from "./contracts";

/**
 * Tracks the user's tap rhythm over many taps and produces a soft-corrected
 * "next beat" anchor that gently nudges the metronome's grid toward the
 * user's perceived rhythm instead of hard-snapping on every tap.
 *
 * Algorithm: exponential moving average (EMA) on the phase error.
 *
 *   periodsElapsed = round((tap - anchor) / interval)
 *   projectedTap   = anchor + periodsElapsed * interval
 *   phaseError     = tap - projectedTap
 *   newAnchor      = anchor + alpha * phaseError
 *
 * `alpha` controls responsiveness: 0.3 corrects 30% of the error per tap, so
 * a steady-state offset converges in ~10 taps. `alpha = 1.0` collapses to a
 * hard snap (the previous behavior).
 *
 * The interval (BPM) is adopted immediately on each tap — TapTempo's median
 * filter already smooths BPM noise upstream, so the tracker only needs to
 * smooth the phase.
 *
 * Reset between practice sessions: call `reset()` (or detect a tap-window
 * reset upstream and reset accordingly).
 */
export class PhaseTracker {
  private readonly alpha: number;
  private grid: { anchor: number; intervalSec: number } | null = null;

  constructor(alpha = 0.3) {
    requires(
      Number.isFinite(alpha) && alpha > 0 && alpha <= 1,
      "PhaseTracker: alpha must be a finite number in (0, 1]",
    );
    this.alpha = alpha;
  }

  get isInitialized(): boolean {
    return this.grid !== null;
  }

  reset(): void {
    this.grid = null;
    ensures(this.grid === null, "PhaseTracker.reset: grid must be cleared");
  }

  /**
   * Observe a tap and return the absolute clock time at which the next beat
   * should fire. The first observe initializes the grid (effectively a hard
   * snap); subsequent observes apply EMA soft correction.
   *
   * @param tapTimeSec  Absolute clock time of the tap (seconds).
   * @param intervalSec Pulse interval (seconds = 60 / bpm) at the moment of the tap.
   * @param nowSec      Current clock time (seconds), used to compute the next future beat.
   */
  observe(tapTimeSec: number, intervalSec: number, nowSec: number): number {
    requires(Number.isFinite(tapTimeSec), "PhaseTracker.observe: tapTimeSec must be finite");
    requires(
      Number.isFinite(intervalSec) && intervalSec > 0,
      "PhaseTracker.observe: intervalSec must be a positive finite number",
    );
    requires(Number.isFinite(nowSec), "PhaseTracker.observe: nowSec must be finite");

    if (this.grid === null) {
      this.grid = { anchor: tapTimeSec, intervalSec };
    } else {
      const periodsElapsed = Math.round((tapTimeSec - this.grid.anchor) / intervalSec);
      const projectedTap = this.grid.anchor + periodsElapsed * intervalSec;
      const phaseError = tapTimeSec - projectedTap;
      this.grid = {
        anchor: this.grid.anchor + this.alpha * phaseError,
        intervalSec,
      };
    }

    // The user expects the next click to be "about one interval after the
    // tap they just made". Snap that target to the nearest grid point on the
    // (possibly soft-corrected) grid. As the soft correction converges, this
    // snap-target lands closer to the user's pure `tap + interval` rhythm.
    const target = tapTimeSec + this.grid.intervalSec;
    const periodsToTarget = Math.round((target - this.grid.anchor) / this.grid.intervalSec);
    let next = this.grid.anchor + periodsToTarget * this.grid.intervalSec;
    // Defensive: if there is latency between the tap and `nowSec`, the snapped
    // target could legitimately land before now. Advance by full intervals
    // until the result is strictly future.
    while (next <= nowSec) next += this.grid.intervalSec;
    ensures(next > nowSec, "PhaseTracker.observe: returned next beat must be strictly after now");
    return next;
  }
}
