import type { BeatEvent, TempoState } from "@click/core";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { type MetronomeParams, WebAudioPort } from "../audio/web-audio-port";
import type { AppStore } from "../state/app-store";

/**
 * Bridges the Solid app store and the Web Audio port. Tracks the latest beat
 * event for visual sync. Owns the WebAudioPort lifecycle.
 */
export interface UseMetronomeApi {
  readonly currentBeat: () => BeatEvent | null;
  readonly toggle: () => Promise<void>;
  /**
   * Tap-tempo phase alignment. Updates the BPM state and either re-anchors
   * an in-flight scheduler to the user's tap rhythm or, when stopped and the
   * tap count crosses the count-in threshold (4), auto-starts playback
   * aligned to the tapped phase.
   */
  readonly syncToTap: (bpm: number, tapTimeMs: number, tapCount: number) => Promise<void>;
}

/** Project a TempoState slice into the WebAudioPort params shape. */
const paramsFromState = (s: TempoState): MetronomeParams => ({
  bpm: s.bpm,
  timeSignature: s.timeSignature,
  accentPattern: s.accentPattern,
  subdivision: s.subdivision,
  volume: s.volume,
  sound: s.sound,
});

/** Number of taps required to trigger auto-start when the metronome is
 *  stopped. Four matches the musical "1-2-3-4" count-in convention. */
const COUNT_IN_THRESHOLD = 4;

export function useMetronome(store: AppStore): UseMetronomeApi {
  const port = new WebAudioPort();
  const [currentBeat, setCurrentBeat] = createSignal<BeatEvent | null>(null);

  port.setOnBeat((event) => setCurrentBeat(event));

  createEffect(() => {
    const s = store.state();
    if (port.isRunning) port.update(paramsFromState(s));
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
      await port.start(paramsFromState(s));
      store.dispatch({ type: "PLAY" });
    }
  };

  const syncToTap = async (bpm: number, tapTimeMs: number, tapCount: number): Promise<void> => {
    // 1. Update UI state so BpmDisplay tracks the tapped tempo.
    store.dispatch({ type: "SET_BPM", bpm });

    // 2. Compute the first FUTURE beat anchor: lastTap + interval, advanced
    //    forward by interval steps if the result happens to land in the past
    //    (defensive — usually unnecessary at human tap latency).
    const intervalSec = 60 / bpm;
    const tapTimeSec = tapTimeMs / 1000;
    let anchorTime = tapTimeSec + intervalSec;
    const nowSec = performance.now() / 1000;
    while (anchorTime < nowSec) anchorTime += intervalSec;

    // The reduce action above clamped bpm into [MIN_BPM, MAX_BPM]; pull the
    // post-clamp state so the params we hand to the port are consistent.
    const params = paramsFromState(store.state());

    if (port.isRunning) {
      // Re-anchor the in-flight scheduler so the next beat lands at anchorTime.
      port.update(params, { anchorTime });
    } else if (tapCount >= COUNT_IN_THRESHOLD) {
      // Stopped + count-in complete: auto-start aligned to the tap rhythm.
      await port.start(params, { anchorTime });
      store.dispatch({ type: "PLAY" });
    }
    // Otherwise (stopped + tapCount < threshold): the BPM is updated for the
    // next manual Play but no audio fires yet. The user is still counting in.
  };

  return { currentBeat, toggle, syncToTap };
}
