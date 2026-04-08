import {
  DEFAULT_BPM,
  DEFAULT_SOUND,
  DEFAULT_SUBDIVISION,
  DEFAULT_TIME_SIGNATURE,
  DEFAULT_VOLUME,
  MAX_BPM,
  MIN_BPM,
} from "./constants";
import { ensures, requires } from "./contracts";
import type { TempoAction, TempoState, TimeSignature } from "./types";

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

const clampBpm = (bpm: number): number => {
  if (!Number.isFinite(bpm)) return MIN_BPM;
  return clamp(Math.round(bpm), MIN_BPM, MAX_BPM);
};

const isValidTimeSignature = (sig: TimeSignature): boolean =>
  Number.isInteger(sig.numerator) &&
  sig.numerator >= 1 &&
  sig.numerator <= 16 &&
  (sig.denominator === 2 ||
    sig.denominator === 4 ||
    sig.denominator === 8 ||
    sig.denominator === 16);

const freshAccentPattern = (signature: TimeSignature): readonly boolean[] => {
  const pattern = new Array<boolean>(signature.numerator).fill(false);
  pattern[0] = true;
  return Object.freeze(pattern);
};

export function initialState(): TempoState {
  const state = Object.freeze({
    isPlaying: false,
    bpm: DEFAULT_BPM,
    timeSignature: Object.freeze({ ...DEFAULT_TIME_SIGNATURE }),
    accentPattern: freshAccentPattern(DEFAULT_TIME_SIGNATURE),
    subdivision: DEFAULT_SUBDIVISION,
    volume: DEFAULT_VOLUME,
    sound: DEFAULT_SOUND,
  });
  ensures(Object.isFrozen(state), "initialState must return a frozen TempoState");
  ensures(
    state.bpm >= MIN_BPM && state.bpm <= MAX_BPM,
    "initialState must seed bpm within [MIN_BPM, MAX_BPM]",
  );
  ensures(
    state.accentPattern.length === state.timeSignature.numerator,
    "initialState accentPattern length must equal timeSignature numerator",
  );
  return state;
}

export function reduce(state: TempoState, action: TempoAction): TempoState {
  requires(state !== null && typeof state === "object", "reduce: state must be a non-null object");
  requires(
    action !== null && typeof action === "object" && typeof action.type === "string",
    "reduce: action must be a non-null object with a string `type`",
  );
  const next = computeNext(state, action);
  ensures(Object.isFrozen(next), "reduce: returned state must be frozen");
  ensures(
    next.bpm >= MIN_BPM && next.bpm <= MAX_BPM,
    "reduce: returned bpm must remain within [MIN_BPM, MAX_BPM]",
  );
  ensures(
    next.accentPattern.length === next.timeSignature.numerator,
    "reduce: accentPattern length must equal timeSignature numerator",
  );
  return next;
}

function computeNext(state: TempoState, action: TempoAction): TempoState {
  switch (action.type) {
    case "PLAY":
      return state.isPlaying ? state : freeze({ ...state, isPlaying: true });
    case "STOP":
      return state.isPlaying ? freeze({ ...state, isPlaying: false }) : state;
    case "TOGGLE_PLAY":
      return freeze({ ...state, isPlaying: !state.isPlaying });
    case "SET_BPM":
      return freeze({ ...state, bpm: clampBpm(action.bpm) });
    case "NUDGE_BPM":
      return freeze({ ...state, bpm: clampBpm(state.bpm + action.delta) });
    case "SET_TIME_SIGNATURE":
      if (!isValidTimeSignature(action.signature)) return state;
      return freeze({
        ...state,
        timeSignature: Object.freeze({ ...action.signature }),
        accentPattern: freshAccentPattern(action.signature),
      });
    case "TOGGLE_ACCENT": {
      if (action.beatIndex < 0 || action.beatIndex >= state.accentPattern.length) {
        return state;
      }
      const next = state.accentPattern.slice();
      next[action.beatIndex] = !next[action.beatIndex];
      return freeze({ ...state, accentPattern: Object.freeze(next) });
    }
    case "SET_SUBDIVISION":
      return freeze({ ...state, subdivision: action.subdivision });
    case "SET_VOLUME":
      if (!Number.isFinite(action.volume)) return state;
      return freeze({ ...state, volume: clamp(action.volume, 0, 1) });
    case "SET_SOUND":
      return freeze({ ...state, sound: action.sound });
  }
}

const freeze = (state: TempoState): TempoState => Object.freeze(state);
