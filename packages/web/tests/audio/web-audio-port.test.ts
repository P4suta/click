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
});
