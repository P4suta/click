import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { BpmControls } from "../../src/components/BpmControls";

describe("BpmControls", () => {
  it("renders slider with current BPM", () => {
    render(() => <BpmControls bpm={140} onChange={() => {}} onNudge={() => {}} />);
    expect(screen.getByLabelText("BPM")).toHaveValue("140");
  });

  it("calls onChange when slider moves", () => {
    const onChange = vi.fn();
    render(() => <BpmControls bpm={140} onChange={onChange} onNudge={() => {}} />);
    fireEvent.input(screen.getByLabelText("BPM"), { target: { value: "150" } });
    expect(onChange).toHaveBeenCalledWith(150);
  });

  it("calls onNudge with -1 when minus button clicked", () => {
    const onNudge = vi.fn();
    render(() => <BpmControls bpm={140} onChange={() => {}} onNudge={onNudge} />);
    fireEvent.click(screen.getByLabelText("Decrease BPM by 1"));
    expect(onNudge).toHaveBeenCalledWith(-1);
  });

  it("calls onNudge with +1 when plus button clicked", () => {
    const onNudge = vi.fn();
    render(() => <BpmControls bpm={140} onChange={() => {}} onNudge={onNudge} />);
    fireEvent.click(screen.getByLabelText("Increase BPM by 1"));
    expect(onNudge).toHaveBeenCalledWith(1);
  });
});
