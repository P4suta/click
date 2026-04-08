import { TapTempo } from "@click/core";
import { type Component, createSignal, onCleanup } from "solid-js";

interface TapTempoButtonProps {
  /** Called whenever a fresh tap-tempo estimate is available. */
  readonly onTempo: (bpm: number) => void;
  /** Optional shared TapTempo instance so the keyboard handler and the
   * button feed the same rolling window. */
  readonly tap?: TapTempo;
}

export const TapTempoButton: Component<TapTempoButtonProps> = (props) => {
  const tap = props.tap ?? new TapTempo();
  const [flashing, setFlashing] = createSignal(false);
  const [hint, setHint] = createSignal<number | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  let resetTimer: ReturnType<typeof setTimeout> | null = null;

  const onTap = (): void => {
    setFlashing(true);
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => setFlashing(false), 80);
    const bpm = tap.tap(performance.now());
    setHint(bpm);
    if (bpm !== null) props.onTempo(bpm);
    // Per DESIGN.md §4: visual hint resets after 2 s of inactivity.
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => setHint(null), 2000);
  };

  onCleanup(() => {
    if (flashTimer) clearTimeout(flashTimer);
    if (resetTimer) clearTimeout(resetTimer);
  });

  return (
    <button
      type="button"
      classList={{ "tap-tempo": true, "tap-tempo--flash": flashing() }}
      aria-label="Tap tempo"
      onClick={onTap}
    >
      <span>TAP</span>
      {hint() !== null && <span class="tap-tempo__hint">{hint()}</span>}
    </button>
  );
};
