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

## 5. columnOverflowMode の全体像 (Phase C 反映)

```js
columnOverflowMode:
  'none'                     // 従来。超過列は描画しない
  'pageChunks'               // パターン1 (Phase B 実装済み)
  'gengaDougaAuto'           // SplitPage を試し、収まらなければ SeparatePages に切替
  'gengaDougaSplitPage'      // パターン3: 1ページ内で原画領域/動画領域を分ける (メイン運用)
  'gengaDougaSeparatePages'  // パターン2: 原画シート/動画シートを別ページに
```

### 5.1 UI 表記 (3択 + 詳細)

設定モーダルの「列超過モード」select は基本3択:

| UI表記 | 値 |
|---|---|
| 通常（原動画 自動） | `gengaDougaAuto` |
| 列ページ分割 | `pageChunks` |
| 従来方式 | `none` |

`gengaDougaSplitPage` / `gengaDougaSeparatePages` は将来「詳細設定」で明示選択可能にする
(Auto に任せず固定したい上級者向け)。初期 UI には出さない。

### 5.2 既存互換と新規デフォルト

- **既存テンプレで `columnOverflowMode` 未設定 → 従来通り `none` 扱い**。
  描画は一切変えない (リグレッション基準)。
- 「UI上の通常 = `gengaDougaAuto`」だが、これは**未設定 (= none) とは区別する**。
  未設定テンプレを開いても select は「従来方式 (none)」を指す。
  ユーザーが明示的に「通常（原動画 自動）」を選んで保存して初めて
  `gengaDougaAuto` になる。
- **新規テンプレ / 一時テンプレのデフォルト**:
  - 案A (採用): 当面は `none` のまま。原動画自動を使うかはユーザーが明示選択。
    既存運用 (1系列を action1/action2 でフレーム継続) を壊さないため。
  - 案B (将来): UX が固まったら新規デフォルトを `gengaDougaAuto` に切替検討。
  → 初期実装は案A。

## 6. パターン3: gengaDougaSplitPage (メイン運用)

### 6.1 位置づけ

1ページを3秒シートのように使い、**同一物理ページ内**で原画領域と動画領域を分ける。
`action1/action2` を「時間の前半/後半」ではなく「原画/動画の領域」として使う。

### 6.2 BBox の役割 (4枠の使い方)

```
action1 + cell1 = 原画領域 (sourceType = 'action')
action2 + cell2 = 動画領域 (sourceType = 'cell')
```

各領域内では cell BBox を「続き列」として使う:

| 領域 | BBox | 描画系列 | 列範囲 |
|---|---|---|---|
| 原画 | action1 | ACTION | 0 .. a1-1 |
| 原画 | cell1   | ACTION | a1 .. a1+c1-1 (続き) |
| 動画 | action2 | CELL   | 0 .. a2-1 |
| 動画 | cell2   | CELL   | a2 .. a2+c2-1 (続き) |

例 (action1.columns=7, cell1.columns=7, ACTIONデータ10列):
- action1: ACTION 1〜7列 / cell1: ACTION 8〜10列
- action2: CELL 1〜7列 / cell2: CELL 8〜10列

frames はフレーム継続ではなく**同一フレーム範囲**を原画/動画で共有する
(action1.frames を1ページ容量とし、action2 も同じ範囲)。

### 6.3 sourceType と描画

`drawTimelineBBox` に `sourceType` ('action'|'cell') と `colOffset` を渡す:
- 原画: (action1, 'action', 0)、(cell1, 'action', a1)
- 動画: (action2, 'cell', 0)、(cell2, 'cell', a2)

セルキー生成・Rep解析・棒線/止メ・BOOK・カラムヘッダーは sourceType の section
(`ACTION` or `CELL`) を参照する。Phase B の `extColOffset` に加え、
`extSourceType` モジュール変数を追加して同様に貫通させる。

### 6.4 ページ番号

**通常表記**。1ページ内に原画/動画が同居するため枝番不要。
- `currentPage`: `1`, `2`, ... (pageChunks のような枝番なし)
- `totalPages`: フレームページ数 (= 通常のシート枚数)
- 原画/動画の区別はページ内ラベル (§8) で示す。

### 6.5 SOUND / CAMERA / BOOK

- **BOOK**: 原画側 (action1 領域) に記載。
- **SOUND / CAMERA / セリフ**: 基本は原画側 (sound1/camera1)。
- **続き欄の活用**: SOUND/CAMERA の列が sound1/camera1 で足りない場合、
  動画側の sound2/camera2 を continuation として使う。
  - sound1/camera1: 原画側の通常 SOUND/CAMERA (列 0..)
  - sound2/camera2: 足りない分の続き列 (colOffset = sound1.columns)
  - ただし SplitPage の動画領域は本来 CELL 系列の描画に使うため、
    SOUND/CAMERA の continuation と競合しうる。
    → 初期実装では **sound/camera は sound1/camera1 のみ** に描画し、
    続き欄活用は将来オプション (要 UI: 「SOUND/CAMERA を動画側へ続ける」) とする。
    SplitPage の主目的は ACTION/CELL の列収容なので、SOUND/CAMERA 超過は稀。

## 7. パターン2: gengaDougaSeparatePages (収まらない時のフォールバック)

### 7.1 位置づけ

SplitPage で列が収まらない (実使用列 > a1+c1) 場合に使う。
1ページ全体を1種類のシート (原画 or 動画) として使う。

### 7.2 BBox の役割

ページ内の全4枠を、そのシートの系列の列描画に使う:

原画シート (sourceType='action'):
| BBox | 列範囲 |
|---|---|
| action1 | 0 .. a1-1 |
| cell1    | a1 .. a1+c1-1 |
| action2  | a1+c1 .. a1+c1+a2-1 |
| cell2    | a1+c1+a2 .. a1+c1+a2+c2-1 |

動画シート (sourceType='cell'): 同じ列割当で CELL 系列を描画。

これにより1ページの列容量が a1+c1+a2+c2 に拡大する。

### 7.3 ページ順とページ番号

- 並び: `1 原画 → 1 動画 → 2 原画 → 2 動画`
- 総物理ページ = (hasPage0 ? 1 : 0) + framePages × 2
- **currentPage / totalPages は通常表記** (`1`, `2`… / 総物理ページ数)。
  そのページが原画/動画かは**ページ内ラベル** (§8) で明記。
  - 例: currentPage `1` (原画), `2` (動画), `3` (原画)…
  - PageDesc.sheetKind = 'genga' | 'douga' で区別。

### 7.4 列が a1+c1+a2+c2 でも収まらない場合

§9 の警告 + 未描画列注記。さらなる chunk 化は将来 (PageDesc.chunk と併用)。

## 8. シート種別ラベル / notice / 上括弧

### 8.1 sheetTypeLabels (テンプレ単位、可変)

```js
tpl.sheetTypeLabels = {
  genga: '原画',                          // en: 'KEY'
  douga: '動画',                          // en: 'INBTWN'
  splitDougaNotice: 'こちらが動画シートです',     // en: 'INBETWEEN AREA'
  separateGengaNotice: '原画シート',            // en: 'KEY SHEET'
  separateDougaNotice: '動画シート'             // en: 'INBETWEEN SHEET'
}
```

未設定時は i18n デフォルトを使う。テンプレで上書き可能。

### 8.2 SplitPage の notice + 上括弧

動画領域 (action2/cell2) の上部に notice を描画し、領域を上括弧で括る:
- **位置**: action2 の上端より上 (カラムヘッダー -1セル目より更に上、または BOOK 帯を避けた位置)。
  action2.y を基準に `noticeY = action2.rect.y - m(オフセット)`。BOOK は原画側なので干渉しない。
- **内容**: `splitDougaNotice` (ja: こちらが動画シートです)。
- **上括弧**: action2 左端〜cell2 右端を覆う `⌐___¬` 型の線。
  `[action2.x, noticeY] → 下に小ヒゲ / 横線 / 右端で下に小ヒゲ`。
  線色は控えめ (グレー or templateLine 色)、下地なしでテンプレ画像に馴染ませる。
- **原画側**: 明示不要。必要なら小さく `genga` ラベルを option で。
- **ON/OFF**: `tpl.sheetTypeLabels.showSplitNotice !== false` (初期 ON)。将来 UI で OFF 可能。

### 8.3 SeparatePages の notice

ページ全体が原画/動画なので**上括弧は不要**。
シート上部 (BOOK 付近 = ヘッダー帯の空きスペース、または action1 の上) に
そのページ種別を明記:
- 原画ページ: `separateGengaNotice` (ja: 原画シート)
- 動画ページ: `separateDougaNotice` (ja: 動画シート)

表示文の長さ: 長い注記 (「別ページに動画シートがあります」) は邪魔なので、
**デフォルトは短縮形** (`原画シート` / `動画シート`)。
長い説明が欲しいユーザーは sheetTypeLabels で上書きできる。

### 8.4 sheetType BBox (任意)

- meta カテゴリの `sheetType` BBox を配置すると、そのページ種別ラベルを
  任意位置に描画できる (全ページ描画)。
- notice (§8.2/8.3) は BBox 無しでも自動描画される固定挙動。
  sheetType BBox は「テンプレ画像に専用欄がある」場合の追加配置用。

## 9. 未描画列の警告 (全モード共通)

どのモードでも列が黙って消えるのを避ける:
- 収まらない列がある場合、Preview 更新時に**警告トースト**
  (「○列が表示されていません。列ページ分割の利用を検討してください」)。
- 可能ならシート上にも `+n列 未表示` の小注記。
- `gengaDougaAuto`: SplitPage (容量 a1+c1) で収まらなければ SeparatePages
  (容量 a1+c1+a2+c2) に自動切替。SeparatePages でも収まらなければ警告。

## 10. Direction を 1-1 のみに (Phase C-1 / 先行小修正)

Phase B では direction を「各 framePage の chunk 0」に描画したが、
**direction はカット全体の指示**なので `1-1` (最初の物理ページ) のみに変更する。

| ページ | direction |
|---|---|
| 1-1 | 描画 |
| 1-2 | 描画しない |
| 2-1 | **描画しない** (Phase B からの変更点) |
| 2-2 | 描画しない |

- memo/staff/custom は従来通り「各 framePage の chunk 0」のままにするか、
  direction と揃えて 1-1 のみにするか → **direction のみ 1-1、他は据え置き**。
  (memo はページごとの補足に使う運用もあるため)
- この修正は Phase C 本体と独立しているため、**Phase C-1 として先行 PR 可能**。

## 11. 実装フェーズ分割 (PR分割)

| Phase | 内容 | 状態 |
|---|---|---|
| A | カラムヘッダー印字 | 実装済み (v0.25.0) |
| B | pageChunks | 実装済み (v0.26.0) |
| **C-1** | direction を 1-1 のみに (先行小修正) | 次 |
| C-2 | gengaDouga ページ計算設計の確定 (PageDesc に sheetKind、Auto の切替ロジック) | |
| C-3 | gengaDougaSplitPage 実装 (sourceType 貫通 + 4枠役割 + 通常ページ番号) | |
| C-4 | gengaDougaSeparatePages 実装 (4枠で1系列 + sheetKind ページ展開) | |
| C-5 | sheetType / notice / 上括弧描画 + sheetTypeLabels + UI 3択 | |
| D | スポイト | 未着手 |

- C-1 は独立。C-2 は設計のみ。C-3 が SplitPage 本体、C-4 が SeparatePages、
  C-5 がラベル類。`gengaDougaAuto` の切替判定は C-3 と C-4 が揃った後 C-5 で結線。
- 各 Phase 完了時も `none` テンプレは描画結果が従来一致 (リグレッション基準)。

## 12. レビュー反映履歴

### 2026-06-12 (初回)
1. totalPages は総物理ページ数 / 2. PAGE1_ONLY は各 framePage の primary chunk /
3. gengaDouga は原画=ACTION系列・動画=CELL系列 / 4. CELL BBox は続き列領域 /
5. SOUND/CAMERA の扱い / 6. カラムヘッダーは外部テンプレのみ /
7. 未描画列は警告 / 8. sheetTypeLabels 可変

### 2026-06-13 (Phase C 詳細化)
1. `columnOverflowMode` を5値に拡張、UI は3択 (通常=gengaDougaAuto / 列ページ分割 / 従来方式)
2. 既存テンプレ未設定は `none` 扱い、新規デフォルトも当面 `none` (案A)
3. **gengaDougaSplitPage** (パターン3) をメイン運用に: 同一ページ内で
   action1+cell1=原画 / action2+cell2=動画。ページ番号は通常表記
4. **gengaDougaSeparatePages** (パターン2): 4枠すべてで1系列を描画、原画/動画は別ページ。
   ページ番号は通常表記、種別はページ内ラベルで明示
5. **gengaDougaAuto**: SplitPage→収まらなければ SeparatePages へ自動切替
6. SOUND/CAMERA は原画側、continuation は将来オプション。BOOK は原画側
7. **direction は 1-1 のみ** (Phase B からの変更、C-1 で先行修正)
8. notice / 上括弧: SplitPage は動画領域上部に notice+上括弧、
   SeparatePages はページ上部にページ種別ラベル (上括弧不要)
9. sheetTypeLabels に notice 文言を追加 (splitDougaNotice 等)
10. Phase を C-1〜C-5 に細分化 (C-1 先行可能)
