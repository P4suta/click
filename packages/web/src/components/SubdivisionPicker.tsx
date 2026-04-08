import type { Subdivision } from "@click/core";
import type { Component } from "solid-js";

interface SubdivisionPickerProps {
  readonly value: Subdivision;
  readonly onChange: (next: Subdivision) => void;
}

/**
 * Cycle through the supported subdivisions per beat:
 *   1 = quarter   (no sub)
 *   2 = eighths
 *   3 = triplets
 *   4 = sixteenths
 *   6 = sextuplets
 *   8 = thirty-seconds
 *
 * Click cycles forward; scroll wheel and arrow keys step in either direction.
 */
const SUBDIVISIONS: readonly Subdivision[] = [1, 2, 3, 4, 6, 8];

const indexOfSubdivision = (s: Subdivision): number => {
  const i = SUBDIVISIONS.indexOf(s);
  return i < 0 ? 0 : i;
};

const stepSubdivision = (current: Subdivision, delta: 1 | -1): Subdivision => {
  const i = indexOfSubdivision(current);
  const next = (i + delta + SUBDIVISIONS.length) % SUBDIVISIONS.length;
  return SUBDIVISIONS[next] as Subdivision;
};

export const SubdivisionPicker: Component<SubdivisionPickerProps> = (props) => {
  const cycleForward = (): void => props.onChange(stepSubdivision(props.value, 1));
  const cycleBackward = (): void => props.onChange(stepSubdivision(props.value, -1));

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (event.deltaY > 0) cycleForward();
    else if (event.deltaY < 0) cycleBackward();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      cycleForward();
    } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      cycleBackward();
    }
  };

  return (
    <button
      type="button"
      class="subdivision"
      aria-label={`Subdivision per beat: ${props.value}. Click or scroll to change.`}
      onClick={cycleForward}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
    >
      <span class="subdivision__label">÷</span>
      <span class="subdivision__value">{props.value}</span>
    </button>
  );
};
