import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TapTempoButton } from "../../src/components/TapTempoButton";

describe("TapTempoButton", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders TAP label", () => {
    render(() => <TapTempoButton onTempo={() => {}} />);
    expect(screen.getByLabelText("Tap tempo")).toHaveTextContent("TAP");
  });

  it("first tap does not emit BPM (insufficient data)", () => {
    const onTempo = vi.fn();
    render(() => <TapTempoButton onTempo={onTempo} />);
    fireEvent.click(screen.getByLabelText("Tap tempo"));
    expect(onTempo).not.toHaveBeenCalled();
  });

  it("flash class clears after 80ms", () => {
    render(() => <TapTempoButton onTempo={() => {}} />);
    const btn = screen.getByLabelText("Tap tempo");
    fireEvent.click(btn);
    expect(btn).toHaveClass("tap-tempo--flash");
    vi.advanceTimersByTime(100);
    expect(btn).not.toHaveClass("tap-tempo--flash");
  });

  it("hint clears after 2 seconds of inactivity", () => {
    render(() => <TapTempoButton onTempo={() => {}} />);
    const btn = screen.getByLabelText("Tap tempo");
    fireEvent.click(btn);
    fireEvent.click(btn);
    // After two taps, hint shows; after 2.1s, hint clears
    vi.advanceTimersByTime(2100);
    // hint span is removed when null — verify by absence of any number text
    expect(btn.textContent).toBe("TAP");
  });

  it("calls onTempo with (bpm, tapTimeMs, tapCount) on the second tap", () => {
    const onTempo = vi.fn();
    render(() => <TapTempoButton onTempo={onTempo} />);
    const btn = screen.getByLabelText("Tap tempo");
    fireEvent.click(btn); // tap 1: returns null, no call
    fireEvent.click(btn); // tap 2: returns BPM, single call
    expect(onTempo).toHaveBeenCalledOnce();
    const call = onTempo.mock.calls[0];
    expect(call).toBeDefined();
    const [bpm, tapTimeMs, tapCount] = call as [number, number, number];
    expect(typeof bpm).toBe("number");
    expect(Number.isFinite(bpm)).toBe(true);
    expect(typeof tapTimeMs).toBe("number");
    expect(Number.isFinite(tapTimeMs)).toBe(true);
    expect(tapCount).toBe(2);
  });

  it("tapCount increments across consecutive taps within the rolling window", () => {
    const onTempo = vi.fn();
    render(() => <TapTempoButton onTempo={onTempo} />);
    const btn = screen.getByLabelText("Tap tempo");
    for (let i = 0; i < 5; i++) fireEvent.click(btn);
    // 4 calls (taps 2..5), tapCount progression 2,3,4,5
    expect(onTempo).toHaveBeenCalledTimes(4);
    const counts = onTempo.mock.calls.map((c) => (c as [number, number, number])[2]);
    expect(counts).toEqual([2, 3, 4, 5]);
  });
});
