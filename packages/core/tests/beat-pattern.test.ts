import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generateBeatPattern } from "../src/beat-pattern";
import { ContractError } from "../src/contracts";
import type { Subdivision, TimeSignature } from "../src/types";

const FOUR_FOUR: TimeSignature = { numerator: 4, denominator: 4 };
const THREE_FOUR: TimeSignature = { numerator: 3, denominator: 4 };
const SIX_EIGHT: TimeSignature = { numerator: 6, denominator: 8 };

describe("generateBeatPattern — basic shape", () => {
  it("at 60 BPM 4/4 produces 4 beats one second apart over a 4-second measure", () => {
    const pattern = generateBeatPattern({
      bpm: 60,
      timeSignature: FOUR_FOUR,
      accentPattern: [true, false, false, false],
      subdivision: 1,
    });
    expect(pattern.beats).toHaveLength(4);
    expect(pattern.beats.map((b) => b.time)).toEqual([0, 1, 2, 3]);
    expect(pattern.measureDurationSec).toBe(4);
  });

  it("at 120 BPM 4/4 produces beats at 0, 0.5, 1.0, 1.5", () => {
    const pattern = generateBeatPattern({
      bpm: 120,
      timeSignature: FOUR_FOUR,
      accentPattern: [true, false, false, false],
      subdivision: 1,
    });
    expect(pattern.beats.map((b) => b.time)).toEqual([0, 0.5, 1.0, 1.5]);
    expect(pattern.measureDurationSec).toBe(2);
  });

  it("3/4 at 60 BPM produces 3 beats and a 3 second measure", () => {
    const pattern = generateBeatPattern({
      bpm: 60,
      timeSignature: THREE_FOUR,
      accentPattern: [true, false, false],
      subdivision: 1,
    });
    expect(pattern.beats).toHaveLength(3);
    expect(pattern.measureDurationSec).toBe(3);
  });

  it("6/8 at 120 BPM uses an eighth-note pulse (so 6 beats per 1.5 second measure)", () => {
    const pattern = generateBeatPattern({
      bpm: 120,
      timeSignature: SIX_EIGHT,
      accentPattern: [true, false, false, true, false, false],
      subdivision: 1,
    });
    expect(pattern.beats).toHaveLength(6);
    expect(pattern.measureDurationSec).toBeCloseTo(1.5, 5);
    expect(pattern.beats[0]?.time).toBe(0);
    expect(pattern.beats[1]?.time).toBeCloseTo(0.25, 5);
  });
});

describe("generateBeatPattern — accents", () => {
  it("marks beats according to accentPattern", () => {
    const pattern = generateBeatPattern({
      bpm: 120,
      timeSignature: FOUR_FOUR,
      accentPattern: [true, false, true, false],
      subdivision: 1,
    });
    expect(pattern.beats.map((b) => b.accent)).toEqual([true, false, true, false]);
  });

  it("only the main beat is accented when subdivision > 1", () => {
    const pattern = generateBeatPattern({
      bpm: 60,
      timeSignature: FOUR_FOUR,
      accentPattern: [true, false, false, false],
      subdivision: 2,
    });
    const accents = pattern.beats.map((b) => b.accent);
    expect(accents).toEqual([true, false, false, false, false, false, false, false]);
  });
});

describe("generateBeatPattern — subdivisions", () => {
  it("subdivision 2 doubles the number of events at 60 BPM 4/4", () => {
    const pattern = generateBeatPattern({
      bpm: 60,
      timeSignature: FOUR_FOUR,
      accentPattern: [true, false, false, false],
      subdivision: 2,
    });
    expect(pattern.beats).toHaveLength(8);
    expect(pattern.beats.map((b) => b.time)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  });

  it("subdivision 3 produces triplets at 60 BPM 4/4", () => {
    const pattern = generateBeatPattern({
      bpm: 60,
      timeSignature: FOUR_FOUR,
      accentPattern: [true, false, false, false],
      subdivision: 3,
    });
    expect(pattern.beats).toHaveLength(12);
    expect(pattern.beats[1]?.time).toBeCloseTo(1 / 3, 5);
    expect(pattern.beats[2]?.time).toBeCloseTo(2 / 3, 5);
  });

  it("subdivision 4 produces sixteenths", () => {
    const pattern = generateBeatPattern({
      bpm: 60,
      timeSignature: FOUR_FOUR,
      accentPattern: [true, false, false, false],
      subdivision: 4,
    });
    expect(pattern.beats).toHaveLength(16);
  });
});

describe("generateBeatPattern — beat indices", () => {
  it("beatIndex matches the parent beat for each subdivision", () => {
    const pattern = generateBeatPattern({
      bpm: 60,
      timeSignature: FOUR_FOUR,
      accentPattern: [true, false, false, false],
      subdivision: 2,
    });
    expect(pattern.beats.map((b) => b.beatIndex)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it("subdivisionIndex is 0 for the main beat and increments within the beat", () => {
    const pattern = generateBeatPattern({
      bpm: 60,
      timeSignature: FOUR_FOUR,
      accentPattern: [true, false, false, false],
      subdivision: 3,
    });
    expect(pattern.beats.map((b) => b.subdivisionIndex)).toEqual([
      0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2,
    ]);
  });
});

describe("generateBeatPattern — defensive validation", () => {
  it("throws on non-positive BPM", () => {
    expect(() =>
      generateBeatPattern({
        bpm: 0,
        timeSignature: FOUR_FOUR,
        accentPattern: [true, false, false, false],
        subdivision: 1,
      }),
    ).toThrow(RangeError);
  });

  it("throws on negative BPM", () => {
    expect(() =>
      generateBeatPattern({
        bpm: -100,
        timeSignature: FOUR_FOUR,
        accentPattern: [true, false, false, false],
        subdivision: 1,
      }),
    ).toThrow(RangeError);
  });

  it("throws on NaN BPM", () => {
    expect(() =>
      generateBeatPattern({
        bpm: Number.NaN,
        timeSignature: FOUR_FOUR,
        accentPattern: [true, false, false, false],
        subdivision: 1,
      }),
    ).toThrow(RangeError);
  });

  it("throws on numerator < 1", () => {
    expect(() =>
      generateBeatPattern({
        bpm: 120,
        timeSignature: { numerator: 0, denominator: 4 },
        accentPattern: [],
        subdivision: 1,
      }),
    ).toThrow(RangeError);
  });
});

describe("generateBeatPattern — edge handling", () => {
  it.each<Subdivision>([
    1, 2, 3, 4,
  ])("subdivision %i produces an immutable beats array", (subdivision) => {
    const pattern = generateBeatPattern({
      bpm: 90,
      timeSignature: FOUR_FOUR,
      accentPattern: [true, false, false, false],
      subdivision,
    });
    expect(Object.isFrozen(pattern)).toBe(true);
    expect(Object.isFrozen(pattern.beats)).toBe(true);
  });

  it("if accentPattern is shorter than numerator, missing beats are unaccented", () => {
    const pattern = generateBeatPattern({
      bpm: 60,
      timeSignature: FOUR_FOUR,
      accentPattern: [true],
      subdivision: 1,
    });
    expect(pattern.beats.map((b) => b.accent)).toEqual([true, false, false, false]);
  });
});

// ----------------------------------------------------------------------------
// Property-based tests
// ----------------------------------------------------------------------------

const validInputArb = fc.record({
  bpm: fc.integer({ min: 30, max: 300 }),
  timeSignature: fc.record({
    numerator: fc.integer({ min: 1, max: 16 }),
    denominator: fc.constantFrom<2 | 4 | 8 | 16>(2, 4, 8, 16),
  }),
  subdivision: fc.constantFrom<Subdivision>(1, 2, 3, 4),
  // Accent pattern length is intentionally varied (shorter / longer than
  // numerator) to exercise the "missing beats are unaccented" branch.
  accentPattern: fc.array(fc.boolean(), { minLength: 0, maxLength: 16 }),
});

describe("generateBeatPattern — properties", () => {
  it("property: beats.length === numerator * subdivision", () => {
    fc.assert(
      fc.property(validInputArb, (input) => {
        const result = generateBeatPattern(input);
        expect(result.beats.length).toBe(input.timeSignature.numerator * input.subdivision);
      }),
      { numRuns: 100 },
    );
  });

  it("property: measureDurationSec === numerator * (60/bpm) * (4/denominator)", () => {
    fc.assert(
      fc.property(validInputArb, (input) => {
        const result = generateBeatPattern(input);
        const expected =
          input.timeSignature.numerator * (60 / input.bpm) * (4 / input.timeSignature.denominator);
        // Floating-point: epsilon scaled to expected magnitude.
        expect(Math.abs(result.measureDurationSec - expected)).toBeLessThan(1e-9);
      }),
      { numRuns: 100 },
    );
  });

  it("property: beats[i].time < beats[i+1].time (strict monotonicity)", () => {
    fc.assert(
      fc.property(validInputArb, (input) => {
        const result = generateBeatPattern(input);
        for (let i = 0; i + 1 < result.beats.length; i++) {
          const a = result.beats[i];
          const b = result.beats[i + 1];
          if (!a || !b) throw new Error("unreachable: index in range by loop bound");
          expect(b.time).toBeGreaterThan(a.time);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("property: last beat time < measureDurationSec", () => {
    fc.assert(
      fc.property(validInputArb, (input) => {
        const result = generateBeatPattern(input);
        const last = result.beats[result.beats.length - 1];
        if (!last) return;
        expect(last.time).toBeLessThan(result.measureDurationSec);
      }),
      { numRuns: 100 },
    );
  });

  it("property: beats[0].time === 0", () => {
    fc.assert(
      fc.property(validInputArb, (input) => {
        const result = generateBeatPattern(input);
        expect(result.beats[0]?.time).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it("property: subdivision distribution — within a beat, time offset === subIndex * (pulseSec/subdivision)", () => {
    fc.assert(
      fc.property(validInputArb, (input) => {
        const result = generateBeatPattern(input);
        const pulseSec = (60 / input.bpm) * (4 / input.timeSignature.denominator);
        const subPulseSec = pulseSec / input.subdivision;
        for (const beat of result.beats) {
          const beatStart = beat.beatIndex * pulseSec;
          const offsetWithinBeat = beat.time - beatStart;
          const expectedOffset = beat.subdivisionIndex * subPulseSec;
          expect(Math.abs(offsetWithinBeat - expectedOffset)).toBeLessThan(1e-9);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("property: result and result.beats are frozen", () => {
    fc.assert(
      fc.property(validInputArb, (input) => {
        const result = generateBeatPattern(input);
        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result.beats)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// ----------------------------------------------------------------------------
// Contract precondition violation tests
//
// These tests exist to kill mutation-testing survivors: the `requires(...)`
// calls in generateBeatPattern() return `void` under normal inputs, so
// mutating the predicate to `true` is indistinguishable from the original
// for every test that passes valid input. The tests below pass *invalid*
// input and assert that a ContractError is thrown — which only happens if
// the original predicate is intact.
// ----------------------------------------------------------------------------

describe("generateBeatPattern — contract preconditions", () => {
  const expectPreconditionThrow = (fn: () => void) => {
    try {
      fn();
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ContractError);
      expect((err as ContractError).kind).toBe("precondition");
    }
  };

  it("throws precondition error on null input", () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
    expectPreconditionThrow(() => generateBeatPattern(null as any));
  });

  it("throws precondition error on non-object input (string)", () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
    expectPreconditionThrow(() => generateBeatPattern("nope" as any));
  });

  it("throws precondition error when timeSignature is null", () => {
    expectPreconditionThrow(() =>
      generateBeatPattern({
        bpm: 120,
        // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
        timeSignature: null as any,
        accentPattern: [true, false, false, false],
        subdivision: 1,
      }),
    );
  });

  it("throws precondition error when timeSignature is a non-object (number)", () => {
    expectPreconditionThrow(() =>
      generateBeatPattern({
        bpm: 120,
        // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
        timeSignature: 7 as any,
        accentPattern: [true],
        subdivision: 1,
      }),
    );
  });

  it("throws precondition error when accentPattern is not an array", () => {
    expectPreconditionThrow(() =>
      generateBeatPattern({
        bpm: 120,
        timeSignature: FOUR_FOUR,
        // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
        accentPattern: "not-an-array" as any,
        subdivision: 1,
      }),
    );
  });

  it("throws precondition error on subdivision outside {1,2,3,4}", () => {
    expectPreconditionThrow(() =>
      generateBeatPattern({
        bpm: 120,
        timeSignature: FOUR_FOUR,
        accentPattern: [true, false, false, false],
        // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
        subdivision: 5 as any,
      }),
    );
  });

  it("throws precondition error on subdivision 0", () => {
    expectPreconditionThrow(() =>
      generateBeatPattern({
        bpm: 120,
        timeSignature: FOUR_FOUR,
        accentPattern: [true, false, false, false],
        // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
        subdivision: 0 as any,
      }),
    );
  });

  it("throws precondition error on denominator outside {2,4,8,16}", () => {
    expectPreconditionThrow(() =>
      generateBeatPattern({
        bpm: 120,
        // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
        timeSignature: { numerator: 4, denominator: 7 as any },
        accentPattern: [true, false, false, false],
        subdivision: 1,
      }),
    );
  });

  it("throws precondition error on denominator 0", () => {
    expectPreconditionThrow(() =>
      generateBeatPattern({
        bpm: 120,
        // biome-ignore lint/suspicious/noExplicitAny: testing runtime precondition
        timeSignature: { numerator: 4, denominator: 0 as any },
        accentPattern: [true, false, false, false],
        subdivision: 1,
      }),
    );
  });
});
