import type { Subdivision, TimeSignature } from "./types";

export const MIN_BPM = 30;
export const MAX_BPM = 999;
export const DEFAULT_BPM = 120;

export const DEFAULT_TIME_SIGNATURE: TimeSignature = { numerator: 4, denominator: 4 };
export const DEFAULT_SUBDIVISION: Subdivision = 1;
export const DEFAULT_VOLUME = 0.8;
export const DEFAULT_SOUND = "click" as const;

/** Lookahead scheduler defaults from Chris Wilson, "A tale of two clocks". */
export const DEFAULT_LOOKAHEAD_MS = 25;
export const DEFAULT_SCHEDULE_AHEAD_SEC = 0.1;

/** Tap tempo defaults. */
export const TAP_TEMPO_WINDOW_SIZE = 8;
export const TAP_TEMPO_MAX_GAP_MS = 2000;
