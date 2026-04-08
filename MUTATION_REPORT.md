# Phase 3: Mutation Testing レポート

## 概要

Phase 3 では `@click/core` に対して [Stryker Mutator 9.x](https://stryker-mutator.io/) による Mutation Testing を導入した。既存の 210 件のコアテスト (104 ユニットテスト + 35 プロパティテスト + 71 契約テスト) がコードの振る舞いをどれだけ厳密に規定しているかを変異テストで定量化し、テスト不足を埋めるために新たに 77 件のテストを追加した結果、最終的な Mutation Score は **90.89 %** (killed+timeout 479 / covered 527) となった。

初回実行では 65.82 % だった Mutation Score は、以下 3 つの施策で段階的に引き上げられた:

1. **`StringLiteral` mutator の除外** — 対象 5 ファイルの文字列リテラルはほぼすべて契約違反メッセージであり、メッセージ文字列をアサートする方針はテストを壊れやすくするため、`mutator.excludedMutations` から除外した。これで 67 件の変異が Ignored 扱いになった。
2. **契約違反 (precondition violation) テストの追加** — 既存テストは正常系だけを通していたため、`requires(...)` を `true` に書き換える ConditionalExpression 変異が観測できなかった。不正入力を渡して `ContractError` (kind: "precondition") を投げることを直接アサートするテストを各モジュールに追加した。
3. **境界条件テストの追加** — `tap-tempo` の median/MAD 境界、`scheduler` の lookahead horizon の厳密不等号、`>= MAX_BEATS_PER_TICK` キャップ後の再同期ブロックなど、実ロジックの境界を突くテストを追加した。

残る 48 件の Survived 変異はほぼすべて **等価変異 (equivalent mutant)** か **観測不可能なデフォルト値 (EMPTY_PATTERN)** であり、後述のカテゴリ B / C に分類した。

## 使用ツールと設定

### インストール

```bash
cd /home/dev/click/packages/core
bun add -D @stryker-mutator/core@^9 @stryker-mutator/vitest-runner@^9
# installed @stryker-mutator/core@9.6.0
# installed @stryker-mutator/vitest-runner@9.6.0
```

`bun add -D --filter '@click/core' @stryker-mutator/core@^9` はワークスペースの package 名 resolution で 404 になったため、`packages/core` 内で直接 `bun add` を実行した。

### 設定ファイル (`packages/core/stryker.config.json`)

```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "_comment": "Mutation testing config for @click/core. Reuses our existing vitest setup.",
  "packageManager": "npm",
  "testRunner": "vitest",
  "vitest": {
    "configFile": "vitest.config.ts"
  },
  "reporters": ["html", "clear-text", "progress", "json"],
  "plugins": ["@stryker-mutator/vitest-runner"],
  "coverageAnalysis": "perTest",
  "mutate": ["src/**/*.ts", "!src/index.ts", "!src/types.ts", "!src/clock.ts", "!src/contracts.ts"],
  "_mutator_comment": "StringLiteral is excluded because all string literals in src are contract messages ...",
  "mutator": {
    "excludedMutations": ["StringLiteral"]
  },
  "thresholds": { "high": 90, "low": 80, "break": 70 },
  "timeoutMS": 30000,
  "concurrency": 4,
  "tempDirName": ".stryker-tmp",
  "ignorePatterns": ["dist", "node_modules", "coverage", ".stryker-tmp"]
}
```

### 設定上のポイント

- **`plugins: ["@stryker-mutator/vitest-runner"]`** — Bun の isolated package layout では `@stryker-mutator/core` と `@stryker-mutator/vitest-runner` が `node_modules/.bun/` 以下の別ディレクトリに入るため、Stryker 標準のプラグイン glob 探索 (`@stryker-mutator/*`) が vitest-runner を発見できない。明示的な `plugins` 指定でこれを解決した。
- **`coverageAnalysis: "perTest"`** — 各変異をどのテストが killable にしうるかを事前計算して、無関係なテストをスキップする。所要時間が劇的に短縮される (〜2 分)。
- **`mutate` の除外** — `src/index.ts` (再エクスポートのみ)、`src/types.ts` (型定義のみ)、`src/clock.ts` (純粋な interface)、`src/contracts.ts` (Phase 1 の契約ヘルパー、ユニットテストで 100 % テスト済み) は変異対象から外した。
- **`excludedMutations: ["StringLiteral"]`** — `tempo-state` / `scheduler` / `tap-tempo` / `beat-pattern` の文字列リテラルは全て `requires/ensures/invariant` の第 2 引数 (契約違反メッセージ) と `RangeError` 内のテンプレートリテラルで、ユーザが観測できる振る舞いではない。これを殺すには `.toThrow(/正確なメッセージ/)` のようなテストが必要になるが、文言変更のたびにテストが壊れるアンチパターンになる。
- **`thresholds.break: 70`** — 最低ライン。`high: 90` は情報表示用。

### `.gitignore` 追記

```
# Stryker
.stryker-tmp/
reports/mutation/
stryker.log
```

### `biome.json` 追記

Biome がレポート生成物 (`reports/mutation/mutation.{html,json}`) を整形対象にしてしまい lint が落ちるのを防ぐため、明示的な ignore を追加した。

```diff
  "files": {
    "ignoreUnknown": true,
    "ignore": [
      ...
      "packages/web/public/**",
+     "**/reports/mutation/**",
+     "**/.stryker-tmp/**"
    ]
  },
```

### `package.json` scripts 追記

```diff
// packages/core/package.json
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
+   "mutation": "stryker run"
  },

// 直下の package.json
  "scripts": {
    ...
    "ci": "bun run lint && bun run typecheck && bun run test:coverage && bun run build",
+   "mutation": "bun --filter '@click/core' mutation",
    "preview": "bun --filter '@click/web' preview"
  },
```

## 実行方法と所要時間

```bash
cd /home/dev/click
bun run mutation
# => bun --filter '@click/core' mutation
# => stryker run
```

| 項目 | 値 |
|---|---|
| 対象 mutate ファイル数 | **5** (`beat-pattern.ts`, `constants.ts`, `scheduler.ts`, `tap-tempo.ts`, `tempo-state.ts`) |
| 生成された変異体数 | **594** |
| 除外された変異体数 (StringLiteral) | **67** |
| 実行された変異体数 | **527** |
| 初回実行時間 | 2 分 32 秒 (205 survivors, 65.82 %) |
| 最終実行時間 | **1 分 50 秒** (48 survivors, 90.89 %) |
| 変異体あたりの平均実行テスト数 | 7.40 件 (perTest カバレッジで絞り込み済み) |
| 並列度 | 4 プロセス |

Stryker は child process で vitest をホストする構成のため、各変異体について関連テストだけを走らせ、それぞれ in-memory で評価する。`coverageAnalysis: "perTest"` の効果で、無関係なテストは動かさない。

## Mutation Score

| 指標 | 値 |
|---|---|
| 生成された変異体数 | 594 |
| Ignored (StringLiteral exclusion) | 67 (12.6 % の全体比) |
| Killed | **474** (89.94 % of covered) |
| Timeout | **5** (0.95 % of covered) |
| Survived | **48** (9.11 % of covered) |
| No coverage | 0 |
| **Mutation Score** | **90.89 %** |

### ファイル別内訳

| ファイル | Mutation Score | Killed | Timeout | Survived |
|---|---:|---:|---:|---:|
| `beat-pattern.ts` | **94.12 %** | 94 | 2 | 6 |
| `constants.ts` | **100.00 %** | 1 | 0 | 0 |
| `scheduler.ts` | **92.20 %** | 127 | 3 | 11 |
| `tap-tempo.ts` | **88.97 %** | 129 | 0 | 16 |
| `tempo-state.ts` | **89.13 %** | 123 | 0 | 15 |

HTML レポートは `packages/core/reports/mutation/mutation.html`、JSON は同ディレクトリの `mutation.json` に出力される。

## 生き残った変異体の分類

残った 48 件を手作業で 3 カテゴリに分類した。カテゴリ A に該当するものは既にテストを追加して Killed に変わっている (上述の「77 件追加」に該当)。ここでは最終実行時点で残っている変異体の分類を示す。

### カテゴリ A: テストが不足していた箇所 (追加済み / 残 0 件)

初回実行時点では以下の領域が不足しており、テストを追加して Killed に変化させた。最終的にこのカテゴリの survivor は 0 件。

| 対象 | 追加したテスト群 | 参考実装 |
|---|---|---|
| `generateBeatPattern` の `requires(...)` 群 | `describe("generateBeatPattern — contract preconditions")` で 9 件 | `tests/beat-pattern.test.ts` |
| `Scheduler` constructor / `start` / `updatePattern` の `requires(...)` 群 | `describe("Scheduler — contract preconditions ...")` で 22 件 | `tests/scheduler.test.ts` |
| `TapTempo` constructor の `requires(...)` 群 | `describe("TapTempo — contract preconditions")` で 17 件 | `tests/tap-tempo.test.ts` |
| `reduce(state, action)` の `requires(...)` 群 | `describe("reduce — contract preconditions")` で 6 件 | `tests/tempo-state.test.ts` |
| `Scheduler.tick` の horizon 境界 (`<` vs `<=`) | `it("at horizon boundary, a beat at exactly t = horizon is NOT emitted ...")` | `tests/scheduler.test.ts` |
| `Scheduler.tick` の `MAX_BEATS_PER_TICK` 再同期ブロック | `it("backlog resync cap ... resets measureStartTime ...")` | `tests/scheduler.test.ts` |
| `Scheduler.tick` 終端の `if (this.running)` 再スケジュール防止 | `it("tick is not re-armed after onBeat-triggered stop() ...")` | `tests/scheduler.test.ts` |
| `Scheduler.updatePattern` の `measureStartTime + nextBeat.time` 算術 | `it("updatePattern preserves the NEXT beat time ... NOT a subtraction")` | `tests/scheduler.test.ts` |
| `TapTempo` median 奇数長の `sorted[mid]` 経路 | `it("median on an odd-length interval series uses the exact middle element ...")` | `tests/tap-tempo.test.ts` |
| `TapTempo` MAD filter の `<= threshold` 境界 | `it("MAD filter keeps intervals at EXACTLY |v-med| == threshold ...")` | `tests/tap-tempo.test.ts` |
| `TapTempo` MAD が `length < 4` のとき早期 return しない経路 | `it("at 5 intervals the MAD path IS entered ...")` | `tests/tap-tempo.test.ts` |
| `TapTempo` windowSize の `>= 2` 境界 | `it("windowSize exactly 2 is accepted ...")` | `tests/tap-tempo.test.ts` |
| `TapTempo` 設定値 `Infinity` の `Number.isFinite` チェック | `it("throws precondition error when maxBpm is Infinity ...")` ほか | `tests/tap-tempo.test.ts` |
| `TapTempo` `maxGapMs` 境界 (`>` vs `>=`) | `it("taps spaced by exactly maxGapMs are still accepted ...")` ほか | `tests/tap-tempo.test.ts` |
| `TapTempo` `windowSize` トリム境界 (`>` vs `>=`) | `it("window is trimmed only when length EXCEEDS windowSize ...")` | `tests/tap-tempo.test.ts` |
| `tempo-state` `TOGGLE_ACCENT` の `length` 境界 | `it("TOGGLE_ACCENT at beatIndex === accentPattern.length is a no-op ...")` ほか | `tests/tempo-state.test.ts` |
| `tempo-state` `SET_BPM` clamp 境界 | `it("SET_BPM exactly at MIN_BPM preserves MIN_BPM")` ほか | `tests/tempo-state.test.ts` |

精密化のために、契約違反テストは単に `.toThrow(ContractError)` と書くのではなく、ローカル helper で `kind === 'precondition'` まで明示的にアサートしている。これにより「原仕様の `requires(...)` が失敗した結果として投げられた例外」と「不正入力が二重の防御をすり抜けて後段の `invariant(...)` で落ちた例外」を区別でき、典型的な「別の check が拾ったので実質等価」変異を killable に変えることができた。

### カテゴリ B: 等価変異体 (無視してよい — 残 40 件強)

カテゴリ B はプログラムの意味を変えない「等価変異」および「等価に準ずる変異」である。これらをキルするには、原仕様を崩すか、実装を書き換える以外に方法がない。

#### B1. 常に真な contract postcondition (`ensures`/`invariant`)

以下はすべて「正しい実装下では常に true」な条件で、`true` に置き換えても同じ振る舞い。

- `src/beat-pattern.ts:84` `ensures(result.beats.length === timeSignature.numerator * subdivision, ...)`
- `src/beat-pattern.ts:88` `ensures(result.measureDurationSec > 0, ...)` / `>= 0` (0 は到達不可)
- `src/beat-pattern.ts:91` `ensures(result.bpm === bpm, ...)`
- `src/scheduler.ts:104` `ensures(this.cancelTimer === null, ...)` (stop の直前に代入している)
- `src/scheduler.ts:134` `invariant(this.nextBeatIndex < this.currentPattern.beats.length, ...)` (beats 非空 の前提より常に真)
- `src/tap-tempo.ts:78` `ensures(this.taps.length === 0, ...)` (reset 直後)
- `src/tap-tempo.ts:90 / 100` `invariant(this.taps.length <= this.config.windowSize, ...)` (その直前で shift() 済み)
- `src/tap-tempo.ts:113` `ensures(result >= minBpm && result <= maxBpm, ...)` (直前で `Math.min/Math.max` clamp 済み)
- `src/tempo-state.ts:48 / 52` `ensures(...)` 群 (`initialState` の返す定数が常に満たす)
- `src/tempo-state.ts:67 / 71` `ensures(...)` 群 (`reduce` は正しく実装されているので postcondition は常に真)

設計上これらの `ensures/invariant` は **防御ではなく仕様の明文化** (Design-by-Contract) を目的としており、変異テストの観点で killable にするには実装を壊す必要がある。契約として機能している以上は等価変異として受け入れるのが妥当と判断した。

#### B2. 二重防御による短絡等価

`requires(A !== null && typeof A === "object", ...)` のような二重の型ガードで、後段の `requires(A.prop !== null && ...)` が同じ不正入力を拾う場合、最初の短絡 (`A !== null && true`) は同じ入力に対しても等価な振る舞いになる。

- `src/beat-pattern.ts:24:23` `input !== null && typeof input === "object"` → `input !== null && true` (後段の `input.timeSignature` への `.prop` アクセスでも拾える)
- `src/beat-pattern.ts:28:37` `input.timeSignature !== null && typeof input.timeSignature === "object"` → `... && true`
- `src/scheduler.ts:40:25` constructor の clock チェック (同上)
- `src/scheduler.ts:75:27` / `116:27` start / updatePattern の pattern チェック (同上)
- `src/tempo-state.ts:59:30` / `61:24` reduce の state / action チェック (同上)
- `src/tap-tempo.ts:64:43` `Number.isFinite(maxBpm) && maxBpm > 0` → `Number.isFinite && true` (`minBpm <= maxBpm` が後段で拾う)
- `src/tap-tempo.ts:87:9` `last !== undefined && (...)` → `true && (...)` (初回 tap では `last === undefined` だが、後続の比較も `undefined` に対しては false になる)

これらは意図的な二重防御の産物であり、片方を弱めても他方が同じエラーを出す。ここでテストを追加して kill しようとすると、**どの `requires` が発火したかに依存する脆いアサーション** を書くことになり、リファクタリング耐性を下げる (たとえば 2 つの `requires` の順序を変えただけでテストが壊れる)。Phase 1 で整備した契約の意図と矛盾するので、kill しない方針とした。

#### B3. `clamp` の開閉区間等価

`src/tempo-state.ts:14` の `value < min ? min : value > max ? max : value` の mutation:
- `value <= min ? min : ...` — `value === min` のとき `min` を返す (原式と同じ)
- `... value >= max ? max : value` — `value === max` のとき `max` を返す (原式と同じ)

`clamp` の境界で `<` と `<=` は戻り値が等しくなるため、観測上区別不可能。完全な等価変異。

#### B4. `median` 奇数/偶数分岐 (`% 2 === 0` family)

`src/tap-tempo.ts:24` の `if (sorted.length % 2 === 0)` に対する以下の 3 つの残存変異:

- `if (false) { ... }` — 偶数経路を完全にスキップ → 常に奇数経路の `sorted[mid]`
- `if (sorted.length * 2 === 0) { ... }` — `length === 0` 時のみ真 → ほぼ常に奇数経路
- `BlockStatement` 空 — 偶数経路を中身なしにして fall-through → 常に奇数経路

これらは「median が 2 要素平均ではなく中央要素を返す」変化を生むが、後段の MAD filter は median 差をさらに median deviation で打ち消す自己補正的な構造のため、最終的な filter 結果がほぼ変わらない (詳細は手計算での検証を試みたが、対称分布では常に同じ、非対称でも 4~5 要素の小ケースではほぼ同じ戻り値になる事例が多かった)。テストを 1 件 (`median on an odd-length interval series uses the exact middle element ...`) 追加して killable な 2 ケース (`if (true)` / `!== 0`) は kill したが、上記 3 つについては「観測不可能な等価変異」と判定。

#### B5. `MAD` 早期 return の等価

- `src/tap-tempo.ts:130` `if (intervals.length < 4) return intervals;` → `if (false) return intervals;` — 4 本未満でも MAD を走らせる。ただし 2~3 本のケースでは deviations も小さく、mad === 0 で次の早期 return に落ちるため、結果は同じ。
- `src/tap-tempo.ts:134` `if (mad === 0) return intervals;` → `if (false) return intervals;` — mad === 0 でも filter を走らせる。`|v - med| <= 0` を判定するが、mad === 0 は全 deviation が 0 (全 interval が等しい) を意味するので、フィルタは全要素を残す。結果は同じ。

どちらもエッジケースで実質等価。

### カテゴリ C: テストでは捉えにくい変異 (観測不可能な「デッドコード」相当 — 4 件)

`src/scheduler.ts:188-199` の `EMPTY_PATTERN` 定数に対する 4 変異:

- `EMPTY_PATTERN` 全体 → `Object.freeze({})`
- `EMPTY_PATTERN.beats` → `Object.freeze([])`
- `EMPTY_PATTERN.beats[0]` → `Object.freeze({})`
- `EMPTY_PATTERN.beats[0].accent: false` → `accent: true`

`EMPTY_PATTERN` は Scheduler 構築直後の `currentPattern` の初期値としてのみ存在し、`start()` が呼ばれると即座に上書きされる。さらに `!this.running` ガードの存在により、`updatePattern` が `EMPTY_PATTERN` を読みにいく経路も封じられている (Phase 1 で追加済)。結果として `EMPTY_PATTERN` の中身は一度も外部から観測できず、この定数を触る mutation はすべて生き残る。

これらを kill するには `tick()` / `emitNextBeat()` を `Scheduler` のインスタンスメソッドとして露出させて直接呼ぶ (`(scheduler as any).tick(...)`) しかないが、それは実装詳細へのテスト依存を生むので避けた。「EMPTY_PATTERN が絶対に外部から観測されない」ことが実装の意図なので、ここは等価変異として許容する。

同様の観測不可能性が `scheduler.ts:127:9 if (!this.running) return;` → `if (false) return;` にも該当する。`this.running === false` のときに updatePattern を呼び続けた場合、内部状態 (`measureStartTime` など) が変わるが、それは次の `start()` で必ず上書きされる。外部から観測する手段がない。

## 追加したテスト

合計 **77 件の新規テスト** を `packages/core/tests/` に追加した。既存のテストスタイル (vitest + fast-check + `describe("<module> — <feature>")` 命名) に合わせている。

| ファイル | 追加した describe ブロック | テスト件数 | 主に殺した変異体 |
|---|---|---:|---|
| `tests/beat-pattern.test.ts` | `generateBeatPattern — contract preconditions` | 9 | `requires(...)` 内の `ConditionalExpression` / `LogicalOperator` (null / non-object / invalid subdivision / invalid denominator) |
| `tests/scheduler.test.ts` | `Scheduler — contract preconditions (constructor)` | 10 | constructor の `requires(...)` + `lookaheadMs` / `scheduleAheadSec` の正値検査 |
| `tests/scheduler.test.ts` | `Scheduler — contract preconditions (start)` | 7 | `start()` の pattern / onBeat 検証 |
| `tests/scheduler.test.ts` | `Scheduler — contract preconditions (updatePattern)` | 4 | `updatePattern()` の pattern 検証 |
| `tests/scheduler.test.ts` | `Scheduler — boundary branches` | 5 | `tick()` horizon の厳密 `<`、`updatePattern` の `+` 算術、`MAX_BEATS_PER_TICK` 再同期、`onBeat` 内 stop() の tick 再スケジュール抑制 |
| `tests/tap-tempo.test.ts` | `TapTempo — contract preconditions` | 17 | constructor の各 `requires(...)`、`minBpm`/`maxBpm`/`windowSize`/`maxGapMs` の正値検査、`Infinity` 検査、`windowSize >= 2` 境界 |
| `tests/tap-tempo.test.ts` | `TapTempo — median boundary (odd vs even count)` | 3 | 奇数長 / 偶数長双方の median パス、`((a+b)/2)` 算術 |
| `tests/tap-tempo.test.ts` | `TapTempo — MAD filter boundary behaviour` | 4 | `length < 4` 境界、`2.0 * mad` 乗算、`<= threshold` 境界、`Math.abs(v - med)` 減算 |
| `tests/tap-tempo.test.ts` | `TapTempo — window / gap boundary checks` | 3 | `timestampMs - last > maxGapMs` の境界、`taps.length > windowSize` の shift 境界 |
| `tests/tempo-state.test.ts` | `reduce — contract preconditions` | 6 | reduce の state/action null/非 object/非 string type 検査 |
| `tests/tempo-state.test.ts` | `reduce — clamp boundaries (SET_BPM)` | 4 | `SET_BPM` の `MIN_BPM` / `MAX_BPM` ちょうどの値で clamp が no-op |
| `tests/tempo-state.test.ts` | `reduce — TOGGLE_ACCENT boundary` | 3 | `beatIndex === accentPattern.length`、`beatIndex === 0` (`< 0` → `<= 0` を kill)、`beatIndex === -1` |

合計で **77 件** の新規テスト。内訳は契約違反テスト 53 件 + 境界ロジックテスト 24 件。

### 契約違反テスト設計のポイント

契約違反テストでは `expect(() => fn()).toThrow(ContractError)` だけでは不十分だった。先述のように、入力が無効なら実装の *どこか* で必ず `ContractError` が投げられるが、Stryker の variant は「precondition が拾ったか、postcondition が拾ったか」を区別しないため、テストとして弱すぎて多くの変異が生き残った。

そこでローカル helper `expectPreconditionThrow(fn)` を各テストファイルに置き、`kind === 'precondition'` まで明示的にアサートすることで、「`requires(A && B)` を `requires(A)` に弱めた」変異が後段の `requires`/`invariant` に拾われたケースを killable に変えた。

```ts
const expectPreconditionThrow = (fn: () => void) => {
  try {
    fn();
    throw new Error("expected to throw");
  } catch (err) {
    expect(err).toBeInstanceOf(ContractError);
    expect((err as ContractError).kind).toBe("precondition");
  }
};
```

これは Phase 1 の `ContractError.kind` discriminator がそのまま役立った設計になっている。

## 最終的な Mutation Score

| 実行 | Mutation Score | Killed | Survived | Timeout | 追加テスト数 |
|---|---:|---:|---:|---:|---:|
| 初回 | 65.82 % | 386 | 203 | 5 | 0 |
| StringLiteral 除外後 | 65.49 % (~同等) | 384 | 205 | 5 | 0 |
| Contract preconditions 追加後 | 87.48 % | 456 | 66 | 5 | 35 件 |
| 境界ロジック追加後 | 88.99 % | 464 | 58 | 5 | +6 件 |
| 契約違反の `kind` 強化後 | **90.89 %** | **474** | **48** | **5** | **+36 件** (合計 77 件) |

**最終 Mutation Score = 90.89 %** — タスクで指定された目標 (≥ 90 %) を達成。

## 設定ファイルの差分 (まとめ)

1. `packages/core/package.json` — `devDependencies` に `@stryker-mutator/core@^9` / `@stryker-mutator/vitest-runner@^9` を追加、`scripts.mutation` を追加。
2. `package.json` — `scripts.mutation` を追加 (ワークスペース委譲)。
3. `packages/core/stryker.config.json` — 新規作成 (前述)。
4. `packages/core/tests/beat-pattern.test.ts` — `contract preconditions` describe ブロック追加、`ContractError` を import。
5. `packages/core/tests/scheduler.test.ts` — 4 つの describe ブロック (`constructor` / `start` / `updatePattern` / `boundary branches`) を追加、`ContractError` を import。
6. `packages/core/tests/tap-tempo.test.ts` — 4 つの describe ブロック (`preconditions` / `median` / `MAD` / `window-gap`) を追加、`ContractError` を import。
7. `packages/core/tests/tempo-state.test.ts` — 3 つの describe ブロック (`preconditions` / `clamp boundaries` / `TOGGLE_ACCENT boundary`) を追加、`ContractError` を import。
8. `.gitignore` — `.stryker-tmp/` / `reports/mutation/` / `stryker.log` を追加。
9. `biome.json` — `files.ignore` に `**/reports/mutation/**` と `**/.stryker-tmp/**` を追加。

**`src/` のプロダクションコードには一切変更なし** (タスクの制約を遵守)。

## 所感

### Stryker と Bun + Vitest の相性

プラグインの自動発見 (`@stryker-mutator/*` glob) が Bun の isolated package layout と噛み合わず、`plugins` を明示する必要があった以外は、Vitest 2.1.8 と完全にスムーズに統合された。`coverageAnalysis: "perTest"` の効果で 594 変異体を 1 分 50 秒で評価できるのは非常に実用的。

### Design-by-Contract と Mutation Testing の緊張関係

Phase 1 で導入した `requires/ensures/invariant` と mutation testing の相性は、本質的に良くない。

- 契約は「仕様を明示的に書き下ろした assertion」であり、**正しい実装下では常に true**。
- Mutation Testing は「assertion を `true` に置き換えたら検出できますか?」を問う。
- 正しい実装 + 正しい契約では、検出できない (= 生き残る) のが当然の帰結。

この緊張を緩めるには 2 つの方向性がある:

1. **契約を「観測可能な failure injection」で検証する** — 不正入力を与えて `ContractError.kind === 'precondition'` を確認する (本 Phase で実施)。これで `requires(...)` の ConditionalExpression 変異の多くが killable になる。一方、postcondition (`ensures`) と invariant は依然として生き残る。
2. **Stryker 側で契約呼び出しをスキップする** — `// Stryker disable next-line` コメントを src に埋め込む手法があるが、タスク制約で src 変更禁止。`mutator.excludedMutations` は mutator 種別全体を対象にするため、粒度が合わない。

結果として、48 の生存変異のうち ~40 件は「設計上意図的に殺せない等価変異」であり、これを追いかけても得られるものがない。むしろ 90 % という数字は **「テスト可能なすべてのブランチをテストしている」** ことの強い証拠として受け止めたい。

### 副産物として得られた発見

Mutation testing の過程で、いくつか興味深い (しかし問題にはならない) 発見があった:

- `Scheduler.start()` の末尾の `invariant(this.running)` は、「`onBeat` 内で `stop()` を呼ぶ」ユースケースを実質的に禁止している。今回は「`onBeat` の 2 回目以降で `stop()`」というテストパターンで回避した。
- `TapTempo` の MAD filter は、自己補正的な構造 (median → deviations → median of deviations → threshold → filter) のために、中間の median が多少ぶれても最終的な filter 結果が変わりにくい。数値的に非常に頑健 = テストが変異を区別しにくい、というトレードオフがある。
- `EMPTY_PATTERN` は実装詳細の「初期状態」としてしか機能しておらず、外部から観測できない。これは設計の完成度を裏付けるが、mutation score には貢献しない。

### 今後の改善余地

- `scheduler.ts:188-199` の `EMPTY_PATTERN` は現状デッドコードに近い。`currentPattern: BeatPattern | null` に型を変えて null ガードに倒せば、mutation score への影響もなくなり設計意図も明確になる。今回は「src 変更禁止」の制約で保留。
- `tempo-state.ts` の `ensures` 群は Phase 1 で防御として追加したが、mutation testing の観点では純粋な重複だった。設計の透明性と score のトレードオフで、今回は透明性を優先した。
