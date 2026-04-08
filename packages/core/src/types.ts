/**
 * Time signature: numerator/denominator (e.g. 4/4, 3/4, 6/8).
 * Numerator is the count of beats per measure; denominator is the note value
 * that gets one beat.
 */
export interface TimeSignature {
  readonly numerator: number;
  readonly denominator: 2 | 4 | 8 | 16;
}

/** Subdivision of each beat. 1 = no subdivision, 2 = eighths, 3 = triplets, 4 = sixteenths. */
export type Subdivision = 1 | 2 | 3 | 4;

/** Identifier of a synthesized click sound. */
export type SoundId = "click" | "beep" | "wood" | "cowbell";

/**
 * One beat (or subdivision) within a measure, with its absolute scheduled
 * time in seconds (relative to the clock's zero) and whether it is accented.
 */
export interface BeatEvent {
  /** Index of the beat within the measure (0-based). */
  readonly beatIndex: number;
  /** Index of the subdivision within the beat (0-based). 0 = the beat itself. */
  readonly subdivisionIndex: number;
  /** Absolute time in seconds when this beat should sound. */
  readonly time: number;
  /** True if this beat is accented (downbeat or user-toggled accent). */
  readonly accent: boolean;
}

/**
 * One measure of beats expressed as offsets from the start of the measure,
 * along with their accent flags. Used by the scheduler to schedule the next
 * note relative to a measure anchor.
 */
export interface BeatPattern {
  /** BPM at which this pattern was generated. */
  readonly bpm: number;
  /** Time signature this pattern represents. */
  readonly timeSignature: TimeSignature;
  /** Total length of the measure in seconds (derived from bpm + signature). */
  readonly measureDurationSec: number;
  /** Beats within one measure, in order. `time` is the offset from measure start. */
  readonly beats: readonly BeatEvent[];
}

/** Full state of the metronome. */
export interface TempoState {
  readonly isPlaying: boolean;
  readonly bpm: number;
  readonly timeSignature: TimeSignature;
  /** One boolean per beat in the measure. true = accented. */
  readonly accentPattern: readonly boolean[];
  readonly subdivision: Subdivision;
  /** Linear volume in [0, 1]. */
  readonly volume: number;
  readonly sound: SoundId;
}

/** Discriminated union of all reducer actions. */
export type TempoAction =
  | { readonly type: "PLAY" }
  | { readonly type: "STOP" }
  | { readonly type: "TOGGLE_PLAY" }
  | { readonly type: "SET_BPM"; readonly bpm: number }
  | { readonly type: "NUDGE_BPM"; readonly delta: number }
  | { readonly type: "SET_TIME_SIGNATURE"; readonly signature: TimeSignature }
  | { readonly type: "TOGGLE_ACCENT"; readonly beatIndex: number }
  | { readonly type: "SET_SUBDIVISION"; readonly subdivision: Subdivision }
  | { readonly type: "SET_VOLUME"; readonly volume: number }
  | { readonly type: "SET_SOUND"; readonly sound: SoundId };
