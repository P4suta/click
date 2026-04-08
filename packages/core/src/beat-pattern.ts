import { ensures, requires } from "./contracts";
import type { BeatEvent, BeatPattern, Subdivision, TimeSignature } from "./types";

export interface BeatPatternInput {
  readonly bpm: number;
  readonly timeSignature: TimeSignature;
  readonly accentPattern: readonly boolean[];
  readonly subdivision: Subdivision;
}

/**
 * Generate one measure of beat events from the given tempo parameters.
 *
 * The "pulse note" is the note value that gets one beat in the time signature
 * — quarter for x/4, eighth for x/8, etc. The pulse interval in seconds is:
 *
 *   pulseSec = 60 / bpm * (4 / denominator)
 *
 * Within each pulse, `subdivision` events are placed at equal intervals.
 * Only the main beat (subdivisionIndex === 0) can carry the user's accent.
 */
export function generateBeatPattern(input: BeatPatternInput): BeatPattern {
  requires(
    input !== null && typeof input === "object",
    "generateBeatPattern: input must be a non-null object",
  );
  requires(
    input.timeSignature !== null && typeof input.timeSignature === "object",
    "generateBeatPattern: input.timeSignature must be a non-null object",
  );
  requires(
    Array.isArray(input.accentPattern),
    "generateBeatPattern: input.accentPattern must be an array",
  );
  requires(
    input.subdivision === 1 ||
      input.subdivision === 2 ||
      input.subdivision === 3 ||
      input.subdivision === 4,
    "generateBeatPattern: subdivision must be one of 1, 2, 3, 4",
  );
  requires(
    input.timeSignature.denominator === 2 ||
      input.timeSignature.denominator === 4 ||
      input.timeSignature.denominator === 8 ||
      input.timeSignature.denominator === 16,
    "generateBeatPattern: denominator must be one of 2, 4, 8, 16",
  );
  const { bpm, timeSignature, accentPattern, subdivision } = input;
  // The two existing RangeError throws are part of the public API contract
  // (tested via .toThrow(RangeError)). They are kept as-is and complement
  // the contract preconditions above.
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new RangeError(`generateBeatPattern: bpm must be a positive finite number, got ${bpm}`);
  }
  if (!Number.isInteger(timeSignature.numerator) || timeSignature.numerator < 1) {
    throw new RangeError(
      `generateBeatPattern: numerator must be a positive integer, got ${timeSignature.numerator}`,
    );
  }
  const pulseSec = (60 / bpm) * (4 / timeSignature.denominator);
  const subPulseSec = pulseSec / subdivision;
  const beats: BeatEvent[] = [];
  for (let beatIndex = 0; beatIndex < timeSignature.numerator; beatIndex++) {
    const accent = accentPattern[beatIndex] === true;
    for (let sub = 0; sub < subdivision; sub++) {
      beats.push({
        beatIndex,
        subdivisionIndex: sub,
        time: beatIndex * pulseSec + sub * subPulseSec,
        accent: sub === 0 && accent,
      });
    }
  }
  const result = Object.freeze({
    bpm,
    timeSignature,
    measureDurationSec: pulseSec * timeSignature.numerator,
    beats: Object.freeze(beats),
  });
  ensures(Object.isFrozen(result), "generateBeatPattern: result must be frozen");
  ensures(Object.isFrozen(result.beats), "generateBeatPattern: result.beats must be frozen");
  ensures(
    result.beats.length === timeSignature.numerator * subdivision,
    "generateBeatPattern: beats length must equal numerator * subdivision",
  );
  ensures(
    result.measureDurationSec > 0,
    "generateBeatPattern: measureDurationSec must be positive",
  );
  ensures(result.bpm === bpm, "generateBeatPattern: result.bpm must equal input.bpm");
  return result;
}
