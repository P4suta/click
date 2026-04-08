import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { BpmDisplay } from "../../src/components/BpmDisplay";

describe("BpmDisplay", () => {
  it("renders the BPM value", () => {
    render(() => <BpmDisplay bpm={120} onChange={() => {}} />);
    expect(screen.getByLabelText(/BPM 120/i)).toHaveTextContent("120");
  });

  it("enters edit mode when the value is clicked", () => {
    render(() => <BpmDisplay bpm={120} onChange={() => {}} />);
    fireEvent.click(screen.getByLabelText(/BPM 120/i));
    expect(screen.getByLabelText("BPM")).toHaveValue(120);
  });

  it("commits new value on blur", () => {
    const onChange = vi.fn();
    render(() => <BpmDisplay bpm={120} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/BPM 120/i));
    const input = screen.getByLabelText("BPM");
    fireEvent.input(input, { target: { value: "140" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(140);
  });

  it("clamps absurd values to range", () => {
    const onChange = vi.fn();
    render(() => <BpmDisplay bpm={120} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/BPM 120/i));
    const input = screen.getByLabelText("BPM");
    fireEvent.input(input, { target: { value: "9999" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(300);
  });

  it("commits on Enter", () => {
    const onChange = vi.fn();
    render(() => <BpmDisplay bpm={120} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/BPM 120/i));
    const input = screen.getByLabelText("BPM");
    fireEvent.input(input, { target: { value: "100" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it("cancels on Escape without committing", () => {
    const onChange = vi.fn();
    render(() => <BpmDisplay bpm={120} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/BPM 120/i));
    const input = screen.getByLabelText("BPM");
    fireEvent.input(input, { target: { value: "100" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores non-numeric input on blur", () => {
    const onChange = vi.fn();
    render(() => <BpmDisplay bpm={120} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/BPM 120/i));
    const input = screen.getByLabelText("BPM");
    fireEvent.input(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
  });
});
