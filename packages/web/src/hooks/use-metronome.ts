import type { BeatEvent } from "@click/core";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { WebAudioPort } from "../audio/web-audio-port";
import type { AppStore } from "../state/app-store";

/**
 * Bridges the Solid app store and the Web Audio port. Tracks the latest beat
 * event for visual sync. Owns the WebAudioPort lifecycle.
 */
export interface UseMetronomeApi {
  readonly currentBeat: () => BeatEvent | null;
  readonly toggle: () => Promise<void>;
}

export function useMetronome(store: AppStore): UseMetronomeApi {
  const port = new WebAudioPort();
  const [currentBeat, setCurrentBeat] = createSignal<BeatEvent | null>(null);

  port.setOnBeat((event) => setCurrentBeat(event));

  createEffect(() => {
    const s = store.state();
    if (port.isRunning) {
      port.update({
        bpm: s.bpm,
        timeSignature: s.timeSignature,
        accentPattern: s.accentPattern,
        subdivision: s.subdivision,
        volume: s.volume,
        sound: s.sound,
      });
    }
  });

  onCleanup(() => {
    void port.dispose();
  });

  const toggle = async (): Promise<void> => {
    const s = store.state();
    if (port.isRunning) {
      port.stop();
      store.dispatch({ type: "STOP" });
      setCurrentBeat(null);
    } else {
      await port.start({
        bpm: s.bpm,
        timeSignature: s.timeSignature,
        accentPattern: s.accentPattern,
        subdivision: s.subdivision,
        volume: s.volume,
        sound: s.sound,
      });
      store.dispatch({ type: "PLAY" });
    }
  };

  return { currentBeat, toggle };
}
