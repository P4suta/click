import type { Clock } from "./clock";
import { DEFAULT_LOOKAHEAD_MS, DEFAULT_SCHEDULE_AHEAD_SEC } from "./constants";
import { ensures, invariant, requires } from "./contracts";
import type { BeatEvent, BeatPattern } from "./types";

export interface SchedulerConfig {
  /** Period of the lookahead callback (ms). Default 25, per Chris Wilson. */
  readonly lookaheadMs: number;
  /** How far ahead of the current clock time to schedule beats (seconds). Default 0.1. */
  readonly scheduleAheadSec: number;
}

type OnBeat = (event: BeatEvent) => void;

/**
 * Lookahead beat scheduler implementing the Chris Wilson "two clocks" pattern.
 *
 * The scheduler does NOT touch Web Audio. It calls a user-supplied `onBeat`
 * callback with `BeatEvent` records that include an absolute target time. The
 * caller (an audio adapter) is responsible for scheduling the actual sound at
 * that time using `AudioContext.currentTime` semantics.
 *
 * Reference: https://web.dev/articles/audio-scheduling
 */
export class Scheduler {
  private readonly clock: Clock;
  private readonly config: SchedulerConfig;

  private running = false;
  private currentPattern: BeatPattern;
  private cancelTimer: (() => void) | null = null;

  /** Absolute time at which the current measure started. */
  private measureStartTime = 0;
  /** Index into `currentPattern.beats` of the next beat to emit. */
  private nextBeatIndex = 0;

  constructor(clock: Clock, config: Partial<SchedulerConfig> = {}) {
    requires(
      clock !== null && typeof clock === "object",
      "Scheduler: clock must be a non-null object",
    );
    requires(typeof clock.now === "function", "Scheduler: clock must implement a `now()` method");
    requires(
      typeof clock.setTimer === "function",
      "Scheduler: clock must implement a `setTimer(callback, delayMs)` method",
    );
    if (config.lookaheadMs !== undefined) {
      requires(
        Number.isFinite(config.lookaheadMs) && config.lookaheadMs > 0,
        "Scheduler: config.lookaheadMs must be a positive finite number",
      );
    }
    if (config.scheduleAheadSec !== undefined) {
      requires(
        Number.isFinite(config.scheduleAheadSec) && config.scheduleAheadSec > 0,
        "Scheduler: config.scheduleAheadSec must be a positive finite number",
      );
    }
    this.clock = clock;
    this.config = {
      lookaheadMs: config.lookaheadMs ?? DEFAULT_LOOKAHEAD_MS,
      scheduleAheadSec: config.scheduleAheadSec ?? DEFAULT_SCHEDULE_AHEAD_SEC,
    };
    this.currentPattern = EMPTY_PATTERN;
    invariant(!this.running, "Scheduler: must start in the not-running state");
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(pattern: BeatPattern, onBeat: OnBeat): void {
    requires(
      pattern !== null && typeof pattern === "object",
      "Scheduler.start: pattern must be a non-null object",
    );
    requires(
      Array.isArray(pattern.beats) && pattern.beats.length > 0,
      "Scheduler.start: pattern.beats must be a non-empty array",
    );
    requires(
      Number.isFinite(pattern.measureDurationSec) && pattern.measureDurationSec > 0,
      "Scheduler.start: pattern.measureDurationSec must be a positive finite number",
    );
    requires(typeof onBeat === "function", "Scheduler.start: onBeat must be a function");
    // Defend against double-start: cancel any pending lookahead before
    // re-arming to avoid leaking a parallel tick chain.
    this.cancelTimer?.();
    this.cancelTimer = null;
    this.currentPattern = pattern;
    this.measureStartTime = this.clock.now();
    this.nextBeatIndex = 0;
    this.running = true;
    this.tick(onBeat);
    invariant(this.running, "Scheduler.start: must be running after start()");
  }

  stop(): void {
    this.running = false;
    this.cancelTimer?.();
    this.cancelTimer = null;
    ensures(!this.running, "Scheduler.stop: must not be running after stop()");
    ensures(this.cancelTimer === null, "Scheduler.stop: cancelTimer must be cleared");
  }

  /**
   * Replace the current pattern (e.g. on BPM change). The next beat to be
   * emitted becomes beat 0 of a fresh measure under the new pattern, anchored
   * at the time the next beat was already going to fire. This means BPM
   * tweaks reset the measure position but preserve continuity at the next
   * beat boundary.
   */
  updatePattern(pattern: BeatPattern): void {
    requires(
      pattern !== null && typeof pattern === "object",
      "Scheduler.updatePattern: pattern must be a non-null object",
    );
    requires(
      Array.isArray(pattern.beats) && pattern.beats.length > 0,
      "Scheduler.updatePattern: pattern.beats must be a non-empty array",
    );
    requires(
      Number.isFinite(pattern.measureDurationSec) && pattern.measureDurationSec > 0,
      "Scheduler.updatePattern: pattern.measureDurationSec must be a positive finite number",
    );
    if (!this.running) return;
    const nextBeat = this.currentPattern.beats[this.nextBeatIndex] as BeatEvent;
    const nextBeatAbsoluteTime = this.measureStartTime + nextBeat.time;
    this.currentPattern = pattern;
    this.measureStartTime = nextBeatAbsoluteTime;
    this.nextBeatIndex = 0;
    invariant(
      this.nextBeatIndex < this.currentPattern.beats.length,
      "Scheduler.updatePattern: nextBeatIndex must be within new pattern bounds",
    );
  }

  private tick(onBeat: OnBeat): void {
    const horizon = this.clock.now() + this.config.scheduleAheadSec;
    // Cap iterations per tick so a backgrounded tab returning with a large
    // time delta doesn't emit thousands of beats in a single burst.
    let emitted = 0;
    while (this.running && emitted < MAX_BEATS_PER_TICK && this.peekNextBeatTime() < horizon) {
      this.emitNextBeat(onBeat);
      emitted++;
    }
    if (this.running && emitted >= MAX_BEATS_PER_TICK) {
      // We hit the cap — likely a long pause in scheduling. Resync to "now"
      // so the next tick doesn't try to drain the same backlog again.
      this.measureStartTime = this.clock.now();
      this.nextBeatIndex = 0;
    }
    if (this.running) {
      this.cancelTimer = this.clock.setTimer(() => this.tick(onBeat), this.config.lookaheadMs);
    }
  }

  private peekNextBeatTime(): number {
    const beat = this.currentPattern.beats[this.nextBeatIndex] as BeatEvent;
    return this.measureStartTime + beat.time;
  }

  private emitNextBeat(onBeat: OnBeat): void {
    const pattern = this.currentPattern;
    const beat = pattern.beats[this.nextBeatIndex] as BeatEvent;
    onBeat({
      beatIndex: beat.beatIndex,
      subdivisionIndex: beat.subdivisionIndex,
      accent: beat.accent,
      time: this.measureStartTime + beat.time,
    });
    this.nextBeatIndex++;
    if (this.nextBeatIndex >= pattern.beats.length) {
      this.nextBeatIndex = 0;
      this.measureStartTime += pattern.measureDurationSec;
    }
  }
}

/**
 * Hard cap on beats emitted per single tick. Protects against runaway loops
 * (e.g. a backgrounded tab returning with a 30s setTimeout delta or a
 * misconfigured BPM) without changing normal-case behavior.
 */
const MAX_BEATS_PER_TICK = 64;

const EMPTY_PATTERN: BeatPattern = Object.freeze({
  bpm: 0,
  timeSignature: { numerator: 1, denominator: 4 } as const,
  measureDurationSec: 0,
  beats: Object.freeze([
    Object.freeze({
      beatIndex: 0,
      subdivisionIndex: 0,
      time: Number.POSITIVE_INFINITY,
      accent: false,
    }),
  ]),
});
