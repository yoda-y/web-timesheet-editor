// === アプリバージョン ===
const APP_VERSION = '0.29.0';
const APP_VERSION_LABEL = `v${APP_VERSION} Beta`;

// 更新履歴（CHANGELOG.md と同期して更新すること）
const APP_CHANGELOG = `# Changelog

本ファイルは Web Timesheet Editor の更新履歴です。
バージョン採番ルール:
- メジャー: Beta終了 / 互換性破壊変更
- マイナー: 機能追加・大きな改修
- パッチ: バグ修正のみ

## v0.28.0 (2026-06-13)

### 追加 (columns超過対応 Phase C-4: gengaDougaSeparatePages + Auto結線)
- gengaDougaSeparatePages: 原画シート/動画シートを別物理ページに出力
  - 原画ページ: action1+cell1+action2+cell2 をすべて ACTION 系列で描画 (4枠で1系列)
  - 動画ページ: 同4枠をすべて CELL 系列で描画
  - ページ順: 1原 → 1動 → 2原 → 2動 (フレームページ内で連続)
  - SOUND/CAMERA/セリフ・memo/staff/custom は原画ページのみ、meta系は全ページ
  - BOOK は原画ページ (最初のフレームページ) の4枠に累積オフセットで描画
- gengaDougaAuto を結線: SplitPage 容量 (action1+cell1 / action2+cell2) に
  収まれば SplitPage、収まらなければ SeparatePages に自動切替
  (getExternalTemplateEffectiveMode)
- ページ計算を sub-page 数で統一 (pageChunks=チャンク数 / Separate=2 / 他=1)
  - totalPages は総物理ページ数、currentPage は物理ページ連番 (Separateは 1,2,3,4)
- 原画/動画のページ内ラベル (notice) は C-5 で対応予定

## v0.29.0 (2026-06-13)

### 追加 (columns超過対応 Phase C-5: ラベル/notice/警告)
- gengaDouga シート種別ラベル (tpl.sheetTypeLabels、テンプレ単位で可変)
  - 既定 ja: 原画/動画、en: KEY/INBTWN
- SplitPage: 動画領域 (action2/cell2) 上部に上括弧 + 「こちらが動画シートです」notice
  - showSplitNotice で ON/OFF (既定 ON)、BOOK帯と干渉しない位置
- SeparatePages: ページ上部に「原画シート」/「動画シート」ラベル
- 未描画列の警告
  - Preview更新時に警告トースト (同一状態は抑制)
  - シート右下に「ACTION +n / CELL +n 列 未表示」注記
  - 容量判定はモード別 (none/Split/Separate)。pageChunks は全列描画で対象外
- Project HTML に sheetTypeLabels を保存/復元

## v0.28.2 (2026-06-13)

### 修正 (列名 Excel化の根本対応)
- 列追加 (sections.js) の自動採番が Z の次に [ \ ] になる問題を修正
  - 末尾追加を Excel列名 (toColumnLetters) に変更し AA, AB… を生成
- 既に [ \ ] 等が保存された列も表示時に Excel列名へ補完
  - resolveColumnDisplayName / isBrokenAutoColumnName を utils.js に追加
  - Edit画面の列ヘッダー (draw.js) と外部テンプレ カラムヘッダー印字の両方に適用
  - 意図あるユーザー定義名 (複数文字や通常文字) は維持
- toColumnLetters を template.js から utils.js へ移動 (共有)

## v0.28.1 (2026-06-13)

### 修正
- カラムヘッダー/列名 fallback を Excel 列名風に (A..Z, AA, AB…/小文字 a..z, aa…)
  - 26列以上でも自然な列名。ユーザー定義列名 (sections[].chars) は従来通り優先
- 標準テンプレ用紙の横拡張要望を docs/paper_horizontal_expand_notes.md に別タスクとしてメモ

## v0.27.1 (2026-06-13)

### 修正 (gengaDougaSplitPage)
- SplitPage で SOUND / CAMERA / セリフが描画されない問題を修正
  - 原画側 (sound1 / camera1) に通常描画を追加
  - sound2/camera2 への続き列描画・動画側複製は将来対応 (continuation)
- SplitPage で cell1 (ACTION続き列) に BOOK が描画されない問題を修正
  - BOOK描画コアを drawBooksIntoBBox に切り出し、action1 + cell1 の両方へ描画
  - cell1 側は action1.columns 分の列オフセットを反映
  - pageChunks / none の BOOK 表示は従来通り (リグレッションなし)

## v0.27.0 (2026-06-13)

### 追加 (columns超過対応 Phase C-2/C-3: gengaDougaSplitPage)
- 列超過モードに gengaDougaSplitPage / gengaDougaAuto を追加
  - SplitPage: 同一フレーム範囲を原画領域/動画領域に分けて1ページに描画
    - 原画領域: action1 (ACTION 0..) + cell1 (ACTION 続き列)
    - 動画領域: action2 (CELL 0..) + cell2 (CELL 続き列)
  - Auto: 当面 SplitPage に解決 (SeparatePages への自動切替は C-4 で追加)
  - ページ番号は通常表記 (枝番なし)、シート容量はフレーム方向 '1'側のみ
- 描画系列の上書き機構 extSourceType を追加
  - BBox のレイアウト種別 (type) と実データ系列を分離 (extDataKey/extSeriesType)
  - セル値 / Rep / 止メ / 棒線・波線 / カラムヘッダー列名が描画系列に追従
  - Rep系の有効判定を type ではなくデータ系列 (ACTION) ベースに変更
- UI: 列超過モード select を3択に (通常〔原動画自動〕/ 列ページ分割 / 従来方式)
  - 既存テンプレ未設定は従来方式 (none) のまま、描画不変
- 動画領域の notice / 上括弧表示は C-5 で対応予定

## v0.26.1 (2026-06-13)

### 修正 (columns超過対応 Phase C-1)
- pageChunks 時、Direction (演出指示) を最初の物理ページ (1-1) のみに描画
  - 従来は各 framePage の chunk 0 (1-1, 2-1, 3-1…) に出ていた
  - Direction はカット全体の指示のため 1-1 のみが適切
  - SOUND/CAMERA/セリフ は従来通り各 framePage の primary chunk に描画
  - memo/staff/custom も従来通り (各 framePage の chunk 0) 据え置き

## v0.26.0 (2026-06-13)

### 追加 (columns超過対応 Phase B: pageChunks)
- 外部テンプレに列超過モード (tpl.columnOverflowMode: none / pageChunks) を追加
  - pageChunks: BBox の columns を超える列を列チャンクとしてページ分割
  - ページ順はフレームページ内で連続 (1-1 → 1-2 → 2-1 → 2-2)
- 論理ページ記述子 PageDesc (framePage / chunk / sheetKind) を導入
  - getExternalTemplatePageDesc / getExternalTemplatePageLabel /
    getExternalTemplateChunkCount / getUsedColumnCount
  - totalPages は総物理ページ数 (フレームページ数 × チャンク数、0ページ除く)
  - currentPage は枝番表記 "1-1" (チャンク無し時は従来の "1")
- 描画の列オフセット対応 (extColOffset)
  - ACTION/CELL のセル値 / option / fontColorId / Rep / 止メ / ブレ /
    棒線・波線 / BOOK / カラムヘッダー列名すべて colOffset 適用で未描画列ゼロ
  - chunk 間で列幅・列範囲を揃えるため描画列数は min(cols1, cols2) に統一
- ページ別描画ルール
  - meta系 (title/cut/currentPage等): 全ページ
  - direction/memo/staff/custom と SOUND/CAMERA/セリフ: 各 framePage の chunk 0 のみ
  - BOOK: 最初のフレームページの該当チャンクに列範囲分を描画
  - 'none' モードは従来挙動を完全維持
- Project HTML に columnOverflowMode を保存/復元

## v0.25.0 (2026-06-12)

### 追加 (columns超過対応 Phase A: カラムヘッダー印字)
- 外部テンプレのタイムラインBBoxに列名 (ACTION: A/B/C…等) を印字できる機能
  - 取得元: Edit の列名 (sections[].chars、ユーザー編集名対応)。空は自動名 fallback
  - 描画位置: 各列の-1セル目 (BBox上端の1セル上) 中央。offsetX/Y (mm) / fontSize (mm、空=自動) / 縦書き対応
  - 下地あり/なし + 下地色 + 文字色 (テンプレ画像のヘッダー欄と重なる場合の可読性確保)
- 設定はテンプレ共通 (外部テンプレ設定モーダル) + timeline BBox単位 override (BBoxエディタ)
  - BBox側は「テンプレ共通設定を使う」チェックで切替
  - 既定は印字OFF (既存テンプレの描画は不変)
- Project HTML にテンプレ共通カラムヘッダー設定を保存/復元 (BBox側は bboxes に内包)
- スポイトによる下地色取得は Phase D で対応予定 (今回は color input)

## v0.24.2 (2026-06-12)

### 修正 (外部テンプレ設定モーダルのUX)
- 未保存変更 (テンプレート名/背景画像) がある状態で閉じる・別テンプレ選択時に破棄確認を表示
- 保存ボタンを右下フッターへ移動して primary (青) に、閉じるボタンは通常スタイルに変更
  (「閉じるだけが青く主操作に見える」問題を解消)
- モーダルタイトル横に「未保存」バッジを表示 (保存/読込/閉じるでクリア)
- 新規追加/複製/削除/インポートは即IDB保存されるため dirty 扱いにしない

## v0.24.1 (2026-06-11)

### 修正
- 外部テンプレの画像変更後、Preview「更新」ボタンで反映されない問題
  - 更新ボタンを reloadCurrentExternalTemplate + 再描画に変更
    - ライブラリテンプレ: IDB から再取得してメモリ状態 (画像/BBox) を差し替え
    - 一時/Project由来テンプレ: 現在のオブジェクトから画像/pageImages を再デコード
    - IDB から削除済みの場合は標準テンプレへ復帰
  - 外部テンプレ設定モーダルの「保存」時、適用中テンプレならメモリ状態を即同期
    (テンプレ切替不要で Edit/Preview に反映)
- 保存後同期を syncAppliedExternalTemplateAfterSave に一本化
  (BBoxエディタ保存後の同期 (v0.21.3) も同ヘルパー使用に統合)

## v0.24.0 (2026-06-11)

### 追加
- BBoxサイズ同期グループに「尺」(lengthSec / lengthFrame) を追加
- 標準A3テンプレートの色設定 (settings.colors.templateBg / templateLine)
  - 背景色と罫線・固定ラベル色 (TEMPLATE_COLOR) を変更可能
  - 入力値の文字色 (TEXT_COLOR) と fontColorId は対象外で従来通り
  - 外部テンプレ画像の下地には適用しない (常に白)
- UIメインカラー (settings.colors.uiAccent → --accent-color)
  - タブ/確定ボタン/アクティブ表示などUIアクセントを一括変更
  - 「自動」時は uiAccent を基準に Edit描画色/標準テンプレ色/選択枠色を派生

### 変更 (色の適用範囲整理)
- メインカラーを「タイムシート構造の描画色」に限定
  - ユーザー入力内容 (セル値/メタ値/DIRECTION本文/棒線・波線/rep・止メ・ブレ表記/
    選択移動ゴースト/cellInput) は従来の文字色 (--text-color) に戻した
  - 枠線/グリッド/ヘッダー/固定ラベルは引き続き editLightMain 適用
- --select-border をキャンバス選択枠専用に分離
  - UI部品 (タブ/確定ボタン/カード/スイッチャ等) は --accent-color を使用

## v0.23.0 (2026-06-11)

### 追加 (BBoxサイズ同期)
- BBoxエディタにカテゴリ別サイズ同期グループを追加 (BBOX_SYNC_GROUPS)
  - action1/2, cell1/2, sound1/2, camera1/2, currentPage/totalPages
  - 同期対象: w / h / fontSize / frames / columns (fontSizeの「自動」も同期)
  - x / y / enabled / locked / type / prefix / label は同期しない (場所は個別)
- checkbox「同種タグとサイズ同期」(bbox.syncSize、デフォルトON)
  - 変更時のみ伝播。エディタを開いただけでは bboxes を変更しない
  - OFF のタグには伝播しない (ON 同士のみ)
  - プロパティ入力 / キャンバスドラッグリサイズ / Alt+矢印キー全てで同期
- ボタン「同種BBoxにサイズを反映」(syncSize 状態に関わらず今すぐコピー)
- Undo 1回で元タグ + 同期先タグの変更がまとめて戻る
- 従来の frames/columns/fontSize の timeline ペア同期はこの仕組みに統合

## v0.22.0 (2026-06-10)

### 変更 (色設定の「自動」挙動)
- 「自動」をライトモード時はメインカラー (Editライトモード メイン色) 基準の再計算に変更
  - BOOK線色: メインの補色寄りアクセント / CELLアイコン色: メイン同系の濃色 /
    選択枠色: メインから135°回した強調色 (ダークモードは従来のテーマ既定値)
  - モーダル内でメイン色を変更すると自動状態の関連色表示も追従
  - システムテーマ変更時も自動色を再解決
- 全リセットは従来通り「この画面をリセット」(確認あり) に分離

### 修正
- 色設定モーダルを開いてOKを押すだけで全カスタム色が「自動」に戻ってしまう問題
  - 各項目を自動/カスタムの状態 (dataset.isAuto) で管理し、触っていない項目は維持
- 「自動」ボタンが確定前に設定を書き換えていた問題 (キャンセルで戻らなかった)

## v0.21.3 (2026-06-10)

### 修正
- 外部テンプレのBBoxエディタで保存しても Preview が更新されない問題
  - IDB保存後に適用中の currentExternalTemplate (メモリ状態) を再読込して同期
- Edit → Preview 切替時にシートが左寄りになる問題
  - 切替のたびに pan を 0,0 にリセットしていたのをやめ、前回表示状態を維持
  - リロード直後の初回のみ全体fit (従来通り)
- 外部テンプレで明示 fontSize 指定時に自動fit上限がかかる問題 (title 3.5mm上限など)
  - title 等の単一行 meta/staff/custom: BBox高さ/幅による縮小をスキップ
  - memo/custom複数行 (drawMultilineInBBox): 高さによる自動縮小をスキップ
  - fontSize 未指定時は従来通り自動fit

## v0.21.2 (2026-06-10)

### 修正 (camera inline)
- inline内の中割記号 (●/○/×) を ACTION/CELL 欄と同じサイズ・描画ルールに統一
  - 標準A3 Preview / 外部テンプレで fillText 直描きだったものをシェイプ描画に
  - SYMBOL_TICK系→●/○、SYMBOL_NULL系→×、SYMBOL_HYPHEN/STOP/START は非表示
- inline ON時に kind名/target名が入力値と重なる問題を修正
  - Edit/標準A3/外部テンプレともブロック開始位置の上に kind名+target名を積む
  - 上に描けない場合は欄/BBox上端付近へクランプ
- 外部テンプレで inline の kind名が描画されない問題を修正
  - BBox clip 内で描いていたラベルを clip 解除後の遅延描画に変更

## v0.21.1 (2026-06-09)

### 修正
- セリフ入力 / カメラワーク入力 モーダルの確定ボタンがライトモードで沈んで読めない問題
  - 背景を半透明 --select-bg → 不透明 --select-border に (v0.21.0 の設定モーダル修正と同様)
- カメラワーク入力の対象レイヤー候補チップも同様に修正

## v0.21.0 (2026-06-09)

### 追加 (改善8)
- Editライトモードの標準インク色を設定可能に (settings.colors.editLightMain)
  - 色設定モーダルに「Editライトモード メイン色」カラーピッカー + 自動ボタン
  - デフォルト #2f5f3a (緑系で紙のタイムシート感、黒より柔らかい)
  - 適用: セル文字(fontColorId未指定時)/ヘッダー/グリッド/罫線/カット尺ライン/
    棒線/波線/Rep/option mark のデフォルト色
  - グリッドは alpha (medium 0.55 / thin 0.28) で階層を維持
  - fontColorId 指定セルは従来優先、ダークモード・Preview・外部テンプレは不変

### 修正
- 設定モーダルの確定(OK)ボタンがライトモードで沈んで読めない問題
  - .primary 背景を半透明 --select-bg → 不透明 --select-border に変更

## v0.20.2 (2026-06-08)

### 修正
- Preview ズーム時に表示が画面外へ飛ぶ不具合を修正 (v0.20.1 の座標系バグ)
  - previewStage の offsetLeft/Top・container scroll・pan を同一座標系に揃えた
  - getPreviewStageLayoutOffset() / previewClientToContentPoint() を追加
  - ホイールズーム / +/- ボタン / Space+Ctrlドラッグズーム / fit を全て統一
  - Space+Ctrlドラッグズーム (handwriting.js) も共通ヘルパー経由に

## v0.20.1 (2026-06-08)

### 修正
- TGA読み込み時も通常画像と同じ長辺4000px制限を適用 (Project HTML肥大化防止)
  - 共通ヘルパー resizeTemplateImageDataUrl() を追加
- ブラウザ更新後の初回Preview表示で用紙全体が見える fit 表示に
  - fitPreviewToContainer() を追加 (初回のみ。手動ズーム後の更新では戻らない)
- Previewホイールズームの中心をマウスポインタ位置に正確化
  - previewStage 基準で content座標を計算し、スクロール/中央寄せがあってもズレない
  - +/- ボタンも同じ計算に統一

## v0.20.0 (2026-06-08)

### 追加 (改善9: 一時テンプレ Phase 3 + TGA読込)
- 画像ドラッグ&ドロップ時に用途選択ダイアログ
  - 「手書き画像として追加」/「一時テンプレ画像として使用」/「キャンセル」
- 一時テンプレ画像のD&D対応
  - 単数: 現在ページに設定
  - 複数: ページ割当方法を選択 (現在ページから順番 / ファイル名からページ番号推定)
  - ファイル名推定: basename 末尾の数字を1-basedページ番号として解釈 (0は無効)
  - 既存の一時/Project由来テンプレがあれば bboxes維持で pageImages 追加
  - 新規作成時のみ BBoxエディタを全OFFで自動オープン
- TGA画像読み込み対応 (js/tga-io.js)
  - uncompressed true-color (24/32bit) / grayscale (8bit) / RLE true-color
  - 内部的に PNG dataURL へ変換し既存の assets/pageImages 仕組みに乗せる
  - 一時テンプレ読込・画像D&D・手書き画像D&D で利用可
  - color-mapped TGA / TGA書き出しは未対応 (今後)

### 既知の制限
- 複数画像の手動ページ指定UIは未実装 (順番/ファイル名推定のみ)
- TGA書き出しは未対応

## v0.19.0 (2026-06-08)

### 追加 (改善9: 一時テンプレ Phase 2)
- 一時テンプレ新規作成時に BBoxエディタを自動で開く (全タグOFF初期状態)
  - openBBoxEditor の initialAllOff オプション (defaultBBox は生成するが enabled=false)
- 一時テンプレでページごとに別のテンプレ画像を設定可能 (pageImages)
  - 一時/Project由来テンプレ選択中に「一時テンプレ読込」すると現在ページの画像を差し替え
  - BBox設定はページ共通 (tpl.bboxes)
  - 描画時、現在ページに pageImages があればそれを使い、無ければ基本画像にフォールバック
- Project HTML/JSON 保存・読込で pageImages を assets 化して保持
  - 既存の単一 imageAssetId 形式との後方互換は維持

### 既知の制限
- IndexedDBライブラリ保存は単一画像前提のまま (複数ページ画像のライブラリ保存は別Phase)
- ドラッグ&ドロップでの一時テンプレ適用は今後対応

## v0.18.0 (2026-06-08)

### 追加 (改善9: 一時テンプレ Phase 1)
- サイドバーに「一時テンプレ読込」ボタン (常時表示)
  - PNG/JPG画像を読み込み、IDBに保存せず Project内のみの外部テンプレとして適用
  - select に「(一時テンプレ) <名前>」と表示 (dataset.temp)
  - 記載済みタイムシート画像にデータだけ流し込む用途
- BBoxエディタのインメモリ編集対応
  - 一時テンプレ / Project HTML由来テンプレ (IDB未保存) でも BBox編集が可能に
  - 保存は IDB ではなく currentExternalTemplate.bboxes へ書き戻し→Preview反映
  - 通常のIDB保存済みテンプレは従来通り IDB保存
  - (副次) Project HTML由来テンプレが BBox編集できなかった潜在バグも解消
- 一時テンプレも Project HTML 保存/読込で画像+BBoxが保持される
- 一時テンプレも「ライブラリに保存」で IDB 登録可能

### 既知の制限
- ドラッグ&ドロップでの一時テンプレ適用は Phase 2 で対応予定

## v0.17.0 (2026-06-08)

### 追加
- プレビューサイドバーに「ページ内画像」セクション (改善7)
  - 現在ページの手書き/読込画像をサムネ・種別・サイズ付きで一覧表示
  - 各画像を個別に「選択」「削除」可能
  - 削除は確認ダイアログ付き、Undo対応 (ストローク・他画像は消さない)
  - 種別ラベル: 読込PNG / ドロップ / INI / バンドル / TDTS memo
  - 読込/ドロップ/memo/ページ切替/シート切替/プロジェクト読込時に自動更新
  - 既存の矩形/投げ縄選択+Del 削除はそのまま維持

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
