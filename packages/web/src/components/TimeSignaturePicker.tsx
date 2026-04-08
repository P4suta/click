import type { TimeSignature } from "@click/core";
import type { Component } from "solid-js";

interface TimeSignaturePickerProps {
  readonly value: TimeSignature;
  readonly onChange: (next: TimeSignature) => void;
}

const PRESETS: readonly TimeSignature[] = [
  { numerator: 4, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 6, denominator: 8 },
  { numerator: 2, denominator: 4 },
  { numerator: 5, denominator: 4 },
  { numerator: 7, denominator: 8 },
];

const samesig = (a: TimeSignature, b: TimeSignature): boolean =>
  a.numerator === b.numerator && a.denominator === b.denominator;

export const TimeSignaturePicker: Component<TimeSignaturePickerProps> = (props) => {
  const cycle = (): void => {
    const idx = PRESETS.findIndex((p) => samesig(p, props.value));
    const next = PRESETS[(idx + 1) % PRESETS.length] as TimeSignature;
    props.onChange(next);
  };

  return (
    <button
      type="button"
      class="time-sig"
      aria-label={`Time signature ${props.value.numerator}/${props.value.denominator}, click to cycle`}
      onClick={cycle}
    >
      <span class="time-sig__num">{props.value.numerator}</span>
      <span class="time-sig__den">{props.value.denominator}</span>
    </button>
  );
};
