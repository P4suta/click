import type { SoundId } from "@click/core";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { playClick } from "../../src/audio/sound-bank";

const makeContext = () => {
  const osc = {
    type: "" as OscillatorType,
    frequency: { value: 0 },
    connect: vi.fn().mockReturnThis(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const gain = {
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn().mockReturnThis(),
  };
  const ctx = {
    createOscillator: vi.fn(() => osc),
    createGain: vi.fn(() => gain),
  };
  // biome-ignore lint/suspicious/noExplicitAny: test stub
  return { ctx: ctx as any, osc, gain };
};

describe("playClick", () => {
  it("schedules an oscillator at the requested time", () => {
    const { ctx, osc } = makeContext();
    playClick({
      context: ctx,
      destination: ctx,
      time: 1.5,
      accent: false,
      sound: "click",
      volume: 0.8,
    });
    expect(osc.start).toHaveBeenCalledWith(1.5);
  });

  it("uses accent frequency when accent is true", () => {
    const { ctx, osc } = makeContext();
    playClick({
      context: ctx,
      destination: ctx,
      time: 0,
      accent: true,
      sound: "click",
      volume: 0.8,
    });
    expect(osc.frequency.value).toBeGreaterThan(1000);
  });

  it("falls back to the default voice on unknown sound id", () => {
    const { ctx, osc } = makeContext();
    playClick({
      context: ctx,
      destination: ctx,
      time: 0,
      accent: false,
      // biome-ignore lint/suspicious/noExplicitAny: testing runtime fallback
      sound: "unknown" as any,
      volume: 0.8,
    });
    expect(osc.start).toHaveBeenCalled();
  });

  it("skips synthesis entirely when volume is zero", () => {
    const { ctx, osc } = makeContext();
    playClick({
      context: ctx,
      destination: ctx,
      time: 0,
      accent: false,
      sound: "click",
      volume: 0,
    });
    expect(osc.start).not.toHaveBeenCalled();
  });

  it.each([
    "click",
    "beep",
    "wood",
    "cowbell",
  ] as const)("renders the %s voice without throwing", (sound) => {
    const { ctx } = makeContext();
    expect(() =>
      playClick({ context: ctx, destination: ctx, time: 0, accent: false, sound, volume: 0.5 }),
    ).not.toThrow();
  });
});

// ----------------------------------------------------------------------------
// Property-based tests
// ----------------------------------------------------------------------------

const soundArb = fc.constantFrom<SoundId>("click", "beep", "wood", "cowbell");

describe("playClick — properties", () => {
  it("property: never throws on valid input combinations", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.double({ min: 0, max: 1, noNaN: true }),
        soundArb,
        fc.double({ min: 0, max: 3600, noNaN: true }),
        (accent, volume, sound, time) => {
          const { ctx } = makeContext();
          expect(() =>
            playClick({
              context: ctx,
              destination: ctx,
              time,
              accent,
              sound,
              volume,
            }),
          ).not.toThrow();
        },
      ),
      { numRuns: 80 },
    );
  });

  it("property: mute — when volume === 0, no oscillator is started", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        soundArb,
        fc.double({ min: 0, max: 3600, noNaN: true }),
        (accent, sound, time) => {
          const { ctx, osc } = makeContext();
          playClick({
            context: ctx,
            destination: ctx,
            time,
            accent,
            sound,
            volume: 0,
          });
          expect(osc.start).not.toHaveBeenCalled();
          // Also: no oscillator was even constructed (the early-return path).
          expect(ctx.createOscillator).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 60 },
    );
  });

  it("property: schedule consistency — when volume > 0, osc.start receives args.time exactly", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        // Strictly positive volume; the production code's branch is `volume <= 0`,
        // so any value > 0 must reach the scheduling path.
        fc.double({ min: Number.MIN_VALUE, max: 1, noNaN: true }),
        soundArb,
        fc.double({ min: 0, max: 3600, noNaN: true }),
        (accent, volume, sound, time) => {
          const { ctx, osc } = makeContext();
          playClick({
            context: ctx,
            destination: ctx,
            time,
            accent,
            sound,
            volume,
          });
          expect(osc.start).toHaveBeenCalledTimes(1);
          expect(osc.start).toHaveBeenCalledWith(time);
        },
      ),
      { numRuns: 80 },
    );
  });
});
