import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { SubdivisionPicker } from "../../src/components/SubdivisionPicker";

describe("SubdivisionPicker", () => {
  it("renders the current value", () => {
    render(() => <SubdivisionPicker value={4} onChange={() => {}} />);
    expect(screen.getByLabelText(/Subdivision per beat: 4/)).toBeInTheDocument();
  });

  it("click cycles forward through 1 → 2 → 3 → 4 → 6 → 8 → 1", () => {
    const onChange = vi.fn();
    render(() => <SubdivisionPicker value={1} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Subdivision/));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("click on 8 wraps to 1", () => {
    const onChange = vi.fn();
    render(() => <SubdivisionPicker value={8} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Subdivision/));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("scroll wheel down cycles forward", () => {
    const onChange = vi.fn();
    render(() => <SubdivisionPicker value={3} onChange={onChange} />);
    fireEvent.wheel(screen.getByLabelText(/Subdivision/), { deltaY: 100 });
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("scroll wheel up cycles backward", () => {
    const onChange = vi.fn();
    render(() => <SubdivisionPicker value={3} onChange={onChange} />);
    fireEvent.wheel(screen.getByLabelText(/Subdivision/), { deltaY: -100 });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("scroll wheel deltaY 0 does nothing", () => {
    const onChange = vi.fn();
    render(() => <SubdivisionPicker value={3} onChange={onChange} />);
    fireEvent.wheel(screen.getByLabelText(/Subdivision/), { deltaY: 0 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ArrowUp/ArrowRight steps forward", () => {
    const onChange = vi.fn();
    render(() => <SubdivisionPicker value={2} onChange={onChange} />);
    const btn = screen.getByLabelText(/Subdivision/);
    fireEvent.keyDown(btn, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith(3);
    fireEvent.keyDown(btn, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(3);
  });

  it("ArrowDown/ArrowLeft steps backward", () => {
    const onChange = vi.fn();
    render(() => <SubdivisionPicker value={2} onChange={onChange} />);
    const btn = screen.getByLabelText(/Subdivision/);
    fireEvent.keyDown(btn, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(btn, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it("other keys are ignored", () => {
    const onChange = vi.fn();
    render(() => <SubdivisionPicker value={4} onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText(/Subdivision/), { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("wraps backward from 1 to 8", () => {
    const onChange = vi.fn();
    render(() => <SubdivisionPicker value={1} onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText(/Subdivision/), { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith(8);
  });
});
