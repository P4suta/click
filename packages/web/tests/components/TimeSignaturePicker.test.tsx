import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { TimeSignaturePicker } from "../../src/components/TimeSignaturePicker";

const FOUR_FOUR = { numerator: 4, denominator: 4 } as const;

describe("TimeSignaturePicker — rendering", () => {
  it("renders the numerator and denominator as separate buttons", () => {
    render(() => (
      <TimeSignaturePicker value={{ numerator: 3, denominator: 8 }} onChange={() => {}} />
    ));
    expect(screen.getByLabelText(/Numerator: 3/)).toHaveTextContent("3");
    expect(screen.getByLabelText(/Denominator: 8/)).toHaveTextContent("8");
  });
});

describe("TimeSignaturePicker — numerator zone", () => {
  it("click cycles numerator forward (4 → 5)", () => {
    const onChange = vi.fn();
    render(() => <TimeSignaturePicker value={FOUR_FOUR} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Numerator: 4/));
    expect(onChange).toHaveBeenCalledWith({ numerator: 5, denominator: 4 });
  });

  it("click on numerator 16 wraps to 1", () => {
    const onChange = vi.fn();
    render(() => (
      <TimeSignaturePicker value={{ numerator: 16, denominator: 4 }} onChange={onChange} />
    ));
    fireEvent.click(screen.getByLabelText(/Numerator: 16/));
    expect(onChange).toHaveBeenCalledWith({ numerator: 1, denominator: 4 });
  });

  it("scroll wheel down on numerator steps forward", () => {
    const onChange = vi.fn();
    render(() => <TimeSignaturePicker value={FOUR_FOUR} onChange={onChange} />);
    fireEvent.wheel(screen.getByLabelText(/Numerator/), { deltaY: 100 });
    expect(onChange).toHaveBeenCalledWith({ numerator: 5, denominator: 4 });
  });

  it("scroll wheel up on numerator steps backward (4 → 3)", () => {
    const onChange = vi.fn();
    render(() => <TimeSignaturePicker value={FOUR_FOUR} onChange={onChange} />);
    fireEvent.wheel(screen.getByLabelText(/Numerator/), { deltaY: -100 });
    expect(onChange).toHaveBeenCalledWith({ numerator: 3, denominator: 4 });
  });

  it("scroll wheel up on numerator 1 wraps to 16", () => {
    const onChange = vi.fn();
    render(() => (
      <TimeSignaturePicker value={{ numerator: 1, denominator: 4 }} onChange={onChange} />
    ));
    fireEvent.wheel(screen.getByLabelText(/Numerator/), { deltaY: -100 });
    expect(onChange).toHaveBeenCalledWith({ numerator: 16, denominator: 4 });
  });

  it("ArrowUp on numerator steps forward", () => {
    const onChange = vi.fn();
    render(() => <TimeSignaturePicker value={FOUR_FOUR} onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText(/Numerator/), { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith({ numerator: 5, denominator: 4 });
  });

  it("ArrowDown on numerator steps backward", () => {
    const onChange = vi.fn();
    render(() => <TimeSignaturePicker value={FOUR_FOUR} onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText(/Numerator/), { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith({ numerator: 3, denominator: 4 });
  });

  it("ArrowRight on numerator also steps forward", () => {
    const onChange = vi.fn();
    render(() => <TimeSignaturePicker value={FOUR_FOUR} onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText(/Numerator/), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith({ numerator: 5, denominator: 4 });
  });

  it("ArrowLeft on numerator also steps backward", () => {
    const onChange = vi.fn();
    render(() => <TimeSignaturePicker value={FOUR_FOUR} onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText(/Numerator/), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith({ numerator: 3, denominator: 4 });
  });

  it("unrelated keys on numerator are ignored", () => {
    const onChange = vi.fn();
    render(() => <TimeSignaturePicker value={FOUR_FOUR} onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText(/Numerator/), { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("wheel deltaY 0 on numerator does nothing", () => {
    const onChange = vi.fn();
    render(() => <TimeSignaturePicker value={FOUR_FOUR} onChange={onChange} />);
    fireEvent.wheel(screen.getByLabelText(/Numerator/), { deltaY: 0 });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("TimeSignaturePicker — denominator zone", () => {
  it("click cycles 4 → 8", () => {
    const onChange = vi.fn();
    render(() => <TimeSignaturePicker value={FOUR_FOUR} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/Denominator: 4/));
    expect(onChange).toHaveBeenCalledWith({ numerator: 4, denominator: 8 });
  });

  it("click on 16 wraps to 2", () => {
    const onChange = vi.fn();
    render(() => (
      <TimeSignaturePicker value={{ numerator: 4, denominator: 16 }} onChange={onChange} />
    ));
    fireEvent.click(screen.getByLabelText(/Denominator: 16/));
    expect(onChange).toHaveBeenCalledWith({ numerator: 4, denominator: 2 });
  });

  it("scroll wheel up on denominator 4 → 2", () => {
    const onChange = vi.fn();
    render(() => <TimeSignaturePicker value={FOUR_FOUR} onChange={onChange} />);
    fireEvent.wheel(screen.getByLabelText(/Denominator/), { deltaY: -100 });
    expect(onChange).toHaveBeenCalledWith({ numerator: 4, denominator: 2 });
  });

  it("scroll wheel up on denominator 2 wraps to 16", () => {
    const onChange = vi.fn();
    render(() => (
      <TimeSignaturePicker value={{ numerator: 4, denominator: 2 }} onChange={onChange} />
    ));
    fireEvent.wheel(screen.getByLabelText(/Denominator/), { deltaY: -100 });
    expect(onChange).toHaveBeenCalledWith({ numerator: 4, denominator: 16 });
  });

  it("ArrowUp on denominator steps forward", () => {
    const onChange = vi.fn();
    render(() => <TimeSignaturePicker value={FOUR_FOUR} onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText(/Denominator/), { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith({ numerator: 4, denominator: 8 });
  });

  it("ArrowDown on denominator steps backward", () => {
    const onChange = vi.fn();
    render(() => <TimeSignaturePicker value={FOUR_FOUR} onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText(/Denominator/), { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith({ numerator: 4, denominator: 2 });
  });

  it("unrelated keys on denominator are ignored", () => {
    const onChange = vi.fn();
    render(() => <TimeSignaturePicker value={FOUR_FOUR} onChange={onChange} />);
    fireEvent.keyDown(screen.getByLabelText(/Denominator/), { key: "Tab" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("wheel deltaY 0 on denominator does nothing", () => {
    const onChange = vi.fn();
    render(() => <TimeSignaturePicker value={FOUR_FOUR} onChange={onChange} />);
    fireEvent.wheel(screen.getByLabelText(/Denominator/), { deltaY: 0 });
    expect(onChange).not.toHaveBeenCalled();
  });
});
