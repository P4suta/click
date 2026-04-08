import { Scheduler } from "@click/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeClock } from "../../../core/tests/fakes/fake-clock";
import { WebAudioPort } from "../../src/audio/web-audio-port";

const PARAMS = {
  bpm: 120,
  timeSignature: { numerator: 4, denominator: 4 } as const,
  accentPattern: [true, false, false, false],
  subdivision: 1 as const,
  volume: 0.8,
  sound: "click" as const,
};

describe("WebAudioPort", () => {
  let clock: FakeClock;
  let port: WebAudioPort;

  beforeEach(() => {
    clock = new FakeClock();
    // Pass the same fake clock to both the Scheduler and the WebAudioPort so
    // the captured audioOffset stays in the FakeClock time base. Without
    // this, WebAudioPort defaults to a RealClock and audioOffset is computed
    // from a real performance.now() — yielding negative beat times that the
    // playClick precondition correctly rejects.
    port = new WebAudioPort(new Scheduler(clock), clock);
  });

  it("starts not running", () => {
    expect(port.isRunning).toBe(false);
  });

  it("becomes running after start", async () => {
    await port.start(PARAMS);
    expect(port.isRunning).toBe(true);
  });

  it("invokes the onBeat listener with beat events", async () => {
    const listener = vi.fn();
    port.setOnBeat(listener);
    await port.start(PARAMS);
    clock.advance(2000);
    expect(listener).toHaveBeenCalled();
  });

  it("stops cleanly", async () => {
    await port.start(PARAMS);
    port.stop();
    expect(port.isRunning).toBe(false);
  });

  it("update changes pattern while running", async () => {
    await port.start(PARAMS);
    expect(() => port.update({ ...PARAMS, bpm: 90 })).not.toThrow();
  });

  it("update before start stores params without throwing", () => {
    expect(() => port.update(PARAMS)).not.toThrow();
  });

  it("update with unchanged pattern params does not re-anchor scheduler", async () => {
    await port.start(PARAMS);
    // Volume change only — should NOT call scheduler.updatePattern (can't
    // observe directly here, but no error is the smoke test).
    expect(() => port.update({ ...PARAMS, volume: 0.5 })).not.toThrow();
  });

  it("update with changed BPM applies the new pattern", async () => {
    await port.start(PARAMS);
    expect(() => port.update({ ...PARAMS, bpm: 90 })).not.toThrow();
  });

  it("update with changed accent pattern applies the new pattern", async () => {
    await port.start(PARAMS);
    expect(() =>
      port.update({ ...PARAMS, accentPattern: [true, true, false, false] }),
    ).not.toThrow();
  });

  it("ignores duplicate start calls", async () => {
    await port.start(PARAMS);
    await port.start(PARAMS); // second call should be a no-op
    expect(port.isRunning).toBe(true);
  });

  it("dispose closes the context", async () => {
    await port.start(PARAMS);
    await port.dispose();
    expect(port.isRunning).toBe(false);
  });

  it("setOnBeat(null) clears the listener", async () => {
    const listener = vi.fn();
    port.setOnBeat(listener);
    port.setOnBeat(null);
    await port.start(PARAMS);
    clock.advance(1000);
    expect(listener).not.toHaveBeenCalled();
  });

  describe("anchored start/update (tap-tempo phase alignment)", () => {
    it("start with options.anchorTime delays the first beat to the anchor time", async () => {
      const listener = vi.fn();
      port.setOnBeat(listener);
      // Anchor 0.5 s in the future of the FakeClock (now = 0)
      await port.start(PARAMS, { anchorTime: 0.5 });
      clock.advance(400);
      expect(listener).not.toHaveBeenCalled();
      clock.advance(200); // crosses anchor + lookahead window
      expect(listener).toHaveBeenCalled();
      const firstEvent = listener.mock.calls[0]?.[0];
      expect(firstEvent.time).toBe(0.5);
    });

    it("update with options.anchorTime re-anchors the next beat regardless of patternDirty", async () => {
      const listener = vi.fn();
      port.setOnBeat(listener);
      await port.start(PARAMS);
      clock.advance(1500);
      const beforeCount = listener.mock.calls.length;
      // Re-anchor with the SAME params (volume change only — patternDirty
      // would normally return false for these). The anchorTime must still
      // force a scheduler.updatePattern() call.
      port.update({ ...PARAMS, volume: 0.6 }, { anchorTime: 1.8 });
      clock.advance(400);
      const newCalls = listener.mock.calls.slice(beforeCount);
      expect(newCalls.length).toBeGreaterThan(0);
      // The first beat after re-anchor must fire at exactly 1.8
      expect(newCalls[0]?.[0].time).toBe(1.8);
    });

    it("update without anchorTime preserves the existing volume-only-no-reanchor behavior", async () => {
      const listener = vi.fn();
      port.setOnBeat(listener);
      await port.start(PARAMS);
      clock.advance(1000);
      // Volume-only change with no anchor — should NOT re-anchor (regression)
      expect(() => port.update({ ...PARAMS, volume: 0.6 })).not.toThrow();
      clock.advance(2000);
      // Beats should still fire at the original 0.5 s pulse cadence
      const times = listener.mock.calls.map((c) => c[0].time);
      // The pre-existing 120 BPM grid: 0, 0.5, 1.0, 1.5, 2.0, 2.5
      expect(times).toContain(2.0);
    });

    it("rejects start with non-finite anchorTime via the scheduler precondition", async () => {
      await expect(port.start(PARAMS, { anchorTime: Number.NaN })).rejects.toThrow();
    });
  });
});
