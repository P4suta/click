import { type Component, Index, createMemo } from "solid-js";

interface BeatIndicatorProps {
  readonly numerator: number;
  readonly accentPattern: readonly boolean[];
  readonly currentBeatIndex: number | null;
}

export const BeatIndicator: Component<BeatIndicatorProps> = (props) => {
  const beats = createMemo(() => Array.from({ length: props.numerator }, (_, i) => i));
  return (
    <output class="beat-indicator" aria-label="Current beat indicator">
      <Index each={beats()}>
        {(_item, i) => (
          <span
            classList={{
              "beat-indicator__dot": true,
              "beat-indicator__dot--downbeat": i === 0,
              "beat-indicator__dot--accent": props.accentPattern[i] === true,
              "beat-indicator__dot--active": props.currentBeatIndex === i,
            }}
            aria-hidden="true"
          />
        )}
      </Index>
    </output>
  );
};
