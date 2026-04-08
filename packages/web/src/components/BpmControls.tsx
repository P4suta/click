import { MAX_BPM, MIN_BPM } from "@click/core";
import type { Component } from "solid-js";

interface BpmControlsProps {
  readonly bpm: number;
  readonly onChange: (bpm: number) => void;
  readonly onNudge: (delta: number) => void;
}

export const BpmControls: Component<BpmControlsProps> = (props) => (
  <div class="bpm-controls">
    <div class="bpm-controls__row">
      <button
        type="button"
        class="bpm-controls__nudge"
        aria-label="Decrease BPM by 1"
        onClick={() => props.onNudge(-1)}
      >
        −
      </button>
      <input
        type="range"
        class="bpm-controls__slider"
        aria-label="BPM"
        min={MIN_BPM}
        max={MAX_BPM}
        step={1}
        value={props.bpm}
        onInput={(e) => props.onChange(Number(e.currentTarget.value))}
      />
      <button
        type="button"
        class="bpm-controls__nudge"
        aria-label="Increase BPM by 1"
        onClick={() => props.onNudge(1)}
      >
        +
      </button>
    </div>
  </div>
);
