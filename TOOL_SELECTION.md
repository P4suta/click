# 品質強化ツール選定

`click` プロジェクトの 3 フェーズ品質強化（Design by Contract → Property-based testing → Mutation testing）で使用するツールを調査・選定した結果を記録する。

## プロジェクト調査結果

| 項目 | 値 |
|---|---|
| 言語 | TypeScript 5.6.3 (strict) |
| ランタイム / パッケージマネージャ | Bun 1.3.10 + workspaces |
| バンドラ | Vite 5.4.21 |
| UI フレームワーク | Solid 1.9.3 |
| テストランナー | Vitest 2.1.8 |
| カバレッジ | @vitest/coverage-v8 2.1.8 |
| Lint / Format | Biome 1.9.4 |
| 既存テスト数 | 168 件 (core 103 + web 65) |
| 既存 PBT | fast-check 3.23.2 (core devDeps) |

CLAUDE.md の方針: 「依存最小」「Web Standards 優先」「不要なライブラリは入れない」。これに沿って、可能な限り既存ツールを再利用し、新規追加は最小限に留める。

---

## 選定結果

### 1. Property-based testing: **fast-check 3.23.2**

すでに `packages/core` に導入済み。バージョンを上げる必要なし。

#### 候補との比較

| 候補 | 採用 | 理由 |
|---|---|---|
| **fast-check** | ✅ | TypeScript 製、既存導入済み、jest/vitest 親和性、shrinking が強力、月次リリース継続中 |
| jsverify | ❌ | 2018 年以降メンテ停止 |
| testcheck-js | ❌ | 4 年以上更新なし |
| @hapi/lab pbt | ❌ | Hapi エコシステム前提 |

**インストール変更**: なし（既存）。`packages/web` でも property test を書く際は workspace 経由で透過的に利用可能だが、明示的に web 側にも devDeps 追加を検討する場合は以下:

```diff
 // packages/web/package.json devDependencies
+    "fast-check": "3.23.2",
```

### 2. Mutation testing: **@stryker-mutator/core 9.x + @stryker-mutator/vitest-runner 9.x**

Stryker は JavaScript / TypeScript 向けの事実上の標準。Vitest 専用ランナーがあり、設定は最小限。

#### 候補との比較

| 候補 | 採用 | 理由 |
|---|---|---|
| **Stryker (StrykerJS)** | ✅ | JS/TS 向けで唯一成熟。Vitest ランナー公式提供。9.1.1 (2025) で活発にメンテ。HTML/JSON レポート、incremental mode、プラグイン豊富 |
| MutateMe | ❌ | 個人プロジェクト、ESM 未対応 |
| jest-mutation-test | ❌ | Jest 専用、コミュニティ小 |

#### 公式ドキュメント参照
- https://stryker-mutator.io/docs/stryker-js/introduction/
- https://stryker-mutator.io/docs/stryker-js/vitest-runner/

#### インストールコマンド

```bash
bun add -D --filter '@click/core' \
  @stryker-mutator/core \
  @stryker-mutator/vitest-runner
```

#### 設定ファイル差分（`packages/core/stryker.config.json` を新規作成）

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "_comment": "Stryker config for @click/core. Vitest runner reuses our existing vitest.config.ts.",
  "packageManager": "npm",
  "testRunner": "vitest",
  "vitest": {
    "configFile": "vitest.config.ts"
  },
  "reporters": ["html", "clear-text", "progress"],
  "coverageAnalysis": "perTest",
  "mutate": [
    "src/**/*.ts",
    "!src/index.ts",
    "!src/types.ts",
    "!src/clock.ts",
    "!src/contracts.ts"
  ],
  "thresholds": {
    "high": 90,
    "low": 80,
    "break": 70
  },
  "timeoutMS": 30000,
  "concurrency": 4,
  "tempDirName": ".stryker-tmp"
}
```

ルート `package.json` に補助スクリプトを 1 行追加:

```diff
 "scripts": {
+    "mutation": "bun --filter '@click/core' mutation",
```

`packages/core/package.json` にも:

```diff
 "scripts": {
+    "mutation": "stryker run"
```

### 3. Contract / assertion: **自作の軽量ヘルパー（外部依存なし）**

CLAUDE.md の「依存最小」方針に沿い、`requires` / `ensures` / `invariant` の 3 つの関数を持つ最小ヘルパーを `packages/core/src/contracts.ts` に自作する。実装は約 30 行。

#### 候補との比較

| 候補 | 採用 | 理由 |
|---|---|---|
| **自作ヘルパー** | ✅ | ゼロ依存、TypeScript の `asserts` 型述語で型ナローイング、Web Audio バンドルにも安全に同梱可能、CLAUDE.md の方針と一致 |
| node:assert/strict | ❌ | Node 専用 API のため、ブラウザで動かす `packages/core` のバンドル時に問題になる可能性 |
| tiny-invariant | ❌ | 軽量だが、`requires`/`ensures`/`invariant` の使い分けができない |
| @sindresorhus/is | ❌ | 型チェック用途で契約の意味付けがない |

#### 実装方針

```typescript
// packages/core/src/contracts.ts
export class ContractError extends Error {
  readonly kind: "precondition" | "postcondition" | "invariant";
  constructor(message: string, kind: "precondition" | "postcondition" | "invariant") {
    super(message);
    this.name = "ContractError";
    this.kind = kind;
  }
}

export function requires(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ContractError(`Precondition failed: ${message}`, "precondition");
}

export function ensures(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ContractError(`Postcondition failed: ${message}`, "postcondition");
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ContractError(`Invariant violated: ${message}`, "invariant");
}
```

`packages/core/src/index.ts` から再エクスポートし、`packages/web` も `@click/core` 経由で利用する。

**インストール変更**: なし（自作）。

---

## まとめ

| 用途 | ツール | 新規依存 | 既存ビルドへの影響 |
|---|---|---|---|
| Property-based testing | fast-check 3.23.2 | なし（既存） | なし |
| Mutation testing | @stryker-mutator/core 9.x + vitest-runner 9.x | 2 件（devDeps のみ） | `stryker.config.json` 追加 + scripts 1 行追加 |
| Contract / assertion | 自作 (`contracts.ts`) | なし | core に 1 ファイル追加 |

これらは全て CLAUDE.md の「依存最小」「Web Standards 優先」原則と整合する最小構成である。
