import { MAX_BPM, MIN_BPM, TAP_TEMPO_MAX_GAP_MS, TAP_TEMPO_WINDOW_SIZE } from "./constants";
import { ensures, invariant, requires } from "./contracts";

export interface TapTempoConfig {
  /** Number of recent taps to consider when estimating BPM. Default 8. */
  readonly windowSize: number;
  /** Maximum allowed interval (ms) between consecutive taps. Beyond this, the window resets. */
  readonly maxGapMs: number;
  /** BPM clamp range. */
  readonly minBpm: number;
  readonly maxBpm: number;
}

const DEFAULT_CONFIG: TapTempoConfig = {
  windowSize: TAP_TEMPO_WINDOW_SIZE,
  maxGapMs: TAP_TEMPO_MAX_GAP_MS,
  minBpm: MIN_BPM,
  maxBpm: MAX_BPM,
};

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  }
  return sorted[mid] as number;
};

/**
 * Estimate BPM from a sequence of tap timestamps.
 *
 * Uses a rolling window of the most recent `windowSize` taps. Outliers are
 * rejected via Median Absolute Deviation (MAD) filtering: any interval more
 * than 2.0 × MAD from the median is dropped before averaging. This makes the
 * estimator robust to occasional human timing errors without requiring the
 * user to "be perfect".
 */
export class TapTempo {
  private readonly config: TapTempoConfig;
  private taps: number[] = [];

  constructor(config: Partial<TapTempoConfig> = {}) {
    if (config.windowSize !== undefined) {
      requires(
        Number.isInteger(config.windowSize) && config.windowSize >= 2,
        "TapTempo: config.windowSize must be an integer >= 2",
      );
    }
    if (config.maxGapMs !== undefined) {
      requires(
        Number.isFinite(config.maxGapMs) && config.maxGapMs > 0,
        "TapTempo: config.maxGapMs must be a positive finite number",
      );
    }
    if (config.minBpm !== undefined) {
      requires(
        Number.isFinite(config.minBpm) && config.minBpm > 0,
        "TapTempo: config.minBpm must be a positive finite number",
      );
    }
    if (config.maxBpm !== undefined) {
      requires(
        Number.isFinite(config.maxBpm) && config.maxBpm > 0,
        "TapTempo: config.maxBpm must be a positive finite number",
      );
    }
    this.config = { ...DEFAULT_CONFIG, ...config };
    requires(this.config.minBpm <= this.config.maxBpm, "TapTempo: minBpm must not exceed maxBpm");
  }

  get tapCount(): number {
    return this.taps.length;
  }

  reset(): void {
    this.taps = [];
    ensures(this.taps.length === 0, "TapTempo.reset: taps array must be empty after reset");
  }

  tap(timestampMs: number): number | null {
    // No precondition on timestampMs: existing tests intentionally pass NaN
    // and non-monotonic timestamps and expect graceful null returns.
    if (!Number.isFinite(timestampMs)) return null;
    const last = this.taps.at(-1);
    // Reset on long gap OR on non-monotonic input (clock skew, replay, etc.).
    if (last !== undefined && (timestampMs <= last || timestampMs - last > this.config.maxGapMs)) {
      this.taps = [timestampMs];
      invariant(
        this.taps.length <= this.config.windowSize,
        "TapTempo.tap: taps length must not exceed windowSize after window reset",
      );
      return null;
    }
    this.taps.push(timestampMs);
    if (this.taps.length > this.config.windowSize) {
      this.taps.shift();
    }
    invariant(
      this.taps.length <= this.config.windowSize,
      "TapTempo.tap: taps length must not exceed windowSize",
    );
    if (this.taps.length < 2) return null;

    const intervals = this.intervals();
    const filtered = this.rejectOutliers(intervals);
    // Monotonic + finite guards above guarantee every interval is > 0,
    // so avg > 0 and finite. No defensive divide-by-zero check needed.
    const avg = filtered.reduce((s, x) => s + x, 0) / filtered.length;
    const rawBpm = Math.round(60_000 / avg);
    const result = Math.min(this.config.maxBpm, Math.max(this.config.minBpm, rawBpm));
    ensures(
      result >= this.config.minBpm && result <= this.config.maxBpm,
      "TapTempo.tap: returned BPM must be within [minBpm, maxBpm]",
    );
    return result;
  }

  private intervals(): number[] {
    const result: number[] = [];
    let prev: number | undefined;
    for (const tap of this.taps) {
      if (prev !== undefined) result.push(tap - prev);
      prev = tap;
    }
    return result;
  }

  private rejectOutliers(intervals: readonly number[]): readonly number[] {
    if (intervals.length < 4) return intervals;
    const med = median(intervals);
    const deviations = intervals.map((v) => Math.abs(v - med));
    const mad = median(deviations);
    if (mad === 0) return intervals;
    const threshold = 2.0 * mad;
    return intervals.filter((v) => Math.abs(v - med) <= threshold);
  }
}
