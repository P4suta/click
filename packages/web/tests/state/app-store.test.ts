import { MAX_BPM, MIN_BPM, type TempoAction } from "@click/core";
import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import { createAppStore } from "../../src/state/app-store";

describe("createAppStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts in the default state", () => {
    const store = createAppStore();
    expect(store.state().isPlaying).toBe(false);
    expect(store.state().bpm).toBe(120);
  });

  it("dispatch updates state via the core reducer", () => {
    const store = createAppStore();
    store.dispatch({ type: "SET_BPM", bpm: 140 });
    expect(store.state().bpm).toBe(140);
  });

  it("does not persist when persistence is not enabled", () => {
    const store = createAppStore();
    store.dispatch({ type: "SET_BPM", bpm: 140 });
    expect(localStorage.getItem("click:tempo-state:v1")).toBeNull();
  });

  it("persists when enabled", () => {
    const store = createAppStore();
    store.enablePersistence();
    store.dispatch({ type: "SET_BPM", bpm: 140 });
    const raw = localStorage.getItem("click:tempo-state:v1");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).bpm).toBe(140);
  });

  it("hydrates from previously persisted state", () => {
    localStorage.setItem("click:tempo-state:v1", JSON.stringify({ bpm: 99, sound: "wood" }));
    const store = createAppStore();
    expect(store.state().bpm).toBe(99);
    expect(store.state().sound).toBe("wood");
  });

  it("ignores corrupted persisted state", () => {
    localStorage.setItem("click:tempo-state:v1", "{not-json");
    const store = createAppStore();
    expect(store.state().bpm).toBe(120);
  });
});

// ----------------------------------------------------------------------------
// Property-based tests
// ----------------------------------------------------------------------------

/**
 * `SET_BPM` is the canonical state-replacement action: the reducer clamps the
 * incoming BPM into `[MIN_BPM, MAX_BPM]`, rounds to integer, and otherwise
 * keeps the rest of the state untouched. We mirror that clamp here so the
 * property doesn't reach into production internals.
 */
const expectedClampedBpm = (bpm: number): number => {
  if (!Number.isFinite(bpm)) return MIN_BPM;
  const rounded = Math.round(bpm);
  if (rounded < MIN_BPM) return MIN_BPM;
  if (rounded > MAX_BPM) return MAX_BPM;
  return rounded;
};

const finiteBpmArb = fc.double({ min: -10_000, max: 10_000, noNaN: true });

const playStopActionArb: fc.Arbitrary<TempoAction> = fc.constantFrom<TempoAction>(
  { type: "PLAY" },
  { type: "STOP" },
  { type: "TOGGLE_PLAY" },
);

describe("AppStore — properties", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("property: dispatching SET_BPM is monotonic state-replacement — final BPM equals last clamped value", () => {
    fc.assert(
      fc.property(fc.array(finiteBpmArb, { minLength: 1, maxLength: 32 }), (bpms) => {
        localStorage.clear();
        const store = createAppStore();
        for (const bpm of bpms) {
          store.dispatch({ type: "SET_BPM", bpm });
        }
        const lastBpm = bpms[bpms.length - 1] as number;
        expect(store.state().bpm).toBe(expectedClampedBpm(lastBpm));
        // Invariant: BPM is always within bounds, regardless of intermediate noise.
        expect(store.state().bpm).toBeGreaterThanOrEqual(MIN_BPM);
        expect(store.state().bpm).toBeLessThanOrEqual(MAX_BPM);
      }),
      { numRuns: 60 },
    );
  });

  it("property: dispatch never throws on arbitrary PLAY/STOP/TOGGLE_PLAY chains", () => {
    fc.assert(
      fc.property(fc.array(playStopActionArb, { minLength: 0, maxLength: 64 }), (actions) => {
        localStorage.clear();
        const store = createAppStore();
        expect(() => {
          for (const action of actions) {
            store.dispatch(action);
          }
        }).not.toThrow();
        // Liveness sanity: state.isPlaying is always a boolean after the chain.
        expect(typeof store.state().isPlaying).toBe("boolean");
      }),
      { numRuns: 60 },
    );
  });
});
