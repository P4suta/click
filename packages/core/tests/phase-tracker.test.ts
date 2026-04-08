import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ContractError } from "../src/contracts";
import { PhaseTracker } from "../src/phase-tracker";

describe("PhaseTracker — construction", () => {
  it("constructs with the default alpha", () => {
    const tracker = new PhaseTracker();
    expect(tracker.isInitialized).toBe(false);
  });

  it("constructs with an explicit alpha in (0, 1]", () => {
    expect(() => new PhaseTracker(0.1)).not.toThrow();
    expect(() => new PhaseTracker(1.0)).not.toThrow();
  });

  it.each([0, -0.1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects alpha %s", (alpha) => {
    expect(() => new PhaseTracker(alpha)).toThrow(ContractError);
  });
});

describe("PhaseTracker — observe (initialization)", () => {
  it("first observe initializes the grid and reports a future beat", () => {
    const tracker = new PhaseTracker(0.3);
    const next = tracker.observe(2.0, 1.0, 2.0);
    // First future grid beat: anchor=2.0, +1 period = 3.0
    expect(next).toBe(3.0);
    expect(tracker.isInitialized).toBe(true);
  });

  it("first observe with nowSec well in the past still snaps to a future beat", () => {
    const tracker = new PhaseTracker(0.3);
    // tap at 2.0, but nowSec is 1.0 (in the past relative to the tap)
    const next = tracker.observe(2.0, 1.0, 1.0);
    // Even though now is before the tap, the next beat is still tap + interval
    expect(next).toBe(3.0);
  });

  it("advances next-beat by full intervals when nowSec is past the snapped target", () => {
    // Defensive guard: if there's significant latency between the tap event
    // and processing (e.g., main thread blocked), the snapped `tap + interval`
    // could land at or before nowSec. The implementation must walk forward in
    // interval steps until the result is strictly future.
    const tracker = new PhaseTracker(0.3);
    // Tap at t=0, intervalSec=1, nowSec=2.5 (1.5 intervals after the tap)
    const next = tracker.observe(0, 1.0, 2.5);
    // target = 0 + 1 = 1. periodsToTarget = round(1) = 1. next = 1.
    // 1 <= 2.5 → loop: next = 2. 2 <= 2.5 → loop: next = 3. 3 > 2.5 → return.
    expect(next).toBe(3.0);
  });

  it("preconditions reject non-finite arguments", () => {
    const tracker = new PhaseTracker();
    expect(() => tracker.observe(Number.NaN, 1.0, 0)).toThrow(ContractError);
    expect(() => tracker.observe(0, Number.NaN, 0)).toThrow(ContractError);
    expect(() => tracker.observe(0, 1.0, Number.NaN)).toThrow(ContractError);
    expect(() => tracker.observe(0, 0, 0)).toThrow(ContractError); // intervalSec must be > 0
    expect(() => tracker.observe(0, -1.0, 0)).toThrow(ContractError);
  });
});

describe("PhaseTracker — soft correction (subsequent observes)", () => {
  it("perfect taps produce zero phase error and stable anchors", () => {
    const tracker = new PhaseTracker(0.3);
    tracker.observe(0.0, 1.0, 0.0);
    // Next perfect tap: at 1.0, expected anchor for next beat: 2.0
    expect(tracker.observe(1.0, 1.0, 1.0)).toBe(2.0);
    expect(tracker.observe(2.0, 1.0, 2.0)).toBe(3.0);
    expect(tracker.observe(3.0, 1.0, 3.0)).toBe(4.0);
  });

  it("a single late tap nudges the grid by alpha * error", () => {
    const tracker = new PhaseTracker(0.3);
    tracker.observe(0.0, 1.0, 0.0);
    tracker.observe(1.0, 1.0, 1.0);
    tracker.observe(2.0, 1.0, 2.0);
    // Now tap 0.1 sec late
    const next = tracker.observe(3.1, 1.0, 3.1);
    // Expected projected tap: 3.0. Error: +0.1. Anchor moves: 0 + 0.3*0.1 = 0.03
    // Next beat: ceil((3.1 - 0.03) / 1.0) = ceil(3.07) = 4 → 0.03 + 4*1.0 = 4.03
    expect(next).toBeCloseTo(4.03, 9);
  });

  it("phase error decays geometrically over consecutive constant-offset taps", () => {
    const tracker = new PhaseTracker(0.5);
    tracker.observe(0.0, 1.0, 0.0);
    // Each tap is 0.2 sec late on a perfect 1.0 grid
    const offset = 0.2;
    const errors: number[] = [];
    for (let i = 1; i <= 10; i++) {
      const tapTime = i * 1.0 + offset;
      const next = tracker.observe(tapTime, 1.0, tapTime);
      // The "next beat" should converge toward tapTime + 1.0 (= the user's expected next tap)
      const targetNext = tapTime + 1.0;
      errors.push(targetNext - next);
    }
    // Errors should monotonically decrease in absolute value
    for (let i = 1; i < errors.length; i++) {
      expect(Math.abs(errors[i] as number)).toBeLessThanOrEqual(Math.abs(errors[i - 1] as number));
    }
    // After 10 taps with alpha=0.5, residual error ≈ 0.2 * (1-0.5)^10 ≈ 0.0002
    expect(Math.abs(errors[errors.length - 1] as number)).toBeLessThan(0.001);
  });

  it("alpha=1.0 collapses to hard snap (next beat exactly at tap + interval)", () => {
    const tracker = new PhaseTracker(1.0);
    tracker.observe(0.0, 1.0, 0.0);
    // Wildly out-of-phase tap. With alpha=1 the grid moves all the way:
    //   periods=round(0.7/1)=1, projected=1, error=-0.3, anchor → -0.3.
    //   target = 0.7 + 1 = 1.7. periodsToTarget = round((1.7-(-0.3))/1) = 2.
    //   next = -0.3 + 2 = 1.7  ← exactly tap + interval (hard snap)
    const next = tracker.observe(0.7, 1.0, 0.7);
    expect(next).toBeCloseTo(1.7, 9);
  });

  it("alpha=very small barely moves the grid (next beat is close to tap + interval)", () => {
    const tracker = new PhaseTracker(0.01);
    tracker.observe(0.0, 1.0, 0.0);
    // 0.5-sec offset tap (huge phase error). With alpha=0.01 the grid barely
    // shifts (0.005 sec) but the next-beat target is still snapped to a grid
    // point near tap + interval:
    //   periods=round(2.5/1)=3 (JS half-away-from-zero), projected=3, error=-0.5,
    //   anchor → 0 + 0.01*(-0.5) = -0.005.
    //   target = 2.5 + 1 = 3.5. periodsToTarget = round((3.5-(-0.005))/1) = 4.
    //   next = -0.005 + 4 = 3.995 (≈ tap + 1.5*interval, but the closest grid
    //   point to 3.5 given the barely-moved grid is at 3.995)
    const next = tracker.observe(2.5, 1.0, 2.5);
    expect(next).toBeCloseTo(3.995, 9);
  });
});

describe("PhaseTracker — BPM changes", () => {
  it("adopts a new interval immediately while soft-correcting the anchor", () => {
    const tracker = new PhaseTracker(0.3);
    tracker.observe(0.0, 1.0, 0.0); // 60 BPM init
    tracker.observe(1.0, 1.0, 1.0);
    // BPM doubles: 60 → 120
    const next = tracker.observe(1.5, 0.5, 1.5);
    // periodsElapsed = round((1.5-0)/0.5) = 3. projectedTap = 0 + 3*0.5 = 1.5. error = 0.
    // anchor → 0 + 0.3*0 = 0. Next: ceil((1.5-0)/0.5)=3 → 0 + max(1,3)*0.5 = 1.5
    // Hmm that's the tap time. Need to check if max(1, ceil) handles "now == grid point" correctly.
    // Actually in this case the user is exactly on a (new) grid point, so the next beat should be
    // 1.5 + 0.5 = 2.0. The current impl returns 1.5, which is wrong.
    // Wait, let me re-read. periodsFromAnchor = max(1, ceil((nowSec - anchor) / intervalSec))
    // = max(1, ceil((1.5 - 0)/0.5)) = max(1, 3) = 3.
    // Next = anchor + 3 * intervalSec = 0 + 3 * 0.5 = 1.5
    // But "1.5" equals the current tap time. We want the NEXT future beat, not the current.
    // Hmm. The Math.ceil approach: ceil(3) is 3 (already on a grid point). We need ceil OR +1 if exact.
    // Better: use Math.floor + 1.
    // Let me adjust the implementation to use floor + 1 instead of ceil + max(1).
    // For now, the test will catch this — and I'll fix the implementation.
    expect(next).toBeGreaterThan(1.5); // next beat must be in the future
  });
});

describe("PhaseTracker — reset", () => {
  it("reset clears state so the next observe re-initializes", () => {
    const tracker = new PhaseTracker(0.3);
    tracker.observe(0.0, 1.0, 0.0);
    expect(tracker.isInitialized).toBe(true);
    tracker.reset();
    expect(tracker.isInitialized).toBe(false);
    // First observe after reset behaves like the very first observe
    const next = tracker.observe(5.0, 0.5, 5.0);
    expect(next).toBe(5.5);
  });
});

describe("PhaseTracker — properties", () => {
  it("property: zero-error perfect-tap sequence stays at zero error", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.05, max: 1.0, noNaN: true }), // alpha
        fc.integer({ min: 30, max: 999 }), // bpm
        fc.integer({ min: 2, max: 16 }), // tap count
        (alpha, bpm, taps) => {
          const tracker = new PhaseTracker(alpha);
          const intervalSec = 60 / bpm;
          const startTap = 1.0;
          for (let i = 0; i < taps; i++) {
            tracker.observe(startTap + i * intervalSec, intervalSec, startTap + i * intervalSec);
          }
          // After perfect taps, the next beat should be at startTap + taps * intervalSec
          const next = tracker.observe(
            startTap + taps * intervalSec,
            intervalSec,
            startTap + taps * intervalSec,
          );
          const expected = startTap + (taps + 1) * intervalSec;
          expect(Math.abs(next - expected)).toBeLessThan(1e-9);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("property: returned next beat is always strictly after nowSec", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 1.0, noNaN: true }),
        fc.integer({ min: 30, max: 999 }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: -0.5, max: 0.5, noNaN: true }),
        (alpha, bpm, baseTime, jitter) => {
          const tracker = new PhaseTracker(alpha);
          const intervalSec = 60 / bpm;
          // initialize with a perfect tap
          tracker.observe(baseTime, intervalSec, baseTime);
          // and a second tap with jitter
          const tapTime = baseTime + intervalSec + jitter * intervalSec * 0.4;
          const next = tracker.observe(tapTime, intervalSec, tapTime);
          expect(next).toBeGreaterThan(tapTime);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("property: phase error converges toward zero over many constant-offset taps", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 0.7, noNaN: true }), // alpha (avoid 1.0 since that's instant)
        fc.double({ min: -0.3, max: 0.3, noNaN: true }), // initial offset relative to interval
        (alpha, offsetFraction) => {
          const tracker = new PhaseTracker(alpha);
          const intervalSec = 1.0;
          const offset = offsetFraction * intervalSec;
          tracker.observe(0.0, intervalSec, 0.0);
          // 30 consistent late/early taps
          let lastError = Math.abs(offset);
          for (let i = 1; i <= 30; i++) {
            const tapTime = i * intervalSec + offset;
            const next = tracker.observe(tapTime, intervalSec, tapTime);
            const target = tapTime + intervalSec;
            const err = Math.abs(target - next);
            // Eventually small (might oscillate slightly due to floating point)
            lastError = err;
          }
          // After 30 taps with alpha >= 0.1, residual error should be tiny
          expect(lastError).toBeLessThan(0.05);
        },
      ),
      { numRuns: 100 },
    );
  });
});
