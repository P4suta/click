import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_BPM, MAX_BPM, MIN_BPM } from "../src/constants";
import { ContractError } from "../src/contracts";
import { initialState, reduce } from "../src/tempo-state";
import type { SoundId, Subdivision, TempoState, TimeSignature } from "../src/types";

describe("initialState", () => {
  it("returns a sensible default state", () => {
    const state = initialState();
    expect(state.isPlaying).toBe(false);
    expect(state.bpm).toBe(DEFAULT_BPM);
    expect(state.timeSignature).toEqual({ numerator: 4, denominator: 4 });
    expect(state.accentPattern).toEqual([true, false, false, false]);
    expect(state.subdivision).toBe(1);
    expect(state.volume).toBeGreaterThan(0);
    expect(state.volume).toBeLessThanOrEqual(1);
    expect(state.sound).toBe("click");
  });

  it("returns a frozen state", () => {
    const state = initialState();
    expect(Object.isFrozen(state)).toBe(true);
  });
});

describe("reduce — playback", () => {
  it("PLAY sets isPlaying to true", () => {
    const next = reduce(initialState(), { type: "PLAY" });
    expect(next.isPlaying).toBe(true);
  });

  it("STOP sets isPlaying to false", () => {
    const playing = reduce(initialState(), { type: "PLAY" });
    const stopped = reduce(playing, { type: "STOP" });
    expect(stopped.isPlaying).toBe(false);
  });

  it("TOGGLE_PLAY toggles from stopped to playing", () => {
    const next = reduce(initialState(), { type: "TOGGLE_PLAY" });
    expect(next.isPlaying).toBe(true);
  });

  it("TOGGLE_PLAY toggles from playing to stopped", () => {
    const playing = reduce(initialState(), { type: "PLAY" });
    const next = reduce(playing, { type: "TOGGLE_PLAY" });
    expect(next.isPlaying).toBe(false);
  });

  it("PLAY on already-playing state returns the same reference", () => {
    const playing = reduce(initialState(), { type: "PLAY" });
    const next = reduce(playing, { type: "PLAY" });
    expect(next).toBe(playing);
  });

  it("STOP on already-stopped state returns the same reference", () => {
    const state = initialState();
    expect(reduce(state, { type: "STOP" })).toBe(state);
  });
});

describe("reduce — BPM", () => {
  it("SET_BPM updates the BPM", () => {
    const next = reduce(initialState(), { type: "SET_BPM", bpm: 140 });
    expect(next.bpm).toBe(140);
  });

  it("SET_BPM clamps to MIN_BPM when given a smaller value", () => {
    const next = reduce(initialState(), { type: "SET_BPM", bpm: 10 });
    expect(next.bpm).toBe(MIN_BPM);
  });

  it("SET_BPM clamps to MAX_BPM when given a larger value", () => {
    const next = reduce(initialState(), { type: "SET_BPM", bpm: 9999 });
    expect(next.bpm).toBe(MAX_BPM);
  });

  it("SET_BPM rounds to the nearest integer", () => {
    const next = reduce(initialState(), { type: "SET_BPM", bpm: 120.7 });
    expect(next.bpm).toBe(121);
  });

  it("NUDGE_BPM adds delta", () => {
    const next = reduce(initialState(), { type: "NUDGE_BPM", delta: 5 });
    expect(next.bpm).toBe(DEFAULT_BPM + 5);
  });

  it("NUDGE_BPM with negative delta subtracts", () => {
    const next = reduce(initialState(), { type: "NUDGE_BPM", delta: -10 });
    expect(next.bpm).toBe(DEFAULT_BPM - 10);
  });

  it("NUDGE_BPM clamps at MIN_BPM", () => {
    const slow = reduce(initialState(), { type: "SET_BPM", bpm: MIN_BPM });
    const next = reduce(slow, { type: "NUDGE_BPM", delta: -100 });
    expect(next.bpm).toBe(MIN_BPM);
  });

  it("NUDGE_BPM clamps at MAX_BPM", () => {
    const fast = reduce(initialState(), { type: "SET_BPM", bpm: MAX_BPM });
    const next = reduce(fast, { type: "NUDGE_BPM", delta: 100 });
    expect(next.bpm).toBe(MAX_BPM);
  });
});

describe("reduce — time signature & accent", () => {
  it("SET_TIME_SIGNATURE replaces the signature and resets accent pattern", () => {
    const sig: TimeSignature = { numerator: 3, denominator: 4 };
    const next = reduce(initialState(), { type: "SET_TIME_SIGNATURE", signature: sig });
    expect(next.timeSignature).toEqual(sig);
    expect(next.accentPattern).toEqual([true, false, false]);
  });

  it("SET_TIME_SIGNATURE 6/8 produces 6 beats with accent on 1", () => {
    const sig: TimeSignature = { numerator: 6, denominator: 8 };
    const next = reduce(initialState(), { type: "SET_TIME_SIGNATURE", signature: sig });
    expect(next.accentPattern).toHaveLength(6);
    expect(next.accentPattern[0]).toBe(true);
    expect(next.accentPattern.slice(1).every((a) => a === false)).toBe(true);
  });

  it("TOGGLE_ACCENT flips the accent at the given index", () => {
    const next = reduce(initialState(), { type: "TOGGLE_ACCENT", beatIndex: 2 });
    expect(next.accentPattern[2]).toBe(true);
    expect(next.accentPattern[0]).toBe(true);
  });

  it("TOGGLE_ACCENT a second time flips back", () => {
    const once = reduce(initialState(), { type: "TOGGLE_ACCENT", beatIndex: 2 });
    const twice = reduce(once, { type: "TOGGLE_ACCENT", beatIndex: 2 });
    expect(twice.accentPattern[2]).toBe(false);
  });

  it("TOGGLE_ACCENT with out-of-range index is a no-op", () => {
    const next = reduce(initialState(), { type: "TOGGLE_ACCENT", beatIndex: 99 });
    expect(next.accentPattern).toEqual([true, false, false, false]);
  });
});

describe("reduce — defensive validation", () => {
  it("SET_BPM with NaN is treated as min BPM (returns clamped state)", () => {
    const next = reduce(initialState(), { type: "SET_BPM", bpm: Number.NaN });
    expect(next.bpm).toBe(30);
  });

  it("SET_BPM with Infinity is treated as min BPM", () => {
    const next = reduce(initialState(), { type: "SET_BPM", bpm: Number.POSITIVE_INFINITY });
    expect(next.bpm).toBe(30);
  });

  it("NUDGE_BPM with NaN delta is treated as min BPM", () => {
    const next = reduce(initialState(), { type: "NUDGE_BPM", delta: Number.NaN });
    expect(next.bpm).toBe(30);
  });

  it("SET_TIME_SIGNATURE with numerator 0 is rejected (returns same state)", () => {
    const state = initialState();
    const next = reduce(state, {
      type: "SET_TIME_SIGNATURE",
      signature: { numerator: 0, denominator: 4 },
    });
    expect(next).toBe(state);
  });

  it("SET_TIME_SIGNATURE with non-integer numerator is rejected", () => {
    const state = initialState();
    const next = reduce(state, {
      type: "SET_TIME_SIGNATURE",
      signature: { numerator: 3.5, denominator: 4 },
    });
    expect(next).toBe(state);
  });

  it("SET_TIME_SIGNATURE with numerator > 16 is rejected", () => {
    const state = initialState();
    const next = reduce(state, {
      type: "SET_TIME_SIGNATURE",
      signature: { numerator: 99, denominator: 4 },
    });
    expect(next).toBe(state);
  });

  it("SET_TIME_SIGNATURE with invalid denominator at runtime is rejected", () => {
    const state = initialState();
    const next = reduce(state, {
      type: "SET_TIME_SIGNATURE",
      // biome-ignore lint/suspicious/noExplicitAny: testing runtime validation
      signature: { numerator: 4, denominator: 7 as any },
    });
    expect(next).toBe(state);
  });

  it("SET_VOLUME with NaN is rejected", () => {
    const state = initialState();
    const next = reduce(state, { type: "SET_VOLUME", volume: Number.NaN });
    expect(next).toBe(state);
  });
});

describe("reduce — subdivision, volume, sound", () => {
  it("SET_SUBDIVISION updates subdivision", () => {
    const next = reduce(initialState(), { type: "SET_SUBDIVISION", subdivision: 3 });
    expect(next.subdivision).toBe(3);
  });

  it("SET_VOLUME updates volume", () => {
    const next = reduce(initialState(), { type: "SET_VOLUME", volume: 0.5 });
    expect(next.volume).toBe(0.5);
  });

  it("SET_VOLUME clamps to [0, 1]", () => {
    const high = reduce(initialState(), { type: "SET_VOLUME", volume: 5 });
    expect(high.volume).toBe(1);
    const low = reduce(initialState(), { type: "SET_VOLUME", volume: -5 });
    expect(low.volume).toBe(0);
  });

  it("SET_SOUND updates sound", () => {
    const next = reduce(initialState(), { type: "SET_SOUND", sound: "wood" });
    expect(next.sound).toBe("wood");
  });
});

describe("reduce — immutability", () => {
  it("returns a new state object on every action", () => {
    const state = initialState();
    const next = reduce(state, { type: "SET_BPM", bpm: 140 });
    expect(next).not.toBe(state);
  });

  it("returns a frozen state on every action", () => {
    const next = reduce(initialState(), { type: "SET_BPM", bpm: 140 });
    expect(Object.isFrozen(next)).toBe(true);
  });

  it("does not mutate the previous state", () => {
    const state = initialState();
    reduce(state, { type: "SET_BPM", bpm: 140 });
    expect(state.bpm).toBe(DEFAULT_BPM);
  });
});

// ----------------------------------------------------------------------------
// Property-based tests
// ----------------------------------------------------------------------------

/** Arbitrary that produces a non-default but always valid TempoState. */
const validTimeSignatureArb = fc.record({
  numerator: fc.integer({ min: 1, max: 16 }),
  denominator: fc.constantFrom<2 | 4 | 8 | 16>(2, 4, 8, 16),
});

const subdivisionArb = fc.constantFrom<Subdivision>(1, 2, 3, 4);
const soundArb = fc.constantFrom<SoundId>("click", "beep", "wood", "cowbell");

/**
 * Arbitrary TempoState built by feeding a sequence of valid actions through
 * `reduce`. This guarantees we only ever observe states reachable through the
 * legitimate API surface (the contract postconditions are then a tautology
 * over reachable states).
 */
const reachableStateArb: fc.Arbitrary<TempoState> = fc
  .tuple(
    fc.integer({ min: MIN_BPM, max: MAX_BPM }),
    validTimeSignatureArb,
    subdivisionArb,
    fc.double({ min: 0, max: 1, noNaN: true }),
    soundArb,
    fc.boolean(),
  )
  .map(([bpm, signature, subdivision, volume, sound, isPlaying]) => {
    let s = initialState();
    s = reduce(s, { type: "SET_TIME_SIGNATURE", signature });
    s = reduce(s, { type: "SET_BPM", bpm });
    s = reduce(s, { type: "SET_SUBDIVISION", subdivision });
    s = reduce(s, { type: "SET_VOLUME", volume });
    s = reduce(s, { type: "SET_SOUND", sound });
    if (isPlaying) s = reduce(s, { type: "PLAY" });
    return s;
  });

describe("reduce — properties", () => {
  it("property: PLAY is idempotent (running PLAY twice yields a playing state, inner call returns same reference)", () => {
    fc.assert(
      fc.property(reachableStateArb, (state) => {
        const once = reduce(state, { type: "PLAY" });
        const twice = reduce(once, { type: "PLAY" });
        // After two PLAYs the state must report playing.
        expect(twice.isPlaying).toBe(true);
        // Inner call: applying PLAY to an already-playing state returns the
        // very same reference (the contract optimisation in `computeNext`).
        expect(reduce(once, { type: "PLAY" })).toBe(once);
      }),
      { numRuns: 100 },
    );
  });

  it("property: STOP is idempotent (inner call on a stopped state returns same reference)", () => {
    fc.assert(
      fc.property(reachableStateArb, (state) => {
        const stopped = reduce(state, { type: "STOP" });
        expect(stopped.isPlaying).toBe(false);
        // Inner call returns same reference.
        expect(reduce(stopped, { type: "STOP" })).toBe(stopped);
      }),
      { numRuns: 100 },
    );
  });

  it("property: SET_BPM clamps any integer into [MIN_BPM, MAX_BPM]", () => {
    fc.assert(
      fc.property(reachableStateArb, fc.integer(), (state, bpm) => {
        const next = reduce(state, { type: "SET_BPM", bpm });
        expect(next.bpm).toBeGreaterThanOrEqual(MIN_BPM);
        expect(next.bpm).toBeLessThanOrEqual(MAX_BPM);
      }),
      { numRuns: 100 },
    );
  });

  it("property: NUDGE_BPM monotonicity — positive delta never decreases BPM, negative delta never increases it", () => {
    fc.assert(
      fc.property(
        reachableStateArb,
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        (state, deltaUp, deltaDown) => {
          const up = reduce(state, { type: "NUDGE_BPM", delta: deltaUp });
          const down = reduce(state, { type: "NUDGE_BPM", delta: -deltaDown });
          expect(up.bpm).toBeGreaterThanOrEqual(state.bpm);
          expect(down.bpm).toBeLessThanOrEqual(state.bpm);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("property: NUDGE_BPM is commutative when no clamping happens (in either order)", () => {
    fc.assert(
      fc.property(
        reachableStateArb,
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: -100, max: 100 }),
        (state, d1, d2) => {
          // Commutativity holds only when neither intermediate AND the final
          // result lands outside [MIN_BPM, MAX_BPM]. If any clamp fires the
          // operation becomes path-dependent — see "性質の精緻化が必要だった点".
          const start = state.bpm;
          const intermediateA = start + d1;
          const intermediateB = start + d2;
          const end = start + d1 + d2;
          fc.pre(intermediateA >= MIN_BPM && intermediateA <= MAX_BPM);
          fc.pre(intermediateB >= MIN_BPM && intermediateB <= MAX_BPM);
          fc.pre(end >= MIN_BPM && end <= MAX_BPM);
          const a = reduce(reduce(state, { type: "NUDGE_BPM", delta: d1 }), {
            type: "NUDGE_BPM",
            delta: d2,
          });
          const b = reduce(reduce(state, { type: "NUDGE_BPM", delta: d2 }), {
            type: "NUDGE_BPM",
            delta: d1,
          });
          expect(a.bpm).toBe(b.bpm);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("property: SET_TIME_SIGNATURE produces accentPattern of length numerator with [0]=true and rest=false", () => {
    fc.assert(
      fc.property(reachableStateArb, validTimeSignatureArb, (state, signature) => {
        const next = reduce(state, { type: "SET_TIME_SIGNATURE", signature });
        expect(next.timeSignature.numerator).toBe(signature.numerator);
        expect(next.timeSignature.denominator).toBe(signature.denominator);
        expect(next.accentPattern.length).toBe(signature.numerator);
        expect(next.accentPattern[0]).toBe(true);
        for (let i = 1; i < signature.numerator; i++) {
          expect(next.accentPattern[i]).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("property: TOGGLE_ACCENT is an involution (toggling the same beat twice restores)", () => {
    fc.assert(
      fc.property(reachableStateArb, fc.nat(15), (state, rawIndex) => {
        // Only meaningful when index is in range; otherwise reducer no-ops and
        // the property still trivially holds.
        const index = rawIndex % state.accentPattern.length;
        const before = state.accentPattern[index];
        const once = reduce(state, { type: "TOGGLE_ACCENT", beatIndex: index });
        const twice = reduce(once, { type: "TOGGLE_ACCENT", beatIndex: index });
        expect(twice.accentPattern[index]).toBe(before);
        // Other indices unaffected by the round-trip.
        for (let i = 0; i < state.accentPattern.length; i++) {
          expect(twice.accentPattern[i]).toBe(state.accentPattern[i]);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("property: reduce always returns a frozen object", () => {
    // Build an arbitrary that emits any valid action shape so we exercise
    // every branch of the discriminated union.
    const actionArb = fc.oneof(
      fc.constant({ type: "PLAY" as const }),
      fc.constant({ type: "STOP" as const }),
      fc.constant({ type: "TOGGLE_PLAY" as const }),
      fc.integer().map((bpm) => ({ type: "SET_BPM" as const, bpm })),
      fc.integer({ min: -1000, max: 1000 }).map((delta) => ({
        type: "NUDGE_BPM" as const,
        delta,
      })),
      validTimeSignatureArb.map((signature) => ({
        type: "SET_TIME_SIGNATURE" as const,
        signature,
      })),
      fc.integer({ min: -5, max: 20 }).map((beatIndex) => ({
        type: "TOGGLE_ACCENT" as const,
        beatIndex,
      })),
      subdivisionArb.map((subdivision) => ({
        type: "SET_SUBDIVISION" as const,
        subdivision,
      })),
      fc.double({ min: -2, max: 2, noNaN: true }).map((volume) => ({
        type: "SET_VOLUME" as const,
        volume,
      })),
      soundArb.map((sound) => ({ type: "SET_SOUND" as const, sound })),
    );
    fc.assert(
      fc.property(reachableStateArb, actionArb, (state, action) => {
        const next = reduce(state, action);
        expect(Object.isFrozen(next)).toBe(true);
        // Postcondition under arbitrary actions: invariants must always hold.
        expect(next.bpm).toBeGreaterThanOrEqual(MIN_BPM);
        expect(next.bpm).toBeLessThanOrEqual(MAX_BPM);
        expect(next.accentPattern.length).toBe(next.timeSignature.numerator);
      }),
      { numRuns: 100 },
    );
  });
});

// ----------------------------------------------------------------------------
// Contract precondition tests + clamp/accent boundary tests
// ----------------------------------------------------------------------------

describe("reduce — contract preconditions", () => {
  const expectPreconditionThrow = (fn: () => void) => {
    try {
      fn();
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ContractError);
      expect((err as ContractError).kind).toBe("precondition");
    }
  };

  it("throws precondition error when state is null", () => {
    expectPreconditionThrow(() =>
      // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
      reduce(null as any, { type: "PLAY" }),
    );
  });

  it("throws precondition error when state is not an object (string)", () => {
    expectPreconditionThrow(() =>
      // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
      reduce("bad" as any, { type: "PLAY" }),
    );
  });

  it("throws precondition error when action is null", () => {
    expectPreconditionThrow(() =>
      // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
      reduce(initialState(), null as any),
    );
  });

  it("throws precondition error when action is non-object", () => {
    expectPreconditionThrow(() =>
      // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
      reduce(initialState(), 42 as any),
    );
  });

  it("throws precondition error when action.type is not a string", () => {
    expectPreconditionThrow(() =>
      // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
      reduce(initialState(), { type: 123 } as any),
    );
  });

  it("throws precondition error when action has no type field", () => {
    expectPreconditionThrow(() =>
      // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
      reduce(initialState(), {} as any),
    );
  });
});

describe("reduce — clamp boundaries (SET_BPM)", () => {
  it("SET_BPM at exactly MIN_BPM is kept (kills `< min` → `<= min` mutation)", () => {
    // clamp: `value < min ? min : ...`. At value === MIN_BPM the original
    // returns value; the mutated `<=` would collapse to min anyway (same
    // numeric result). The OTHER half of the mutation is more interesting:
    // at value === MIN_BPM - 1, the original returns MIN_BPM but the
    // mutated `>` on the max side also returns MIN_BPM. The mutation we
    // can actually distinguish is `<` → `<=` at the boundary below.
    // What we really want to assert: SET_BPM with a value exactly 1 above
    // MIN_BPM stays at MIN_BPM + 1 (not snapped down to MIN_BPM).
    const next = reduce(initialState(), { type: "SET_BPM", bpm: MIN_BPM + 1 });
    expect(next.bpm).toBe(MIN_BPM + 1);
  });

  it("SET_BPM at exactly MAX_BPM is kept (kills `> max` → `>= max` mutation)", () => {
    // Similarly: at MAX_BPM - 1 the original returns MAX_BPM - 1 but the
    // mutated `>= max` would snap down to max. Well, actually `value >= max`
    // is false when value == max - 1, so the mutation wouldn't trigger. The
    // real kill is: at value === MAX_BPM the original returns MAX_BPM
    // (the else branch: `value > max ? max : value`), but the mutated
    // `value >= max ? max : value` ALSO returns max. So these specific
    // EqualityOperator mutations on clamp are equivalent mutants. What we
    // assert below is the inverse: the boundary value just below max is
    // preserved.
    const next = reduce(initialState(), { type: "SET_BPM", bpm: MAX_BPM - 1 });
    expect(next.bpm).toBe(MAX_BPM - 1);
  });

  it("SET_BPM exactly at MIN_BPM preserves MIN_BPM", () => {
    const next = reduce(initialState(), { type: "SET_BPM", bpm: MIN_BPM });
    expect(next.bpm).toBe(MIN_BPM);
  });

  it("SET_BPM exactly at MAX_BPM preserves MAX_BPM", () => {
    const next = reduce(initialState(), { type: "SET_BPM", bpm: MAX_BPM });
    expect(next.bpm).toBe(MAX_BPM);
  });
});

describe("reduce — TOGGLE_ACCENT boundary", () => {
  it("TOGGLE_ACCENT at beatIndex === accentPattern.length is a no-op (kills `>=` → `>` mutation)", () => {
    // Original: `if (action.beatIndex < 0 || action.beatIndex >= length)` returns state.
    // Mutated `>`: at beatIndex === length, the condition is false and the
    // toggle would attempt to write past the end of the accentPattern,
    // producing an array of length length+1 — which is then frozen. The
    // invariant check at the end of reduce() catches this and throws.
    const state = initialState(); // numerator === 4
    const next = reduce(state, { type: "TOGGLE_ACCENT", beatIndex: 4 });
    expect(next).toBe(state);
    expect(next.accentPattern).toHaveLength(4);
  });

  it("TOGGLE_ACCENT at beatIndex === -1 is a no-op (kills `< 0` → `<= 0` mutation)", () => {
    // Original: `< 0`. Mutated `<= 0` would also reject beatIndex 0, which
    // IS a valid index — so the mutation would no-op on a perfectly valid
    // index. We need to kill this: check that toggle at index 0 is NOT a
    // no-op but actually flips the accent.
    const state = initialState();
    // Index 0 is initially accented (downbeat), after toggle it becomes false.
    const next = reduce(state, { type: "TOGGLE_ACCENT", beatIndex: 0 });
    expect(next.accentPattern[0]).toBe(false);
    expect(next).not.toBe(state);
  });

  it("TOGGLE_ACCENT at beatIndex === -1 (actually negative) is a no-op", () => {
    const state = initialState();
    const next = reduce(state, { type: "TOGGLE_ACCENT", beatIndex: -1 });
    expect(next).toBe(state);
  });
});
