import type { TimeSignature } from "@click/core";
import type { Component } from "solid-js";

interface TimeSignaturePickerProps {
  readonly value: TimeSignature;
  readonly onChange: (next: TimeSignature) => void;
}

/** Allowed denominators for the time signature. */
const DENOMINATORS: readonly (2 | 4 | 8 | 16)[] = [2, 4, 8, 16];

const MIN_NUMERATOR = 1;
const MAX_NUMERATOR = 16;

const stepNumerator = (current: number, delta: 1 | -1): number => {
  // Cycle through 1..16 inclusive
  const span = MAX_NUMERATOR - MIN_NUMERATOR + 1;
  const zero = current - MIN_NUMERATOR;
  const next = (zero + delta + span) % span;
  return next + MIN_NUMERATOR;
};

const stepDenominator = (current: 2 | 4 | 8 | 16, delta: 1 | -1): 2 | 4 | 8 | 16 => {
  const i = DENOMINATORS.indexOf(current);
  const next = (i + delta + DENOMINATORS.length) % DENOMINATORS.length;
  return DENOMINATORS[next] as 2 | 4 | 8 | 16;
};

/**
 * Two stacked clickable zones — numerator on top, denominator on bottom —
 * each cycling its own value independently. Click cycles forward; scroll
 * wheel and arrow keys step in either direction. This replaces the old
 * preset-cycling button so musicians can reach any (1..16) / (2|4|8|16)
 * combination directly without searching through a fixed list.
 */
export const TimeSignaturePicker: Component<TimeSignaturePickerProps> = (props) => {
  const cycleNum = (delta: 1 | -1) => {
    props.onChange({
      numerator: stepNumerator(props.value.numerator, delta),
      denominator: props.value.denominator,
    });
  };

  const cycleDen = (delta: 1 | -1) => {
    props.onChange({
      numerator: props.value.numerator,
      denominator: stepDenominator(props.value.denominator, delta),
    });
  };

  const onNumWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (event.deltaY > 0) cycleNum(1);
    else if (event.deltaY < 0) cycleNum(-1);
  };

  const onDenWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (event.deltaY > 0) cycleDen(1);
    else if (event.deltaY < 0) cycleDen(-1);
  };

  const onNumKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      cycleNum(1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      cycleNum(-1);
    }
  };

  const onDenKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      cycleDen(1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      cycleDen(-1);
    }
  };

  return (
    <div class="time-sig">
      <button
        type="button"
        class="time-sig__num"
        aria-label={`Numerator: ${props.value.numerator}. Click or scroll to change.`}
        onClick={() => cycleNum(1)}
        onWheel={onNumWheel}
        onKeyDown={onNumKey}
      >
        {props.value.numerator}
      </button>
      <button
        type="button"
        class="time-sig__den"
        aria-label={`Denominator: ${props.value.denominator}. Click or scroll to change.`}
        onClick={() => cycleDen(1)}
        onWheel={onDenWheel}
        onKeyDown={onDenKey}
      >
        {props.value.denominator}
      </button>
    </div>
  );
};
