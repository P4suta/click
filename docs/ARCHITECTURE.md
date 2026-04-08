# Architecture

`click` follows a **hexagonal / ports-and-adapters** design. The core domain is pure TypeScript with zero browser, DOM, or Web Audio dependencies. All I/O lives at the edges and is injected as an interface.

## Why this matters

Because `Scheduler` takes a `Clock` (interface) and emits `BeatEvent` to a callback — never an `AudioContext` — tests inject a `FakeClock` and run deterministically in microseconds. There is no audio mock to maintain, no flaky timer, no `setTimeout` in tests. **This is what makes 100% coverage feasible *and* meaningful.**

## Layers

```
+---------------------------------------------------+
|  packages/web (Solid UI + Web Audio adapter)      |
|                                                   |
|   - components/   - audio/web-audio-port.ts       |
|   - hooks/        - audio/real-clock.ts           |
|   - state/        - audio/sound-bank.ts           |
+---------------------|-----------------------------+
                      |
                      | depends on (workspace:*)
                      v
+---------------------------------------------------+
|  packages/core (pure TS, no browser deps)         |
|                                                   |
|   - clock.ts          (interface)                 |
|   - scheduler.ts      (uses Clock + emits events) |
|   - tap-tempo.ts      (pure)                      |
|   - tempo-state.ts    (reducer)                   |
|   - beat-pattern.ts   (pure)                      |
|   - types.ts, constants.ts                        |
+---------------------------------------------------+
```

## Ports

| Port | Defined in | Implemented by |
|---|---|---|
| `Clock` | `packages/core/src/clock.ts` | `packages/web/src/audio/real-clock.ts` (production), `packages/core/tests/fakes/fake-clock.ts` (tests) |
| Audio sink | callback `(BeatEvent) => void` passed to `Scheduler.start` | `packages/web/src/audio/web-audio-port.ts` schedules `OscillatorNode`s |

The core never imports anything browser-specific. The web layer imports core via `@click/core` (Bun workspace).

## Scheduler contract

The scheduler implements the [Chris Wilson lookahead pattern](https://web.dev/articles/audio-scheduling):

1. `setTimer(callback, lookaheadMs)` is called periodically (default 25 ms).
2. On each tick, while `nextNoteTime < clock.now() + scheduleAheadSec` (default 100 ms), an event is emitted with its absolute target time.
3. The audio adapter (`web-audio-port.ts`) receives each event, translates the time from `performance.now()`-based seconds to `AudioContext.currentTime`-based seconds via a captured `audioOffset`, then schedules an `OscillatorNode` to play at exactly that time using `osc.start(time)`. Web Audio's hardware clock guarantees sub-millisecond precision regardless of main-thread jitter.

Modern browsers do not throttle setTimeout in tabs playing audible audio, so a main-thread scheduler is sufficient for Phase 1. A Web Worker host can be added later as a defense-in-depth measure.

## State management

`packages/core/src/tempo-state.ts` exports a pure reducer (`reduce(state, action) => state`) and an `initialState()` constructor. The Solid UI wraps this in `createStore` so reactivity is fine-grained: only components subscribed to a specific field re-run when it changes.

`packages/web/src/state/persistence.ts` reads/writes a subset of the state to `localStorage` on change. Loading happens once at startup. Failures are silent (private mode, quota).

## Why no backend?

A metronome is a stateless personal tool. Tracking, accounts, sharing, and statistics are anti-features for a focused practice aid. The PWA is fully self-contained and works offline forever once installed.

## Testing

- **`packages/core/tests`** — Vitest. Pure unit tests with `FakeClock`. Property-based tests via `fast-check` for the scheduler (drift) and tap-tempo (convergence). 100% coverage enforced.
- **`packages/web/tests`** — Vitest + happy-dom. Component tests for Solid components (`@solidjs/testing-library`). Audio tests use a small hand-rolled `FakeAudioContext` (~50 lines).

## Build pipeline

1. `bun run build` builds `packages/core` (declaration files only, since it's consumed as TypeScript) and `packages/web` (Vite production build with PWA service worker).
2. CI runs lint → typecheck → test:coverage → build → deploy to GitHub Pages on `main`.
3. Tagged releases (`v*`) trigger the Wails native build matrix and attach binaries to the GitHub release.
