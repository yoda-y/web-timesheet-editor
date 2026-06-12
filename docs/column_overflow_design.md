# 外部テンプレ columns超過時の自動分割 設計メモ

Status: Draft (実装前レビュー用)
対象バージョン: v0.25.0 以降 (段階実装)

## 0. 現状整理 (調査結果)

- 外部テンプレの timeline 描画はすべて `for (ci = 0; ci < bbox.columns)` ループで、
  BBox の columns を超えた Edit 列は **黙って描画されない** (ACTION/CELL/SOUND/CAMERA、
  BOOK、Rep/棒線/波線/止メ/ブレ すべて)。
- ページ分割は **フレーム方向のみ**:
  - 1ページ容量 = `getExternalTemplateSheetCapacity()` (= action1.frames + action2.frames)
  - `getExternalTemplateTotalPages()` / `getExternalTemplatePageStartFrame(pageIndex)`
  - 0ページ (headMargin) は pageIndex 0 を占有。
- action1→action2 は「同じ列範囲のフレーム継続」(例: 左半分 0-71fr / 右半分 72-143fr)。
- メタ系描画 `drawExternalTemplateMetaBoxes` は既に**全ページ描画**で、
  `PAGE1_ONLY_TAGS = ['direction']` だけ1ページ目限定。→ 課題1への回答:
  meta系の全ページ表示は現状のままで整合する。変更が必要なのは
  「1ページ目のみ」集合の拡張と、列チャンク/シート種別の概念追加。
- 列ヘッダー名の取得元: Edit の `sections[].chars` (ユーザーが編集可能。
  ACTION/CELL はペアで管理、例 A/B/C… と a/b/c…、CAMERA は CAM1 等)。

## 1. 用語とページモデル

ページを (framePage, chunk, sheetKind) の3軸で表す論理ページに拡張する。

```
論理ページ記述子 PageDesc = {
  framePage: 0..N-1,       // フレーム方向のページ (従来の pageIndex 相当)
  chunk: 0..C-1,           // 列チャンク (pageChunks モードのみ C>1)
  sheetKind: 'normal' | 'genga' | 'douga',  // gengaDouga モードのみ genga/douga
  isPage0: boolean
}
```

- 物理ページ番号 (Preview のページ送り / 画像書き出しの並び) は
  **フレームページ内で chunk / sheetKind を連続**させる:
  - pageChunks: `1-1, 1-2, 2-1, 2-2, ...`
  - gengaDouga: `1原, 1動, 2原, 2動, ...`
- `getExternalTemplatePageDesc(physicalIndex)` を新設し、
  既存の `getPageStartFrame()` は `desc.framePage` ベースで返す。
  描画系は renderTemplate(dpi, physicalIndex) → desc 展開で従来コードへ流す。
- 0ページ (headMargin) は chunk 0 / normal のみの1枚 (列続きは作らない)。

## 2. 設定とデータモデル

### 2.1 テンプレ単位 (外部テンプレオブジェクト直下)

```js
tpl.columnOverflowMode: 'none' | 'pageChunks' | 'gengaDouga'   // default 'none'
tpl.columnHeader: {                 // テンプレ共通のカラムヘッダー設定
  show: false,                      // showColumnHeaders
  bgEnabled: true,
  bgColor: '#ffffff',
  textColor: '#000000',
  offsetX: 0,                       // mm 単位 (scale非依存)
  offsetY: 0,
  fontSize: null,                   // null = 自動 (セル高ベース)
  vertical: false                   // 縦書き
}
```

### 2.2 BBox単位 override (timeline BBox のみ)

```js
bbox.columnHeader: { ...同キーの部分集合... }   // 未指定キーはテンプレ共通へフォールバック
```

採用理由 (質問への回答):
- `columnOverflowMode` は**テンプレ単位**。ページ構成そのものが変わるため
  BBox単位にすると整合が取れない。
- `columnHeader` は**テンプレ共通 + BBox override**。テンプレ画像のヘッダー欄は
  領域ごとに位置・下地の有無が違うことが多い (ACTION欄は印字済み、CAMERA欄は無い等)。
  実装は `resolveColumnHeaderConfig(tpl, bbox)` 1関数でマージ。
- 保存互換: どちらも未定義 = 従来動作。IDB / Project HTML は丸ごと保存なので
  シリアライズ変更不要 (BBoxサイズ同期の syncSize と同じ扱い)。
- columnHeader は **BBoxサイズ同期 (BBOX_SYNC_GROUPS) の対象外**とする
  (位置依存の offset を含むため。必要になれば後で同期キーに追加可能)。

## 3. カラムヘッダー印字 (優先度1 / 単独で先行実装可)

columns超過と独立して価値があるため **Phase A として先行実装**する。

- 取得元: `sections.find(s => s.type === 'ACTION').chars[ci]` 等。
  外部テンプレの type→section 対応は action→ACTION, cell→CELL,
  sound→SOUND, camera→CAMERA。
  空/未定義は自動名 fallback (ACTION: A,B,C… / CELL: 小文字 / CAMERA: CAM{n} / SOUND: S{n})。
  列オフセット導入後は `chars[ci + colOffset]`。
- 描画位置: 各列の **0セル目** 中央。
  `x = rect.x + ci * cellW + cellW/2 + m(offsetX)`、
  `y = rect.y + cellH/2 + m(offsetY)` (フレーム0行のセル内)。
  ※ BBox 範囲外 (上) に出す案は clip と外部画像のヘッダー欄位置が不定なため不採用。
  0セル目はデータと重なり得るが、下地で可読性を確保する。
- フォント: `fontSize ?? min(cellH*0.6, m(2.2))`、`vertical: true` で1文字ずつ縦組み。
- 下地: `bgEnabled` 時、テキスト実測幅+パディングの矩形を `bgColor` で塗ってから文字。
  下地なしも可 (白抜き欄が既にあるテンプレ向け)。
- 描画タイミング: `drawTimelineBBox` 内、セルデータ描画の**後**
  (ヘッダーが最前面。下地でセル0の値を隠す形になるが、0コマ目に値がある運用は稀)。

### 3.1 設定UI

- BBoxエディタのプロパティパネル (timeline タグ選択時) に追加:
  - [x] カラムヘッダーを印字
  - [x] 下地あり / 下地色 (color input) / 文字色
  - offsetX / offsetY (number, mm) / fontSize / 縦書き
  - 「テンプレ共通設定を使う」チェック (OFF で BBox override 有効化)
- テンプレ共通設定は外部テンプレ設定モーダルの詳細フォームに同項目を置く。

### 3.2 スポイト (優先度4、設計のみ)

- BBoxエディタのキャンバスは画像を canvas 描画しているため、
  `ctx.getImageData(x, y, 1, 1)` で実装コストは低い (同一オリジン dataURL なので
  canvas 汚染なし)。
- UI: 下地色 input の隣に「スポイト」ボタン → キャンバスが pick モードになり、
  クリックで色取得して input へ反映、Esc で解除。カーソルは crosshair。
- 実装は Phase A に含めず Phase D (小PR) とする。color input が先行。

## 4. パターン1: pageChunks (優先度2)

### 4.1 ページ計算

```js
function getUsedColumnCount(type) {
  // cellData キー走査 + dialogueBlocks/cameraBlocks の colIndex(+colspan) +
  // booksData の最大列から、実使用列数 (max index + 1) を返す
}
function getExternalTemplateChunkCount(tpl) {
  if (tpl.columnOverflowMode !== 'pageChunks') return 1;
  let chunks = 1;
  for (const grp of [action, cell]) {           // ※ SOUND/CAMERA は対象外 (下記)
    const cap = grp.b2有効 ? min(b1.columns, b2.columns) : b1.columns;
    chunks = max(chunks, ceil(getUsedColumnCount(grp) / cap));
  }
  return chunks;
}
総物理ページ = (hasPage0 ? 1 : 0) + framePages * chunkCount
```

- **chunk の列容量は ACTION/CELL のみで決める**。SOUND/CAMERA は
  1ページ目 (chunk 0) のみ描画 (今回の前提修正に従う)。
- 列範囲: chunk k は `colOffset = k * cap` から `cap` 列分。

### 4.2 ページ別の描画内容

| 要素 | chunk 0 | chunk 1+ |
|---|---|---|
| meta系 (title/cut/page等) | 描画 (現状通り全ページ) | 描画 |
| direction / memo / staff | 1ページ目のみ (※) | 描画しない |
| custom | 1ページ目のみ (将来 bbox.allPages で切替) | 描画しない |
| ACTION / CELL | colOffset=0 | colOffset=k*cap |
| SOUND / CAMERA | 描画 | 描画しない (枠のみ) |
| BOOK | 描画 (列範囲内のみ) | 列範囲内の BOOK のみ |
| Rep/棒線/波線/止メ/ブレ | 描画 | colOffset 適用で描画 |

※「1ページ目のみ」の判定 (課題2への回答):
`PAGE1_ONLY_TAGS` を `['direction', 'memo'] + staffカテゴリ + customカテゴリ` に拡張し、
判定を `isFirstPage && chunk === 0` に変更する。タグのカテゴリは
`externalTemplate.tags[tag].category` から取れるため、ハードコード列挙ではなく
カテゴリベースで安全に判定できる。currentPage/totalPages/title 等の meta は対象外。
custom の「全ページ表示」フラグ (`bbox.allPages`) は将来拡張として予約のみ。

### 4.3 列オフセットの貫通 (課題6, 8)

`drawTimelineBBox(ctx, type, bbox, ..., colOffset)` を追加し、配下へ渡す:

- `drawActionCellInBBox`: セルキー `TYPE-(ci+colOffset)-f`、fontColorId/option も同様
- `computeActionRepeatSkipSet` / `drawActionRepeatsInBBox` / 棒線・波線 / 止メ:
  列ループを colOffset 起点に変更
- `drawSoundInBBox` / `drawCameraInBBox`: chunk 0 のみ呼ばれるため改修不要
  (将来のため block.colIndex - colOffset 方式のフィルタだけ入れてもよい)
- `drawExternalTemplateBooks`: `colIndex >= columns` で捨てている箇所を
  `colIndex - colOffset` が 0..columns-1 に入るものだけ描画に変更
- カラムヘッダー: `chars[ci + colOffset]`

### 4.4 ページ表記 (課題5)

- `getSheetLabel` 相当の外部テンプレ版 `getExternalTemplatePageLabel(desc)` を新設:
  - chunkCount === 1: 従来通り `"1"`, `"2"`
  - chunkCount > 1: `"1-1"`, `"1-2"` (framePage は 1 始まり、chunk も 1 始まり)
- `currentPage` BBox: 上記ラベル文字列をそのまま描画 (数値でなく文字列化)。
- `totalPages` BBox: **フレームページ数のまま** (例 `1-2 / 2` = 2枚目相当)。
  代替案 (総物理ページ数 4) はシート枚数の意味が変わるため不採用。
  → 要確認: この解釈で良いか。
- Preview のページ送り UI / 画像書き出しのページ列挙は総物理ページ数を使う。

## 5. パターン2: gengaDouga (優先度3)

### 5.1 概念

- ACTION 系列のデータ (Edit の ACTION/CELL 列) を「原画シート」「動画シート」の
  2枚に**同じ列配分で**印字する。シートの違いは種別ラベルのみ。
- **CELL BBox は「ACTION 続き列の描画領域」に転用**する (このモードの核心)。

### 5.2 データの読み方 (課題7、慎重設計部分)

結論案: **どちらのシートも同じ cellData を描画する** (転記シートの複製)。

- 原画/動画でデータを分ける案 (ACTION=原画データ、CELL=動画データ) は、
  Edit 側に「原画用/動画用」の区別が存在しないため**今回は採らない**。
  Edit の cellData は1系統であり、原画マン→動画マンに渡る紙の複製が実態。
- 列配分: 実使用列数 U、ACTION容量 a = action1.columns、CELL容量 c = cell1.columns。
  - 列 0..a-1 → ACTION BBox (colOffset 0)
  - 列 a..min(U, a+c)-1 → CELL BBox (colOffset a、**データソースは ACTION 系列**)
  - U > a+c の場合はさらに pageChunks と同じ仕組みで `(a+c)` 列単位のチャンク化
    (gengaDouga × chunk の組合せ。初期実装では U > a+c は切り捨てでも可 → 要確認)
- CELL 系列の cellData (`CELL-*`) はこのモードでは**描画しない**。
  ACTION/CELL ペア列 (タップ割り) の運用では CELL 値は ACTION の組と
  対で入るため、原画/動画シートに ACTION 系列のみを印字する想定。
  → 要確認: CELL 値も印字したいケースがあるか (あるなら「CELL列も列配分に含める」
  オプションを検討)。
- 実装: `drawTimelineBBox(ctx, type, ...)` に `sourceType` を追加し、
  cell BBox 描画時に `sourceType='action'` を渡すだけで成立する
  (セルキー生成・Rep解析・BOOK が sourceType を見るよう統一)。

### 5.3 ページ計算とシート種別

- 総物理ページ = (hasPage0 ? 1 : 0) + framePages × 2 (原画, 動画)
- 並び: `1原 → 1動 → 2原 → 2動` (フレームページ内で連続)
- シート種別ラベル:
  - 新タグ `sheetType` BBox を追加 (meta カテゴリ、全ページ描画)。
    値は `原画` / `動画` (en: KEY / INBTWN)。BBox 未配置でも
    currentPage ラベルに含める (下記)。
  - `currentPage` 表記: `1 原画` / `1 動画` (en: `1 G` / `1 D` 等は i18n で吸収)。
- SOUND / CAMERA / direction / staff / custom は**原画シートのみ** (=各フレームページの
  1枚目) に描画。meta系は両方。

## 6. 実装フェーズ分割 (PR分割案)

| Phase | 内容 | 規模 |
|---|---|---|
| A | カラムヘッダー印字 (テンプレ共通+BBox override、下地、色 input) | 中 |
| B | pageChunks: PageDesc 導入 + 列オフセット貫通 + ページ表記 | 大 |
| C | gengaDouga: sourceType + シート種別ラベル + ページ展開 | 中 (Bの上に乗る) |
| D | スポイト | 小 |

- B が土台 (PageDesc / colOffset / PAGE1_ONLY 拡張)。C は B の chunk 機構を
  sheetKind に置き換えるだけで済むよう、B の時点で PageDesc に sheetKind を
  予約しておく。
- 既存テンプレ (columnOverflowMode 未設定 = 'none') は全 Phase 完了後も
  描画結果がバイト単位で従来一致すること (リグレッション基準)。

## 7. 残課題 / 要確認

1. totalPages の解釈: フレームページ数のまま (`1-2 / 2`) で良いか、
   総物理ページ数にするか。(設計は前者)
2. gengaDouga で U > a+c (両領域でも収まらない) はチャンク化まで初期対応するか、
   切り捨て+警告にするか。(設計は切り捨て+警告を初期、チャンク化は後続)
3. gengaDouga で CELL 系列の値を印字するケースの有無。
4. sheetType の文言 (原画/動画 固定で良いか、自由文字列にするか)。
5. カラムヘッダーを標準A3テンプレにも印字するか (今回は外部テンプレのみ)。
