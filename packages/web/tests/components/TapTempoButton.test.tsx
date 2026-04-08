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
});
