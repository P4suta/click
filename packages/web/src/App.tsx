import type { Component } from "solid-js";
import { BeatIndicator } from "./components/BeatIndicator";
import { BpmControls } from "./components/BpmControls";
import { BpmDisplay } from "./components/BpmDisplay";
import { PlayButton } from "./components/PlayButton";
import { TapTempoButton } from "./components/TapTempoButton";
import { TimeSignaturePicker } from "./components/TimeSignaturePicker";
import { useKeyboard } from "./hooks/use-keyboard";
import { useMetronome } from "./hooks/use-metronome";
import type { AppStore } from "./state/app-store";

interface AppProps {
  readonly store: AppStore;
}

export const App: Component<AppProps> = (props) => {
  const metronome = useMetronome(props.store);

  const handleToggle = (): void => {
    void metronome.toggle();
  };

  useKeyboard({ store: props.store, onToggle: handleToggle });

  return (
    <main class="app" aria-label="Metronome">
      <header class="app__header">
        <h1 class="app__title">click</h1>
      </header>
      <BpmDisplay
        bpm={props.store.state().bpm}
        onChange={(bpm) => props.store.dispatch({ type: "SET_BPM", bpm })}
      />
      <BeatIndicator
        numerator={props.store.state().timeSignature.numerator}
        accentPattern={props.store.state().accentPattern}
        currentBeatIndex={metronome.currentBeat()?.beatIndex ?? null}
      />
      <PlayButton
        isPlaying={props.store.state().isPlaying}
        pulsing={metronome.currentBeat() !== null && props.store.state().isPlaying}
        onToggle={handleToggle}
      />
      <BpmControls
        bpm={props.store.state().bpm}
        onChange={(bpm) => props.store.dispatch({ type: "SET_BPM", bpm })}
        onNudge={(delta) => props.store.dispatch({ type: "NUDGE_BPM", delta })}
      />
      <div class="app__row">
        <TapTempoButton onTempo={(bpm) => props.store.dispatch({ type: "SET_BPM", bpm })} />
        <TimeSignaturePicker
          value={props.store.state().timeSignature}
          onChange={(signature) => props.store.dispatch({ type: "SET_TIME_SIGNATURE", signature })}
        />
      </div>
      <footer class="app__footer">
        <kbd>Space</kbd> play/stop · <kbd>T</kbd> tap · <kbd>↑</kbd>
        <kbd>↓</kbd> BPM
      </footer>
    </main>
  );
};
