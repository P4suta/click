import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { TimeSignaturePicker } from "../../src/components/TimeSignaturePicker";

describe("TimeSignaturePicker", () => {
  it("renders the current numerator and denominator", () => {
    render(() => (
      <TimeSignaturePicker value={{ numerator: 3, denominator: 4 }} onChange={() => {}} />
    ));
    expect(screen.getByLabelText(/3\/4/)).toBeInTheDocument();
  });

  it("cycles to the next preset on click", () => {
    const onChange = vi.fn();
    render(() => (
      <TimeSignaturePicker value={{ numerator: 4, denominator: 4 }} onChange={onChange} />
    ));
    fireEvent.click(screen.getByLabelText(/4\/4/));
    expect(onChange).toHaveBeenCalledWith({ numerator: 3, denominator: 4 });
  });

  it("wraps to the first preset after the last", () => {
    const onChange = vi.fn();
    render(() => (
      <TimeSignaturePicker value={{ numerator: 7, denominator: 8 }} onChange={onChange} />
    ));
    fireEvent.click(screen.getByLabelText(/7\/8/));
    expect(onChange).toHaveBeenCalledWith({ numerator: 4, denominator: 4 });
  });
});
