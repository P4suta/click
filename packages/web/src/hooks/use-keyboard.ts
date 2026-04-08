import type { TapTempo } from "@click/core";
import { onCleanup, onMount } from "solid-js";
import type { AppStore } from "../state/app-store";

interface UseKeyboardArgs {
  readonly store: AppStore;
  /** Shared TapTempo instance — must be the same one passed to TapTempoButton
   *  so the keyboard and the on-screen button feed a single rolling window. */
  readonly tap: TapTempo;
  readonly onToggle: () => void;
  /** Called with the same shape as `TapTempoButton.onTempo` so callers can
   *  route both input methods through `useMetronome.syncToTap`. */
  readonly onTap: (bpm: number, tapTimeMs: number, tapCount: number) => void;
}

/**
 * Global keyboard shortcuts:
 *   - Space      → toggle play/stop
 *   - T          → tap tempo
 *   - ↑ / ↓      → nudge BPM ±1
 *   - Shift+↑/↓  → nudge BPM ±10
 *
 * Skips when the focused element is an input/textarea so the user can edit
 * BPM directly without triggering shortcuts.
 */
export function useKeyboard(args: UseKeyboardArgs): void {
  const isEditing = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
  };

  const handler = (event: KeyboardEvent): void => {
    if (isEditing(event.target)) return;
    // Skip when modifier keys other than Shift are held so we don't intercept
    // browser shortcuts like Cmd+T (new tab) or Ctrl+ArrowUp.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    switch (event.key) {
      case " ":
        if (event.repeat) return;
        event.preventDefault();
        args.onToggle();
        return;
      case "t":
      case "T": {
        if (event.repeat) return;
        event.preventDefault();
        const tapTimeMs = performance.now();
        const bpm = args.tap.tap(tapTimeMs);
        if (bpm !== null) args.onTap(bpm, tapTimeMs, args.tap.tapCount);
        return;
      }
      case "ArrowUp":
        event.preventDefault();
        args.store.dispatch({ type: "NUDGE_BPM", delta: event.shiftKey ? 10 : 1 });
        return;
      case "ArrowDown":
        event.preventDefault();
        args.store.dispatch({ type: "NUDGE_BPM", delta: event.shiftKey ? -10 : -1 });
        return;
      default:
        return;
    }
  };

  onMount(() => {
    window.addEventListener("keydown", handler);
  });
  onCleanup(() => {
    window.removeEventListener("keydown", handler);
  });
}
