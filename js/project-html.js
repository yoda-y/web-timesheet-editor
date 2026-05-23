// === プロジェクトHTML 形式 シリアライザ/デシリアライザ (P1-a) ===
// docs/project_html_spec.md (v1) を参照。
//
// P1-a の範囲: 通常データ (外部テンプレ無し / 手書き無し / assets 無し) のラウンドトリップ。
//   - buildProjectData(): 現在の state → projectData (JSON-ready オブジェクト)
//   - loadProjectData(projectData): projectData → 現在の state へ反映
//   - validation (format/formatVersion/必須キー)
//   - meta.projectId 生成ヘルパー
// 後続:
//   - P1-b: assets 集約 (外部テンプレ画像 / 手書き画像)
//   - P1-c: JSON エクスポート/インポート + UI 配線
//   - P1-d: HTML 生成
//   - P1-e: HTML パース
//   - P1-f: メニュー追加

const PROJECT_HTML_FORMAT = 'web-timesheet-project';
const PROJECT_HTML_FORMAT_VERSION = 1;

// ─── ユーティリティ ──────────────────────────────────────────────────────────

// projectId 生成: proj_<YYYY>_<MM>_<DD>_<random8>
function generateProjectId() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${now.getUTCFullYear()}_${pad(now.getUTCMonth() + 1)}_${pad(now.getUTCDate())}`;
    const randHex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    return `proj_${dateStr}_${randHex}`;
}

// document id 生成 (現状は単一なので "doc_main" 固定でも可、将来複数化に備え random)
function generateDocumentId() {
    return 'doc_main';
}

// 安全なディープコピー (JSON-safe な値のみ前提)
function deepCloneJSON(value) {
    return JSON.parse(JSON.stringify(value));
}

// 現在の appVersion 文字列取得
function getCurrentAppVersion() {
    return (typeof APP_VERSION === 'string') ? APP_VERSION : '0.0.0';
}

// ─── buildProjectData: state → projectData ───────────────────────────────────

// 現在の state からプロジェクトデータ (JSON-ready) を構築する
// extraMeta: { projectId?, createdAt?, originalFileName?, displayName? } を上書き可能
//   - projectId: 未指定なら新規生成
//   - createdAt: 未指定なら savedAt と同じ (= 現在時刻)
function buildProjectData(extraMeta) {
    extraMeta = extraMeta || {};
    const now = new Date().toISOString();

    // シート配列を取得 (現状の state を sheets[currentSheetIndex] に同期した上で)
    const sheetsCopy = (typeof exportAllSheetsData === 'function')
        ? exportAllSheetsData()
        : [];

    // sheets を documents[0] の sheets として格納 (v1 は documents.length === 1)
    const docId = generateDocumentId();
    // ドキュメント共通 sections: 1枚目の sections を採用 (シート個別 sections は各 sheet 内にも持つ)
    const docSections = sheetsCopy.length > 0 && sheetsCopy[0].sections
        ? deepCloneJSON(sheetsCopy[0].sections)
        : [];
    const docName = (sheetsCopy[0] && sheetsCopy[0].metaData && sheetsCopy[0].metaData.cut)
        ? `cut${sheetsCopy[0].metaData.cut}`
        : 'document';

    const projectData = {
        format: PROJECT_HTML_FORMAT,
        formatVersion: PROJECT_HTML_FORMAT_VERSION,
        appVersion: getCurrentAppVersion(),
        meta: {
            projectId: extraMeta.projectId || generateProjectId(),
            createdAt: extraMeta.createdAt || now,
            savedAt: now,
            originalFileName: extraMeta.originalFileName || null,
            displayName: extraMeta.displayName || docName
        },
        workspace: {
            activeDocumentId: docId,
            activeSheetIndex: (typeof currentSheetIndex === 'number') ? currentSheetIndex : 0
        },
        documents: [
            {
                id: docId,
                name: docName,
                sections: docSections,
                sheets: sheetsCopy.map(serializeSheet)
            }
        ],
        // P1-a では externalTemplate / assets は未対応 (P1-b 以降で追加)
        assets: {}
    };

    return projectData;
}

// シート単体のシリアライズ (P1-a では既存構造をほぼそのまま使う)
// P1-b で handwritingPages 内 image の dataURL → assetId 化を行う
function serializeSheet(sheet) {
    return {
        name: sheet.name,
        isSharedCut: !!sheet.isSharedCut,
        color: sheet.color || 0,
        metaData: deepCloneJSON(sheet.metaData || {}),
        cellData: deepCloneJSON(sheet.cellData || {}),
        booksData: deepCloneJSON(sheet.booksData || { ACTION: {}, SOUND: {}, CELL: {}, CAMERA: {} }),
        customRepeats: deepCloneJSON(sheet.customRepeats || []),
        dialogueBlocks: deepCloneJSON(sheet.dialogueBlocks || []),
        cameraBlocks: deepCloneJSON(sheet.cameraBlocks || []),
        handwritingPages: deepCloneJSON(sheet.handwritingPages || {}),
        sections: deepCloneJSON(sheet.sections || [])
    };
}

// ─── loadProjectData: projectData → state ─────────────────────────────────────

// projectData を現在の state に反映する
// 戻り値: { ok: boolean, warnings: string[], error?: string }
function loadProjectData(projectData) {
    const result = { ok: false, warnings: [] };
    const v = validateProjectData(projectData);
    if (!v.ok) {
        result.error = v.error;
        return result;
    }

    const doc = projectData.documents[0];

    // sheets を loadAllSheetsData 経由で反映
    if (typeof loadAllSheetsData !== 'function') {
        result.error = 'loadAllSheetsData が利用できません';
        return result;
    }
    const sheetsArr = (doc.sheets || []).map(deserializeSheet);
    if (sheetsArr.length === 0) {
        result.error = 'documents[0].sheets が空です';
        return result;
    }

    // activeSheetIndex
    let activeIdx = (projectData.workspace && typeof projectData.workspace.activeSheetIndex === 'number')
        ? projectData.workspace.activeSheetIndex
        : 0;
    if (activeIdx < 0 || activeIdx >= sheetsArr.length) {
        result.warnings.push(`workspace.activeSheetIndex=${activeIdx} が範囲外。0 に修正`);
        activeIdx = 0;
    }

    loadAllSheetsData(sheetsArr, activeIdx);

    // 既存 TDTS/XDTS 保存挙動への影響を避けるため、currentFileHandle は触らない
    // (呼出側が必要に応じて setCurrentFileName 等を呼ぶ)

    result.ok = true;
    return result;
}

// シート単体のデシリアライズ (P1-a では既存構造ベース)
function deserializeSheet(rawSheet) {
    return {
        name: rawSheet.name || 'sheet1',
        isSharedCut: !!rawSheet.isSharedCut,
        color: rawSheet.color || 0,
        metaData: deepCloneJSON(rawSheet.metaData || {}),
        cellData: deepCloneJSON(rawSheet.cellData || {}),
        booksData: deepCloneJSON(rawSheet.booksData || { ACTION: {}, SOUND: {}, CELL: {}, CAMERA: {} }),
        customRepeats: deepCloneJSON(rawSheet.customRepeats || []),
        dialogueBlocks: deepCloneJSON(rawSheet.dialogueBlocks || []),
        cameraBlocks: deepCloneJSON(rawSheet.cameraBlocks || []),
        handwritingPages: deepCloneJSON(rawSheet.handwritingPages || {}),
        sections: deepCloneJSON(rawSheet.sections || [])
    };
}

// ─── validation ──────────────────────────────────────────────────────────────

// 致命的エラーチェック。OK なら { ok: true }、NG なら { ok: false, error }
function validateProjectData(data) {
    if (!data || typeof data !== 'object') {
        return { ok: false, error: 'プロジェクトデータが不正です (object でない)' };
    }
    if (data.format !== PROJECT_HTML_FORMAT) {
        return { ok: false, error: `format が違います (期待: ${PROJECT_HTML_FORMAT}, 実際: ${data.format})` };
    }
    if (typeof data.formatVersion !== 'number') {
        return { ok: false, error: 'formatVersion が数値ではありません' };
    }
    if (data.formatVersion > PROJECT_HTML_FORMAT_VERSION) {
        return { ok: false, error: `formatVersion=${data.formatVersion} は対応外 (このアプリの対応最大: ${PROJECT_HTML_FORMAT_VERSION})` };
    }
    if (!data.meta || typeof data.meta !== 'object') {
        return { ok: false, error: 'meta が不正です' };
    }
    if (!data.meta.projectId || typeof data.meta.projectId !== 'string') {
        return { ok: false, error: 'meta.projectId が不正です' };
    }
    if (!data.workspace || typeof data.workspace !== 'object') {
        return { ok: false, error: 'workspace が不正です' };
    }
    if (!Array.isArray(data.documents)) {
        return { ok: false, error: 'documents が配列ではありません' };
    }
    if (data.documents.length === 0) {
        return { ok: false, error: 'documents が空です' };
    }
    if (data.documents.length > 1) {
        // v1 は length===1 を強制だが、warn にする選択もある。ここでは致命的エラー扱い。
        return { ok: false, error: `v1 (formatVersion=1) では documents は 1件のみ (受信: ${data.documents.length})` };
    }
    const doc = data.documents[0];
    if (!doc || typeof doc !== 'object') {
        return { ok: false, error: 'documents[0] が不正です' };
    }
    if (!Array.isArray(doc.sheets) || doc.sheets.length === 0) {
        return { ok: false, error: 'documents[0].sheets が空または配列ではありません' };
    }
    return { ok: true };
}

// ─── window 公開 (デバッグ/将来UI配線用) ─────────────────────────────────────

window.projectHtml = {
    FORMAT: PROJECT_HTML_FORMAT,
    FORMAT_VERSION: PROJECT_HTML_FORMAT_VERSION,
    build: buildProjectData,
    load: loadProjectData,
    validate: validateProjectData,
    generateProjectId
};
