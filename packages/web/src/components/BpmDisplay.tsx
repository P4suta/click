import { MAX_BPM, MIN_BPM } from "@click/core";
import { type Component, createSignal, Show } from "solid-js";

interface BpmDisplayProps {
  readonly bpm: number;
  readonly onChange: (bpm: number) => void;
}

export const BpmDisplay: Component<BpmDisplayProps> = (props) => {
  const [editing, setEditing] = createSignal(false);
  const [draft, setDraft] = createSignal("");

  const beginEdit = (): void => {
    setDraft(String(props.bpm));
    setEditing(true);
  };

  const commit = (): void => {
    const trimmed = draft().trim();
    if (trimmed !== "") {
      const value = Number(trimmed);
      if (Number.isFinite(value)) {
        props.onChange(Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value))));
      }
    }
    setEditing(false);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") {
      commit();
    } else if (event.key === "Escape") {
      setEditing(false);
    }
  };

  return (
    <div class="bpm-display">
      <Show
        when={editing()}
        fallback={
          <button
            type="button"
            class="bpm-display__value"
            aria-label={`BPM ${props.bpm}, click to edit`}
            onClick={beginEdit}
          >
            {props.bpm}
          </button>
        }
      >
        <input
          type="number"
          class="bpm-display__input"
          aria-label="BPM"
          min={MIN_BPM}
          max={MAX_BPM}
          value={draft()}
          ref={(el) => {
            queueMicrotask(() => el.focus());
          }}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
      </Show>
      <span class="bpm-display__unit">BPM</span>
    </div>
  );
};
