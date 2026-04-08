# Contributing to click

Thank you for considering a contribution. Read this in full before opening your first PR.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- (Optional, Phase 4) [Go](https://go.dev) ≥ 1.22 and [Wails](https://wails.io) for the native build

## Setup

```bash
git clone https://github.com/P4suta/click.git
cd click
bun install
bun run dev
```

## Workflow

1. Read [`CLAUDE.md`](../CLAUDE.md) and [`DESIGN.md`](../DESIGN.md).
2. Open or claim an issue.
3. Create a feature branch from `main`.
4. **Follow TDD strictly for `packages/core`**: failing test → minimum impl → refactor.
5. Run `bun run ci` locally before pushing.
6. Open a PR. Fill out the template.
7. CI must be green for the PR to be eligible for merge.
8. Maintainers run the [3-round review](../CLAUDE.md#multi-agent-post-implementation-review-3-rounds).

## Commit style

- One coherent change per commit. Prefer many small commits over one giant one.
- Use the imperative mood: `Add tap tempo median filter`, not `added` or `adds`.
- Reference issues with `#123` if applicable.
- Each TDD cycle (red-green-refactor) ideally lives in 1-3 commits.

## Coverage

- `packages/core/src/**` must remain at **100%** lines/branches/functions/statements. CI enforces this.
- `packages/web/src/**` should stay at 95%+. Entrypoints and generated SW code are excluded.
- Don't game coverage with trivial tests. Property tests are preferred where mechanical coverage would be meaningless.

## Code style

Biome enforces formatting and a strict linter ruleset. Run `bun run lint:fix` before committing. Don't disable rules without justification in the PR.

## Branch protection (maintainer setup)

The `main` branch should be configured with:

- Require pull request before merging
- Require all status checks to pass (`lint`, `typecheck`, `test-core`, `test-web`, `build`)
- Require linear history (no merge commits)
- Restrict who can push to matching branches

## Reporting bugs

Use the bug issue template. Include:
- Browser + version
- OS
- Steps to reproduce
- Expected vs. actual behavior
- Console errors if any

## Proposing features

Use the feature issue template. Discuss before implementing — large PRs without prior agreement may be closed.

## Design changes

Visual changes require an update to [`DESIGN.md`](../DESIGN.md) **first**. New colors, fonts, spacing values, or component patterns must be documented there before code changes are reviewed.

## Releasing (maintainers)

```bash
# Bump version, commit, tag
git tag v0.x.0
git push origin v0.x.0
```

The release workflow builds Wails native binaries (Phase 4+) and attaches them to the GitHub release.
