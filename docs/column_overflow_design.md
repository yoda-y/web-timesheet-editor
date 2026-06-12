# 外部テンプレ columns超過時の自動分割 設計メモ

Status: Reviewed (2026-06-12 レビュー反映済み。Phase A から実装開始可)
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
  `PAGE1_ONLY_TAGS = ['direction']` だけ1ページ目限定。
- 列ヘッダー名の取得元: Edit の `sections[].chars` (ユーザーが編集可能。
  ACTION/CELL はペアで管理、例 A/B/C… と a/b/c…、CAMERA は CAM1 等)。

## 1. 基本方針とページモデル

```js
tpl.columnOverflowMode: 'none' | 'pageChunks' | 'gengaDouga'   // default 'none'
```

- `none`: 従来通り。超過列は描画しない
- `pageChunks`: 列チャンクごとにページを増やす (パターン1)
- `gengaDouga`: 原画シート / 動画シートを分けて出力 (パターン2)

ページを (framePage, chunk, sheetKind) の3軸で表す論理ページに拡張する。

```
論理ページ記述子 PageDesc = {
  framePage: 0..N-1,       // フレーム方向のページ (従来の pageIndex 相当)
  chunk: 0..C-1,           // 列チャンク (pageChunks モード。将来 gengaDouga でも使用)
  sheetKind: 'normal' | 'genga' | 'douga',  // gengaDouga モードのみ genga/douga
  isPage0: boolean
}
```

- 物理ページ番号 (Preview のページ送り / 画像書き出しの並び) は
  **フレームページ内で chunk / sheetKind を連続**させる:
  - pageChunks: `1-1 → 1-2 → 2-1 → 2-2`
  - gengaDouga: `1 原画 → 1 動画 → 2 原画 → 2 動画`
- `getExternalTemplatePageDesc(physicalIndex)` を新設し、
  既存の `getPageStartFrame()` は `desc.framePage` ベースで返す。
  描画系は renderTemplate(dpi, physicalIndex) → desc 展開で従来コードへ流す。
- 0ページ (headMargin) は chunk 0 / normal のみの1枚 (列続き・原画動画分割は作らない)。
- **primary chunk**: 各フレームページの先頭の物理ページ。
  `isPrimaryChunkForFramePage = (chunk === 0)` (gengaDouga では `sheetKind === 'genga'`)。
  「framePage ごとに1回だけ出す要素」の判定に使う (物理1ページ目限定ではない)。

## 2. 設定とデータモデル

### 2.1 テンプレ単位 (外部テンプレオブジェクト直下)

```js
tpl.columnOverflowMode: 'none' | 'pageChunks' | 'gengaDouga'
tpl.columnHeader: {                 // テンプレ共通のカラムヘッダー設定
  show: false,                      // showColumnHeaders
  bgEnabled: true,                  // columnHeaderBgEnabled
  bgColor: '#ffffff',               // columnHeaderBgColor
  textColor: '#000000',             // columnHeaderTextColor
  offsetX: 0,                       // mm 単位 (scale非依存)
  offsetY: 0,
  fontSize: null,                   // null = 自動 (セル高ベース)
  vertical: false                   // columnHeaderVertical (縦書き)
}
tpl.sheetTypeLabels: {              // gengaDouga のシート種別文言 (データ構造は可変)
  genga: '原画',                    // en デフォルト: 'KEY'
  douga: '動画'                     // en デフォルト: 'INBTWN'
}
// 将来拡張 (初期実装では固定値、設定UI無し):
// tpl.gengaDougaSources = { genga: 'action', douga: 'cell' }
```

### 2.2 BBox単位 override (timeline BBox のみ)

```js
bbox.columnHeader: { ...同キーの部分集合... }   // 未指定キーはテンプレ共通へフォールバック
```

- `columnOverflowMode` は**テンプレ単位** (ページ構成そのものが変わるため)。
- `columnHeader` は**テンプレ共通 + BBox override**。テンプレ画像のヘッダー欄は
  領域ごとに位置・下地の有無が違うことが多い。
  実装は `resolveColumnHeaderConfig(tpl, bbox)` 1関数でマージ。
- 保存互換: いずれも未定義 = 従来動作。IDB / Project HTML は丸ごと保存なので
  シリアライズ変更不要。
- columnHeader は **BBoxサイズ同期 (BBOX_SYNC_GROUPS) の対象外**。

## 3. カラムヘッダー印字 (Phase A / 単独で先行実装)

columns超過と独立して価値があるため先行実装する。**対象は外部テンプレのみ**
(標準A3は対象外)。

- 取得元: `sections.find(s => s.type === 'ACTION').chars[ci]` 等。
  外部テンプレの type→section 対応は action→ACTION, cell→CELL,
  sound→SOUND, camera→CAMERA。
  空/未定義は自動名 fallback (ACTION: A,B,C… / CELL: 小文字 / CAMERA: CAM{n} / SOUND: S{n})。
  列オフセット導入後は `chars[ci + colOffset]`、gengaDouga では sourceType の section を参照。
- 描画位置: 各列の **0セル目** 中央。
  `x = rect.x + ci * cellW + cellW/2 + m(offsetX)`、
  `y = rect.y + cellH/2 + m(offsetY)` (フレーム0行のセル内)。
  ※ BBox 範囲外 (上) に出す案は clip と外部画像のヘッダー欄位置が不定なため不採用。
  0セル目はデータと重なり得るが、下地で可読性を確保する。
- フォント: `fontSize ?? min(cellH*0.6, m(2.2))`、`vertical: true` で1文字ずつ縦組み。
- 下地: `bgEnabled` 時、テキスト実測幅+パディングの矩形を `bgColor` で塗ってから文字。
  下地なしも可 (白抜き欄が既にあるテンプレ向け)。
- 描画タイミング: `drawTimelineBBox` 内、セルデータ描画の**後** (ヘッダーが最前面)。

### 3.1 設定UI

- BBoxエディタのプロパティパネル (timeline タグ選択時) に追加:
  - [x] カラムヘッダーを印字
  - [x] 下地あり / 下地色 (color input) / 文字色
  - offsetX / offsetY (number, mm) / fontSize / 縦書き
  - 「テンプレ共通設定を使う」チェック (OFF で BBox override 有効化)
- テンプレ共通設定は外部テンプレ設定モーダルの詳細フォームに同項目を置く。

### 3.2 スポイト (Phase D、設計のみ)

- BBoxエディタのキャンバスは画像を canvas 描画しているため、
  `ctx.getImageData(x, y, 1, 1)` で実装コストは低い (dataURL なので canvas 汚染なし)。
- UI: 下地色 input の隣に「スポイト」ボタン → キャンバスが pick モードになり、
  クリックで色取得して input へ反映、Esc で解除。カーソルは crosshair。
- Phase A では color input のみ。

## 4. パターン1: pageChunks (Phase B)

### 4.1 ページ計算

```js
function getUsedColumnCount(type) {
  // cellData キー走査 + dialogueBlocks/cameraBlocks の colIndex(+colspan) +
  // booksData の最大列から、実使用列数 (max index + 1) を返す
}
function getExternalTemplateChunkCount(tpl) {
  if (tpl.columnOverflowMode !== 'pageChunks') return 1;
  let chunks = 1;
  for (const grp of [action, cell]) {           // ※ SOUND/CAMERA は対象外 (chunk 0 のみ)
    const cap = grp.b2有効 ? min(b1.columns, b2.columns) : b1.columns;
    chunks = max(chunks, ceil(getUsedColumnCount(grp) / cap));
  }
  return chunks;
}
総物理ページ = (hasPage0 ? 1 : 0) + framePages * chunkCount
```

- **chunk の列容量は ACTION/CELL のみで決める**。
- 列範囲: chunk k は `colOffset = k * cap` から `cap` 列分。

### 4.2 ページ別の描画内容

| 要素 | 各 framePage の chunk 0 | chunk 1+ |
|---|---|---|
| meta系 (title/episode/scene/cut/name/lengthSec/lengthFrame/currentPage/totalPages/sheetType 等) | 描画 (**全ページ**) | 描画 (**全ページ**) |
| direction / memo / staff / custom | 描画 | 描画しない |
| ACTION / CELL | colOffset=0 | colOffset=k*cap |
| SOUND / CAMERA / セリフ | 描画 | 描画しない (枠のみ) |
| BOOK | 列範囲内のみ描画 | 列範囲内の BOOK のみ |
| Rep/棒線/波線/止メ/ブレ | 描画 | colOffset 適用で描画 |

- meta系は**全物理ページに描画**する。カット番号・ページ番号・title/name が無いと
  ページ単体で識別できないため。
- direction/memo/staff/custom と SOUND/CAMERA/セリフは
  **物理1ページ目限定ではなく、各 framePage の chunk 0 (primary chunk)** に描画する。
  6秒超のカットでは `2-1`, `3-1` にもそのフレーム範囲の SOUND/CAMERA が必要。
  判定: `isPrimaryChunkForFramePage = (chunk === 0)`。
  ※ direction は従来「最初の通常ページのみ」だったが、本モードでは
  「各 framePage の chunk 0」へ変更 (chunk 1+ にだけ出さない)。
  `none` モードでは従来挙動を維持する。
- 0ページ (headMargin) は従来通りの別扱い (chunk 0 のみ)。
- custom の「全ページ表示」フラグ (`bbox.allPages`) は将来拡張として予約のみ。

### 4.3 列オフセットの貫通

`drawTimelineBBox(ctx, type, bbox, ..., colOffset)` を追加し、配下へ渡す:

- `drawActionCellInBBox`: セルキー `TYPE-(ci+colOffset)-f`、fontColorId/option も同様
- `computeActionRepeatSkipSet` / `drawActionRepeatsInBBox` / 棒線・波線 / 止メ:
  列ループを colOffset 起点に変更
- `drawSoundInBBox` / `drawCameraInBBox`: chunk 0 のみ呼ばれる
  (将来のため block.colIndex - colOffset 方式のフィルタは入れておく)
- `drawExternalTemplateBooks`: `colIndex >= columns` で捨てている箇所を
  `colIndex - colOffset` が 0..columns-1 に入るものだけ描画に変更
- カラムヘッダー: `chars[ci + colOffset]`

### 4.4 ページ表記

- `getExternalTemplatePageLabel(desc)` を新設:
  - chunkCount === 1: 従来通り `"1"`, `"2"`
  - chunkCount > 1: `"1-1"`, `"1-2"` (framePage / chunk とも 1 始まり)
- `currentPage` BBox: 上記ラベル文字列をそのまま描画。
- `totalPages` BBox: **総物理ページ数** (例: 2フレームページ×2チャンク = `4`)。
  - Preview/書き出しで実際に生成される枚数と一致させる。
  - 例: currentPage `1-2` / totalPages `4`。
  - フレームページ数が必要になったら別タグ `totalFramePages` を将来追加。
- Preview のページ送り UI / 画像書き出しのページ列挙も総物理ページ数を使う。

## 5. パターン2: gengaDouga (Phase C)

### 5.1 概念

原画シートと動画シートを分けて出力する。
**シート種別ごとに描画するデータ系列が異なる**:

```js
const sourceType = (sheetKind === 'douga') ? 'cell' : 'action';
```

- 原画シート: **ACTION 系列**を描画
- 動画シート: **CELL 系列**を描画

将来設定可能にする場合は `tpl.gengaDougaSources = { genga: 'action', douga: 'cell' }`。
初期実装はこの固定値 (UI 無し)。

### 5.2 CELL BBox の役割

gengaDouga モードでは CELL BBox は「CELLデータ専用欄」ではなく、
**そのシートで扱う系列の続き列を描画する領域**として使う。

- 原画シート: ACTION BBox = ACTION 列 0..a-1 / CELL BBox = ACTION 列 a.. (続き)
- 動画シート: ACTION BBox = CELL 列 0..a-1 / CELL BBox = CELL 列 a.. (続き)

例 (ACTION BBox columns=7, CELL BBox columns=7, データ10列):

| シート | ACTION BBox | CELL BBox |
|---|---|---|
| 1 原画 | ACTION 1〜7列 | ACTION 8〜10列 |
| 1 動画 | CELL 1〜7列 | CELL 8〜10列 |

実装: `drawTimelineBBox` に `sourceType` と `colOffset` を渡す。
- 原画: (ACTION BBox, sourceType='action', colOffset=0)、(CELL BBox, sourceType='action', colOffset=a)
- 動画: (ACTION BBox, sourceType='cell', colOffset=0)、(CELL BBox, sourceType='cell', colOffset=a)
セルキー生成・Rep解析・棒線/止メ・BOOK・カラムヘッダーは sourceType の section を参照する。

### 5.3 ページ計算とシート種別

- 総物理ページ = (hasPage0 ? 1 : 0) + framePages × 2 (原画, 動画)
- 並び: `1 原画 → 1 動画 → 2 原画 → 2 動画`
- シート種別表示:
  - 新タグ `sheetType` BBox (meta カテゴリ、**全ページ描画**、gengaDouga 以外では空)。
    値は `tpl.sheetTypeLabels` (ja デフォルト 原画/動画、en デフォルト KEY/INBTWN)。
  - `currentPage` 表記: `1 原画` / `1 動画` (ラベルは sheetTypeLabels を使用)。
  - `totalPages`: 総物理ページ数 (framePages × 2 + 0ページ)。
- SOUND / CAMERA / セリフ / direction / memo / staff / custom は
  **各 framePage の原画シート側のみ** (primary = genga)。
  動画シートにも出すオプションは将来追加。
- meta系は全ページ。

### 5.4 列が収まらない場合 (a + c < 実使用列数)

**黙って切り捨てない**。

- 初期実装 (Phase C): 未描画列が発生した場合、
  1. Preview 更新時に警告トースト (「○列が表示されていません。pageChunks の利用を検討してください」)
  2. シート上にも未描画列があることを明示 (CELL BBox 右下に「+n列 未表示」の小さい注記)
- 将来: gengaDouga × chunk の組合せ (`1-1 原画, 1-2 原画, 1-1 動画...`) を
  PageDesc の chunk 軸で実現できる設計にしておく (PageDesc に chunk を最初から持たせる理由)。

## 6. 実装フェーズ分割 (PR分割)

| Phase | 内容 | 規模 |
|---|---|---|
| A | カラムヘッダー印字 (外部テンプレのみ、0セル目中央、offset/fontSize/textColor/bg/vertical、color input) | 中 |
| B | pageChunks: PageDesc + colOffset 貫通 + currentPage/totalPages + SOUND/CAMERA は chunk 0 のみ + meta全ページ + 未描画列ゼロ | 大 |
| C | gengaDouga: sheetKind + sourceType (原画=action/動画=cell) + ACTION/CELL BBox を前半/続き領域として使用 + sheetType 表示 + SOUND/CAMERA は原画側 + 収まらない場合の警告 | 中 (Bの上に乗る) |
| D | スポイト (BBoxエディタ上でテンプレ画像から色取得 → columnHeaderBgColor) | 小 |

- B が土台 (PageDesc / colOffset / primary chunk 判定)。
- 既存テンプレ (columnOverflowMode 未設定 = 'none') は全 Phase 完了後も
  描画結果が従来と一致すること (リグレッション基準)。

## 7. レビュー反映履歴 (2026-06-12)

初版からの主な変更点:

1. totalPages は**総物理ページ数** (初版はフレームページ数 → 変更)
2. PAGE1_ONLY 系は物理1ページ目限定ではなく**各 framePage の primary chunk** (chunk 0 / 原画側)
3. gengaDouga は**原画=ACTION系列、動画=CELL系列** (初版の「両シート同一データ複製」案を破棄)
4. CELL BBox は「そのシートの sourceType の続き列領域」
5. SOUND/CAMERA は pageChunks では各 framePage の chunk 0、gengaDouga では原画シート側
6. カラムヘッダーは外部テンプレのみ
7. gengaDouga で列が収まらない場合、黙って切り捨てず警告 + 未表示明示
8. sheetTypeLabels をデータ構造として可変に (ja: 原画/動画、en: KEY/INBTWN)
