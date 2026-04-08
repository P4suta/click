import { describe, expect, it, vi } from "vitest";
import { FakeClock } from "./fakes/fake-clock";

describe("FakeClock", () => {
  it("starts at zero by default", () => {
    const clock = new FakeClock();
    expect(clock.now()).toBe(0);
  });

  it("starts at the given initial time (ms → seconds)", () => {
    const clock = new FakeClock(2500);
    expect(clock.now()).toBe(2.5);
  });

  it("advances by the given milliseconds", () => {
    const clock = new FakeClock();
    clock.advance(1500);
    expect(clock.now()).toBe(1.5);
  });

  it("does not fire timers that have not yet elapsed", () => {
    const clock = new FakeClock();
    const fn = vi.fn();
    clock.setTimer(fn, 100);
    clock.advance(50);
    expect(fn).not.toHaveBeenCalled();
  });

  it("fires a timer when its deadline is reached during advance", () => {
    const clock = new FakeClock();
    const fn = vi.fn();
    clock.setTimer(fn, 100);
    clock.advance(150);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("fires multiple timers in deadline order", () => {
    const clock = new FakeClock();
    const order: number[] = [];
    clock.setTimer(() => order.push(2), 200);
    clock.setTimer(() => order.push(1), 100);
    clock.setTimer(() => order.push(3), 300);
    clock.advance(500);
    expect(order).toEqual([1, 2, 3]);
  });

  it("places now() at the firing time when a callback runs", () => {
    const clock = new FakeClock();
    let observed = -1;
    clock.setTimer(() => {
      observed = clock.now();
    }, 250);
    clock.advance(1000);
    expect(observed).toBe(0.25);
  });

  it("allows a timer callback to schedule another timer that also fires within advance", () => {
    const clock = new FakeClock();
    const seen: number[] = [];
    clock.setTimer(() => {
      seen.push(1);
      clock.setTimer(() => {
        seen.push(2);
      }, 100);
    }, 100);
    clock.advance(500);
    expect(seen).toEqual([1, 2]);
  });

  it("returns a cancel function that prevents the timer from firing", () => {
    const clock = new FakeClock();
    const fn = vi.fn();
    const cancel = clock.setTimer(fn, 100);
    cancel();
    clock.advance(500);
    expect(fn).not.toHaveBeenCalled();
  });

  it("treats a negative delay as zero (fires on next advance)", () => {
    const clock = new FakeClock();
    const fn = vi.fn();
    clock.setTimer(fn, -100);
    clock.advance(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("reports pending timer count", () => {
    const clock = new FakeClock();
    clock.setTimer(() => {}, 100);
    clock.setTimer(() => {}, 200);
    expect(clock.pendingTimers).toBe(2);
    clock.advance(150);
    expect(clock.pendingTimers).toBe(1);
  });

  it("ends advance with now() at the target time even if no timer fires there", () => {
    const clock = new FakeClock();
    clock.setTimer(() => {}, 100);
    clock.advance(500);
    expect(clock.now()).toBe(0.5);
  });
});
