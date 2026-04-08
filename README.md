# click

A modern, offline-first music practice metronome.

[![CI](https://github.com/P4suta/click/actions/workflows/ci.yml/badge.svg)](https://github.com/P4suta/click/actions/workflows/ci.yml)
[![Pages](https://img.shields.io/badge/demo-GitHub%20Pages-blue)](https://P4suta.github.io/click/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> Built with Bun · Vite · Solid · TypeScript · Biome · Vitest · vite-plugin-pwa · Web Audio API · Wails (Go).

## Features

- Rock-solid timing using the Chris Wilson lookahead scheduler pattern
- Tap tempo with rolling-window outlier rejection
- 4/4, 3/4, 6/8 time signatures with downbeat accent
- Visual beat indicator synced to audio
- Keyboard shortcuts (`Space` play/stop, `T` tap, `↑`/`↓` BPM)
- Installable PWA — works fully offline
- Native portable build via Wails (Windows / macOS / Linux) — Phase 4
- Zero tracking, zero accounts, zero backend

## Quickstart

```bash
bun install
bun run dev          # http://localhost:5173
```

## Commands

| Command | Description |
|---|---|
| `bun run dev` | Vite dev server (web) |
| `bun run build` | Build all packages |
| `bun run test` | Run all tests |
| `bun run test:coverage` | Coverage report (core 100% enforced) |
| `bun run lint` | Biome check |
| `bun run typecheck` | tsc across all workspaces |
| `bun run ci` | lint + typecheck + test:coverage + build |

## Architecture

- `packages/core` — pure TypeScript domain (clock, scheduler, tap-tempo, state). Zero browser dependencies. Tests run in microseconds with an injected fake clock.
- `packages/web` — Solid + Vite + PWA. Wraps core via a Web Audio adapter.
- `native/` — Wails Go wrapper that reuses the web bundle. Phase 4.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for details.

## Contributing

Read [`CLAUDE.md`](CLAUDE.md) for the development methodology (TDD, conventions, multi-agent review). Read [`DESIGN.md`](DESIGN.md) before touching the UI. Read [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) for the PR workflow.

## License

[MIT](LICENSE)
