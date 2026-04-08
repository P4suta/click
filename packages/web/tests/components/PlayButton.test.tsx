import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { PlayButton } from "../../src/components/PlayButton";

describe("PlayButton", () => {
  it("renders Play label when not playing", () => {
    render(() => <PlayButton isPlaying={false} pulsing={false} onToggle={() => {}} />);
    expect(screen.getByLabelText("Play")).toBeInTheDocument();
  });

  it("renders Stop label when playing", () => {
    render(() => <PlayButton isPlaying={true} pulsing={false} onToggle={() => {}} />);
    expect(screen.getByLabelText("Stop")).toBeInTheDocument();
  });

  it("invokes onToggle on click", () => {
    const onToggle = vi.fn();
    render(() => <PlayButton isPlaying={false} pulsing={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByLabelText("Play"));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("applies pulsing class when pulsing is true", () => {
    render(() => <PlayButton isPlaying={true} pulsing={true} onToggle={() => {}} />);
    expect(screen.getByLabelText("Stop")).toHaveClass("play-button--pulsing");
  });

  it("uses aria-pressed to reflect state", () => {
    render(() => <PlayButton isPlaying={true} pulsing={false} onToggle={() => {}} />);
    expect(screen.getByLabelText("Stop")).toHaveAttribute("aria-pressed", "true");
  });
});
