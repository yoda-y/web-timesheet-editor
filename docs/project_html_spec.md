# プロジェクトHTML 仕様書 (v1)

Web Timesheet Editor 専用のプロジェクトファイル形式。
本書は **第三者** がこのフォーマットを実装・拡張・メンテナンスする際の参照ドキュメントとして書かれている。

- **対象読者**: 本アプリの開発者、互換ツールを実装する開発者、将来のメンテナ
- **想定アプリ**: [Web Timesheet Editor](https://yoda-y.github.io/web-timesheet-editor/) v0.8.0 以降
- **現行 formatVersion**: 1

---

## 目次

1. [目的と背景](#1-目的と背景)
2. [用語集](#2-用語集)
3. [なぜHTML形式か](#3-なぜhtml形式か)
4. [なぜTDTS/XDTSではなく独自HTMLか](#4-なぜtdtsxdtsではなく独自htmlか)
5. [ファイル構成と埋め込み方式](#5-ファイル構成と埋め込み方式)
6. [ルート構造](#6-ルート構造)
7. [トップレベルキー詳細](#7-トップレベルキー詳細)
8. [必須キー / 任意キー](#8-必須キー--任意キー)
9. [未知キーの扱い](#9-未知キーの扱い)
10. [formatVersion / appVersion の違い](#10-formatversion--appversion-の違い)
11. [Migration方針](#11-migration方針)
12. [Assets分離の理由](#12-assets分離の理由)
13. [v1 で documents が 1件のみの理由](#13-v1-で-documents-が-1件のみの理由)
14. [保存・読込のユーザー体験](#14-保存読込のユーザー体験)
15. [セキュリティとプライバシー](#15-セキュリティとプライバシー)
16. [互換書き出し（TDTS/XDTS）との関係](#16-互換書き出しtdtsxdtsとの関係)
17. [サンプルJSON](#17-サンプルjson)
18. [実装 Phase](#18-実装-phase)
19. [後回し項目と将来拡張](#19-後回し項目と将来拡張)
20. [P0.5 確定事項チェックリスト](#20-p05-確定事項チェックリスト)

---

## 1. 目的と背景

### 課題

アニメーション制作の現場では、1カットの作業状態が以下の複数ファイルに分散している:

- **TDTS / XDTS** (タイムシート本体)
- **手書きPNG / INI** (タブレット入力の手書きレイヤー)
- **外部テンプレート画像 / BBox配置情報** (用紙レイアウト)
- **customFields** (アプリ独自のメタフィールド)

ファイルが複数あるため、チーム間で受け渡す際に「手書きを忘れた」「テンプレ画像が無い」「BBox配置が違う」等の事故が起きる。

### 解決方針

**プロジェクトHTML (`.html`)** を導入し、上記すべてを単一ファイルに格納する。

ユーザーは `.html` を開くだけで、Web Timesheet Editor が自動起動し、内包データを復元して編集を続行できる。

---

## 2. 用語集

| 用語 | 説明 |
|---|---|
| **プロジェクトHTML** | 本仕様で定義される `.html` ファイル。本アプリ専用のプロジェクト形式 |
| **アプリ本体** | Web Timesheet Editor。GitHub Pages で配布。プロジェクトHTMLからデータを受け取り編集UIを提供 |
| **ランチャー** | プロジェクトHTML内に埋め込まれた小さなページ。ファイルを開いた時に表示され、アプリ本体を新タブで開く |
| **プロジェクトデータ** | プロジェクトHTML内に埋め込まれたJSON。`format: "web-timesheet-project"` を持つ |
| **document** | アプリのドキュメントタブ単位。1つの作業プロジェクト |
| **sheet** | document 内の個別タイムシート。兼用カット時は複数シート |
| **兼用カット (sharedCut)** | 同一document内で、別カット番号を共有する複数のシート |
| **section (列)** | タイムシートの ACTION / SOUND / CELL / CAMERA レイヤー |
| **BBox** | 外部テンプレート画像上の領域定義 (正規化座標 0-1) |
| **asset** | 画像など大きいバイナリ。`assets` 領域に集約し ID で参照 |
| **customFields** | 外部テンプレートで定義される任意のメタフィールド (custom1-4) |
| **dialogueType** | セリフの種別 (normal / off / mono / 背) |
| **nonce** | ランチャー→アプリ本体のデータ受け渡し時に使う一回限りの認証文字列 |
| **TDTS / XDTS** | 東映デジタルタイムシート / 標準交換形式。本アプリは互換読み書き対応 |
| **formatVersion** | プロジェクトHTML のデータ構造バージョン。Migration 判定に使う |
| **appVersion** | 保存時のアプリバージョン。情報用 |

---

## 3. なぜHTML形式か

### 候補と比較

| 候補形式 | 単一ファイル | 起動可能 | 中身確認 | 採用 |
|---|---|---|---|---|
| `.zip` | ◯ | × (専用ビューア必要) | ◯ | ✕ |
| `.json` | ◯ | × (アプリで開く必要) | ◯ | △ (補助用) |
| `.tdts` 拡張 | ◯ | × | △ | ✕ |
| **`.html`** | ◯ | **◯ (ブラウザで自動起動)** | △ | **◯** |

### HTML を選ぶ理由

1. **ダブルクリックで開ける**: 拡張子 `.html` はOSがブラウザに関連付けているため、ユーザーは特別な操作なしでアプリを起動できる
2. **ランチャー機能を内包できる**: HTML自体がページとして表示でき、ブラウザ機能（JavaScript / postMessage）で本体アプリへデータを渡せる
3. **配布が容易**: メール添付、チャット、クラウドストレージ、すべて単一ファイルで完結
4. **デバッグしやすい**: HTML内の `<script type="application/json">` をテキストエディタで覗けば中身を確認できる
5. **特別なビューアが不要**: ブラウザだけで完結

### トレードオフ

- ファイルサイズはJSON単体より大きい（HTMLボイラープレート分のオーバーヘッド）
- 画像を含めると大きくなる (50MB+ の可能性) → サイズ警告で対処（[19. 後回し項目](#19-後回し項目と将来拡張) 参照）

---

## 4. なぜTDTS/XDTSではなく独自HTMLか

### TDTS / XDTS の制約

- **TDTS**: 東映が定義した形式。本アプリ独自データ (customFields, dialogueType, 外部テンプレ, 手書き) を仕様外として持ち込めない。`_webEditor` 名前空間で一部対応中だが本家リーダーで無視される
- **XDTS**: 業界標準交換形式。仕様外データの追加は規格違反

### 本アプリが扱いたい情報

- タイムシート本体 (TDTS/XDTSで表現可能)
- 手書きレイヤー (TDTS仕様外)
- 外部テンプレート画像とBBox配置 (TDTS仕様外)
- アプリ独自メタデータ (customFields, dialogueType, タブ状態 等)

### 結論

互換性は TDTS/XDTS の書き出し機能で担保し、再編集用の正規保存は独自フォーマットにする。

```
プロジェクトHTML (正規)     ← Ctrl+S 等で保存
   ├── TDTS/XDTS書き出し  ← 互換、納品用
   ├── PNG/JPG書き出し    ← 確認用
   └── PSD書き出し        ← 撮影段階共有用
```

---

## 5. ファイル構成と埋め込み方式

### HTML 全体構造

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>cut001 - Web Timesheet Editor Project</title>
  <style>...</style>
</head>
<body>
  <!-- ランチャーUI (簡易画面) -->
  <div id="launcher">
    <h1>cut001</h1>
    <p>このファイルは Web Timesheet Editor 用のプロジェクトファイルです。</p>
    <button onclick="openInApp()">アプリで開く</button>
    <button onclick="exportJSON()">JSONを書き出し</button>
  </div>

  <!-- プロジェクトデータ -->
  <script type="application/json" id="project-data" data-encoding="json">
{...escaped JSON...}
  </script>

  <!-- ランチャーロジック -->
  <script>
    // postMessage + URL fragment nonce で本体アプリへデータを渡す
  </script>
</body>
</html>
```

### `<script>` タグ埋め込みの理由

- ブラウザは `type="application/json"` のスクリプトを **実行しない** ため安全
- DOM経由で `JSON.parse(document.getElementById('project-data').textContent)` で取り出せる
- テキストエディタで中身を確認できる

### Base64 化しない理由

Base64 はバイナリ→テキスト変換のためのもので、JSON はすでにテキスト。さらに Base64 化すると:

- サイズが約1.33倍に増える
- 中身が読みにくくなる
- デバッグ時に毎回デコードが必要

JSON のまま埋め込むのが最も素直。

### エスケープ規則

JSON 文字列内に `</script>` が含まれると HTML パーサが script タグの終わりと誤認するため、JSON シリアライズ後に **`<` (U+003C) を `<` に置換** する:

```js
const json = JSON.stringify(projectData);
const safe = json.replace(/</g, '\\u003c');
// <script type="application/json">${safe}</script>
```

置換後の挙動:

- JSON 内の `<` → `<` （JSON パース時に `<` に戻る）
- JSON 内の `</script>` → `</script>` （HTML パーサが script の終端と誤認しない）

注意点:

- HTMLエンティティの `&lt;` ではなく、**JSON 仕様の正規エスケープ `<`** を使う
- JSON.parse() で正しく `<` に復元される
- 圧縮非対応の v1 でも互換性が壊れない

### `data-encoding` 属性

| 値 | 内容 | 対応時期 |
|---|---|---|
| `json` | 生JSON (v1 現行) | 必須サポート |
| `json+lz` | LZ系圧縮文字列 | 将来予約 |

- v1 リーダーは `data-encoding="json"` のみサポート
- 未知の `data-encoding` は読み込みエラー（致命的）

---

## 6. ルート構造

```json
{
  "format": "web-timesheet-project",
  "formatVersion": 1,
  "appVersion": "0.8.0",
  "meta": { ... },
  "workspace": { ... },
  "documents": [ ... ],
  "externalTemplate": { ... },
  "assets": { ... }
}
```

トップレベルキーの一覧:

| キー | 型 | 必須 | 説明 |
|---|---|---|---|
| `format` | string | ✅ | 固定値 `"web-timesheet-project"` |
| `formatVersion` | integer | ✅ | データ構造のバージョン番号 |
| `appVersion` | string | ✅ | 保存時のアプリバージョン |
| `meta` | object | ✅ | プロジェクトメタ情報 |
| `workspace` | object | ✅ | アクティブ状態の最小再現情報 |
| `documents` | array | ✅ | ドキュメント配列（v1 は要素数1） |
| `externalTemplate` | object | ⚪ | 外部テンプレ情報。標準A3使用時は省略 |
| `assets` | object | ⚪ | 画像など大きいデータ集約領域。空でも可 |

---

## 7. トップレベルキー詳細

### `format`

固定値 `"web-timesheet-project"`。リーダーは最初にこの値を確認し、違えば読み込み中止。

### `formatVersion`

データ構造バージョン。整数。v1 現行は `1`。

- リーダーは自身が対応する最大バージョン以下のみ読み込む
- 大きいバージョンの場合は致命的エラーまたは警告（実装による）

### `appVersion`

保存時のアプリバージョン文字列（例: `"0.8.0"`）。情報用のため、リーダーは validate しない。

### `meta`

```json
"meta": {
  "projectId": "proj_2026_05_19_a3b1f8c2",
  "createdAt": "2026-05-19T10:30:00.000Z",
  "savedAt": "2026-05-19T14:22:15.123Z",
  "originalFileName": "cut001.tdts",
  "displayName": "cut001"
}
```

| キー | 型 | 必須 | 説明 |
|---|---|---|---|
| `projectId` | string | ✅ | プロジェクト一意ID。同一カット判定に使う |
| `createdAt` | string (ISO 8601 UTC) | ✅ | 初回作成タイムスタンプ |
| `savedAt` | string (ISO 8601 UTC) | ✅ | 直近保存タイムスタンプ |
| `originalFileName` | string | ⚪ | TDTSから開いた場合の元ファイル名 |
| `displayName` | string | ⚪ | UI表示名（ランチャー画面のタイトル等） |

**注意**: `appVersion` は root 直下なので meta には置かない。

### `workspace`

```json
"workspace": {
  "activeDocumentId": "doc_main",
  "activeSheetIndex": 0
}
```

| キー | 型 | 必須 | 説明 |
|---|---|---|---|
| `activeDocumentId` | string | ✅ | アクティブ document の `id` |
| `activeSheetIndex` | integer | ✅ | アクティブシート番号（0始まり） |

v1 では最小限のみ。`viewMode` / `zoom` / `scroll` 等は持たない。

### `documents`

ドキュメント配列。**v1 では要素数 1 のみ**（詳細: [13. v1 で documents が 1件のみの理由](#13-v1-で-documents-が-1件のみの理由)）。

構造例:

```json
{
  "documents": [
    {
      "id": "doc_main",
      "name": "cut001",
      "sections": [
        { "type": "ACTION", "cols": 7, "chars": ["A", "B", "C", "D", "E", "F", "G"] },
        { "type": "SOUND",  "cols": 2, "chars": ["S1", "S2"] },
        { "type": "CELL",   "cols": 7, "chars": ["a", "b", "c", "d", "e", "f", "g"] },
        { "type": "CAMERA", "cols": 2, "chars": ["1", "2"] }
      ],
      "sheets": [
        {
          "name": "sheet1",
          "isSharedCut": false,
          "color": 0,
          "metaData": {
            "title": "サンプル", "subTitle": "",
            "scene": "S1", "cut": "001",
            "sharedCuts": [],
            "lengthSec": "6", "lengthFrame": "00",
            "creator": "山田", "sheetName": "sheet1",
            "customFields": { "custom1": "撮影注意" }
          },
          "cellData": { "ACTION-0-0": { "value": "1", "option": "OPTION_KEYFRAME", "fontColorId": 0 } },
          "booksData": { "ACTION": {}, "SOUND": {}, "CELL": {}, "CAMERA": {} },
          "customRepeats": [],
          "dialogueBlocks": [
            { "id": 1, "colIndex": 0, "speakerName": "A", "text": "おはよう",
              "startFrame": 10, "endFrame": 30, "dialogueType": "off" }
          ],
          "cameraBlocks": [],
          "handwritingPages": {}
        }
      ]
    }
  ]
}
```

> 完全なサンプル（外部テンプレあり / 手書きあり）は [17. サンプルJSON](#17-サンプルjson) を参照。

| キー | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | ✅ | document 一意ID。`workspace.activeDocumentId` と対応 |
| `name` | string | ⚪ | document 表示名 |
| `sections` | array | ✅ | ドキュメント共通の列構成 |
| `sheets` | array | ✅ | シート配列。1件以上 |

### sheet オブジェクト

| キー | 型 | 必須 | 説明 |
|---|---|---|---|
| `name` | string | ✅ | シート表示名 |
| `isSharedCut` | boolean | ⚪ | 兼用カット由来か。デフォルト false |
| `color` | integer | ⚪ | タブ色 ID |
| `metaData` | object | ✅ | シート個別メタ（title/scene/cut/length/creator/sharedCuts/customFields 等） |
| `cellData` | object | ✅ | セルデータ。キーは `"TYPE-colIndex-frame"` 形式 |
| `booksData` | object | ⚪ | BOOK情報 |
| `customRepeats` | array | ⚪ | カスタムリピート定義 |
| `dialogueBlocks` | array | ⚪ | セリフブロック |
| `cameraBlocks` | array | ⚪ | カメラブロック |
| `handwritingPages` | object | ⚪ | 手書きデータ。ページキー (`page-0`等) → ストローク/画像 |
| `sections` | array | ⚪ | シート個別列構成（document.sections と異なる場合のみ） |

### `externalTemplate`

外部テンプレ使用時のみ存在。標準A3使用時は省略。

```json
"externalTemplate": {
  "name": "Aスタジオ 6秒シート",
  "imageAssetId": "asset_tpl_main_b91d0e",
  "imageWidth": 2480,
  "imageHeight": 3508,
  "sourceTemplateId": "tpl_xxxxx",
  "bboxes": {
    "title": { "enabled": true, "x": 0.1, "y": 0.05, "w": 0.3, "h": 0.04 }
  }
}
```

| キー | 型 | 必須 | 説明 |
|---|---|---|---|
| `name` | string | ✅ | テンプレ表示名 |
| `imageAssetId` | string | ✅ | `assets` への参照ID |
| `imageWidth` | integer | ✅ | 画像ピクセル幅 |
| `imageHeight` | integer | ✅ | 画像ピクセル高 |
| `sourceTemplateId` | string | ⚪ | **任意メタ**。IDB ライブラリ参考用。**復元時に依存しない** |
| `bboxes` | object | ✅ | タグ名キー → BBox プロパティ |

### bbox プロパティ

| キー | 型 | 必須 | 説明 |
|---|---|---|---|
| `enabled` | boolean | ✅ | 表示/流し込み対象 |
| `x` / `y` / `w` / `h` | number | ✅ | 正規化座標 (0-1)。画像基準 |
| `locked` | boolean | ⚪ | ロック中はエディタで動かせない |
| `fontSize` | number | ⚪ | フォントサイズ (mm)。null/省略時はデフォルト |
| `prefix` | string | ⚪ | テキスト前置詞 |
| `label` | string | ⚪ | カスタム項目のラベル |
| `type` | string | ⚪ | `"text"` / `"multiline"` |
| `frames` | integer | ⚪ | タイムラインBBox: コマ数 |
| `columns` | integer | ⚪ | タイムラインBBox: 列数 |

**注意**: タグ名（`title`, `action1`, `custom1` 等）はアプリ側で定義された固定セット。未知タグはリーダーが無視。

### `assets`

```json
"assets": {
  "asset_tpl_main_b91d0e": {
    "type": "externalTemplate",
    "mimeType": "image/png",
    "width": 2480, "height": 3508,
    "data": "data:image/png;base64,..."
  }
}
```

キーは命名規則 `asset_<type>_<scope>_<random6>`:
- `<type>`: `hw` / `tpl` / `img`
- `<scope>`: 人間可読サフィックス（`doc1_p2`, `main` 等）。空でも可
- `<random6>`: 英数小文字6文字

| asset エントリ | 型 | 必須 | 説明 |
|---|---|---|---|
| `type` | string | ✅ | `"externalTemplate"` / `"handwriting"` / `"image"` |
| `mimeType` | string | ✅ | `"image/png"` / `"image/jpeg"` / `"image/webp"` |
| `width` / `height` | integer | ⚪ | 画像寸法（パフォーマンス用） |
| `data` | string | ✅ | dataURL 形式（`data:image/...;base64,...`） |

---

## 8. 必須キー / 任意キー

### 必須キー (Reader が validate すべき)

```text
format
formatVersion
appVersion
meta.projectId
meta.createdAt
meta.savedAt
workspace.activeDocumentId
workspace.activeSheetIndex
documents (array)
documents[].id
documents[].sections
documents[].sheets (array, 1件以上)
documents[].sheets[].name
documents[].sheets[].metaData
documents[].sheets[].cellData
```

外部テンプレ使用時のみ:
```text
externalTemplate.name
externalTemplate.imageAssetId
externalTemplate.imageWidth
externalTemplate.imageHeight
externalTemplate.bboxes
```

Asset 参照時:
```text
assets[id].type
assets[id].mimeType
assets[id].data
```

### 任意キー

すべての `⚪` マーク付きキー。

### Validation の挙動

- 必須キーが欠落 → 致命的エラー、読み込み中止
- 必須キーの型が違う → 致命的エラー
- 任意キーが欠落 → デフォルト値で補完
- 任意キーの型が違う → 警告ログ、デフォルト値で補完

---

## 9. 未知キーの扱い

将来 formatVersion を上げずに小さな拡張を入れる場合に備え、**未知キーは保持して無視する** 方針を取る。

### Reader 実装ガイド

```js
// 例: sheet オブジェクトを読み込む
function readSheet(rawSheet) {
  const known = {
    name: rawSheet.name,
    isSharedCut: rawSheet.isSharedCut ?? false,
    metaData: rawSheet.metaData,
    cellData: rawSheet.cellData,
    // ...
  };
  // 未知キーを保持して raw に残す (再保存時に失われない)
  known._unknownKeys = {};
  for (const k in rawSheet) {
    if (!(k in known)) known._unknownKeys[k] = rawSheet[k];
  }
  return known;
}

// Writer 側
function writeSheet(sheet) {
  return {
    name: sheet.name,
    isSharedCut: sheet.isSharedCut,
    metaData: sheet.metaData,
    cellData: sheet.cellData,
    ...sheet._unknownKeys, // 復元
  };
}
```

### 利点

- 新しいアプリで保存 → 古いアプリで開く → 古いアプリの理解する範囲だけで動作
- 再保存時に未知データが失われない（forward compatibility）

### 制限

- 構造を**大きく**変える場合は formatVersion を上げ、migration ロジックを書く

---

## 10. formatVersion / appVersion の違い

| 項目 | formatVersion | appVersion |
|---|---|---|
| 型 | integer | string |
| 例 | `1`, `2` | `"0.8.0"`, `"1.0.0-beta"` |
| 役割 | データ構造バージョン | アプリバージョン情報 |
| 上げる条件 | 構造の互換性破壊変更 | リリース毎 |
| 用途 | Reader が migration 判定に使う | 情報用、ログ、警告判断補助 |
| Validation | Reader がチェック | Reader はチェックしない |

### formatVersion を上げる例

- documents が複数許可になる (v1 → v2)
- 既存キーが必須から任意、または逆になる
- 既存キーの型が変わる (例: integer → string)
- 構造の入れ子レベルが変わる

### appVersion を上げる例

- アプリのリリース毎（バグ修正のみでも）
- formatVersion を変えなくても appVersion は上がる

---

## 11. Migration方針

### 基本ルール

- Reader は **自身の formatVersion 以下**のファイルを読める
- Reader は **自身の formatVersion より新しい**ファイルを読む場合、警告を出して読み込みを試みるか、致命的エラーとして中止する（実装による）

### Migration の書き方

```js
function migrate(data) {
  while (data.formatVersion < CURRENT_FORMAT_VERSION) {
    if (data.formatVersion === 1) {
      data = migrateV1ToV2(data);
    }
    // 必要に応じて追加
  }
  return data;
}

function migrateV1ToV2(data) {
  // 例: externalTemplate (単数) を externalTemplates (配列) に変換
  if (data.externalTemplate) {
    data.externalTemplates = [data.externalTemplate];
    delete data.externalTemplate;
  }
  data.formatVersion = 2;
  return data;
}
```

### Migration の原則

1. **データを失わない**: 古いキーは新しい構造に変換するか、`_legacy` に退避
2. **冪等性**: 同じデータを2回 migrate しても結果が変わらない
3. **明示的ログ**: どの項目がどう変換されたか詳細ログに記録
4. **逆方向 migration はサポートしない**: 新→旧は基本的に対応しない

---

## 12. Assets分離の理由

### 課題

- 手書き画像や外部テンプレ画像は数MB単位
- JSON ツリー内に直接埋め込むと、各 sheet オブジェクトが巨大化
- 同じ画像を複数箇所で参照する場合、データが重複する

### 解決

`assets` を root 直下に集約し、各所からは ID で参照する。

```text
documents[0].sheets[0].handwritingPages["page-0"].images[0].imageAssetId
  ↓
assets["asset_hw_doc1_p0img0_a3b1f8"].data
```

### 利点

1. **重複排除**: 同じ画像を複数参照しても 1 度だけ保存
2. **メタ情報の分離**: 軽い設定（座標、ON/OFF）は document 側、重い画像は assets 側
3. **将来の WebP 化が容易**: data の置換だけで済む
4. **デバッグしやすい**: 画像IDが分かれば assets を辿るだけ

### assets に入れるもの / 入れないもの

| 入れる | 入れない |
|---|---|
| 手書き画像 | TDTS本文、セルデータ |
| 外部テンプレ画像 | BBox座標、ON/OFF、テンプレ名 |
| 将来の大きい素材 | ページサムネイル、表示キャッシュ |

---

## 13. v1 で documents が 1件のみの理由

### 設計判断

`documents` は配列形式だが、v1 では `length === 1` を強制する。

### 理由

1. **typical use case は 1HTML = 1作業プロジェクト**
   - 複数 documents を 1 HTML にまとめるユースケースが未確認
   - ファイル名と内容の一致を保ちやすい
2. **配列形式は維持**: 将来 v2 で複数許可にする場合、構造変更なしで拡張可能
3. **同一カット判定が単純化**: projectId が 1つ存在
4. **UI設計が複雑化しない**: タブ切替時の挙動を考えなくてよい

### 兼用カット / 複数シートの扱い

これらは **document 内の `sheets` 配列** で表現する:

```json
{
  "documents": [
    {
      "id": "doc_main",
      "sheets": [
        { "name": "main",    "metaData": { "cut": "001", "sharedCuts": ["001", "002"] } },
        { "name": "shared2", "isSharedCut": true, "metaData": { "cut": "002" } }
      ]
    }
  ]
}
```

`documents` (タブ) と `sheets` (シート/兼用カット) は **混ぜない**。

### 将来の v2 拡張

複数 documents 対応の必要性が出た場合:
- `formatVersion: 2` に上げる
- migration で v1 の `documents` をそのまま v2 に渡す
- v2 Reader は `documents.length > 1` を許可

---

## 14. 保存・読込のユーザー体験

### データ受け渡しフロー

```text
ユーザーが cut001.html を開く (ダブルクリック等)
   ↓
ブラウザがHTMLを表示 (ランチャー画面)
   ↓
ランチャー JS が動作:
   - nonce 生成
   - https://yoda-y.github.io/web-timesheet-editor/#projectImportNonce=xxx を新タブで開く
   ↓
アプリ本体が起動:
   - URL fragment から nonce を取得して記憶
   - history.replaceState で fragment を削除
   - postMessage 受信待機 (30秒タイムアウト)
   ↓
ランチャーが postMessage で { nonce, projectData } を送信
   ↓
アプリ本体:
   - nonce 一致を確認
   - format / formatVersion / 必須構造を validate
   - 既存データの未保存確認 → ユーザー選択
   - データ復元 (assets 展開、画像 decode 等)
   - UI に反映
```

### postMessage 検証項目

- `event.origin`
- `data.format === "web-timesheet-project"`
- `data.formatVersion <= CURRENT_VERSION`
- データサイズ妥当性
- 必須構造の存在

### Origin 許可ポリシー

| Origin | 動作 |
|---|---|
| `https://yoda-y.github.io` | 自動許可 |
| `http://localhost`, `http://127.0.0.1` | 自動許可 (ローカル開発用) |
| `null` (file:// プロトコル) | **確認ダイアログを挟む** |
| その他 | 拒否 |

### nonce ハンドシェイク

- nonce は **一回限り使用**（受理後に破棄）
- **30秒タイムアウト**（受信なければ失効）
- URL hash は受信前に削除（ブラウザ履歴に残さない）

### フォールバック

ランチャー機構が動かない場合:

1. HTML側「アプリで開く」ボタンで再試行
2. HTMLをアプリ画面へドラッグ&ドロップ
3. HTML側「JSONを書き出し」ボタンでJSON保存 → アプリの「開く...」から読込

### 同一カット判定

既存データが開かれている状態でプロジェクトHTMLを開いた時:

1. **未保存変更があれば確認** (保存して続行 / 保存せず続行 / キャンセル)
2. 同一カット判定の優先順位:
   - `meta.projectId` 一致 → 同一
   - ファイル名一致 → ほぼ同一
   - `metaData.title` + `cut` + `scene` 一致 → 同一の可能性
3. 動作:
   - 同一: ユーザー選択（置き換え / 別タブで開く / キャンセル）
   - 別カット: 新規ドキュメントタブで開く

### 保存先権限

| 環境 | 動作 |
|---|---|
| File System Access API 対応 (Chrome/Edge) | 「保存」「名前を付けて保存」で保存先選択。以後 Ctrl+S で上書き |
| API 非対応 (iPad/Safari) | ブラウザのダウンロード/共有保存。上書き保存不可 |

### ファイル名規則

- 既存HTML上書き: 元のHTMLファイル名を維持
- 新規/未確定: 命名規則設定を使用
- デフォルト: `%title%_%episode%_%cut%_ts.html`

### エラー表示

| 種類 | 動作 |
|---|---|
| 致命的エラー（プロジェクトデータなし、JSON破損、format違い、formatVersion対応外） | 読み込み中止、理由表示 |
| 部分復元失敗（手書き一部失敗、外部テンプレ画像失敗、旧形式変換） | 読める部分だけ開き警告表示 |

「詳細をコピー」で詳細ログ取得可。個人情報・ファイル全文は含めない。

---

## 15. セキュリティとプライバシー

### 明示する内容

- このHTMLにはタイムシートデータが含まれる
- 手書き画像が含まれる場合がある
- 外部テンプレート画像が含まれる場合がある
- 共有相手はこのHTMLだけで内容を開ける

### 保存しないもの

- ローカルファイルのフルパス
- 不要な個人情報
- 詳細ログ内のファイル全文

### postMessage の検証

origin / format / formatVersion / サイズ / 必須構造を必ず確認。検証通過後も、既存データを置き換える場合はユーザー確認を挟む。

### XSS 対策

- `<script type="application/json">` 自体は実行されない（ブラウザ仕様）
- ただし JSON 文字列内に `</script>` リテラルが含まれると HTML パーサが script タグ終端と誤認する可能性があるため、**JSON 内の `<` (U+003C) をすべて `<` にエスケープ** する
  - 結果として JSON 内の `</script>` は `</script>` となり、HTML 上は安全
  - `&lt;` ではなく `<` を使う（JSON 仕様上の正規エスケープ）
- データURL は `image/*` MIME のみ受理（`text/html` などは拒否）

---

## 16. 互換書き出し（TDTS/XDTS）との関係

プロジェクトHTML は再編集用の正規保存形式。
TDTS/XDTS/PNG/PSD は **互換書き出し** として位置付け、書き出しメニューから出力する。

### TDTS/XDTS に含めるもの

| 項目 | TDTS | XDTS | 備考 |
|---|---|---|---|
| タイムシート本文 | ✅ | ✅ | |
| ヘッダー情報 | ✅ | ✅ | |
| セルデータ | ✅ | ✅ | |
| ACTION/SOUND/CELL/CAMERA | ✅ | ✅ | XDTS は ACTION/CELL を統合 |
| 兼用カット | ✅ | △ | XDTS は形式上、表現が限定的 |
| VERSION 情報 | ✅ | △ | |
| **`customFields`** | ✅ (`_webEditor.customFields`) | ❌ | TDTS 独自拡張。本家TDTSリーダーは無視。XDTS では保持されず書き出し時に警告 |
| **`dialogueType`** (off/mono/背) | ✅ (`dialogueBlocks[].dialogueType`) | ❌ | TDTS 独自拡張。本家TDTSリーダーは無視。XDTS では保持されず書き出し時に警告 |

**重要**:

- `customFields` と `dialogueType` は **本アプリの独自拡張** であり、規格 (TDTS/XDTS) の正式仕様ではない
- **TDTS**: `_webEditor.customFields` / `dialogueBlocks[].dialogueType` という名前空間で保持され、本家TDTSリーダーは無視（互換性破壊なし）
- **XDTS**: 拡張領域を持たないため、これらは **保持されない**。書き出し時に確認ダイアログで警告し、ユーザーに「完全なデータはプロジェクトHTMLで保存してください」と案内
- 外部テンプレート紐付け情報も XDTS では同様に保持されず、警告対象

### TDTS/XDTS に含めないもの

- 手書き画像
- 手書き INI 相当データ
- 外部テンプレート画像
- 外部テンプレート BBox 設定
- アプリ専用タブ状態
- workspace 情報
- meta (projectId / createdAt / savedAt 等)
- assets 領域

### 書き出し時の案内

```text
TDTS/XDTSには、手書き画像や外部テンプレート情報は含まれません。
完全な再編集用データはプロジェクトHTMLとして保存してください。
```

---

## 17. サンプルJSON

### 17.1 最小サンプル（外部テンプレなし、手書きなし）

```json
{
  "format": "web-timesheet-project",
  "formatVersion": 1,
  "appVersion": "0.8.0",
  "meta": {
    "projectId": "proj_2026_05_19_minimal",
    "createdAt": "2026-05-19T10:30:00.000Z",
    "savedAt": "2026-05-19T10:30:00.000Z",
    "displayName": "minimal-cut"
  },
  "workspace": {
    "activeDocumentId": "doc_main",
    "activeSheetIndex": 0
  },
  "documents": [
    {
      "id": "doc_main",
      "name": "minimal-cut",
      "sections": [
        { "type": "ACTION", "cols": 3, "chars": ["A","B","C"] },
        { "type": "SOUND",  "cols": 1, "chars": ["S1"] },
        { "type": "CELL",   "cols": 3, "chars": ["a","b","c"] },
        { "type": "CAMERA", "cols": 1, "chars": ["1"] }
      ],
      "sheets": [
        {
          "name": "sheet1",
          "isSharedCut": false,
          "color": 0,
          "metaData": {
            "title": "サンプル",
            "subTitle": "",
            "scene": "S1",
            "cut": "001",
            "sharedCuts": [],
            "lengthSec": "6",
            "lengthFrame": "00",
            "creator": "山田",
            "sheetName": "sheet1",
            "customFields": {}
          },
          "cellData": {
            "ACTION-0-0": { "value": "1", "option": "OPTION_KEYFRAME", "fontColorId": 0 },
            "ACTION-0-12": { "value": "2", "option": "OPTION_KEYFRAME", "fontColorId": 0 }
          },
          "booksData": { "ACTION": {}, "SOUND": {}, "CELL": {}, "CAMERA": {} },
          "customRepeats": [],
          "dialogueBlocks": [],
          "cameraBlocks": [],
          "handwritingPages": {}
        }
      ]
    }
  ],
  "assets": {}
}
```

### 17.2 外部テンプレありサンプル

```json
{
  "format": "web-timesheet-project",
  "formatVersion": 1,
  "appVersion": "0.8.0",
  "meta": {
    "projectId": "proj_2026_05_19_with_template",
    "createdAt": "2026-05-19T10:30:00.000Z",
    "savedAt": "2026-05-19T14:22:15.123Z",
    "displayName": "cut001-template"
  },
  "workspace": {
    "activeDocumentId": "doc_main",
    "activeSheetIndex": 0
  },
  "documents": [
    {
      "id": "doc_main",
      "name": "cut001",
      "sections": [
        { "type": "ACTION", "cols": 7, "chars": ["A", "B", "C", "D", "E", "F", "G"] },
        { "type": "SOUND",  "cols": 2, "chars": ["S1", "S2"] },
        { "type": "CELL",   "cols": 7, "chars": ["a", "b", "c", "d", "e", "f", "g"] },
        { "type": "CAMERA", "cols": 2, "chars": ["1", "2"] }
      ],
      "sheets": [
        {
          "name": "sheet1",
          "isSharedCut": false,
          "color": 0,
          "metaData": {
            "title": "テンプレサンプル",
            "scene": "S1",
            "cut": "001",
            "sharedCuts": [],
            "lengthSec": "6",
            "lengthFrame": "00",
            "creator": "山田",
            "sheetName": "sheet1",
            "customFields": {
              "custom1": "撮影注意1",
              "custom2": "BG確認"
            }
          },
          "cellData": {
            "ACTION-0-0": { "value": "1", "option": "OPTION_KEYFRAME", "fontColorId": 0 }
          },
          "booksData": { "ACTION": {}, "SOUND": {}, "CELL": {}, "CAMERA": {} },
          "customRepeats": [],
          "dialogueBlocks": [
            { "id": 1, "colIndex": 0, "speakerName": "A", "text": "おはよう",
              "startFrame": 10, "endFrame": 30, "dialogueType": "off" }
          ],
          "cameraBlocks": [],
          "handwritingPages": {}
        }
      ]
    }
  ],
  "externalTemplate": {
    "name": "Aスタジオ 6秒シート",
    "imageAssetId": "asset_tpl_main_b91d0e",
    "imageWidth": 2480,
    "imageHeight": 3508,
    "bboxes": {
      "title":   { "enabled": true, "x": 0.04, "y": 0.020, "w": 0.20, "h": 0.030 },
      "cut":     { "enabled": true, "x": 0.43, "y": 0.020, "w": 0.08, "h": 0.030 },
      "scene":   { "enabled": true, "x": 0.34, "y": 0.020, "w": 0.08, "h": 0.030 },
      "action1": { "enabled": true, "x": 0.04, "y": 0.16, "w": 0.20, "h": 0.78, "frames": 72, "columns": 7 },
      "custom1": { "enabled": true, "x": 0.35, "y": 0.08, "w": 0.10, "h": 0.03, "label": "撮影注意1" }
    }
  },
  "assets": {
    "asset_tpl_main_b91d0e": {
      "type": "externalTemplate",
      "mimeType": "image/png",
      "width": 2480,
      "height": 3508,
      "data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
    }
  }
}
```

### 17.3 手書きありサンプル

```json
{
  "format": "web-timesheet-project",
  "formatVersion": 1,
  "appVersion": "0.8.0",
  "meta": {
    "projectId": "proj_2026_05_19_handwriting",
    "createdAt": "2026-05-19T10:30:00.000Z",
    "savedAt": "2026-05-19T16:10:00.000Z",
    "displayName": "cut001-handwriting"
  },
  "workspace": {
    "activeDocumentId": "doc_main",
    "activeSheetIndex": 0
  },
  "documents": [
    {
      "id": "doc_main",
      "name": "cut001",
      "sections": [
        { "type": "ACTION", "cols": 3, "chars": ["A", "B", "C"] },
        { "type": "SOUND",  "cols": 1, "chars": ["S1"] },
        { "type": "CELL",   "cols": 3, "chars": ["a", "b", "c"] },
        { "type": "CAMERA", "cols": 1, "chars": ["1"] }
      ],
      "sheets": [
        {
          "name": "sheet1",
          "isSharedCut": false,
          "color": 0,
          "metaData": {
            "title": "手書きサンプル",
            "subTitle": "",
            "scene": "S1",
            "cut": "001",
            "sharedCuts": [],
            "lengthSec": "6",
            "lengthFrame": "00",
            "creator": "山田",
            "sheetName": "sheet1",
            "customFields": {}
          },
          "cellData": {
            "ACTION-0-0": { "value": "1", "option": "OPTION_KEYFRAME", "fontColorId": 0 }
          },
          "booksData": { "ACTION": {}, "SOUND": {}, "CELL": {}, "CAMERA": {} },
          "customRepeats": [],
          "dialogueBlocks": [],
          "cameraBlocks": [],
          "handwritingPages": {
            "page-0": {
              "strokes": [
                {
                  "points": [[100, 100], [120, 110], [140, 130]],
                  "color": "#000000",
                  "width": 2
                },
                {
                  "points": [[200, 200], [220, 210]],
                  "color": "#ff0000",
                  "width": 3
                }
              ],
              "images": [
                {
                  "id": "hwimg-1",
                  "imageAssetId": "asset_hw_doc_main_p0img0_a3b1f8",
                  "x": 300, "y": 400, "w": 500, "h": 400
                }
              ]
            },
            "page-1": {
              "strokes": [],
              "images": []
            }
          }
        }
      ]
    }
  ],
  "assets": {
    "asset_hw_doc_main_p0img0_a3b1f8": {
      "type": "handwriting",
      "mimeType": "image/png",
      "width": 500,
      "height": 400,
      "data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
    }
  }
}
```

---

## 18. 実装 Phase

| Phase | 内容 | バージョン目安 |
|---|---|---|
| **P0 (完了)** | 仕様再確認 | – |
| **P0.5 (完了)** | スキーマ詳細確定 | 本ドキュメント |
| **P1** | 最小コア実装 | v0.9.0 候補 |
| | - JSON シリアライザ / デシリアライザ |  |
| | - assets 集約変換層（既存 dataURL を assets 経由参照に） |  |
| | - HTML 生成（`<script type="application/json">` + `<` エスケープ） |  |
| | - HTML パース |  |
| | - 「開く...」の `.html` 対応 |  |
| | - 「書き出し > プロジェクトHTML」メニュー追加 |  |
| | - **保存メイン化はしない**（書き出しの1つとして提供） |  |
| **P2** | ランチャー + ハンドシェイク | v0.9.x |
| | - HTML 内ランチャー画面 + 自動起動スクリプト |  |
| | - nonce 機構（URL fragment + postMessage） |  |
| | - フォールバック（D&D / JSON書き出し） |  |
| | - ローカル origin null の確認ダイアログ |  |
| **P3** | 保存メイン化 + メニュー再編 | v0.9.x or v1.0 |
| | - Ctrl+S をプロジェクトHTML上書き保存に切替 |  |
| | - TDTS/XDTS/PNG/PSD を「書き出し」へ降格 |  |
| | - タブバー右側に保存系ボタン |  |
| | - 既存TDTSユーザー向け移行案内トースト |  |
| **P4** | 画像最適化と容量警告 | v1.0 |
| | - 外部テンプレ画像のWebP化 |  |
| | - 300dpi 制限 |  |
| | - ファイルサイズ警告（30/50/100MB） |  |
| | - iPad/Safari 検証 |  |
| **P5** | 圧縮対応 / 安定確認 → v1.0.0 | v1.0.0 |
| | - 必要なら `data-encoding="json+lz"` 実装 |  |

各Phaseは独立してマージ可能で、後戻りも容易。

---

## 19. 後回し項目と将来拡張

### Phase 後回し

- WebP化 / 300dpi 制限 (P4)
- ファイルサイズ警告 (P4)
- 圧縮対応 `json+lz` (P5)
- 「参照のみ保存」モード（チーム全員が同じテンプレを持つ場合の軽量版）
- 複数 documents 対応（v2）
- 複数 externalTemplates 対応（v2）

### 未決定（実装時に検討）

- nonce タイムアウト「30秒」の妥当性（iPad/Safari 遅延に対する余裕）
- File System Access API ハンドル切れ時の再認可 UX 詳細
- HTML 保存ボタンのタブバー配置（最終レイアウト）
- 既存TDTSユーザー向け移行トーストの文言・タイミング
- 同一カット判定における projectId 不在時のフォールバック優先順位の詳細

### 将来の formatVersion bump 候補

| バージョン | 想定変更 |
|---|---|
| 2 | 複数 documents / 複数 externalTemplates 対応 |
| 3 | 圧縮 `json+lz` をデフォルトに昇格 |
| 4 | 共通 asset ライブラリ参照（外部ホストの asset） |

各 bump 時には migration ロジックを書き、旧バージョンファイルも読めるようにする。

---

## 20. P0.5 確定事項チェックリスト

- [x] `appVersion` は root 直下に配置（meta には置かない）
- [x] `documents` は配列形式（v1 は length === 1 を強制）
- [x] `workspace` は `activeDocumentId` / `activeSheetIndex` のみ
- [x] `externalTemplate` は単数
- [x] `sourceTemplateId` は任意メタ、復元時にIDBへ依存しない
- [x] P1 では assets に既存 dataURL を集約するだけ（WebP化は P4）
- [x] JSON 埋め込みは Base64 化せず、`<script type="application/json">` に直接
- [x] `</script>` エスケープは `<` → `<`
- [x] 将来 `data-encoding="json+lz"` を予約
- [x] `formatVersion` = migration判定、`appVersion` = 情報用
- [x] `customFields` は `documents[i].sheets[j].metaData.customFields`
- [x] `dialogueType` は `documents[i].sheets[j].dialogueBlocks[k].dialogueType`
- [x] handwriting strokes は埋め込み、images は assets 化
- [x] TDTS/XDTS は互換書き出し（HTMLプロジェクトに降格）
- [x] 未知キーは保持して無視（forward compatibility）

---

**本書 P0.5 確定版。P1 (最小コア実装) に進める準備が整っている。**

実装中に矛盾や未定義が見つかった場合、本書を都度更新する。formatVersion を上げる変更時は、本書のバージョンも上げて旧版を `project_html_spec_v1.md` 等として保存する。
