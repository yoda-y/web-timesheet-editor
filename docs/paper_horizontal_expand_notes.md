# 標準テンプレートの用紙横拡張 設計メモ

Status: 設計 (PR-2)。調査反映済み。実装は別PR (段階実装)。
columns超過対応 (column_overflow_design.md) とは別問題 — あちらは外部テンプレ画像、
こちらは標準A3 用紙そのものの可変幅。

## 背景・要望

標準A3テンプレートで初期カラム数より多い列がある場合、現状は列幅を圧縮して
A3 幅に収めている。これを「カラム幅は維持し、用紙を横に拡張する」挙動にしたい。

- 列圧縮は読みにくい / 追加列は追加スペースとして扱いたい
- 横スクロール・横長書き出しは許容する

## 調査結果 (現状の実装)

### Edit 画面 (draw.js / utils.js / state.js)
- **既に圧縮しない**。各セクションは固定セル幅 `sec.cw` (ACTION 32 / SOUND 68 /
  CELL 58 / CAMERA 58 px)。
- `updateSectionPositions()` (utils.js:238): `sec.x` を順に積み、
  `endX = 最終列右端`、`baseWidth = max(window.innerWidth, endX + 50)`。
  → 列が増えれば baseWidth が伸び、横スクロールで対応済み。
- メタ行 (metaFields) は baseWidth に対する比率配置。
- **結論: Edit 側は横拡張が既に効いている**。今回の主対象ではない。

### Preview / 標準A3 描画 (template.js)
- `renderTemplate(dpi, pageIndex)`:
  - `TEMPLATE.WIDTH_MM = 297` 固定。`createTemplateCanvas(dpi)` が
    297×420mm 固定キャンバスを作る。
  - `contentW = (WIDTH_MM - MARGIN_LEFT - MARGIN_RIGHT) * scale`
  - `bodyW = (contentW - BODY_H_MARGIN) / 2` (左右2カラム=0-71fr / 72-143fr)
- `drawTimelineColumn()`:
  - `availW = bodyW - frameNumW`
  - `totalParts = cols.ACTION + cols.SOUND*soundRatio + cols.CELL + cols.CAMERA`
  - **`unitW = availW / totalParts`** ← ここで列が増えるほど unitW が縮む = 圧縮。
- **結論: 圧縮の元凶は template.js のこの幅計算 + 固定 WIDTH_MM**。

### 書き出し
- PNG/JPG: `getTemplateForExport(dpi)` → `renderTemplate(dpi, currentPage)` の
  canvas をそのまま出力。canvas 幅が広がれば出力も広がる。
- PSD (psd-export.js): `renderExternalTemplateImageOnly` / `renderTemplate` の
  canvas 寸法に依存。レイヤー座標も canvas 基準。
- → renderTemplate のキャンバス幅を可変にすれば書き出しは概ね追従するが、
  PSD のキャンバス寸法・レイヤー配置の再確認が必要。

### 手書きレイヤー (handwriting.js)
- 手書きは Preview の stage (テンプレ画像) 座標に正規化して保持。
  用紙幅が変わると正規化基準が変わるため、既存手書きの座標維持/再マップ要検討。

### TDTS / XDTS
- 列数を持つデータ形式。用紙幅は出力に直接影響しないはずだが、
  ラウンドトリップ (列数保持) の確認が必要。

## 設計方針

### 基本方針: 標準A3の「用紙幅」を列数に応じて可変にする
- 圧縮をやめ、**1列あたりの物理幅 (mm/列) を固定**し、列が基準を超えたら
  `WIDTH_MM` を拡張する。
- A3 縦 (297×420) を基準に、超過分を**右方向に追加**して `297+α × 420` の
  横長用紙にする。比率は維持しない (A3+ 横長を許容)。

### 決めたいこと (要確認)

1. **基準セクション**: どの列増加で横拡張するか。
   - 案: ACTION + CELL の合計列数を基準 (作画の主軸)。SOUND/CAMERA は
     固定列数前提か、これらも含めるか。
   - 推奨: **ACTION/CELL の超過分のみ**で拡張幅を算出 (SOUND/CAMERA は通常固定)。

2. **基準列幅 (mm/列)**: 拡張時の1列幅。
   - 案: 初期A3で7列が収まる時の unitW を「標準列幅」として固定し、
     超過列はその幅で右に追加。`extraCols × 標準列幅` を WIDTH_MM に加算。

3. **A3比率維持 or 横長**: → 横長許容 (比率維持しない)。

4. **Preview / Export も横長にするか**: → する (用紙が実際に広がる)。
   - Preview は既存の pan/zoom + fit で横長キャンバスを表示。
   - 書き出しも横長画像になる。

5. **手書き座標**: 用紙幅変更時の既存手書き。
   - 案A (推奨): 手書きは「用紙左上原点・mm 絶対座標」で保持し、用紙拡張は
     右に伸びるだけなので既存手書き座標は不変 (左寄せ維持)。
   - 案B: 正規化(0-1)保持だと幅変更で歪むため避ける。
   - → 実装時に handwriting の保持系を確認して案Aで吸収。

6. **既存データを開いた時に勝手に横拡張するか**:
   - 案: 列数が基準内なら従来どおり A3。超過時のみ自動拡張。
     既存データは列数で自動判定 (勝手に見た目が変わるのは超過時のみ)。

7. **設定で ON/OFF**:
   - 案: `settings.draw.paperAutoExpand` (既定 ON)。OFF なら従来の圧縮動作。
   - 移行期は OFF 既定にして明示オプトインも検討 (要確認)。

### 影響範囲チェックリスト (実装時)

- [ ] template.js: `WIDTH_MM` 固定 → `getTemplatePaperWidthMm()` 動的算出に
- [ ] `createTemplateCanvas`: 幅を動的 WIDTH_MM ベースに
- [ ] `drawTimelineColumn`: `unitW` を「固定列幅」に変更 (圧縮しない)
- [ ] 左右2カラム構成 (bodyW × 2) が横長でどうなるか (横長時は1カラム化?要設計)
  - ※ ここが最大の論点: 現状 0-71fr/72-143fr の2段組。横拡張すると
    2段組を維持しつつ各段が広がるのか、段組を見直すのか。
- [ ] ヘッダー/Direction/BOOK の幅追従
- [ ] PNG/JPG 書き出しサイズ
- [ ] PSD 書き出し canvas/レイヤー座標
- [ ] 手書きレイヤー座標の維持
- [ ] Preview pan/zoom/fit の横長対応
- [ ] 印刷時の用紙サイズ (A3前提が崩れる旨の UI 提示要否)
- [ ] headMargin / tailMargin への影響 (縦方向なので軽微の想定)
- [ ] TDTS/XDTS ラウンドトリップ (列数保持)

### 段階実装案

- **Step 1 (設計確定)**: 本メモ + 上記「決めたいこと」7点の回答。
  特に論点「2段組をどうするか」を先に確定する。
- **Step 2**: template.js の幅可変化 (Preview 描画のみ)。
  最小スコープで横長 Preview を試作し見た目を確認。
- **Step 3**: 書き出し (PNG/JPG → PSD) を横長対応。
- **Step 4**: 手書きレイヤー座標の検証・調整。
- **Step 5**: 設定 ON/OFF、印刷時の注意表示。

## 最大の論点 (実装前に要決定)

標準A3は **0-71fr (左) / 72-143fr (右) の2段組**。
「横に拡張」する時:
- (a) 2段組を維持し、各段の列領域を右に広げる (用紙はさらに横長に)
- (b) 横長になるなら2段組をやめ、1段で 0-143fr を縦に通す (用紙は横だが段組無し)
- (c) 列超過時のみ段組を解除して横1段にする

紙の運用 (A3 2段組) と、横長で何を優先するかで変わる。
→ **要確認**: ここはユーザーの作画/共有ワークフロー次第なので、
実装前に方針を決める。

## 関連
- [column_overflow_design.md](column_overflow_design.md) (外部テンプレ側の列超過対応)
