import { type SoundId, requires } from "@click/core";

/**
 * Synthesized click sounds. Each sound is rendered to an OscillatorNode +
 * GainNode envelope, scheduled at a precise audio-context time. No samples
 * are loaded — everything is generated on the fly so the PWA stays tiny and
 * works fully offline.
 */

interface VoiceSpec {
  readonly accentFreq: number;
  readonly normalFreq: number;
  readonly type: OscillatorType;
  readonly duration: number;
  readonly attack: number;
  readonly release: number;
}

const VOICES: Readonly<Record<SoundId, VoiceSpec>> = {
  click: {
    accentFreq: 1500,
    normalFreq: 1000,
    type: "square",
    duration: 0.04,
    attack: 0.001,
    release: 0.03,
  },
  beep: {
    accentFreq: 1320,
    normalFreq: 880,
    type: "sine",
    duration: 0.07,
    attack: 0.002,
    release: 0.06,
  },
  wood: {
    accentFreq: 1800,
    normalFreq: 1200,
    type: "triangle",
    duration: 0.05,
    attack: 0.001,
    release: 0.04,
  },
  cowbell: {
    accentFreq: 800,
    normalFreq: 540,
    type: "sawtooth",
    duration: 0.08,
    attack: 0.001,
    release: 0.07,
  },
};

export interface PlayClickArgs {
  readonly context: AudioContext;
  readonly destination: AudioNode;
  readonly time: number;
  readonly accent: boolean;
  readonly sound: SoundId;
  readonly volume: number;
}

export function playClick(args: PlayClickArgs): void {
  requires(args !== null && typeof args === "object", "playClick: args must be a non-null object");
  requires(
    args.context !== null && typeof args.context === "object",
    "playClick: args.context must be a non-null AudioContext-like object",
  );
  requires(
    args.destination !== null && typeof args.destination === "object",
    "playClick: args.destination must be a non-null AudioNode-like object",
  );
  requires(
    Number.isFinite(args.time) && args.time >= 0,
    "playClick: args.time must be a non-negative finite number (audio-context seconds)",
  );
  requires(Number.isFinite(args.volume), "playClick: args.volume must be a finite number");
  requires(typeof args.accent === "boolean", "playClick: args.accent must be a boolean");
  requires(typeof args.sound === "string", "playClick: args.sound must be a string");
  // Defensive lookup: an upstream schema breach could deliver an unknown
  // SoundId. Fall back to the default voice rather than throwing per-beat.
  const voice = VOICES[args.sound] ?? VOICES.click;
  if (args.volume <= 0) return; // muted: skip the ramp entirely (avoids exp-ramp warnings)
  const osc = args.context.createOscillator();
  const gain = args.context.createGain();
  osc.type = voice.type;
  osc.frequency.value = args.accent ? voice.accentFreq : voice.normalFreq;
  const peak = (args.accent ? 1 : 0.7) * args.volume;
  gain.gain.setValueAtTime(0.0001, args.time);
  gain.gain.linearRampToValueAtTime(peak, args.time + voice.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, args.time + voice.attack + voice.release);
  osc.connect(gain).connect(args.destination);
  osc.start(args.time);
  osc.stop(args.time + voice.duration + 0.01);
}
