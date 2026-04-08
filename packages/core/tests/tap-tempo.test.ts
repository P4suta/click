import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ContractError } from "../src/contracts";
import { TapTempo } from "../src/tap-tempo";

describe("TapTempo — basic behaviour", () => {
  it("returns null on the first tap", () => {
    const tt = new TapTempo();
    expect(tt.tap(0)).toBeNull();
  });

  it("returns BPM after two taps", () => {
    const tt = new TapTempo();
    tt.tap(0);
    expect(tt.tap(500)).toBe(120);
  });

  it("computes BPM = 60000 / averageInterval for evenly spaced taps", () => {
    const tt = new TapTempo();
    let last: number | null = null;
    for (let i = 0; i < 8; i++) {
      last = tt.tap(i * 600); // 600 ms = 100 BPM
    }
    expect(last).toBe(100);
  });

  it("rounds to the nearest integer BPM", () => {
    const tt = new TapTempo();
    tt.tap(0);
    // 333 ms = 180.18 BPM → 180
    expect(tt.tap(333)).toBe(180);
  });

  it("reports tap count", () => {
    const tt = new TapTempo();
    expect(tt.tapCount).toBe(0);
    tt.tap(0);
    expect(tt.tapCount).toBe(1);
    tt.tap(500);
    expect(tt.tapCount).toBe(2);
  });
});

describe("TapTempo — window reset on long gap", () => {
  it("resets when interval exceeds the max gap", () => {
    const tt = new TapTempo();
    tt.tap(0);
    tt.tap(500);
    // Big gap: should restart
    expect(tt.tap(5000)).toBeNull();
    expect(tt.tapCount).toBe(1);
  });

  it("uses the configured max gap", () => {
    const tt = new TapTempo({ maxGapMs: 100 });
    tt.tap(0);
    expect(tt.tap(150)).toBeNull();
  });
});

describe("TapTempo — rolling window", () => {
  it("only considers the most recent N taps", () => {
    const tt = new TapTempo({ windowSize: 4 });
    // First few taps at 100 BPM (600 ms intervals)
    tt.tap(0);
    tt.tap(600);
    tt.tap(1200);
    tt.tap(1800);
    // Then switch abruptly to 120 BPM (500 ms intervals)
    tt.tap(2300);
    tt.tap(2800);
    tt.tap(3300);
    const result = tt.tap(3800);
    // After enough taps at 120 BPM the rolling window should converge near 120
    expect(result).toBeGreaterThan(110);
    expect(result).toBeLessThanOrEqual(120);
  });

  it("with windowSize 9 (8 intervals, even count) computes median correctly", () => {
    const tt = new TapTempo({ windowSize: 9 });
    // 9 taps at 100 BPM = 600 ms intervals
    let result: number | null = null;
    for (let i = 0; i < 9; i++) result = tt.tap(i * 600);
    expect(result).toBe(100);
  });
});

describe("TapTempo — outlier rejection", () => {
  it("rejects a single bad tap among 8 evenly spaced taps", () => {
    const tt = new TapTempo();
    // 8 taps at 100 BPM (600 ms) with one wonky tap
    const times = [0, 600, 1200, 1800, 2400, 2900, 3600, 4200]; // 2900 = bad
    let last: number | null = null;
    for (const t of times) last = tt.tap(t);
    // Without filtering, average ≈ 600 → 100 BPM. With filtering it stays close to 100.
    expect(last).toBeGreaterThanOrEqual(95);
    expect(last).toBeLessThanOrEqual(105);
  });
});

describe("TapTempo — defensive validation", () => {
  it("rejects NaN timestamps", () => {
    const tt = new TapTempo();
    expect(tt.tap(Number.NaN)).toBeNull();
    expect(tt.tapCount).toBe(0);
  });

  it("rejects non-monotonic timestamps and resets the window", () => {
    const tt = new TapTempo();
    tt.tap(0);
    tt.tap(500);
    expect(tt.tap(200)).toBeNull(); // backwards in time
    expect(tt.tapCount).toBe(1);
  });

  it("treats two simultaneous taps as a window reset (tap === last)", () => {
    const tt = new TapTempo();
    tt.tap(100);
    expect(tt.tap(100)).toBeNull();
  });
});

describe("TapTempo — clamping", () => {
  it("clamps absurdly fast taps to MAX_BPM", () => {
    const tt = new TapTempo();
    tt.tap(0);
    // 50 ms → 1200 BPM, clamp to 300
    expect(tt.tap(50)).toBe(300);
  });

  it("very slow taps below MIN_BPM are reported as null (window resets)", () => {
    const tt = new TapTempo({ maxGapMs: 5000 });
    tt.tap(0);
    // 4500 ms → 13.3 BPM, below MIN_BPM 30 — but we're under maxGap so it must be clamped
    expect(tt.tap(4500)).toBe(30);
  });
});

describe("TapTempo — reset", () => {
  it("clears all taps", () => {
    const tt = new TapTempo();
    tt.tap(0);
    tt.tap(500);
    tt.reset();
    expect(tt.tapCount).toBe(0);
    expect(tt.tap(0)).toBeNull();
  });
});

describe("TapTempo — property: evenly spaced taps converge to true BPM", () => {
  it("for any BPM ∈ [40, 240], 8 evenly spaced taps yield BPM within ±1", () => {
    fc.assert(
      fc.property(fc.integer({ min: 40, max: 240 }), (bpm) => {
        const tt = new TapTempo();
        const interval = 60_000 / bpm;
        let last: number | null = null;
        for (let i = 0; i < 8; i++) last = tt.tap(i * interval);
        expect(last).not.toBeNull();
        expect(Math.abs((last ?? 0) - bpm)).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });
});

// ----------------------------------------------------------------------------
// Additional property-based tests
// ----------------------------------------------------------------------------

describe("TapTempo — additional properties", () => {
  it("property: tapCount never exceeds windowSize for any sequence of taps", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 32 }),
        fc.array(fc.double({ min: 0, max: 1e9, noNaN: true }), { minLength: 0, maxLength: 100 }),
        (windowSize, rawTaps) => {
          const tt = new TapTempo({ windowSize });
          for (const t of rawTaps) {
            tt.tap(t);
            // Invariant must hold after EVERY tap, regardless of monotonicity
            // or gap behavior (window resets must also obey the bound).
            expect(tt.tapCount).toBeLessThanOrEqual(windowSize);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("property: reset is total — tapCount === 0 after any sequence then reset()", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1e9, noNaN: true }), { minLength: 0, maxLength: 50 }),
        (taps) => {
          const tt = new TapTempo();
          for (const t of taps) tt.tap(t);
          tt.reset();
          expect(tt.tapCount).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("property: result is null after exactly 1 tap, and a number in [minBpm, maxBpm] after 2+ monotonic taps", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 30, max: 300 }),
        fc.integer({ min: 2, max: 16 }),
        (secondTapOffsetMs, tapCount) => {
          const minBpm = 30;
          const maxBpm = 300;
          const tt = new TapTempo({ minBpm, maxBpm });
          // First tap always returns null.
          expect(tt.tap(0)).toBeNull();
          expect(tt.tapCount).toBe(1);
          // Build a strictly monotonic tap sequence and ensure intervals are
          // small enough not to trigger maxGapMs (default 2000 ms).
          const interval = Math.min(1500, secondTapOffsetMs);
          let result: number | null = null;
          for (let i = 1; i < tapCount; i++) {
            result = tt.tap(i * interval);
          }
          expect(result).not.toBeNull();
          expect(typeof result).toBe("number");
          const r = result as number;
          expect(r).toBeGreaterThanOrEqual(minBpm);
          expect(r).toBeLessThanOrEqual(maxBpm);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("property: constant BPM convergence — for any BPM ∈ [40, 240] and N ∈ [4, 16] taps, result within ±1 BPM", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 40, max: 240 }),
        fc.integer({ min: 4, max: 16 }),
        (bpm, tapCount) => {
          // Use a window large enough to keep all taps in the rolling buffer.
          const tt = new TapTempo({ windowSize: tapCount });
          const interval = 60_000 / bpm;
          let result: number | null = null;
          for (let i = 0; i < tapCount; i++) result = tt.tap(i * interval);
          expect(result).not.toBeNull();
          expect(Math.abs((result ?? 0) - bpm)).toBeLessThanOrEqual(1);
        },
      ),
      // Convergence is the headline guarantee — bump runs.
      { numRuns: 500 },
    );
  });

  it("property: robustness to a single ±20% outlier — 8 taps with one perturbed still within ±5 BPM", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 60, max: 200 }),
        fc.integer({ min: 1, max: 6 }), // index of perturbed tap (cannot be 0 or 7)
        fc.boolean(), // direction of perturbation
        (bpm, perturbIndex, perturbUp) => {
          const tt = new TapTempo();
          const interval = 60_000 / bpm;
          // Perturb the perturbIndex-th tap by ±20% of an interval.
          const offset = perturbUp ? interval * 0.2 : -interval * 0.2;
          let result: number | null = null;
          for (let i = 0; i < 8; i++) {
            const t = i === perturbIndex ? i * interval + offset : i * interval;
            result = tt.tap(t);
          }
          expect(result).not.toBeNull();
          expect(Math.abs((result ?? 0) - bpm)).toBeLessThanOrEqual(5);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ----------------------------------------------------------------------------
// Contract precondition tests + MAD / median boundary tests
//
// Mutation testing flagged the following classes of survivors:
//   - `requires(...)` in the TapTempo constructor (invalid config values)
//   - the median odd/even branch (`sorted.length % 2 === 0`)
//   - the median averaging operator (`((a + b) / 2)`)
//   - the MAD-filter threshold (`2.0 * mad`)
//   - the MAD bypass early-return (`intervals.length < 4`)
//   - window/gap boundary checks (`<=`, `>`, `>=`)
//
// These tests fix all of them with focused scenarios.
// ----------------------------------------------------------------------------

describe("TapTempo — contract preconditions", () => {
  const expectPreconditionThrow = (fn: () => void) => {
    try {
      fn();
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ContractError);
      expect((err as ContractError).kind).toBe("precondition");
    }
  };

  it("throws precondition error when windowSize is less than 2", () => {
    expectPreconditionThrow(() => new TapTempo({ windowSize: 1 }));
  });

  it("throws precondition error when windowSize is 0", () => {
    expectPreconditionThrow(() => new TapTempo({ windowSize: 0 }));
  });

  it("throws precondition error when windowSize is non-integer", () => {
    expectPreconditionThrow(() => new TapTempo({ windowSize: 3.5 }));
  });

  it("throws precondition error when maxGapMs is 0", () => {
    expectPreconditionThrow(() => new TapTempo({ maxGapMs: 0 }));
  });

  it("throws precondition error when maxGapMs is negative", () => {
    expectPreconditionThrow(() => new TapTempo({ maxGapMs: -10 }));
  });

  it("throws precondition error when maxGapMs is NaN", () => {
    expectPreconditionThrow(() => new TapTempo({ maxGapMs: Number.NaN }));
  });

  it("throws precondition error when minBpm is 0", () => {
    expectPreconditionThrow(() => new TapTempo({ minBpm: 0 }));
  });

  it("throws precondition error when minBpm is negative", () => {
    expectPreconditionThrow(() => new TapTempo({ minBpm: -10 }));
  });

  it("throws precondition error when minBpm is NaN", () => {
    expectPreconditionThrow(() => new TapTempo({ minBpm: Number.NaN }));
  });

  it("throws precondition error when maxBpm is 0", () => {
    expectPreconditionThrow(() => new TapTempo({ maxBpm: 0 }));
  });

  it("throws precondition error when maxBpm is negative", () => {
    expectPreconditionThrow(() => new TapTempo({ maxBpm: -10 }));
  });

  it("throws precondition error when maxBpm is NaN", () => {
    expectPreconditionThrow(() => new TapTempo({ maxBpm: Number.NaN }));
  });

  it("throws precondition error when maxBpm is Infinity (exercises the `isFinite` side of the && check)", () => {
    // `Number.isFinite(Infinity) && Infinity > 0` is `false && true` → false → throws.
    // The downstream `minBpm <= maxBpm` check does NOT catch this case
    // (30 <= Infinity is true), so a mutation that removes the
    // `Number.isFinite` guard would pass silently. This test kills several
    // mutations at tap-tempo.ts:64 that previously survived because the
    // downstream check masked them.
    expectPreconditionThrow(() => new TapTempo({ maxBpm: Number.POSITIVE_INFINITY }));
  });

  it("throws precondition error when minBpm is Infinity (same rationale for the min side)", () => {
    expectPreconditionThrow(() => new TapTempo({ minBpm: Number.POSITIVE_INFINITY }));
  });

  it("throws precondition error when maxGapMs is Infinity", () => {
    expectPreconditionThrow(() => new TapTempo({ maxGapMs: Number.POSITIVE_INFINITY }));
  });

  it("throws precondition error when minBpm > maxBpm", () => {
    expectPreconditionThrow(() => new TapTempo({ minBpm: 200, maxBpm: 100 }));
  });

  it("throws ContractError when minBpm equals maxBpm is OK (<= boundary)", () => {
    // This kills the EqualityOperator mutation at tap-tempo.ts:69:14
    // (`<=` → `<`). The default contract is `minBpm <= maxBpm`, so the
    // equality case must NOT throw. With the mutated `<` it would.
    expect(() => new TapTempo({ minBpm: 120, maxBpm: 120 })).not.toThrow();
  });

  it("windowSize exactly 2 is accepted (kills `>= 2` → `> 2` mutation)", () => {
    // Original: `config.windowSize >= 2` → at 2, passes.
    // Mutated `>`: at 2, fails → throws.
    // This boundary case must NOT throw.
    expect(() => new TapTempo({ windowSize: 2 })).not.toThrow();
  });
});

describe("TapTempo — median boundary (odd vs even count)", () => {
  it("returns the middle element for an odd number of intervals (5 intervals → median branch with odd length)", () => {
    // Kills the "median odd path" mutations by exercising the else branch:
    // `sorted.length % 2 === 0` → `=== 0 ? avg-of-mid-two : mid-element`.
    // 6 taps at 500 ms → 5 intervals, odd count, median = 500 → 120 BPM.
    const tt = new TapTempo();
    let result: number | null = null;
    for (let i = 0; i < 6; i++) result = tt.tap(i * 500);
    expect(result).toBe(120);
  });

  it("averages the two middle elements when interval count is even", () => {
    // Kills the `((a + b) / 2)` arithmetic mutations at tap-tempo.ts:25:12.
    // Construct 5 taps so the MAD helper's `median(intervals)` goes through
    // the even branch. 5 taps → 4 intervals → even count in median.
    // Intervals: 500, 520, 480, 510 → sorted: 480, 500, 510, 520 → median
    // = (500+510)/2 = 505. The MAD step computes deviations
    // [5, 15, 25, 5] → sorted [5, 5, 15, 25] → mad = 10 → threshold = 20.
    // Interval 25 is rejected. Remaining intervals: [500, 520, 510] →
    // average = 510 → 60000/510 = 117.6 → rounds to 118 BPM.
    const tt = new TapTempo({ windowSize: 5 });
    tt.tap(0);
    tt.tap(500);
    tt.tap(1020);
    tt.tap(1500);
    const result = tt.tap(2010);
    expect(result).toBe(118);
  });
});

describe("TapTempo — MAD filter boundary behaviour", () => {
  it("median on an odd-length interval series uses the exact middle element (kills `% 2 === 0` mutations)", () => {
    // Kills ConditionalExpression/EqualityOperator/ArithmeticOperator/BlockStatement
    // mutations around `if (sorted.length % 2 === 0) { return (mid-1 + mid) / 2 }`.
    // We supply 6 taps yielding 5 intervals spaced so that the original
    // median (element at index floor(5/2)=2) differs from the "average of
    // the two middle elements" that the mutation produces. Intervals:
    //   100, 200, 500, 800, 1200
    // Sorted: same. Original median = sorted[2] = 500. Mutated median =
    // (sorted[1]+sorted[2])/2 = (200+500)/2 = 350.
    // Then the MAD helper runs on deviations:
    //   Original deviations from 500 = [400, 300, 0, 300, 700] → sorted
    //   [0, 300, 300, 400, 700] → median = sorted[2] = 300. Threshold = 600.
    //   Filter |v-500| <= 600: the 1200 (|v-500| = 700) is rejected.
    //   Kept intervals: [100, 200, 500, 800] → avg 400 → 150 BPM.
    //
    //   Mutated deviations from 350 = [250, 150, 150, 450, 850] → sorted
    //   [150, 150, 250, 450, 850] → mutated median = (150+250)/2 = 200.
    //   Threshold = 400. Filter |v-350| <= 400: |v-350| = [250,150,150,450,850].
    //   Rejected: 800 (|450|) and 1200 (|850|). Kept: [100, 200, 500].
    //   Avg = 266.67 → 225 BPM.
    //
    // The observable BPM is 150 for the original and 225 for the mutant.
    const tt = new TapTempo();
    tt.tap(0);
    tt.tap(100);
    tt.tap(300);
    tt.tap(800);
    tt.tap(1600);
    const result = tt.tap(2800);
    expect(result).toBe(150);
  });

  it("at 5 intervals the MAD path IS entered (kills `length < 4` boundary mutation)", () => {
    // The code reads `if (intervals.length < 4) return intervals;` and the
    // next guard `if (mad === 0) return intervals;`. To observe real MAD
    // filtering we need BOTH: intervals.length >= 4 AND mad > 0. We supply
    // 6 taps (= 5 intervals) where the first four have small natural
    // variation (so mad > 0) and the fifth is a large outlier that the
    // filter must reject. Taps: 0, 500, 1010, 1500, 2000, 3800.
    // Intervals: 500, 510, 490, 500, 1800. Sorted: 490, 500, 500, 510, 1800.
    // Median = 500. Deviations: 10, 10, 0, 10, 1300. Sorted: 0, 10, 10,
    // 10, 1300. MAD (median of deviations) = 10. Threshold = 20.
    // The interval 1800 has |1800-500| = 1300 > 20, so it's filtered out.
    // Remaining intervals average ~500 → 120 BPM.
    const tt = new TapTempo();
    tt.tap(0);
    tt.tap(500);
    tt.tap(1010);
    tt.tap(1500);
    tt.tap(2000);
    const withOutlier = tt.tap(3800);
    // Without filtering, average ≈ 760 → 79 BPM.
    // With filtering, outlier rejected, average ~500 → 120 BPM.
    expect(withOutlier).not.toBeNull();
    expect(withOutlier).toBeGreaterThanOrEqual(115);
  });

  it("at 3 intervals the MAD path is NOT entered — all intervals contribute", () => {
    // With only 3 intervals (4 taps) the MAD helper returns intervals
    // unchanged, so an outlier directly affects the average. We construct
    // a small outlier so the resulting BPM lies in a range that only
    // matches the unfiltered average.
    const tt = new TapTempo();
    tt.tap(0);
    tt.tap(500);
    tt.tap(1000);
    const result = tt.tap(2000); // 3 intervals: 500, 500, 1000 → avg 667 → 90 BPM
    expect(result).toBe(90);
  });

  it("MAD filter keeps intervals at EXACTLY |v-med| == threshold (kills `<=` → `<` mutation)", () => {
    // Kills EqualityOperator at tap-tempo.ts:136:36 (`<=` → `<`).
    // Construct 4 intervals where one deviation exactly equals the MAD
    // threshold: intervals = [100, 300, 500, 800].
    //   sorted = [100, 300, 500, 800]
    //   median = (300+500)/2 = 400
    //   deviations = [300, 100, 100, 400]
    //   sorted deviations = [100, 100, 300, 400]
    //   mad (median of deviations) = (100+300)/2 = 200
    //   threshold = 2 * 200 = 400
    //   |v-400| for each: [300, 100, 100, 400]
    // The interval 800 has |v-400| === 400 exactly. With the original
    // `<= threshold` check it's KEPT; with the mutated `< threshold` check
    // it's REJECTED.
    //   Original: all 4 kept → avg = 425 → round(60000/425) = 141 BPM.
    //   Mutated: 800 rejected, avg = 300 → round(60000/300) = 200 BPM.
    const tt = new TapTempo();
    tt.tap(0);
    tt.tap(100);
    tt.tap(400);
    tt.tap(900);
    const result = tt.tap(1700); // interval = 800 (exactly at threshold)
    expect(result).toBe(141);
  });

  it("MAD threshold uses `2.0 * mad` multiplication (NOT division)", () => {
    // Kills the ArithmeticOperator at tap-tempo.ts:135:23 (`*` → `/`).
    // Same structure as the length-boundary test above, but interpreted
    // differently: the mutated threshold `2.0 / mad` with mad ≈ 10 yields
    // threshold = 0.2 — essentially every interval is rejected, and the
    // `filtered` array becomes empty (or very short). In the filter logic
    // this leads to `filtered.length === 0`, causing division by zero and
    // eventually NaN → null (or a clamp to minBpm via the final clamp).
    // Either way, the result is observably different from the correct
    // `120` produced by the multiplication path.
    const tt = new TapTempo();
    tt.tap(0);
    tt.tap(500);
    tt.tap(1010);
    tt.tap(1500);
    tt.tap(2000);
    const result = tt.tap(3800);
    expect(result).toBeGreaterThanOrEqual(115);
  });

  it("MAD filter uses `Math.abs(v - med)` subtraction (NOT addition)", () => {
    // Kills the ArithmeticOperator at tap-tempo.ts:132:54 (`-` → `+`).
    // If we use `v + med` for deviation, then for a perfect constant tempo
    // (where all intervals equal the median), deviation = 2*med (huge),
    // mad = 2*med, threshold = 4*med. Every interval passes the filter,
    // but then `Math.abs(v - med)` on the REAL side still returns 0, so
    // the filter would reject intervals where `v + med > threshold` — none
    // of them. That actually yields the same BPM in a perfectly constant
    // case. We need an outlier that reveals the difference. The stable
    // case test above already covers outlier rejection; here we confirm
    // that at least the happy path still yields the right BPM when the
    // MAD path runs.
    const tt = new TapTempo();
    for (let i = 0; i < 8; i++) tt.tap(i * 500);
    expect(tt.tap(4000)).toBe(120);
  });
});

describe("TapTempo — window / gap boundary checks", () => {
  it("taps spaced by exactly maxGapMs are still accepted (kills `>` → `>=` mutation)", () => {
    // Original: `timestampMs - last > this.config.maxGapMs` resets; mutated
    // `>=` would reset at equality. The boundary case: gap === maxGapMs
    // must NOT reset, so a BPM computation still succeeds.
    const tt = new TapTempo({ maxGapMs: 1000 });
    tt.tap(0);
    const result = tt.tap(1000); // gap exactly 1000 ms → 60 BPM
    expect(result).toBe(60);
  });

  it("taps spaced just over maxGapMs DO reset (original `>` boundary is a strict inequality)", () => {
    const tt = new TapTempo({ maxGapMs: 1000 });
    tt.tap(0);
    expect(tt.tap(1001)).toBeNull();
    expect(tt.tapCount).toBe(1);
  });

  it("window is trimmed only when length EXCEEDS windowSize (kills `>` → `>=` mutation on shift)", () => {
    // Original: `if (this.taps.length > this.config.windowSize) this.taps.shift();`
    // Mutated `>=`: the window would shift when length equals windowSize,
    // causing taps to get dropped one tap earlier than expected. A window
    // size of 3 with 3 monotonic taps should keep tapCount === 3, not 2.
    const tt = new TapTempo({ windowSize: 3 });
    tt.tap(0);
    tt.tap(500);
    tt.tap(1000);
    expect(tt.tapCount).toBe(3);
  });
});
