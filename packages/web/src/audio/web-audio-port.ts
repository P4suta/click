import {
  type BeatEvent,
  type BeatPattern,
  type Clock,
  Scheduler,
  type SoundId,
  ensures,
  generateBeatPattern,
  requires,
} from "@click/core";
import { RealClock } from "./real-clock";
import { playClick } from "./sound-bank";

const validateMetronomeParams = (params: MetronomeParams, label: string): void => {
  requires(
    params !== null && typeof params === "object",
    `${label}: params must be a non-null object`,
  );
  requires(Number.isFinite(params.bpm), `${label}: params.bpm must be a finite number`);
  requires(
    params.timeSignature !== null && typeof params.timeSignature === "object",
    `${label}: params.timeSignature must be a non-null object`,
  );
  requires(
    Number.isInteger(params.timeSignature.numerator) && params.timeSignature.numerator >= 1,
    `${label}: params.timeSignature.numerator must be a positive integer`,
  );
  requires(
    params.timeSignature.denominator === 2 ||
      params.timeSignature.denominator === 4 ||
      params.timeSignature.denominator === 8 ||
      params.timeSignature.denominator === 16,
    `${label}: params.timeSignature.denominator must be one of 2, 4, 8, 16`,
  );
  requires(Array.isArray(params.accentPattern), `${label}: params.accentPattern must be an array`);
  requires(
    params.subdivision === 1 ||
      params.subdivision === 2 ||
      params.subdivision === 3 ||
      params.subdivision === 4,
    `${label}: params.subdivision must be one of 1, 2, 3, 4`,
  );
  requires(Number.isFinite(params.volume), `${label}: params.volume must be a finite number`);
  requires(typeof params.sound === "string", `${label}: params.sound must be a string`);
};

const clampVolume = (v: number): number => {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
};

const patternDirty = (a: MetronomeParams, b: MetronomeParams): boolean => {
  if (a.bpm !== b.bpm) return true;
  if (a.subdivision !== b.subdivision) return true;
  if (a.timeSignature.numerator !== b.timeSignature.numerator) return true;
  if (a.timeSignature.denominator !== b.timeSignature.denominator) return true;
  if (a.accentPattern.length !== b.accentPattern.length) return true;
  for (let i = 0; i < a.accentPattern.length; i++) {
    if (a.accentPattern[i] !== b.accentPattern[i]) return true;
  }
  return false;
};

export interface MetronomeParams {
  readonly bpm: number;
  readonly timeSignature: { readonly numerator: number; readonly denominator: 2 | 4 | 8 | 16 };
  readonly accentPattern: readonly boolean[];
  readonly subdivision: 1 | 2 | 3 | 4;
  readonly volume: number;
  readonly sound: SoundId;
}

/**
 * Bridge between the pure core scheduler and the browser's Web Audio API.
 *
 * The audio context is created lazily on the first `start()` call to satisfy
 * the iOS Safari autoplay policy: `AudioContext` cannot leave the suspended
 * state until a user gesture has resumed it. Callers should invoke `start`
 * inside a click/keydown handler.
 *
 * Timebase: the core scheduler's `Clock` reports `performance.now()/1000`
 * seconds, while Web Audio scheduling needs `AudioContext.currentTime`
 * seconds. We capture `audioOffset = ctx.currentTime - clock.now()` at start
 * and translate every beat's time before calling `playClick`. The two clocks
 * advance at the same rate (real-time wall clock), so the offset is constant
 * for the duration of one play session.
 */
export class WebAudioPort {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private scheduler: Scheduler;
  private clock: Clock;
  private currentParams: MetronomeParams | null = null;
  private onBeat: ((event: BeatEvent) => void) | null = null;
  private audioOffset = 0;
  private starting = false;

  constructor(scheduler?: Scheduler, clock: Clock = new RealClock()) {
    requires(
      clock !== null && typeof clock === "object",
      "WebAudioPort: clock must be a non-null Clock object",
    );
    requires(
      typeof clock.now === "function" && typeof clock.setTimer === "function",
      "WebAudioPort: clock must implement now() and setTimer()",
    );
    this.clock = clock;
    this.scheduler = scheduler ?? new Scheduler(clock);
  }

  /** Subscribe to beat events for visual feedback. */
  setOnBeat(listener: ((event: BeatEvent) => void) | null): void {
    requires(
      listener === null || typeof listener === "function",
      "WebAudioPort.setOnBeat: listener must be a function or null",
    );
    this.onBeat = listener;
  }

  async start(params: MetronomeParams): Promise<void> {
    validateMetronomeParams(params, "WebAudioPort.start");
    if (this.starting || this.scheduler.isRunning) return;
    this.starting = true;
    try {
      const ctx = this.ensureContext();
      if (ctx.state === "suspended") await ctx.resume();
      this.audioOffset = ctx.currentTime - this.clock.now();
      this.currentParams = params;
      const master = this.master;
      if (master) master.gain.value = clampVolume(params.volume);
      const pattern = this.toPattern(params);
      this.scheduler.start(pattern, (event) => this.handleBeat(event));
      ensures(
        this.scheduler.isRunning,
        "WebAudioPort.start: scheduler must be running after start completes",
      );
    } finally {
      this.starting = false;
    }
  }

  stop(): void {
    this.scheduler.stop();
    this.currentParams = null;
    ensures(
      !this.scheduler.isRunning,
      "WebAudioPort.stop: scheduler must not be running after stop()",
    );
    ensures(
      this.currentParams === null,
      "WebAudioPort.stop: currentParams must be cleared after stop()",
    );
  }

  /** Apply parameter changes (BPM, accents, signature) without stopping. */
  update(params: MetronomeParams): void {
    validateMetronomeParams(params, "WebAudioPort.update");
    if (!this.scheduler.isRunning) {
      this.currentParams = params;
      return;
    }
    const prev = this.currentParams;
    if (this.master && prev && params.volume !== prev.volume) {
      this.master.gain.value = clampVolume(params.volume);
    }
    this.currentParams = params;
    // Only re-synthesize the pattern if pattern-affecting parameters changed.
    // Volume and sound updates do not require re-anchoring the scheduler.
    if (!prev || patternDirty(prev, params)) {
      this.scheduler.updatePattern(this.toPattern(params));
    }
  }

  get isRunning(): boolean {
    return this.scheduler.isRunning;
  }

  /** Release audio resources. Useful when navigating away. */
  async dispose(): Promise<void> {
    this.stop();
    const ctx = this.context;
    if (ctx) {
      await ctx.close();
      this.context = null;
      this.master = null;
    }
    ensures(
      !this.scheduler.isRunning,
      "WebAudioPort.dispose: scheduler must not be running after dispose()",
    );
  }

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    this.context = ctx;
    this.master = master;
    return ctx;
  }

  private toPattern(params: MetronomeParams): BeatPattern {
    return generateBeatPattern({
      bpm: params.bpm,
      timeSignature: params.timeSignature,
      accentPattern: params.accentPattern,
      subdivision: params.subdivision,
    });
  }

  private handleBeat(event: BeatEvent): void {
    const params = this.currentParams;
    const ctx = this.context;
    const master = this.master;
    if (params && ctx && master) {
      playClick({
        context: ctx,
        destination: master,
        time: event.time + this.audioOffset,
        accent: event.accent,
        sound: params.sound,
        volume: clampVolume(params.volume),
      });
    }
    this.onBeat?.(event);
  }
}
