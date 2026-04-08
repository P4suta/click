import { type BeatEvent, PhaseTracker, type TempoState } from "@click/core";
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
   * an in-flight scheduler toward the user's tap rhythm (using EMA-based
   * soft correction via PhaseTracker) or, when stopped and the tap count
   * crosses the count-in threshold (4), auto-starts playback aligned to the
   * tapped phase.
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

/** EMA coefficient for tap-tempo phase soft correction. 0.3 corrects 30% of
 *  the phase error per tap, converging in ~10 taps. Lower = smoother but
 *  slower; higher = snappier but more jarring. */
const PHASE_ALPHA = 0.3;

export function useMetronome(store: AppStore): UseMetronomeApi {
  const port = new WebAudioPort();
  const [currentBeat, setCurrentBeat] = createSignal<BeatEvent | null>(null);
  // Owns the soft-correction grid across consecutive taps. Reset whenever
  // TapTempo's rolling window resets (detected by tapCount going down).
  const phaseTracker = new PhaseTracker(PHASE_ALPHA);
  let lastTapCount = 0;

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

    // 2. If TapTempo's rolling window just reset (gap > maxGapMs), tapCount
    //    drops back to 2. Mirror that on our phase tracker so the new session
    //    starts fresh instead of soft-correcting from a stale grid.
    if (tapCount < lastTapCount) phaseTracker.reset();
    lastTapCount = tapCount;

    // 3. Feed the tap into the EMA-based PhaseTracker. The returned anchor is
    //    the next beat time, soft-corrected toward the user's tap rhythm.
    const anchorTime = phaseTracker.observe(tapTimeMs / 1000, 60 / bpm, performance.now() / 1000);

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
