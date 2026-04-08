import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealClock } from "../../src/audio/real-clock";

describe("RealClock", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date(0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns performance.now() in seconds and advances with time", () => {
    const clock = new RealClock();
    const start = clock.now();
    vi.advanceTimersByTime(2500);
    const end = clock.now();
    expect(end - start).toBeCloseTo(2.5, 1);
  });

  it("schedules a callback after the given delay", () => {
    const clock = new RealClock();
    const fn = vi.fn();
    clock.setTimer(fn, 500);
    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("returns a cancel function that prevents firing", () => {
    const clock = new RealClock();
    const fn = vi.fn();
    const cancel = clock.setTimer(fn, 500);
    cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
