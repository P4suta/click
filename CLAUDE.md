# CLAUDE.md — Agent Guidance for `click`

This file is the source of truth for how AI agents (Claude Code and similar) should approach work on this project. Read it in full before making changes.

## Project Overview

`click` is a zero-backend, offline-first music practice metronome built as a PWA and an optional Wails (Go) native binary. The goal is a best-in-class modern TypeScript implementation with strict TDD, 100% core coverage, and zero dependencies that aren't essential.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime / PM | Bun ≥ 1.3 (workspaces) | Fastest installs, native TS, single tool |
| Language | TypeScript 6 strict | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Bundler | Vite 8 | Best DX, mature PWA plugin |
| UI Framework | Solid 1.9 | Smallest bundle, fine-grained reactivity, no VDOM |
| Lint / Format | Biome 2.4 | Single tool, 10-100× faster than ESLint+Prettier |
| Tests | Vitest 4 + happy-dom 20 + fast-check 4 | Native ESM, fast, property tests |
| Coverage | @vitest/coverage-v8 | V8-native, 100% enforced for core |
| Mutation testing | @stryker-mutator/core 9 + vitest-runner 9 | Quality of test suite — current core mutation score 90.89% |
| Contracts | hand-rolled `contracts.ts` (zero deps) | `requires` / `ensures` / `invariant` with TS `asserts` predicates |
| PWA | vite-plugin-pwa + Workbox 7 | Industry standard offline-first |
| Audio | Web Audio API (native) | No deps, Chris Wilson lookahead pattern |
| Native | Wails v2 (Go) | Reuses web bundle, tiny binaries |
| CI | GitHub Actions | Native Pages deploy |

**Backend**: None. The metronome is 100% client-side. Hono is intentionally not used.

**Explicitly rejected**: React, Tailwind, Redux/Zustand, ESLint, Prettier, Jest, Storybook, Turborepo, Tauri, external audio libs.

## TDD Policy (Mandatory for `packages/core`)

**RED → GREEN → REFACTOR**:

1. Write a failing test that describes the next behavior.
2. Run `bun test` and confirm it fails for the right reason.
3. Write the minimum code to make it pass.
4. Run `bun test` and confirm green.
5. Refactor (rename, extract, simplify) with tests still green.
6. Commit the cycle.

**Coverage targets** (enforced in CI):
- `packages/core/src/**`: **100%** lines/branches/functions/statements
- `packages/web/src/**`: 95%+ (entrypoint and generated code excluded)

If a line cannot reasonably be covered, remove it. If you must keep it, mark it explicitly with an exemption comment and justify in the PR description.

## テスト方針 (Quality Strategy)

- テストでは正常系だけでなく、**境界値と異常系を必ず含める**。
- assertion には**人間が読めるメッセージ**を付与する (例: `expect(x).toBe(y, "...")` 不可なら test 名で表現する)。
- public 関数には**事前条件・事後条件を `requires`/`ensures` で明記する** (`@click/core` の `contracts.ts` ヘルパー、または `@click/core` 経由)。`invariant` はクラス内の状態遷移に使う。
- **property-based test** を `fast-check` で積極的に使い、具体値テストを補完する。アルゴリズム法則 (round-trip, idempotency, monotonicity, involution, oracle, 不変保存) を優先表現する。
- **mutation score** を品質指標として参照する (`bun run mutation` で Stryker を走らせる)。core の現状値は 90.89% (2026 年 4 月時点)。新規 PR でこの値を**下げてはならない**。
- 契約 (`requires`/`ensures`) は production の防御コードではなく**仕様の宣言**である。CLAUDE.md の「不可能な状態への防御を入れない」原則と矛盾しない: 契約は呼び出し側との約束を明文化するもので、内部実装の冗長な防御ではない。
- 既存の 3 段階品質強化 (Phase 1 契約 / Phase 2 性質 / Phase 3 変異) で発見されたパターンは `CONTRACT_REPORT.md` / `PROPERTY_REPORT.md` / `MUTATION_REPORT.md` を参照。

## Multi-Agent Post-Implementation Review (3 Rounds)

After each feature is green, run three review passes (each as a fresh agent invocation so context doesn't bleed). Findings from each round become commits separate from the feature.

### Round 1 — Correctness & Performance
- Does the implementation match the spec and tests?
- Race conditions? Off-by-one? Timing drift?
- Hot paths: any unnecessary allocations in the scheduler tick?
- Does the scheduler stay drift-free over 10 minutes at 300 BPM?

### Round 2 — Optimization & Simplification
- Can any module be smaller?
- Can any type be sharper?
- Dead code? Speculative generality?
- Can any abstraction be inlined? (YAGNI check)

### Round 3 — Edge Cases & Defensive Coding
- BPM boundaries (29, 30, 300, 301)?
- AudioContext suspended (iOS autoplay policy)?
- Single tap then nothing?
- localStorage full or disabled (private mode)?
- Service worker fails to register?
- BPM changed mid-beat?

## Coding Conventions

### Universal
- **Pure functions for all core logic.** Side effects live at the edges (audio adapter, persistence, DOM).
- **Immutable data.** `readonly` on all type fields, `Object.freeze` in tests to detect mutation.
- **Web Standards over libraries.** `URL`, `crypto.randomUUID`, `structuredClone`, `AbortController`, `Intl.NumberFormat` are native — use them.
- **No `any`.** Use `unknown` and narrow.
- **No default exports** (except `main.tsx`, `vite.config.ts`, `*.config.*`, and Web Workers). Named exports are greppable and refactor-safe.
- **No barrel files deeper than `packages/*/src/index.ts`.** Intermediate `index.ts` hides dependencies.
- **Avoid premature abstraction.** Inline the second use; extract on the third.
- **File size**: prefer < 200 lines. **Function size**: prefer < 40 lines.
- **Comments**: explain *why*, not *what*. Obvious code needs no comments.
- **Error handling**: discriminated unions for expected errors, `throw` only for programmer errors. No `try/catch` in `packages/core`.
- **No `console.log`** in committed code (Biome enforces; `console.warn`/`error` allowed).
- **Early return / early continue** to flatten nesting (carry-over from competitive-programming style).
- **Naming**: short but meaningful (`flat`, `rank`, `count`, `beat`). Avoid 1-letter names and cryptic abbreviations (`sz`, `indeg`).
- **Standard library first.** Don't reinvent `Array.prototype.*`, `Map`, `Set`, `Intl.*`.
- **Ternaries** are fine and often clearer than `if`/`else`.
- **No streams** for collection processing — use simple loops or `Array.prototype` methods, not custom iterables.

### Web Specific
- **CSS**: only via `tokens.css` custom properties. No inline styles. No utility-CSS frameworks.
- **Accessibility (non-negotiable)**:
  - Every interactive element keyboard-operable
  - Every icon-only button has `aria-label`
  - Visible focus states using `--primary-hover`
  - Color contrast ≥ 4.5:1 for text (≥ 3:1 for large text)
  - Animations respect `prefers-reduced-motion`

### Performance-Critical Paths (Scheduler)
- Avoid allocating in the scheduler tick (no `new Object()`, no array spreads inside the loop).
- Reuse buffers and event objects where possible.
- Prefer typed arrays for fixed-size numeric data.

### What Does NOT Carry Over from Competitive Programming
The Java-specific rule "avoid raw arrays, use Collections" is not applicable. In TypeScript, idiomatic `Array`, `Map`, `Set` are correct. The performance reasoning still applies though: prefer typed arrays in the scheduler hot loop to avoid GC churn.

## File Structure

See `docs/ARCHITECTURE.md` for the full diagram. High-level:

- `packages/core/` — pure TypeScript domain. Zero browser/DOM/audio dependencies. 100% test coverage.
- `packages/web/` — Solid + Vite + PWA. Adapts core to the browser via `audio/` and `state/`.
- `native/` — Wails Go wrapper (Phase 4). Reuses `packages/web/dist`.
- `.github/workflows/` — CI/CD pipelines.
- `docs/` — Architecture and contribution docs.
- `DESIGN.md` — Single source of truth for visual design (read it before touching `packages/web/src/components` or `styles/`).

## Commands

```bash
# install
bun install

# dev
bun run dev               # vite dev server
bun run build             # build all packages

# test
bun run test              # all tests
bun run test:core         # core only
bun run test:web          # web only
bun run test:watch        # vitest watch mode (core)
bun run test:coverage     # full coverage report + threshold check

# quality
bun run lint              # biome check
bun run lint:fix          # biome check --write
bun run format            # biome format --write
bun run typecheck         # tsc -b (all workspaces)

# mutation testing (Stryker on packages/core)
bun run mutation          # ~5 minutes; HTML report at packages/core/reports/mutation/

# everything
bun run ci                # lint && typecheck && test:coverage && build

# preview production build
bun run preview
```

## Reference Policy

**Always consult the official documentation before adopting an API, pattern, or configuration.** When sources conflict, the official source wins.

- Bun: https://bun.sh/docs
- Vite: https://vitejs.dev/guide/
- Solid: https://docs.solidjs.com/
- Biome: https://biomejs.dev/guides/
- Vitest: https://vitest.dev/guide/
- vite-plugin-pwa: https://vite-pwa-org.netlify.app/
- Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- Chris Wilson, *A tale of two clocks*: https://web.dev/articles/audio-scheduling
- Wails: https://wails.io/docs/
- DESIGN.md convention: https://github.com/VoltAgent/awesome-design-md

## Working with this Repo

- Read `DESIGN.md` before touching any UI code.
- Read this file before touching `packages/core` (TDD policy is non-negotiable).
- Don't add a dependency without justifying it in the PR description against the existing tech stack table.
- Don't introduce a new color, font, or spacing value without first proposing an addition to `DESIGN.md`.
- Run `bun run ci` locally before opening a PR.
