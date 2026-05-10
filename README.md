# Web Timesheet Editor

アニメーション制作用タイムシートをブラウザ上で編集できるWebアプリケーションです。

**[デモ / Demo](https://yoda-y.github.io/web-timesheet-editor/)**

## 機能

### ファイル対応
- **TDTS形式** (toeiDigitalTimeSheet) - 読み込み・保存
- **XDTS形式** (exchangeDigitalTimeSheet) - 読み込み・エクスポート
- 兼用カット対応（複数カットを1ファイルで管理）

### エディタ機能
- セル編集（動画番号、記号入力）
- ドラッグによるセル移動・コピー
- 複数セル選択・一括操作
- セリフ・カメラワークブロック編集
- Undo/Redo対応
- キーボードショートカット

### プレビュー機能
- テンプレートに沿ったタイムシート表示
- 4種類のテンプレート（A4縦/横、シンプル等）
- 手書きレイヤー（ペン・消しゴム・選択・変形）
- ズーム・パン操作
- PNG/PDFエクスポート

### その他
- 複数ドキュメントタブ
- 複数シート対応
- ダークモード
- 日本語/英語切り替え
- 設定のカスタマイズ

## 使い方

1. [デモページ](https://yoda-y.github.io/web-timesheet-editor/)を開く
2. 「ファイル」→「開く」でTDTS/XDTSファイルを読み込み
3. セルをクリックして編集
4. 「ファイル」→「保存」で出力

### フォルダから開く（推奨）
「ファイル」→「フォルダから開く」を使うと：
- 手書きデータの自動読み込み/保存
- 同一フォルダへの上書き保存

## 動作環境

- Chrome / Edge（推奨）
- Firefox
- Safari

※ File System Access APIに対応したブラウザで全機能が使用可能

## ローカルで実行

```bash
git clone https://github.com/yoda-y/web-timesheet-editor.git
cd web-timesheet-editor
# 任意のローカルサーバーで起動
npx serve .
# または
python -m http.server 8000
```

## ライセンス

MIT License

## 謝辞

本アプリケーションはXDTSViewerの仕様を参考に開発されました。
