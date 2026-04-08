import {
  MAX_BPM,
  MIN_BPM,
  type SoundId,
  type Subdivision,
  type TempoState,
  type TimeSignature,
  ensures,
  requires,
} from "@click/core";

const PERSISTED_KEYS = new Set([
  "bpm",
  "timeSignature",
  "accentPattern",
  "subdivision",
  "volume",
  "sound",
]);

const STORAGE_KEY = "click:tempo-state:v1";

export type Persisted = Pick<
  TempoState,
  "bpm" | "timeSignature" | "accentPattern" | "subdivision" | "volume" | "sound"
>;

const VALID_SOUNDS = new Set<SoundId>(["click", "beep", "wood", "cowbell"]);
const VALID_DENOMS = new Set([2, 4, 8, 16]);
const VALID_SUBDIVISIONS = new Set([1, 2, 3, 4]);

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

const validateBpm = (x: unknown): number | undefined => {
  if (typeof x !== "number" || !Number.isFinite(x)) return undefined;
  if (x < MIN_BPM || x > MAX_BPM) return undefined;
  return Math.round(x);
};

const validateTimeSignature = (x: unknown): TimeSignature | undefined => {
  if (!isObject(x)) return undefined;
  const { numerator, denominator } = x;
  if (
    typeof numerator !== "number" ||
    !Number.isInteger(numerator) ||
    numerator < 1 ||
    numerator > 16
  ) {
    return undefined;
  }
  if (typeof denominator !== "number" || !VALID_DENOMS.has(denominator)) return undefined;
  return { numerator, denominator: denominator as 2 | 4 | 8 | 16 };
};

const validateAccentPattern = (x: unknown, length: number): readonly boolean[] | undefined => {
  if (!Array.isArray(x) || x.length !== length) return undefined;
  if (!x.every((b) => typeof b === "boolean")) return undefined;
  return x as readonly boolean[];
};

const validateSubdivision = (x: unknown): Subdivision | undefined => {
  if (typeof x !== "number" || !VALID_SUBDIVISIONS.has(x)) return undefined;
  return x as Subdivision;
};

const validateVolume = (x: unknown): number | undefined => {
  if (typeof x !== "number" || !Number.isFinite(x)) return undefined;
  if (x < 0 || x > 1) return undefined;
  return x;
};

const validateSound = (x: unknown): SoundId | undefined => {
  if (typeof x !== "string" || !VALID_SOUNDS.has(x as SoundId)) return undefined;
  return x as SoundId;
};

type MutablePartialPersisted = {
  -readonly [K in keyof Persisted]?: Persisted[K];
};

const validatePersisted = (raw: unknown): Partial<Persisted> => {
  if (!isObject(raw)) return {};
  const result: MutablePartialPersisted = {};
  const { bpm, timeSignature, accentPattern, subdivision, volume, sound } = raw;
  const validBpm = validateBpm(bpm);
  if (validBpm !== undefined) result.bpm = validBpm;
  const validSig = validateTimeSignature(timeSignature);
  if (validSig !== undefined) {
    result.timeSignature = validSig;
    const validAccent = validateAccentPattern(accentPattern, validSig.numerator);
    if (validAccent !== undefined) result.accentPattern = validAccent;
  }
  const validSub = validateSubdivision(subdivision);
  if (validSub !== undefined) result.subdivision = validSub;
  const validVol = validateVolume(volume);
  if (validVol !== undefined) result.volume = validVol;
  const validSound = validateSound(sound);
  if (validSound !== undefined) result.sound = validSound;
  return result;
};

export function loadPersisted(): Partial<Persisted> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const validated = validatePersisted(parsed);
    if (Object.keys(validated).length === 0) return null;
    ensures(
      Object.keys(validated).every((k) => PERSISTED_KEYS.has(k)),
      "loadPersisted: returned object must contain only validated Persisted keys",
    );
    return validated;
  } catch {
    return null;
  }
}

export function savePersisted(state: TempoState): void {
  requires(
    state !== null && typeof state === "object",
    "savePersisted: state must be a non-null TempoState object",
  );
  const subset: Persisted = {
    bpm: state.bpm,
    timeSignature: state.timeSignature,
    accentPattern: state.accentPattern,
    subdivision: state.subdivision,
    volume: state.volume,
    sound: state.sound,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subset));
  } catch {
    /* private mode / quota — silent */
  }
}
