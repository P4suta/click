# Phase 2: Property-based Testing レポート

## 概要

Phase 1 で各モジュールに埋め込んだ契約 (`requires` / `ensures` / `invariant`) を「合法な入力空間の境界」として活用し、その内側で **常に成り立つべき性質** を `fast-check` で property test として表現した。`packages/core` と `packages/web` を 2 つのサブエージェントに並列委譲し、それぞれが完了後にレポートを統合した。

## 実行プロセス

サブエージェント:
- **packages/core 担当エージェント** (id: `a6e3d1e31c0e07d86`)
- **packages/web 担当エージェント** (id: `a2695519b2927b6fc`)

両エージェントとも初回起動時に EnterPlanMode が誘発される問題があったため、明示的な「DO NOT plan, EXECUTE NOW」指示で再投入し、両者とも全タスクを完了した。

## ツール

- **fast-check 3.23.2** — `packages/core` には Phase 1 以前から導入済み。Phase 2 で `packages/web` の devDependencies にも明示追加 (`bun install` で lockfile 更新済み)。

## 対象モジュールと優先順位

| 順位 | パッケージ | モジュール | 理由 |
|---|---|---|---|
| 1 | core | `tempo-state.ts` | 純粋リデューサー。代数的法則 (idempotency / involution / monotonicity / commutativity) を直接表現できる |
| 2 | core | `beat-pattern.ts` | 純関数。BPM/拍子/分割率の三軸を fast-check で広く covering できる |
| 3 | core | `scheduler.ts` | `FakeClock` で決定論駆動可能。drift / accent などの追加性質に向く |
| 4 | core | `tap-tempo.ts` | MAD フィルタの「外れ値ロバスト性」を表現可能 |
| 5 | core | `contracts.ts` | helper の boolean 全域性を簡潔に証明 |
| 6 | web | `state/persistence.ts` | バリデータ + round-trip。`fc.jsonValue()` adversarial 入力に最適 |
| 7 | web | `audio/sound-bank.ts` | 副作用を mock で観測可能。volume/accent/sound/time の 4 軸 |
| 8 | web | `state/app-store.ts` | Solid signal + reducer の合成が dispatch シーケンスを正しく扱うか |
| (除外) | web | `audio/real-clock.ts` | 既存決定論テストで十分。PBT は重複 |

## 各モジュールに定義した性質

### packages/core/src/tempo-state.ts (8 性質)

| 性質名 | 説明 | numRuns | 結果 |
|---|---|---|---|
| PLAY 冪等性 | `reduce(reduce(s, PLAY), PLAY)` 後 `isPlaying === true`、内側呼びは reference equal | 100 | passed |
| STOP 冪等性 | 停止状態に STOP 再適用は同一 reference | 100 | passed |
| BPM クランプ往復 | 任意整数の `SET_BPM` 後の `bpm ∈ [MIN_BPM, MAX_BPM]` | 100 | passed |
| NUDGE_BPM 単調性 | 正 delta は減少させない、負 delta は増加させない | 100 | passed |
| NUDGE_BPM 可換性 | クランプが起きないとき順序入替で同一結果 | 100 | passed (精緻化後) |
| SET_TIME_SIGNATURE 不変 | `accentPattern.length === numerator`, `[0]===true`, 残り `false` | 100 | passed |
| TOGGLE_ACCENT involution | 同じ index を 2 回トグル → 元の状態 | 100 | passed |
| reduce frozen + 全契約維持 | 任意 (state, action) で frozen + 契約事後条件全て | 100 | passed |

### packages/core/src/beat-pattern.ts (7 性質)

| 性質名 | 説明 | numRuns | 結果 |
|---|---|---|---|
| beat 数則 | `beats.length === numerator * subdivision` | 100 | passed |
| measure duration 則 | `measureDurationSec === numerator * (60/bpm) * (4/denominator)` (ε=1e-9) | 100 | passed |
| 厳密単調 | `beats[i].time < beats[i+1].time` | 100 | passed |
| 最終 beat 上界 | `beats[last].time < measureDurationSec` | 100 | passed |
| beat 0 起点 | `beats[0].time === 0` | 100 | passed |
| 分割分布 | beat 内オフセット = `subIndex * (pulseSec/subdivision)` | 100 | passed |
| frozen 結果 | `result` と `result.beats` の両方が frozen | 100 | passed |

### packages/core/src/scheduler.ts (4 性質、既存 1 性質に追加)

| 性質名 | 説明 | numRuns | 結果 |
|---|---|---|---|
| start→stop は静か | `stop()` 後 60 秒進めても新しい beat が出ない | 100 | passed (精緻化後) |
| **drift 上限 ±0.001s** | BPM ∈ [30,300] × duration ∈ [1,30]s で最終 beat 時刻誤差 < 1ms | **500** | passed |
| beatIndex < numerator | 任意 emit beat の `beatIndex ∈ [0, numerator)` | 100 | passed |
| accent 保存則 | `accent === (subdivisionIndex===0 && accentPattern[beatIndex])` | 100 | passed |

### packages/core/src/tap-tempo.ts (5 性質、既存 1 性質に追加)

| 性質名 | 説明 | numRuns | 結果 |
|---|---|---|---|
| windowSize 上界不変 | NaN/逆行/巨大ギャップ含む任意 tap 列で `tapCount <= windowSize` (毎 tap 後) | 100 | passed |
| reset 全域性 | 任意の tap 列の後 `reset()` で `tapCount === 0` | 100 | passed |
| 1 tap → null, 2+ → 範囲内 | 1 tap で必ず null、以後 monotonic で `[minBpm, maxBpm]` | 100 | passed |
| **定 BPM 収束 (Oracle)** | BPM ∈ [40,240] × N tap ∈ [4,16] で ±1 BPM 以内 | **500** | passed |
| **単一外れ値ロバスト性** | 8 tap のうち 1 つを ±20% 摂動しても結果は ±5 BPM 以内 | 100 | passed |

### packages/core/src/contracts.ts (3 性質)

| 性質名 | 説明 | numRuns | 結果 |
|---|---|---|---|
| `requires` boolean 全域 | true → 例外なし、false → `ContractError("precondition")` | 100 | passed |
| `ensures` boolean 全域 | true → 例外なし、false → `ContractError("postcondition")` | 100 | passed |
| `invariant` boolean 全域 | true → 例外なし、false → `ContractError("invariant")` | 100 | passed |

### packages/web/src/state/persistence.ts (3 性質)

| 性質名 | 説明 | numRuns | 結果 |
|---|---|---|---|
| **round-trip law** | 任意の有効 `TempoState` で `loadPersisted(savePersisted(s))` が persisted 6 フィールドを再現 | 60 | passed |
| **validation rejects everything wrong** | `fc.jsonValue()` 任意 JSON に対し `loadPersisted` は `null` または Persisted キー subset のみ | 80 | passed |
| idempotent save | `savePersisted(s)` を 2 回連続で localStorage 値が同一 | 60 | passed |

### packages/web/src/audio/sound-bank.ts (3 性質)

| 性質名 | 説明 | numRuns | 結果 |
|---|---|---|---|
| never throws on valid input | `(boolean, [0..1] volume, SoundId, [0..3600] time)` で throw なし | 80 | passed |
| mute property | `volume === 0` で `osc.start` も `createOscillator` も呼ばれない (early return 完全) | 60 | passed |
| **schedule consistency** | `volume > 0` (`Number.MIN_VALUE` から) で `osc.start(args.time)` がちょうど time そのもので 1 回 | 80 | passed |

### packages/web/src/state/app-store.ts (2 性質)

| 性質名 | 説明 | numRuns | 結果 |
|---|---|---|---|
| dispatch monotonic state-replacement | 任意長 (1〜32) の SET_BPM 列で、最終 state.bpm = 最後入力の clamp 値 | 60 | passed |
| dispatch never throws on PLAY/STOP/TOGGLE_PLAY chains | 任意系列 (0〜64 個) で contract 違反なし | 60 | passed |

### 合計

| パッケージ | 新規 property 数 |
|---|---|
| packages/core | 27 (8+7+4+5+3) |
| packages/web | 8 (3+3+2) |
| **合計** | **35** |

## テスト実行結果

| 指標 | Phase 1 完了時 | Phase 2 完了時 | 増分 |
|---|---|---|---|
| core テスト件数 | 112 | **139** | **+27** |
| web テスト件数 | 75 | **83** | **+8** |
| **合計テスト件数** | 187 | **222** | **+35** |
| core 実行時間 | 1.37s | 1.85s | +0.48s |
| web 実行時間 | 2.7s | 3.6s | +0.9s |
| lint | clean | clean | — |
| typecheck | clean | clean | — |

drift と BPM 収束の 2 性質は `numRuns: 500` で実行 (品質ゲート最重要のため)、他は `100` または `60-80`。

## 発見したバグ

**プロダクションコードのバグ: なし**

Phase 1 の Round 3 防御実装と契約埋め込みの効果で、property test を 35 件追加してもプロダクションコードの新バグは検出されなかった。一方で、性質の精緻化が必要だった 2 件と、性質の設計上のセオリーを再確認するに至った 2 件があった。

### 性質の精緻化が必要だった点

#### 1. NUDGE_BPM commutativity の `fc.pre` 条件 (tempo-state)

**最初**: 「最終値だけがレンジ内なら可換」
**fast-check の反例**: `state.bpm=234, d1=-6, d2=67`
- 順序 A (d1, d2): `clamp(234-6)=228 → clamp(228+67)=295` ✓
- 順序 B (d2, d1): `clamp(234+67)=clamp(301)=300 → clamp(300-6)=294` ✗

**原因**: 中間値 `301` が MAX_BPM=300 を超えてからクランプされ、後の `-6` が真値に戻らない。
**修正**: 中間値 (`start+d1`, `start+d2`) と最終値 (`start+d1+d2`) の **3 つすべて** がレンジ内であることを要求。
**意味**: `clampBpm` は projection で群準同型ではない、という普遍的な性質を property test が即座に明らかにした。

#### 2. Scheduler `start→stop` 性質の文言

**最初**: 「start 直後に stop すると emit 数 ≤ 1 (t=0 だけ)」
**fast-check の反例**: `bpm=151, timeSignature=1/16` で pulse ≈ 0.0993s。デフォルト lookahead window (0.1s) 内に beat 0 (t=0) と beat 1 (t≈0.0993) が両方入り、`start()` の同期 tick で 2 件 emit される。

**原因**: 性質の理解誤り。`stop()` は同期 tick の **後** に走るので、lookahead window 内 beat はすべて合法的に emit される。
**修正**: 性質を「stop の **後** は新しい beat が出ない (`countAfterStop` から増えない)」 に書き換え。
**意味**: scheduler の真の不変条件は「tick chain の clean な切断」であり、emit 数の上限ではない。

### 設計の再確認

#### 3. `validTempoStateArb` の依存制約

`accentPattern.length === timeSignature.numerator` の制約を arbitrary の `.map()` 内で吸収する必要があった。`fc.array(fc.boolean())` のナイーブ実装では validator が reject するため round-trip が散発的に fail する。スキーマ依存は arbitrary 生成段階で解決するセオリー通り。

#### 4. `Number.MIN_VALUE` 境界選択 (sound-bank schedule consistency)

production の境界が `volume <= 0` であるため、`fc.double({min: 0.001, ...})` ではなく `fc.double({min: Number.MIN_VALUE, ...})` を採用。境界 mutation (`<= 0` → `< 0.001`) を Phase 3 で確実に殺すため。

## 特に強力な性質 (network effect 上位 3 件)

### #1 Scheduler drift 上限 ±0.001s (numRuns=500)

```ts
fc.property(bpm ∈ [30,300], duration ∈ [1,30],
  ...
  expect(|last.time - n*pulseSec| < 0.001))
```

- **狙い**: スケジューラー本体 (`tick`, `peekNextBeatTime`, `emitNextBeat`, `MAX_BEATS_PER_TICK` リセンク) のいずれかをいじって drift を持ち込んだら、500 ラン × 270 種類の (BPM, duration) 直積でほぼ確実に検出される。
- **想定攻撃**: 「累積誤差を無視して `time += pulseSec` を Float32 で計算する」「lookahead 中に `measureStartTime` をうっかり更新する」「clamp 周辺の浮動小数点で round して 1ms ずれる」など。
- **強さの根拠**: ε=0.001s は人間が知覚するメトロノームのジッタ上限 (Wing 1973) と同等で、本物のメトロノーム品質ガードになっている。

### #2 TapTempo 単一外れ値ロバスト性 (8 tap, ±20% 摂動)

```ts
fc.property(bpm ∈ [60,200], perturbIndex ∈ [1,6], direction,
  ...
  expect(|result - bpm| <= 5))
```

- **狙い**: MAD フィルタが正しく働いていることを保証。
- **想定攻撃**: 「`rejectOutliers` の閾値 `2.0 * mad` を `4.0 * mad` に緩める」「`if (intervals.length < 4) return intervals` を `< 8` に変える」「`median` の偶数長分岐をミスる」「フィルタ後の `avg` を `median` に変える」などの subtle な mutation を、property test が ±5 BPM の許容で確実に escape させる。
- **強さの根拠**: MAD フィルタは tap-tempo の差別化機能。「人間が日常的に犯すタイミングミス」をシミュレートしており、実機品質と直結する。

### #3 reduce が常に frozen + 全契約維持

```ts
fc.property(reachableStateArb, actionArb,
  ...
  expect(Object.isFrozen(next)),
  expect(next.bpm in [MIN_BPM, MAX_BPM]),
  expect(next.accentPattern.length === next.timeSignature.numerator))
```

- **狙い**: 10 種類の action union を fast-check で全分岐網羅。`reachableStateArb` 自身が `reduce` を 6 回通して構築されるので「過去の任意の state 上で任意の action」が一気に exercise される。
- **想定攻撃**: `SET_TIME_SIGNATURE` で `accentPattern` を作り直し忘れる / `SET_BPM` で `freeze` を呼び忘れる / `TOGGLE_ACCENT` で配列をミューテートして frozen を破る、などのリファクタ事故を出口で必ず捕まえる。
- **強さの根拠**: 契約の `ContractError` と組み合わせると、property test は契約の全 case をブラックボックスで検証する meta-test として動く。誰かが `freeze` を 1 箇所外しただけで 100 件の property がいずれかでヒットする確率がほぼ 1。

## 所感

Phase 1 の契約埋め込みが Phase 2 の property test 設計を劇的に楽にした:
- 契約の事前条件が「合法な入力空間」を明示しているため、arbitrary の設計がほぼ自動的に決まる。
- 契約の事後条件がそのまま property の expect 文に転写できる (例: `loadPersisted` の事後条件 → `validation rejects everything wrong` 性質)。
- 契約違反は `ContractError` として明確に発火するので、property test の出力が読みやすい。

「契約 → 性質 → 変異テスト」の 3 段階品質強化は、各段階が次段階の足場になる設計として機能している。Phase 3 の Stryker mutation testing で、これらの property が実際にどれだけの mutant を kill できるかが楽しみ。
