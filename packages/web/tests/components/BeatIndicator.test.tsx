import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { BeatIndicator } from "../../src/components/BeatIndicator";

describe("BeatIndicator", () => {
  it("renders one dot per beat in the measure", () => {
    const { container } = render(() => (
      <BeatIndicator
        numerator={4}
        accentPattern={[true, false, false, false]}
        currentBeatIndex={null}
      />
    ));
    expect(container.querySelectorAll(".beat-indicator__dot")).toHaveLength(4);
  });

  it("marks the downbeat dot", () => {
    const { container } = render(() => (
      <BeatIndicator numerator={3} accentPattern={[true, false, false]} currentBeatIndex={null} />
    ));
    expect(container.querySelector(".beat-indicator__dot--downbeat")).toBeInTheDocument();
  });

  it("marks the active dot", () => {
    const { container } = render(() => (
      <BeatIndicator
        numerator={4}
        accentPattern={[true, false, false, false]}
        currentBeatIndex={2}
      />
    ));
    const dots = container.querySelectorAll(".beat-indicator__dot");
    expect(dots[2]).toHaveClass("beat-indicator__dot--active");
  });

  it("exposes a status role for screen readers", () => {
    render(() => (
      <BeatIndicator
        numerator={4}
        accentPattern={[true, false, false, false]}
        currentBeatIndex={null}
      />
    ));
    // <output> implicitly has role="status"
    expect(screen.getByLabelText("Current beat indicator")).toBeInTheDocument();
  });
});
