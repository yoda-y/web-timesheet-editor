// === アプリバージョン ===
const APP_VERSION = '0.16.0';
const APP_VERSION_LABEL = `v${APP_VERSION} Beta`;

// 更新履歴（CHANGELOG.md と同期して更新すること）
const APP_CHANGELOG = `# Changelog

本ファイルは Web Timesheet Editor の更新履歴です。
バージョン採番ルール:
- メジャー: Beta終了 / 互換性破壊変更
- マイナー: 機能追加・大きな改修
- パッチ: バグ修正のみ

## v0.16.0 (2026-06-08)

### 追加
- BBoxエディタにタグの一括ON/OFF機能
  - タグ一覧ヘッダーに「全てON / 全てOFF」
  - 各カテゴリ見出し横に「ON / OFF」(meta/staff/timeline/custom/extra/other)
  - enabled のみ変更し、locked・座標・fontSize・label 等は不変
  - 一括操作は Undo 1回分にまとまる

## v0.15.1 (2026-06-08)

### 修正
- 設定の読み込み/書き出しがメニューバー2箇所にあった重複を整理
  - 「ファイル > 設定」に集約、「設定 > 設定データ」からは削除 (設定パネル内ボタンは維持)
- i18n: 「設定をエクスポート/インポート」→「設定を書き出し/読み込み (JSON)」に統一
- 外部テンプレ管理モーダルで Preview 適用中のテンプレを削除した際、
  内部状態が残る問題を修正 (削除後に標準A3へ自動復帰)

## v0.15.0 (2026-06-08)

### 追加
- Project HTML 由来の外部テンプレを IndexedDB ライブラリへ保存する機能
  - サイドバーに「ライブラリに保存」ボタン (Project由来テンプレ選択時のみ表示)
  - 保存後は通常の外部テンプレと同じ扱いになり、再読込後もライブラリに残る
  - 同名テンプレがある場合: 上書き / 別名(自動連番) / キャンセル を確認
  - 画像・BBox・fontSize・customFields・frames等を欠落なく保存
  - 保存後 Preview 表示が崩れないよう正規テンプレとして再ロード

## v0.14.2 (2026-06-08)

### 修正
- 「文字色を変更」メニュー (edit.color) が実装済みなのに disabled だった問題を有効化
- ライトモードでボタンの視認性が悪い問題を改善
  - --highlight を少し濃く (#f0f0f0 → #e6e6e6) し、白背景とのコントラスト確保
  - border-color / grid-medium を調整し、有効ボタン・hover・active・disabled の差を明確化
- (据え置き) edit.selectAll / edit.repeatDelete は未実装のため disabled 維持

## v0.14.1 (2026-06-08)

### 修正
- 外部テンプレ→標準A3に戻せない問題を修正
  - 外部テンプレ一覧の再構築時に Project HTML 由来の仮 option が消えて状態がズレる不具合
  - 標準A3への強制復帰ヘルパー resetToStandardTemplate() を追加
  - Project由来テンプレの再選択を IDB ではなくキャッシュから復元
- Preview 更新漏れを修正
  - シート切替時、Preview モード中にプレビューが更新されない不具合

## v0.14.0 (2026-05-24)

### 変更 (P4: ファイルメニュー整理)
- ファイル > 「インポート」→「読み込み」、「エクスポート」→「書き出し」に改名
- 書き出し/読み込みサブメニューを再構成 (Project系を先頭、互換/画像/手書き を区切り線で分離)
- 手書きPNG 読込/書出 をファイル直下から 読み込み/書き出し 配下へ移動
- 画像書き出し (PNG/JPG/PSD) の文言を「PNG画像へ...」等に統一
- 「ファイル > 設定 ▶」サブメニュー新設 (設定書き出し/読み込み)
- 「最近使ったファイル」 disabled 行を削除

### 追加
- サイドバー書き出しセクションに「プロジェクトHTML保存」ボタン
  - Ctrl+S と同等 (handle あれば silent、無ければピッカー)

### 注意
- 既存アクションID (file.save / file.handwriting.import など) はすべて維持
- ショートカットキーバインドへの影響なし
- 設定パネル内の設定 import/export ボタンは維持 (今回スコープ外)

## v0.13.0 (2026-05-24)

### 追加 (P3-w)
- TDTS/XDTS 保存後、Web独自情報がある場合にプロジェクトHTML保存を案内
- 手書き / 外部テンプレート / customFields / セリフタイプ の検出
- 警告トーストに「プロジェクトHTMLとしても保存…」「閉じる」「今後表示しない」を実装
- \`settings.preview.suppressProjectSaveWarning\` 設定キー追加

### 既知の制限
- 警告はセッション内60秒で抑制（連続保存対策）
- 「今後表示しない」を有効にした場合、設定UIからの解除はまだ提供していない
  (settings.preview.suppressProjectSaveWarning を直接 false に戻すこと)

## v0.12.0 (2026-05-24)

### 追加 (P2-2d)
- Ctrl+Shift+S / ファイル > 別名で保存 で形式選択モーダルを表示
  - Project HTML / Project JSON / TDTS / XDTS から選択可能
  - デフォルト選択は現在の formatに応じる (JSON→HTMLは昇格)
  - Esc/Enter キー対応、ダーク/ライトテーマ対応

### 変更 (Launcher polish)
- ランチャーHTML表示項目を整理
  - 主要: TITLE / EPISODE / SCENE / CUT / NAME
  - 詳細 (折りたたみ): appVersion / formatVersion / 作成日時 / 保存日時
- プロジェクト名の自動解決: extraMeta.displayName → currentFileName →
  title+cut → docName のフォールバック
- handoff 成功後にランチャータブの自動 close を試行
  - ブラウザ制限で閉じられない場合は「閉じて構いません」と案内に切替

### 既知の制限
- ユーザー直接開きのランチャータブは window.close() がブロックされる場合あり

## v0.11.0 (2026-05-24)

### 追加 (P2-2 a+b+c)
- 保存先の自動切替: Ctrl+S が currentFileFormat に応じて分岐
  - TDTS/XDTS: 従来通り互換書き出しで上書き
  - Project HTML (.html / .wtproj.html): silent or picker で HTML 保存
  - Project JSON (.wtproj.json): HTML に昇格保存
  - 新規 / handoff / 不明: Project HTML として保存ピッカー
- \`exportProjectHTML\` に silent 上書き対応 (currentFileHandle 保持時)
- 標準拡張子を \`.html\` に変更 (旧 \`.wtproj.html\` は読込互換維持)
- \`settings.preview.projectFilenameTemplate\` 追加 (デフォルト \`%title_%episode_%cut_ts\`)

### 変更
- Ctrl+Shift+S が常に TDTS 別名保存だったバグを修正 (現在形式に応じた別名保存に)
- handoff 受信成功時に currentFileFormat を 'wtproj-html' に設定

### 既知の制限
- \`<input type=file>\` 経由で開いた project HTML は最初の Ctrl+S でピッカー必須 (handle 取得不可)
- Ctrl+Shift+S での形式選択モーダルは P2-2d で別途実装予定
- メニュー個別エクスポータ (TDTSへ / XDTSへ等) は今回変更なし

## v0.10.0 (2026-05-24)

### 追加 (P2-1)
- \`.wtproj.html\` ランチャーから「アプリで開く」ボタンで、新タブのアプリへ projectData を postMessage で自動転送
- postMessage + nonce ハンドシェイク（origin/nonce/source 三重検証、30秒タイムアウト）
- handoff 起動時 (URLに \`#wtproj=...\` がある場合) は autosave 復元プロンプトをスキップ
- ランチャーに状態表示エリア（接続中 / 成功 / キャンセル / エラー）を追加
- JSON書き出しは fallback として常に残置

### 変更
- ランチャーボタン名「アプリを開く」→「アプリで開く」

### 既知の制限
- 既存アプリタブの再利用はしない（常に新規タブを開く）
- file:// ランチャーから http://localhost への handoff は受信側 origin ホワイトリストにより許可
- ランチャー displayName 表示調整は後続バージョンで改善予定

## v0.9.1 (2026-05-24)

### 追加
- 手書きPNG / INI / Bundle / TDTS memo / ドラッグ&ドロップ で読み込んだ画像を connected components で自動分割し、複数の images[] パーツとして登録
- 分割パーツは矩形選択 / 投げ縄選択 / 変形が個別に行えるように

### 修正
- 透明背景PNGで透明ピクセルのRGBが黒の場合に全画面前景扱いされる問題（alpha判定を優先）
- sw.js の ASSETS_TO_CACHE に \`./js/project-html.js\` (v0.9.0で漏れ) を追加

### 既知の制限
- 分割数が100を超える場合や前景が見つからない場合は従来通り1枚画像として読み込む
- Project JSON / HTML 読込ルートには分割を適用しない（保存済み構造を維持）

## v0.9.0 (2026-05-24)

### 追加
- **プロジェクト保存/読込 (P1)**: Web Timesheet Editor 専用形式
  - \`.wtproj.json\`: 全エディタ状態を1ファイルで保存（メタ・セル・ブロック・customFields・dialogueType・外部テンプレ・手書き画像/ストローク）
  - \`.wtproj.html\`: 単体で開ける自己完結型HTML（埋め込みJSON + ランチャー）
  - \`.wtproj.html\` / \`.wtproj.json\` をファイル > 開く・ドラッグ&ドロップで読込可能
  - 外部テンプレート画像・手書き画像はassetsマップに集約しdataURL重複排除
  - 埋め込みJSONはXSS対策のため \`<\` / \`-->\` / U+2028 / U+2029 をエスケープ
- TDTS出力で \`headDummykomas\` / \`footDummykomas\` を本家標準の24固定に
- TDTS出力で \`header.showHeadDummy\` を \`headMarginEnabled\` 設定に連動
- TDTS読込で \`headMarginEnabled\` を \`header.showHeadDummy\` から復元

### 修正
- TDTS出力時、先頭マージン無効でも残値が \`headDummykomas\` に書かれ本家ビューアで表示開始位置がずれていた問題

### 既知の制限
- \`.wtproj.html\` を直接開いた場合、現状はランチャーから「JSONダウンロード」または「アプリを開く」操作が必要（HTMLからアプリへの自動転送はP2予定）
- \`Ctrl+S\` のプロジェクト形式保存への切替は未実装（P2予定）

## v0.8.1 (2026-05-24)

### 追加
- セリフタイプに N (Narration) を追加

### 変更
- セリフの話者名が漢字で潰れにくいよう、話者名の横幅許容を調整
- TDTS読み込み時、本家TDTS手描きメモを手書きレイヤーとして読み込むか確認するように変更

### 修正
- 標準A3で止メ表記に棒線が貫通する問題を修正

## v0.8.0 (2026-05-19)

### 追加
- **外部テンプレート機能**: 任意の用紙画像にBBoxで領域を定義し、データを流し込み可能
  - 画像インポート (PNG/JPEG)、自動リサイズ、IndexedDB保存
  - BBox編集モーダル: メタ情報/タイムライン/カスタム項目を視覚的に配置
  - サイドバーから「追加」「設定」「BBox編集」へ直接アクセス
  - 用紙テンプレートセレクトで標準A3と外部テンプレを切替
  - JSONエクスポート/インポート対応
- **カスタム項目**: 外部テンプレに任意のメタフィールド (custom1-4) を追加可能、サイドバーから入力
- **セリフタイプ** (normal / off / mono / 背): セリフ編集モーダルで設定、プレビュー描画に反映
- **0ページ (先頭マージン) の外部テンプレ対応**: headMargin有効時にも適切に描画
- **カット尺終わりライン + 尺以降グレーアウト** を外部テンプレでも描画
- **棒線/波線** (ACTION/CELL 連続線) を外部テンプレでも描画
- **BOOK ラベル** を外部テンプレでも描画 (action1 BBox上端から積み上げ)
- **camera kind 全種** (PAN/SL/TU/TB/TRACK/FI/FO/WI/WO/BL K/W K/O.L/Wipe/Iris/SHAKE/Strobo/instruction系) の外部テンプレ対応

### 変更
- **XDTS読み込みダイアログを4モードに整理**:
  - 完全新規 / 新しいシート / 上書き / 兼用カット
  - CELL取込先のデフォルトを「ACTIONのみ」に変更
  - カット尺は読み込み時に常に取り込み
  - 上書き/新シート/兼用カット時はヘッダー情報を維持
- **camera描画を改善** (標準A3にも反映):
  - kindラベルの下地撤廃
  - 主要範囲線を太く (max(1.6, scale*0.35))
  - ラベル右寄せ + ページ幅自動逃がし
  - waypoint/from-to/fairing 衝突回避強化
- **Direction の多列自動展開** (外部テンプレでBBoxを越えるテキストを自動分割)
- **話者名/タイプ表記の表示順** をブロック内上部に統一 (元位置)
- **PSDレイヤー分離** を外部テンプレに対応 (background/template/data/memo の4層)

### 修正
- XDTSインポートダイアログのカット番号欄にシート名が表示される問題
- BBox編集保存後にテンプレートセレクトが標準A3に戻る問題
- TDTSのcustomFields入出力を \`_webEditor.customFields\` 名前空間で round-trip
- PSDがクリスタでクラッシュする問題 (PackBitsエンコードのリテラル長128超過バグ)
- PSDに ResolutionInfo (DPI情報) を追加し互換性向上
- セリフ列で連続セル入力時にcustomRepeatsが誤削除される問題
- 標準A3 frame 0 のセリフで話者名が描画されない問題
- 外部テンプレ画像層を完全不透明に変更 (CSP互換性確保)

### 注意事項 (既知の制限)
- HTMLプロジェクト保存は未実装 (将来対応)
- XDTSではセリフタイプ・外部テンプレ紐付け・customFields は保持されない (書き出し時に警告)
- 外部テンプレートライブラリはブラウザ内 (IndexedDB) 保存。共有はJSONエクスポートで

## v0.7.1 (2026-05-13)

### 修正
- カット尺以降のACTION/CELL値がEdit/Previewで表示されない問題を修正
- ACTION/CELLの手動Repがカット尺以降でも省略・描画されるよう調整
- 手書きPNG保存時に \`handwriting.ini\` も出力するよう修正
- TDTS/XDTS保存時に手書きPNG/INIも半自動で保存するよう改善
- 手書きあり保存時は保存先フォルダ選択1回で、本体ファイルと同名フォルダ内のPNG/INIをまとめて保存するよう改善
- 手書きありTDTS読み込み時に、同名フォルダからPNG/INIを読み込む確認を追加
- \`handwriting.ini\` から複数ページ分の手書きPNGを読み込めるよう改善
- 読み込んだ手書きPNGを消しゴム、選択、変形、削除できるよう改善
- 手書きあり保存時のファイル名を、既存ファイル名優先、新規時は命名規則に従うよう調整

### 検討
- HTML出力 / GitHub Pages投稿機能は後回し

## v0.7.0 (2026-05-12)

### 追加
- 文字サイズ設定（セル番号/セリフ/カメララベル/メタ情報、mm単位指定）
- 設定メニューから先頭/末尾マージンの直接ON/OFFトグル
- 設定一覧モーダルに「文字」カードとマージンクイックトグル
- TDTSの手書きメモを手書きレイヤーに自動取込(位置近似、警告トースト付き)
- Rep自動付与のON/OFF設定、最小サイクル数設定、Rep右クリックで個別除外
- BOOKラベル幅の文字数による自動調整
- プレビューのページ送りショートカット(',' 前 / '.' 次)
- 同名ファイルの重複オープン防止
- 文字設定モーダル、CHANGELOG表示、バージョン表示

### 変更
- 設定モーダルの整理: マージンを「エディタ環境設定」へ、文字サイズを「文字設定」へ移動
- セリフ文字配置を3コマ1文字制限から余白均等配置に変更
- 話者カラーをEditモードとPreviewで共通化
- カメラkind名を長尺ブロック(72fr以上)のみ7fr目位置に配置

### 修正
- プレビューのセリフ/カメラブロックで列跨ぎ時に途中に線が引かれる不具合
- 自動Repの最後のサイクルが範囲から漏れる不具合
- 自動RepをOFFにすると止メ表記も消える不具合
- 自動Rep範囲内でセル値が重複描画される不具合
- カット尺以降のセル値が表示される不具合(Edit/Preview両方)
- セル構成パネルのラベルドラッグでファイルドロップUIが誤発火する不具合
- 「x」「X」単独入力時にカラ記号「×」へ自動変換(ACTION/CELL/TDTS/XDTS読込全て対応)
- 同話者の離れたセリフが1つに統合されてしまう不具合
- 画像書き出しの保存先選択がブラウザにブロックされる不具合
- プレビューのページ境界で文字が切れる不具合
- 高DPI画像書き出しの罫線がサブピクセル位置でちらつく不具合

### その他
- 免責事項を About画面と README に追記
`;
