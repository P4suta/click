# Phase 1: Design by Contract レポート

## 概要

`packages/core` と `packages/web` の主要な公開関数・メソッドに、`requires` (事前条件) / `ensures` (事後条件) / `invariant` (不変条件) を埋め込んだ。すべての契約は `packages/core/src/contracts.ts` で定義された軽量ヘルパー (依存ゼロ) を使用しており、失敗時には `ContractError` を投げる。

## 実行プロセス

ユーザー指示通り、サブエージェントへの委譲を試みた:

- **packages/core 用エージェント** (id: `ae79fe30a0f5f9bce`, `a1af80408665d43d2`)
- **packages/web 用エージェント** (id: `a25a0842d57f23215`, `a223b7e83fb605555`)

しかし両エージェントとも、起動時に環境のシステム reminder で plan mode が有効化されてしまい、計画ファイルを書いた後でファイル編集を実行できなかった。SendMessage ツールが当環境では利用不可だったため、メインスレッドでエージェントの計画 (各サブエージェントが詳細に作成済み) をそのまま実行した。各サブエージェントが提示した契約配置と「テストが破壊する箇所への注意点」はそのまま採用している。

## モジュール一覧

### packages/core (5 ファイル、契約追加 4 ファイル)
- `src/contracts.ts` — 契約ヘルパー本体 (新規作成)
- `src/tempo-state.ts` — `initialState`, `reduce`
- `src/beat-pattern.ts` — `generateBeatPattern`
- `src/scheduler.ts` — `Scheduler` クラス (constructor / start / stop / updatePattern / isRunning)
- `src/tap-tempo.ts` — `TapTempo` クラス (constructor / tap / reset / tapCount)
- `src/clock.ts` — interface のみのためスキップ

### packages/web (5 ファイル)
- `src/audio/real-clock.ts` — `RealClock` クラス (now / setTimer)
- `src/audio/sound-bank.ts` — `playClick` 関数
- `src/audio/web-audio-port.ts` — `WebAudioPort` クラス + 共通バリデータ `validateMetronomeParams`
- `src/state/app-store.ts` — `createAppStore` + `dispatch`
- `src/state/persistence.ts` — `loadPersisted`, `savePersisted`

## 追加した契約の一覧

### packages/core/src/tempo-state.ts

| 関数 | 事前条件 | 事後条件 | 不変条件 |
|---|---|---|---|
| `initialState()` | — | フリーズされている / `bpm ∈ [MIN_BPM, MAX_BPM]` / `accentPattern.length === numerator` | — |
| `reduce(state, action)` | `state` は非null オブジェクト / `action` は `type: string` を持つ非null オブジェクト | 返り値はフリーズされている / `bpm ∈ [MIN_BPM, MAX_BPM]` / `accentPattern.length === numerator` | — |

**設計上の注意**: 既存テストは NaN BPM、numerator=0 等の不正入力に対して `reduce` がクランプまたは no-op で「同じ state を返す」ことを期待している。事前条件で reject すると既存テストが壊れるため、`reduce` の事前条件は state/action の構造のみをチェックし、内容の正当性は事後条件 (および switch 内の既存ガード) に委ねている。`switch` 文を `computeNext` ヘルパーに切り出すことで、事後条件を 1 箇所で適用できる構造にした。

### packages/core/src/beat-pattern.ts

| 関数 | 事前条件 | 事後条件 | 不変条件 |
|---|---|---|---|
| `generateBeatPattern(input)` | `input` は非null オブジェクト / `input.timeSignature` は非null オブジェクト / `input.accentPattern` は配列 / `input.subdivision ∈ {1,2,3,4}` / `input.timeSignature.denominator ∈ {2,4,8,16}` | 返り値はフリーズ / `result.beats` もフリーズ / `result.beats.length === numerator * subdivision` / `result.measureDurationSec > 0` / `result.bpm === input.bpm` | — |

**設計上の注意**: 既存の `RangeError` (bpm <=0 と numerator < 1) は public API として `.toThrow(RangeError)` テストに依存しているため残し、契約の `requires` はそれと相補的な追加チェックとして配置した。

### packages/core/src/scheduler.ts

| メソッド | 事前条件 | 事後条件 | 不変条件 |
|---|---|---|---|
| `constructor(clock, config?)` | `clock` は非null / `clock.now`, `clock.setTimer` は関数 / `config.lookaheadMs > 0` (指定時) / `config.scheduleAheadSec > 0` (指定時) | — | 構築直後 `!this.running` |
| `start(pattern, onBeat)` | `pattern` は非null / `pattern.beats` は非空配列 / `pattern.measureDurationSec > 0` / `onBeat` は関数 | — | 呼び出し後 `this.running === true` |
| `stop()` | — | `!this.running` / `this.cancelTimer === null` | — |
| `updatePattern(pattern)` | `pattern` は非null / `pattern.beats` は非空配列 / `pattern.measureDurationSec > 0` | — | 実行後 `nextBeatIndex < currentPattern.beats.length` |
| `isRunning` getter | — | — | — |

**設計上の注意**: テスト「double-start without intervening stop」が `start` を 2 度連続で呼ぶことを期待しているため、`start` には「running でないこと」の事前条件を入れていない。`updatePattern` の「running でないときは no-op」も保持。

### packages/core/src/tap-tempo.ts

| メソッド | 事前条件 | 事後条件 | 不変条件 |
|---|---|---|---|
| `constructor(config?)` | `config.windowSize >= 2 整数` (指定時) / `config.maxGapMs > 0 finite` (指定時) / `config.minBpm > 0 finite` (指定時) / `config.maxBpm > 0 finite` (指定時) / `minBpm <= maxBpm` (確定後) | — | — |
| `tap(timestampMs)` | (なし — テストが NaN や非単調入力で `null` を返すことを期待) | 非 null 戻り値は `[minBpm, maxBpm]` の範囲内 | `taps.length <= windowSize` (push/shift 後と reset 後の両方で確認) |
| `reset()` | — | `taps.length === 0` | — |
| `tapCount` getter | — | — | — |

### packages/web/src/audio/real-clock.ts

| メソッド | 事前条件 | 事後条件 | 不変条件 |
|---|---|---|---|
| `now()` | — | 戻り値は finite | — |
| `setTimer(callback, delayMs)` | `callback` は関数 / `delayMs` は finite | — | — |

### packages/web/src/audio/sound-bank.ts

| 関数 | 事前条件 | 事後条件 | 不変条件 |
|---|---|---|---|
| `playClick(args)` | `args` は非null オブジェクト / `args.context` は非null / `args.destination` は非null / `args.time >= 0 finite` / `args.volume` は finite / `args.accent` は boolean / `args.sound` は string | — | — |

**設計上の注意**: テスト mock が `context.state` を持たないため `state !== "closed"` チェックは入れない。テストは `sound: "unknown" as any` を渡して fallback を期待しているため `sound ∈ SoundId` のチェックも入れない (string 型のみ要求)。

### packages/web/src/audio/web-audio-port.ts

| メソッド | 事前条件 | 事後条件 | 不変条件 |
|---|---|---|---|
| `constructor(scheduler?, clock?)` | `clock` は非null / `clock.now`, `clock.setTimer` は関数 | — | — |
| `setOnBeat(listener)` | `listener` は関数 または `null` | — | — |
| `start(params)` | `validateMetronomeParams(params, ...)` (bpm/timeSignature/accentPattern/subdivision/volume/sound の構造と finite 性) | `scheduler.isRunning === true` (early return しなかった場合) | — |
| `stop()` | — | `!scheduler.isRunning` / `currentParams === null` | — |
| `update(params)` | `validateMetronomeParams(params, ...)` | — | — |
| `dispose()` | — | `!scheduler.isRunning` | — |
| `isRunning` getter | — | — | — |

`validateMetronomeParams` は `start` と `update` の両方から呼ぶ共通バリデータとして抽出した。

### packages/web/src/state/app-store.ts

| 関数 | 事前条件 | 事後条件 | 不変条件 |
|---|---|---|---|
| `createAppStore()` | — | 返り値の `state`, `dispatch`, `enablePersistence` がいずれも関数 | — |
| `dispatch(action)` (closure) | `action` は非null オブジェクトかつ `type: string` | — | — |

### packages/web/src/state/persistence.ts

| 関数 | 事前条件 | 事後条件 | 不変条件 |
|---|---|---|---|
| `loadPersisted()` | — | 戻り値は `null` または `Persisted` キー (`bpm`, `timeSignature`, `accentPattern`, `subdivision`, `volume`, `sound`) のサブセットのみを含むオブジェクト | — |
| `savePersisted(state)` | `state` は非null オブジェクト | — | — |

`loadPersisted` の事後条件は try ブロック内、成功 return の直前に配置している。catch 経路の `null` return は事後条件を自明に満たすため、quota error の silent swallow を破壊しない。

## メッセージスタイルの例

すべての契約メッセージは英文で「subject + must + condition」形式に統一した。サンプル:

- `"Scheduler.start: pattern.beats must be a non-empty array"`
- `"reduce: returned bpm must remain within [MIN_BPM, MAX_BPM]"`
- `"playClick: args.time must be a non-negative finite number (audio-context seconds)"`
- `"WebAudioPort.start: scheduler must be running after start completes"`
- `"TapTempo.tap: returned BPM must be within [minBpm, maxBpm]"`
- `"loadPersisted: returned object must contain only validated Persisted keys"`

## 発見したバグ

### バグ #1: テストフィクスチャの clock 不整合 (web-audio-port.test.ts)

**発見した契約**: `playClick` の `args.time >= 0` 事前条件

**現象**: `WebAudioPort` のテストが `new WebAudioPort(new Scheduler(clock))` で `Scheduler` には `FakeClock` を渡すが、`WebAudioPort` 自身の `clock` 引数を省略していた。`WebAudioPort.constructor` のデフォルト値 `new RealClock()` が使われ、コンストラクタ内で `audioOffset = ctx.currentTime - this.clock.now()` を計算する際に、

- `ctx.currentTime`: `FakeAudioContext` 由来 → `0`
- `this.clock.now()`: `RealClock` 由来 → 数百〜数千秒 (実時間)

から `audioOffset` が大幅な負の値となり、最初の beat の `event.time + audioOffset` が `playClick` に渡される時点で負数になっていた。本番環境ではすべて同じ `RealClock` を共有するためこの問題は顕在化しないが、テスト環境ではプロダクトコードの仕様 (両 clock が一致している前提) を破っていた。

**根本原因**: テストフィクスチャが「Scheduler の clock」と「WebAudioPort の clock」を別物として設定していた。

**修正**: `tests/audio/web-audio-port.test.ts:beforeEach` で `WebAudioPort` のコンストラクタにも同じ `FakeClock` を渡すように変更:

```diff
- port = new WebAudioPort(new Scheduler(clock));
+ port = new WebAudioPort(new Scheduler(clock), clock);
```

**インパクト**: テスト 10 件が一時的に失敗したが、上記修正で全てパス。プロダクトコードは無変更。コメントで根本原因を明記したため将来同じ問題は起きない。

**この発見の価値**: 契約の文化的意義を裏付ける具体例。「テストは通っていたが、テストフィクスチャ自身がプロダクトコードの暗黙の前提を破っていた」というケースが、実行時 assert によって即座に表面化した。

### その他

`reduce` / `Scheduler` / `TapTempo` / `generateBeatPattern` / `WebAudioPort` の契約は既存テストを 1 件も壊さなかった。これは Round 3 の防御的実装ですでに NaN/境界値ガードが手厚く入っていた効果でもある。

## テスト実行結果

### Phase 1 完了時点

- **`packages/core`**: 6 ファイル、**112 件 すべてパス** (うち新規 `contracts.test.ts` で 9 件)
- **`packages/web`**: 11 ファイル、**75 件 すべてパス** (うち追加 `sound-bank.test.ts` で 8 件、`real-clock.test.ts` で 3 件、`persistence.test.ts` 拡充で +13 件)
- **合計**: **187 件 すべてパス**
- **lint**: clean (`biome check .` 全 57 ファイル)
- **typecheck**: clean (`tsc -b`)

## 副次的な改善

- `packages/core/src/index.ts` から `requires` / `ensures` / `invariant` / `ContractError` / `ContractKind` を再エクスポートしたので、`@click/web` 側は `import { requires } from "@click/core"` でシームレスに利用できる。
- `tempo-state.ts` の `reduce` を内部ヘルパー `computeNext` に切り出したことで、事後条件の集中適用と将来のリファクタが容易になった (semantic は不変)。
- `web-audio-port.ts` の `validateMetronomeParams` 共通バリデータ抽出により、`start`/`update` の入力チェックが DRY になった。
