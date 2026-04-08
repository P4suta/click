import { MAX_BPM, MIN_BPM, type SoundId, type TempoState, initialState } from "@click/core";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPersisted, savePersisted } from "../../src/state/persistence";

describe("persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when nothing is stored", () => {
    expect(loadPersisted()).toBeNull();
  });

  it("round-trips a state subset", () => {
    const state = initialState();
    savePersisted(state);
    const loaded = loadPersisted();
    expect(loaded).toMatchObject({ bpm: state.bpm, volume: state.volume });
  });

  it("loadPersisted returns null when JSON is corrupted", () => {
    localStorage.setItem("click:tempo-state:v1", "@@@");
    expect(loadPersisted()).toBeNull();
  });

  it("savePersisted swallows quota errors silently", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => savePersisted(initialState())).not.toThrow();
    spy.mockRestore();
  });

  it("rejects out-of-range BPM", () => {
    localStorage.setItem("click:tempo-state:v1", JSON.stringify({ bpm: 9999 }));
    expect(loadPersisted()).toBeNull();
  });

  it("rejects non-finite BPM", () => {
    localStorage.setItem("click:tempo-state:v1", JSON.stringify({ bpm: "fast" }));
    expect(loadPersisted()).toBeNull();
  });

  it("rejects time signature with bad denominator", () => {
    localStorage.setItem(
      "click:tempo-state:v1",
      JSON.stringify({ timeSignature: { numerator: 4, denominator: 7 } }),
    );
    expect(loadPersisted()).toBeNull();
  });

  it("rejects time signature with non-integer numerator", () => {
    localStorage.setItem(
      "click:tempo-state:v1",
      JSON.stringify({ timeSignature: { numerator: 3.5, denominator: 4 } }),
    );
    expect(loadPersisted()).toBeNull();
  });

  it("rejects time signature with numerator 0", () => {
    localStorage.setItem(
      "click:tempo-state:v1",
      JSON.stringify({ timeSignature: { numerator: 0, denominator: 4 } }),
    );
    expect(loadPersisted()).toBeNull();
  });

  it("rejects time signature missing fields", () => {
    localStorage.setItem("click:tempo-state:v1", JSON.stringify({ timeSignature: {} }));
    expect(loadPersisted()).toBeNull();
  });

  it("rejects time signature when value is not an object", () => {
    localStorage.setItem("click:tempo-state:v1", JSON.stringify({ timeSignature: "4/4" }));
    expect(loadPersisted()).toBeNull();
  });

  it("rejects accent pattern with wrong length", () => {
    localStorage.setItem(
      "click:tempo-state:v1",
      JSON.stringify({
        timeSignature: { numerator: 4, denominator: 4 },
        accentPattern: [true, false],
      }),
    );
    const loaded = loadPersisted();
    expect(loaded?.accentPattern).toBeUndefined();
    expect(loaded?.timeSignature).toBeDefined();
  });

  it("rejects accent pattern with non-boolean elements", () => {
    localStorage.setItem(
      "click:tempo-state:v1",
      JSON.stringify({
        timeSignature: { numerator: 4, denominator: 4 },
        accentPattern: [1, 0, 0, 0],
      }),
    );
    const loaded = loadPersisted();
    expect(loaded?.accentPattern).toBeUndefined();
  });

  it("rejects accent pattern when value is not an array", () => {
    localStorage.setItem(
      "click:tempo-state:v1",
      JSON.stringify({
        timeSignature: { numerator: 4, denominator: 4 },
        accentPattern: "true,false",
      }),
    );
    const loaded = loadPersisted();
    expect(loaded?.accentPattern).toBeUndefined();
  });

  it("rejects out-of-range volume", () => {
    localStorage.setItem("click:tempo-state:v1", JSON.stringify({ volume: 5 }));
    expect(loadPersisted()).toBeNull();
  });

  it("rejects unknown sound id", () => {
    localStorage.setItem("click:tempo-state:v1", JSON.stringify({ sound: "xyz" }));
    expect(loadPersisted()).toBeNull();
  });

  it("rejects unknown subdivision", () => {
    localStorage.setItem("click:tempo-state:v1", JSON.stringify({ subdivision: 7 }));
    expect(loadPersisted()).toBeNull();
  });

  it("rejects when raw is not an object", () => {
    localStorage.setItem("click:tempo-state:v1", JSON.stringify(42));
    expect(loadPersisted()).toBeNull();
  });

  it("accepts a valid full state", () => {
    const state = initialState();
    savePersisted(state);
    expect(loadPersisted()).toMatchObject({
      bpm: state.bpm,
      timeSignature: state.timeSignature,
      accentPattern: state.accentPattern,
      subdivision: state.subdivision,
      volume: state.volume,
      sound: state.sound,
    });
  });
});

// ----------------------------------------------------------------------------
// Property-based tests
// ----------------------------------------------------------------------------

const PERSISTED_KEYS = new Set([
  "bpm",
  "timeSignature",
  "accentPattern",
  "subdivision",
  "volume",
  "sound",
]);

const STORAGE_KEY = "click:tempo-state:v1";

const soundArb = fc.constantFrom<SoundId>("click", "beep", "wood", "cowbell");

const subdivisionArb = fc.constantFrom<1 | 2 | 3 | 4>(1, 2, 3, 4);

const denominatorArb = fc.constantFrom<2 | 4 | 8 | 16>(2, 4, 8, 16);

/**
 * Build a valid TempoState by sampling each persisted field from an arbitrary
 * that respects the schema in `persistence.ts`. We mutate `initialState()` to
 * keep `isPlaying` and any future non-persisted fields untouched.
 */
const validTempoStateArb: fc.Arbitrary<TempoState> = fc
  .record({
    bpm: fc.integer({ min: MIN_BPM, max: MAX_BPM }),
    numerator: fc.integer({ min: 1, max: 16 }),
    denominator: denominatorArb,
    subdivision: subdivisionArb,
    volume: fc.double({ min: 0, max: 1, noNaN: true }),
    sound: soundArb,
  })
  .map(({ bpm, numerator, denominator, subdivision, volume, sound }) => {
    // Build a per-numerator accent pattern (downbeat + random rest).
    const accentPattern = Object.freeze(
      Array.from({ length: numerator }, (_, i) => i === 0),
    ) as readonly boolean[];
    return Object.freeze({
      ...initialState(),
      bpm,
      timeSignature: Object.freeze({ numerator, denominator }),
      accentPattern,
      subdivision,
      volume,
      sound,
    }) as TempoState;
  });

describe("persistence — properties", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("property: round-trip — loadPersisted after savePersisted matches the persisted subset", () => {
    fc.assert(
      fc.property(validTempoStateArb, (state) => {
        localStorage.clear();
        savePersisted(state);
        const loaded = loadPersisted();
        expect(loaded).not.toBeNull();
        // The persisted subset must be reproduced verbatim. Numbers are
        // round-tripped through JSON, so reference equality on objects does
        // not hold — use deep equality for nested fields.
        expect(loaded?.bpm).toBe(state.bpm);
        expect(loaded?.subdivision).toBe(state.subdivision);
        expect(loaded?.volume).toBe(state.volume);
        expect(loaded?.sound).toBe(state.sound);
        expect(loaded?.timeSignature).toEqual(state.timeSignature);
        expect(loaded?.accentPattern).toEqual(state.accentPattern);
      }),
      { numRuns: 60 },
    );
  });

  it("property: validation — for any unknown JSON value, loadPersisted returns null or only whitelisted keys", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (raw) => {
        localStorage.clear();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
        const loaded = loadPersisted();
        if (loaded === null) return;
        // Whatever survives must be a subset of the legal Persisted keys.
        for (const key of Object.keys(loaded)) {
          expect(PERSISTED_KEYS.has(key)).toBe(true);
        }
        // ... and have at least one entry (loadPersisted otherwise returns
        // null when the validated record is empty).
        expect(Object.keys(loaded).length).toBeGreaterThan(0);
      }),
      { numRuns: 80 },
    );
  });

  it("property: idempotent save — running savePersisted twice leaves storage unchanged", () => {
    fc.assert(
      fc.property(validTempoStateArb, (state) => {
        localStorage.clear();
        savePersisted(state);
        const first = localStorage.getItem(STORAGE_KEY);
        savePersisted(state);
        const second = localStorage.getItem(STORAGE_KEY);
        expect(second).toBe(first);
      }),
      { numRuns: 60 },
    );
  });
});
