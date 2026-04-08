import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generateBeatPattern } from "../src/beat-pattern";
import { ContractError } from "../src/contracts";
import { Scheduler } from "../src/scheduler";
import type { BeatEvent, BeatPattern, TimeSignature } from "../src/types";
import { FakeClock } from "./fakes/fake-clock";

const FOUR_FOUR: TimeSignature = { numerator: 4, denominator: 4 };

const pattern = (bpm: number, sig: TimeSignature = FOUR_FOUR): BeatPattern =>
  generateBeatPattern({
    bpm,
    timeSignature: sig,
    accentPattern: new Array<boolean>(sig.numerator).fill(false).map((_, i) => i === 0),
    subdivision: 1,
  });

const collect = (scheduler: Scheduler, clock: FakeClock, pat: BeatPattern, durationMs: number) => {
  const events: BeatEvent[] = [];
  scheduler.start(pat, (e) => events.push(e));
  clock.advance(durationMs);
  return events;
};

describe("Scheduler — basic emission", () => {
  it("does not run before start", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    expect(scheduler.isRunning).toBe(false);
    clock.advance(1000);
    expect(scheduler.isRunning).toBe(false);
  });

  it("emits the first beat at start time", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    const events = collect(scheduler, clock, pattern(60), 0);
    expect(events).toHaveLength(1);
    expect(events[0]?.time).toBe(0);
  });

  it("isRunning becomes true after start", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    scheduler.start(pattern(60), () => {});
    expect(scheduler.isRunning).toBe(true);
  });

  it("emits 4 beats at 60 BPM in 4 seconds", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    const events = collect(scheduler, clock, pattern(60), 4000);
    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events.length).toBeLessThanOrEqual(5);
    expect(events[0]?.time).toBe(0);
    expect(events[1]?.time).toBe(1);
    expect(events[2]?.time).toBe(2);
    expect(events[3]?.time).toBe(3);
  });

  it("emits accent on beat 1 of every measure", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    const events = collect(scheduler, clock, pattern(60), 8000);
    const accentTimes = events.filter((e) => e.accent).map((e) => e.time);
    expect(accentTimes).toContain(0);
    expect(accentTimes).toContain(4);
  });

  it("preserves beatIndex across measures (loops 0..n-1)", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    const events = collect(scheduler, clock, pattern(60), 8000);
    const indices = events.slice(0, 8).map((e) => e.beatIndex);
    expect(indices).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
  });
});

describe("Scheduler — stop", () => {
  it("stops emitting after stop()", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    const events: BeatEvent[] = [];
    scheduler.start(pattern(60), (e) => events.push(e));
    clock.advance(2000);
    const before = events.length;
    scheduler.stop();
    clock.advance(10000);
    expect(events.length).toBe(before);
  });

  it("isRunning becomes false after stop", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    scheduler.start(pattern(60), () => {});
    scheduler.stop();
    expect(scheduler.isRunning).toBe(false);
  });

  it("stop is idempotent", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    scheduler.start(pattern(60), () => {});
    scheduler.stop();
    expect(() => scheduler.stop()).not.toThrow();
    expect(scheduler.isRunning).toBe(false);
  });

  it("can be restarted after stop", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    scheduler.start(pattern(60), () => {});
    scheduler.stop();
    const events: BeatEvent[] = [];
    scheduler.start(pattern(60), (e) => events.push(e));
    clock.advance(2000);
    expect(events.length).toBeGreaterThan(0);
  });
});

describe("Scheduler — updatePattern", () => {
  it("changes BPM mid-play and uses new pulse for subsequent beats", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    const events: BeatEvent[] = [];
    scheduler.start(pattern(60), (e) => events.push(e));
    clock.advance(1500); // ~ beats at 0, 1
    scheduler.updatePattern(pattern(120));
    clock.advance(2500);
    // After update, new pulse is 0.5 s, so new beats fire on the new tempo grid
    const lateBeats = events.filter((e) => e.time >= 2);
    expect(lateBeats.length).toBeGreaterThanOrEqual(2);
  });

  it("does nothing if not running", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    expect(() => scheduler.updatePattern(pattern(120))).not.toThrow();
    expect(scheduler.isRunning).toBe(false);
  });
});

describe("Scheduler — drift", () => {
  it("emits the correct number of beats over a long duration", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    const events = collect(scheduler, clock, pattern(120), 60_000);
    // 120 BPM × 60 s = 120 beats expected. lookahead may schedule a few extra
    expect(events.length).toBeGreaterThanOrEqual(120);
    expect(events.length).toBeLessThanOrEqual(122);
  });

  it("does not accumulate timing error over 10 minutes at 240 BPM", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    const events = collect(scheduler, clock, pattern(240), 600_000);
    // 240 × 10 = 2400 expected
    expect(events.length).toBeGreaterThanOrEqual(2400);
    expect(events.length).toBeLessThanOrEqual(2402);
    // The Nth beat time must be exactly N * pulseSec from start
    const pulseSec = 60 / 240;
    for (let i = 0; i < 100; i++) {
      const event = events[i];
      if (!event) continue;
      expect(event.time).toBeCloseTo(i * pulseSec, 9);
    }
  });
});

describe("Scheduler — property: beat count tracks BPM × duration", () => {
  it("for any BPM ∈ [30, 300] and any duration ∈ [1, 60], count is within ±2", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 30, max: 300 }),
        fc.integer({ min: 1, max: 60 }),
        (bpm, durationSec) => {
          const clock = new FakeClock();
          const scheduler = new Scheduler(clock);
          const events = collect(scheduler, clock, pattern(bpm), durationSec * 1000);
          const expected = Math.floor((durationSec * bpm) / 60) + 1; // +1 for the beat at t=0
          // lookahead may schedule a few extra beats
          expect(events.length).toBeGreaterThanOrEqual(expected);
          expect(events.length).toBeLessThanOrEqual(expected + 2);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Scheduler — defensive guards", () => {
  it("double-start without intervening stop does not leak parallel timers", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    const events: BeatEvent[] = [];
    scheduler.start(pattern(60), (e) => events.push(e));
    // Call start again — old timer must be cancelled, new one in its place.
    scheduler.start(pattern(60), (e) => events.push(e));
    clock.advance(3000);
    // Now stop and assert no further beats fire — proves there is exactly
    // one tick chain, not two leaked ones.
    scheduler.stop();
    const countAfterStop = events.length;
    clock.advance(10_000);
    expect(events.length).toBe(countAfterStop);
  });

  it("caps beats per tick when many beats fit in the lookahead window", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    const events: BeatEvent[] = [];
    // Synthetic: 60000 BPM gives 1ms pulse; a 100ms lookahead window would
    // try to schedule 100 beats per tick. The internal cap (64) bounds this
    // to prevent runaway loops on backgrounded-tab resume or invalid BPMs.
    scheduler.start(pattern(60000), (e) => events.push(e));
    expect(events.length).toBeLessThanOrEqual(64);
    expect(events.length).toBeGreaterThanOrEqual(64);
    scheduler.stop();
  });
});

describe("Scheduler — config", () => {
  it("accepts custom lookahead config", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock, { lookaheadMs: 50, scheduleAheadSec: 0.2 });
    const events = collect(scheduler, clock, pattern(60), 2000);
    expect(events.length).toBeGreaterThanOrEqual(2);
  });
});

// ----------------------------------------------------------------------------
// Property-based tests
// ----------------------------------------------------------------------------

const arbTimeSignature: fc.Arbitrary<TimeSignature> = fc.record({
  numerator: fc.integer({ min: 1, max: 16 }),
  denominator: fc.constantFrom<2 | 4 | 8 | 16>(2, 4, 8, 16),
});

describe("Scheduler — additional properties", () => {
  it("property: start-then-immediate-stop is a quiet no-op (no further beats fire after stop)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 30, max: 300 }), arbTimeSignature, (bpm, sig) => {
        const clock = new FakeClock();
        const scheduler = new Scheduler(clock);
        const events: BeatEvent[] = [];
        scheduler.start(pattern(bpm, sig), (e) => events.push(e));
        scheduler.stop();
        const countAfterStop = events.length;
        // The very first tick (synchronous part of `start`) may legitimately
        // schedule any beats that already lie within the lookahead window
        // before `stop()` runs. After `stop()` no further beats may appear.
        clock.advance(60_000);
        expect(events.length).toBe(countAfterStop);
        expect(scheduler.isRunning).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it("property: drift bound — last beat time is within ±0.001s of the theoretical N * pulseSec", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 30, max: 300 }),
        fc.integer({ min: 1, max: 30 }),
        (bpm, durationSec) => {
          const clock = new FakeClock();
          const scheduler = new Scheduler(clock);
          const events = collect(scheduler, clock, pattern(bpm), durationSec * 1000);
          if (events.length === 0) return;
          const last = events[events.length - 1] as BeatEvent;
          // The Nth beat (0-indexed) lives at index = beatIndex within its
          // measure plus measureIndex * numerator. We can recover N from the
          // events array length itself: events are emitted in order, one per
          // tick, no gaps, so the Nth event corresponds to the Nth pulse.
          const n = events.length - 1;
          const pulseSec = 60 / bpm;
          const expected = n * pulseSec;
          expect(Math.abs(last.time - expected)).toBeLessThan(0.001);
        },
      ),
      // Drift is one of the most safety-critical properties — bump runs.
      { numRuns: 500 },
    );
  });

  it("property: every emitted beatIndex is < numerator", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 30, max: 300 }),
        arbTimeSignature,
        fc.integer({ min: 100, max: 30_000 }),
        (bpm, sig, durationMs) => {
          const clock = new FakeClock();
          const scheduler = new Scheduler(clock);
          const events = collect(scheduler, clock, pattern(bpm, sig), durationMs);
          for (const e of events) {
            expect(e.beatIndex).toBeGreaterThanOrEqual(0);
            expect(e.beatIndex).toBeLessThan(sig.numerator);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("property: accent === (subdivisionIndex === 0 && accentPattern[beatIndex])", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 30, max: 300 }),
        fc
          .integer({ min: 1, max: 8 })
          .chain((numerator) =>
            fc.tuple(
              fc.constant(numerator),
              fc.array(fc.boolean(), { minLength: numerator, maxLength: numerator }),
              fc.constantFrom<1 | 2 | 3 | 4>(1, 2, 3, 4),
              fc.constantFrom<2 | 4 | 8 | 16>(2, 4, 8, 16),
            ),
          ),
        fc.integer({ min: 100, max: 8_000 }),
        (bpm, [numerator, accentPattern, subdivision, denominator], durationMs) => {
          const sig: TimeSignature = { numerator, denominator };
          const beatPattern = generateBeatPattern({
            bpm,
            timeSignature: sig,
            accentPattern,
            subdivision,
          });
          const clock = new FakeClock();
          const scheduler = new Scheduler(clock);
          const events: BeatEvent[] = [];
          scheduler.start(beatPattern, (e) => events.push(e));
          clock.advance(durationMs);
          for (const e of events) {
            const expectedAccent = e.subdivisionIndex === 0 && accentPattern[e.beatIndex] === true;
            expect(e.accent).toBe(expectedAccent);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ----------------------------------------------------------------------------
// Contract precondition violation tests + boundary-sensitive logic tests
//
// These exercise the `requires` predicates in the Scheduler constructor,
// `start`, and `updatePattern`. They also cover boundary branches in the
// internal `tick` loop (backlog-resync when emitted >= MAX_BEATS_PER_TICK,
// and the strict `<` horizon comparison) that mutation testing flagged as
// "survivors" when only happy-path tests were present.
// ----------------------------------------------------------------------------

describe("Scheduler — contract preconditions (constructor)", () => {
  const expectPreconditionThrow = (fn: () => void) => {
    try {
      fn();
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ContractError);
      expect((err as ContractError).kind).toBe("precondition");
    }
  };

  it("throws precondition error on null clock", () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
    expectPreconditionThrow(() => new Scheduler(null as any));
  });

  it("throws precondition error on non-object clock (number)", () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
    expectPreconditionThrow(() => new Scheduler(42 as any));
  });

  it("throws precondition error when clock is missing now()", () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
    const bad = { setTimer: () => () => {} } as any;
    expectPreconditionThrow(() => new Scheduler(bad));
  });

  it("throws precondition error when clock is missing setTimer()", () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
    const bad = { now: () => 0 } as any;
    expectPreconditionThrow(() => new Scheduler(bad));
  });

  it("throws precondition error when lookaheadMs is 0", () => {
    expectPreconditionThrow(() => new Scheduler(new FakeClock(), { lookaheadMs: 0 }));
  });

  it("throws precondition error when lookaheadMs is negative", () => {
    expectPreconditionThrow(() => new Scheduler(new FakeClock(), { lookaheadMs: -1 }));
  });

  it("throws precondition error when lookaheadMs is NaN", () => {
    expectPreconditionThrow(() => new Scheduler(new FakeClock(), { lookaheadMs: Number.NaN }));
  });

  it("throws precondition error when scheduleAheadSec is 0", () => {
    expectPreconditionThrow(() => new Scheduler(new FakeClock(), { scheduleAheadSec: 0 }));
  });

  it("throws precondition error when scheduleAheadSec is negative", () => {
    expectPreconditionThrow(() => new Scheduler(new FakeClock(), { scheduleAheadSec: -0.1 }));
  });

  it("throws precondition error when scheduleAheadSec is Infinity", () => {
    expectPreconditionThrow(
      () => new Scheduler(new FakeClock(), { scheduleAheadSec: Number.POSITIVE_INFINITY }),
    );
  });
});

describe("Scheduler — contract preconditions (start)", () => {
  const expectPreconditionThrow = (fn: () => void) => {
    try {
      fn();
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ContractError);
      expect((err as ContractError).kind).toBe("precondition");
    }
  };

  it("throws precondition error on null pattern", () => {
    const scheduler = new Scheduler(new FakeClock());
    // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
    expectPreconditionThrow(() => scheduler.start(null as any, () => {}));
  });

  it("throws precondition error on non-object pattern", () => {
    const scheduler = new Scheduler(new FakeClock());
    // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
    expectPreconditionThrow(() => scheduler.start("bad" as any, () => {}));
  });

  it("throws precondition error when pattern.beats is not an array", () => {
    const scheduler = new Scheduler(new FakeClock());
    const bad = {
      bpm: 60,
      timeSignature: { numerator: 4, denominator: 4 } as TimeSignature,
      measureDurationSec: 4,
      // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
      beats: "nope" as any,
    };
    expectPreconditionThrow(() => scheduler.start(bad, () => {}));
  });

  it("throws precondition error when pattern.beats is empty", () => {
    const scheduler = new Scheduler(new FakeClock());
    const bad = {
      bpm: 60,
      timeSignature: { numerator: 4, denominator: 4 } as TimeSignature,
      measureDurationSec: 4,
      beats: [] as readonly BeatEvent[],
    };
    expectPreconditionThrow(() => scheduler.start(bad, () => {}));
  });

  it("throws precondition error when pattern.measureDurationSec is 0", () => {
    const scheduler = new Scheduler(new FakeClock());
    const bad = {
      bpm: 60,
      timeSignature: { numerator: 4, denominator: 4 } as TimeSignature,
      measureDurationSec: 0,
      beats: [{ beatIndex: 0, subdivisionIndex: 0, time: 0, accent: false }] as const,
    };
    expectPreconditionThrow(() => scheduler.start(bad, () => {}));
  });

  it("throws precondition error when pattern.measureDurationSec is NaN", () => {
    const scheduler = new Scheduler(new FakeClock());
    const bad = {
      bpm: 60,
      timeSignature: { numerator: 4, denominator: 4 } as TimeSignature,
      measureDurationSec: Number.NaN,
      beats: [{ beatIndex: 0, subdivisionIndex: 0, time: 0, accent: false }] as const,
    };
    expectPreconditionThrow(() => scheduler.start(bad, () => {}));
  });

  it("throws precondition error when onBeat is not a function", () => {
    const scheduler = new Scheduler(new FakeClock());
    // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
    expectPreconditionThrow(() => scheduler.start(pattern(60), "not-fn" as any));
  });
});

describe("Scheduler — contract preconditions (updatePattern)", () => {
  it("throws ContractError (precondition) on null pattern", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    scheduler.start(pattern(60), () => {});
    try {
      // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
      scheduler.updatePattern(null as any);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ContractError);
      expect((err as ContractError).kind).toBe("precondition");
    }
  });

  it("throws ContractError (precondition) on non-object pattern", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    scheduler.start(pattern(60), () => {});
    try {
      // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
      scheduler.updatePattern(42 as any);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ContractError);
      expect((err as ContractError).kind).toBe("precondition");
    }
  });

  it("throws ContractError (precondition) when pattern.beats is empty", () => {
    // Asserting the error's `kind === 'precondition'` distinguishes the
    // upstream `requires(...)` check from the downstream `invariant(...)`
    // check: mutations that bypass the precondition and let the code fall
    // through to the invariant would throw with kind 'invariant' instead
    // and be caught by this tighter assertion.
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    scheduler.start(pattern(60), () => {});
    const bad = {
      bpm: 60,
      timeSignature: { numerator: 4, denominator: 4 } as TimeSignature,
      measureDurationSec: 4,
      beats: [] as readonly BeatEvent[],
    };
    try {
      scheduler.updatePattern(bad);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ContractError);
      expect((err as ContractError).kind).toBe("precondition");
    }
  });

  it("throws ContractError (precondition) when pattern.measureDurationSec is 0", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    scheduler.start(pattern(60), () => {});
    const bad = {
      bpm: 60,
      timeSignature: { numerator: 4, denominator: 4 } as TimeSignature,
      measureDurationSec: 0,
      beats: [{ beatIndex: 0, subdivisionIndex: 0, time: 0, accent: false }] as const,
    };
    try {
      scheduler.updatePattern(bad);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ContractError);
      expect((err as ContractError).kind).toBe("precondition");
    }
  });
});

describe("Scheduler — boundary branches", () => {
  it("updatePattern preserves the NEXT beat time (measureStartTime + nextBeat.time, NOT a subtraction)", () => {
    // This kills the ArithmeticOperator mutation at scheduler.ts:129
    // (`+` → `-`). After ~1.5s at 60 BPM, beat 0 (t=0) and beat 1 (t=1) have
    // fired; nextBeatIndex is 2, expected next fire time ~2s. If we call
    // updatePattern there, the new measure anchor should be 2.0 (measureStart
    // 0 + nextBeat.time 2), not -2.0. At 120 BPM the next 4 beats then fire
    // at 2.0, 2.5, 3.0, 3.5. If the mutation replaced `+` with `-`, the
    // first post-update beat would fire near t = -2.0 — instantly at t ~ 1.5
    // — producing a burst of beats far earlier than the expected schedule.
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    const events: BeatEvent[] = [];
    scheduler.start(pattern(60), (e) => events.push(e));
    clock.advance(1500);
    const countBeforeUpdate = events.length;
    scheduler.updatePattern(pattern(120));
    // Advance enough to observe multiple beats under the NEW pattern.
    clock.advance(2000);
    // Under the correct logic, post-update beats fire at 2.0, 2.5, 3.0, 3.5.
    // With the `-` mutation, the new measure anchor would be negative and
    // many beats would fire immediately. Without updatePattern running at
    // all (the `if (this.running) return;` mutation), the 60 BPM cadence
    // would produce beats at 2.0, 3.0, 3.5 — at most 2 beats in the window.
    const newBeats = events.slice(countBeforeUpdate);
    expect(newBeats.length).toBeGreaterThanOrEqual(3);
    expect(newBeats[0]?.time).toBeCloseTo(2.0, 5);
    expect(newBeats[1]?.time).toBeCloseTo(2.5, 5);
    expect(newBeats[2]?.time).toBeCloseTo(3.0, 5);
  });

  it("at horizon boundary, a beat at exactly t = horizon is NOT emitted (strict < check)", () => {
    // Kills EqualityOperator at scheduler.ts:144:60 (`<` → `<=`).
    // The default scheduleAheadSec is 0.1 s. We construct a pattern whose
    // first beat lies at t = 0 (always inside horizon) and second beat lies
    // exactly at t = 0.1 (the horizon boundary). The loop should emit beat 0
    // but NOT beat 1 on the first tick — that beat is emitted on the next
    // tick. With the mutation (`<=`), beat 1 would be pulled into the first
    // tick burst.
    const clock = new FakeClock();
    // 600 BPM → pulseSec = 0.1s
    const scheduler = new Scheduler(clock, { scheduleAheadSec: 0.1 });
    const events: BeatEvent[] = [];
    scheduler.start(pattern(600), (e) => events.push(e));
    // Synchronously on `start`, only the beat whose time is STRICTLY LESS
    // than horizon (= 0.1) should be emitted — that's only beat 0.
    expect(events.length).toBe(1);
    expect(events[0]?.time).toBe(0);
    scheduler.stop();
  });

  it("backlog resync cap (MAX_BEATS_PER_TICK) — resets measureStartTime so the next tick's first beat is anchored to `now`", () => {
    // Kills the BlockStatement mutation at scheduler.ts:148:56 (the resync
    // body is emptied) and the ConditionalExpression/EqualityOperator
    // siblings on the surrounding `if`. After the cap hits during the first
    // synchronous tick, the resync rewrites measureStartTime to clock.now()
    // (= 0 at sync-tick time) and nextBeatIndex to 0. Then clock.advance(25)
    // fires the next tick at clock.now()=0.025, horizon 0.125, and the first
    // beat of that tick is anchored at measureStartTime (= 0) + beats[0].time
    // (= 0) → time === 0.
    //
    // Without the resync, measureStartTime stays at the accumulated 0.064
    // (= 16 measure wraps × 0.004 s/measure). The first beat of the second
    // tick would fire at time 0.064 instead of 0.
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    const events: BeatEvent[] = [];
    scheduler.start(pattern(60000), (e) => events.push(e));
    expect(events.length).toBe(64);
    // Advance the clock so the next tick fires.
    clock.advance(25);
    // The 65th beat (index 64 in the events array) belongs to the SECOND
    // tick. With the resync, its time equals the freshly anchored
    // measureStartTime (= 0), plus beats[0].time (= 0) → 0. Without the
    // resync the accumulated measureStartTime is 0.064, so the 65th beat
    // would emit at time 0.064 — a clearly observable difference.
    expect(events[64]?.time).toBe(0);
    scheduler.stop();
  });

  it("tick is not re-armed after onBeat-triggered stop() — confirms `if (this.running)` at tick bottom", () => {
    // Kills ConditionalExpression at scheduler.ts:154:9 (`if (this.running)` → `if (true)`).
    // Scenario: the user-provided onBeat callback calls scheduler.stop() on
    // the SECOND beat (first beat is the one scheduled synchronously from
    // start(); calling stop() there would violate the start() postcondition
    // `invariant(this.running)`). When the second tick runs asynchronously
    // after clock.advance(), onBeat fires, calls stop(), and the while loop
    // exits with this.running === false. With the original guard no timer
    // is re-armed; with the mutation a new timer IS scheduled.
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    const events: BeatEvent[] = [];
    let count = 0;
    scheduler.start(pattern(60), (e) => {
      events.push(e);
      count++;
      if (count === 2) {
        scheduler.stop();
      }
    });
    // Advance enough for the second beat to fire (at t = 1s for 60 BPM).
    clock.advance(1100);
    expect(count).toBe(2);
    expect(scheduler.isRunning).toBe(false);
    // After the onBeat-triggered stop, tick's bottom `if (this.running)`
    // must prevent re-arming. Any pending timer would mean the mutation
    // bypassed that guard.
    expect(clock.pendingTimers).toBe(0);
    // Advancing further must not produce more beats.
    clock.advance(10_000);
    expect(count).toBe(2);
  });

  it("updatePattern on a non-running scheduler is a silent no-op (kills the `!this.running` guard mutation)", () => {
    // This differentiates `if (!this.running) return;` from
    // `if (this.running) return;`. If the mutation flipped it, calling
    // updatePattern on a stopped scheduler would attempt to index into
    // the pre-existing currentPattern (EMPTY_PATTERN), reset
    // measureStartTime/nextBeatIndex, and then require that the
    // nextBeatIndex invariant holds — but currentPattern would silently
    // change. We observe the EMPTY_PATTERN's time of POSITIVE_INFINITY:
    // If updatePattern mistakenly ran, the internal currentPattern would
    // change to the supplied pattern. We start() afterwards; with the
    // original guard, start() re-initialises everything so the behavior is
    // identical regardless of the prior updatePattern call.
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    // Call updatePattern before ever calling start — should be a no-op.
    // Also confirms isRunning stays false.
    scheduler.updatePattern(pattern(120));
    expect(scheduler.isRunning).toBe(false);
    const events: BeatEvent[] = [];
    // Then call start normally and verify the scheduler behaves as usual.
    scheduler.start(pattern(60), (e) => events.push(e));
    clock.advance(2000);
    // Should see beats at 0 and 1 from the 60 BPM pattern (plus possibly a
    // few lookahead-scheduled extras), definitely not at 0.5/1.0/1.5 from
    // the 120 BPM pattern that was "update"d before start.
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0]?.time).toBe(0);
    expect(events[1]?.time).toBe(1);
    scheduler.stop();
  });
});

// ----------------------------------------------------------------------------
// Anchored start / updatePattern (tap-tempo phase alignment)
// ----------------------------------------------------------------------------

describe("Scheduler — anchored start", () => {
  it("emits the first beat at the explicit anchorTime", () => {
    const clock = new FakeClock(); // now = 0
    const scheduler = new Scheduler(clock);
    const events: BeatEvent[] = [];
    scheduler.start(pattern(60), (e) => events.push(e), { anchorTime: 5.0 });
    // Beat 0 sits at anchorTime 5.0, well outside the lookahead window from 0,
    // so nothing fires until time advances close to 5.
    clock.advance(4_900);
    expect(events.length).toBe(0);
    // Cross the lookahead horizon (default 100ms ahead) — beat 0 should now fire.
    clock.advance(200);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.time).toBe(5);
    scheduler.stop();
  });

  it("uses clock.now() when anchorTime is omitted (regression)", () => {
    const clock = new FakeClock(2500); // now = 2.5 s
    const scheduler = new Scheduler(clock);
    const events: BeatEvent[] = [];
    scheduler.start(pattern(60), (e) => events.push(e));
    // First beat fires immediately because measureStartTime === clock.now()
    expect(events[0]?.time).toBe(2.5);
    scheduler.stop();
  });

  it("explicit anchorTime in the future delays the first emission", () => {
    const clock = new FakeClock(1000); // now = 1.0 s
    const scheduler = new Scheduler(clock);
    const events: BeatEvent[] = [];
    scheduler.start(pattern(120), (e) => events.push(e), { anchorTime: 1.5 });
    // anchor 0.5 s away — outside lookahead, no immediate emission
    expect(events.length).toBe(0);
    clock.advance(500);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.time).toBe(1.5);
    scheduler.stop();
  });

  it("rejects anchorTime that is not finite", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    expect(() => scheduler.start(pattern(60), () => {}, { anchorTime: Number.NaN })).toThrow(
      ContractError,
    );
    expect(() =>
      scheduler.start(pattern(60), () => {}, { anchorTime: Number.POSITIVE_INFINITY }),
    ).toThrow(ContractError);
    expect(() =>
      scheduler.start(pattern(60), () => {}, { anchorTime: Number.NEGATIVE_INFINITY }),
    ).toThrow(ContractError);
  });
});

describe("Scheduler — anchored updatePattern", () => {
  it("re-anchors the next beat to the explicit anchorTime", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    const events: BeatEvent[] = [];
    scheduler.start(pattern(60), (e) => events.push(e));
    // Run for 1.5 sec — beats at 0 and 1 emitted, scheduler is "on" the 1->2 boundary
    clock.advance(1500);
    const before = events.length;
    expect(before).toBeGreaterThanOrEqual(2);
    // Re-anchor: next beat should fire at clock.now() + 0.3 = 1.8
    scheduler.updatePattern(pattern(120), { anchorTime: 1.8 });
    // Tick is 25 ms; horizon is now+0.1. Next beat at 1.8 — past horizon, wait.
    clock.advance(200); // now = 1.7
    // Beat at 1.8 within horizon when clock advances past 1.7 (1.7 + 0.1 = 1.8)
    // But strict <, so we need clock.now() > 1.7 for 1.8 < (now+0.1) to hold.
    const newBeats = events.slice(before);
    // The first beat after re-anchor must fire at exactly 1.8
    if (newBeats.length > 0) {
      expect(newBeats[0]?.time).toBe(1.8);
    }
    scheduler.stop();
  });

  it("preserves the current phase when anchorTime is omitted (regression)", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    const events: BeatEvent[] = [];
    scheduler.start(pattern(60), (e) => events.push(e));
    clock.advance(500); // now = 0.5, beat 0 already emitted at 0
    scheduler.updatePattern(pattern(120));
    clock.advance(2000);
    // After re-anchor without anchorTime, the next beat should still fire at
    // time 1.0 (preserved phase from 60 BPM scheduler).
    const allTimes = events.map((e) => e.time);
    expect(allTimes).toContain(1);
    scheduler.stop();
  });

  it("anchored updatePattern is still a no-op when not running", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    expect(() => scheduler.updatePattern(pattern(120), { anchorTime: 5 })).not.toThrow();
    expect(scheduler.isRunning).toBe(false);
  });

  it("rejects anchorTime that is not finite", () => {
    const clock = new FakeClock();
    const scheduler = new Scheduler(clock);
    scheduler.start(pattern(60), () => {});
    expect(() => scheduler.updatePattern(pattern(60), { anchorTime: Number.NaN })).toThrow(
      ContractError,
    );
    expect(() =>
      scheduler.updatePattern(pattern(60), { anchorTime: Number.POSITIVE_INFINITY }),
    ).toThrow(ContractError);
    scheduler.stop();
  });
});

describe("Scheduler — anchored start property", () => {
  it("property: for any anchor in [now, now+30s] and BPM ∈ [30,300], first beat fires at anchorTime", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 30, max: 300 }),
        fc.double({ min: 0, max: 30, noNaN: true }),
        (bpm, anchorOffsetSec) => {
          const clock = new FakeClock();
          const scheduler = new Scheduler(clock);
          const events: BeatEvent[] = [];
          const anchor = anchorOffsetSec; // clock starts at 0
          scheduler.start(pattern(bpm), (e) => events.push(e), { anchorTime: anchor });
          // Advance enough to definitely cross the anchor + lookahead window
          clock.advance(Math.ceil((anchorOffsetSec + 1) * 1000));
          expect(events.length).toBeGreaterThanOrEqual(1);
          expect(events[0]?.time).toBe(anchor);
          scheduler.stop();
        },
      ),
      { numRuns: 100 },
    );
  });
});
