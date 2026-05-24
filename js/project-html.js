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

// ─── Assets (P1-b) ──────────────────────────────────────────────────────────

// asset_<typeShort>_<scope>_<random6>
function generateAssetId(assetType, scope) {
    const typeShort = assetType === 'externalTemplate' ? 'tpl'
                    : assetType === 'handwriting'      ? 'hw'
                    : 'img';
    const rand = Array.from(crypto.getRandomValues(new Uint8Array(3)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    const s = scope ? `_${String(scope).replace(/[^A-Za-z0-9_]/g, '')}` : '';
    return `asset_${typeShort}${s}_${rand}`;
}

function mimeFromDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string') return 'image/png';
    const m = /^data:([^;]+);/.exec(dataUrl);
    return m ? m[1] : 'image/png';
}

// ビルド側: dataURL を assets に格納し、ID を返す。重複 dataURL は同一IDに集約。
function createAssetRegistry() {
    const assets = {};
    const dataUrlIndex = new Map();
    return {
        assets,
        addImage(dataUrl, assetType, scope, w, h) {
            if (!dataUrl || typeof dataUrl !== 'string') return null;
            const existing = dataUrlIndex.get(dataUrl);
            if (existing) return existing;
            const id = generateAssetId(assetType, scope);
            const entry = {
                type: assetType,
                mimeType: mimeFromDataUrl(dataUrl),
                data: dataUrl
            };
            if (typeof w === 'number' && w > 0) entry.width = Math.round(w);
            if (typeof h === 'number' && h > 0) entry.height = Math.round(h);
            assets[id] = entry;
            dataUrlIndex.set(dataUrl, id);
            return id;
        }
    };
}

// 復元側: assets から imageAssetId に対応する dataURL を取り出す
function resolveAssetDataUrl(assets, id) {
    if (!assets || !id) return null;
    const a = assets[id];
    if (!a || typeof a.data !== 'string') return null;
    return a.data;
}

// dialogueBlocks の正規化: dialogueType を保持しつつ、未定義/不正値のみ 'normal' 補完。
// 既存値 (normal / off / mono / 背) はそのまま維持する。
// v0.8.1 で 'N' (Narration) を追加。dialogue.js 側の許可リストと一致させること。
const VALID_DIALOGUE_TYPES = ['normal', 'off', 'mono', 'N', '背'];
function normalizeDialogueBlocksArray(blocks) {
    if (!Array.isArray(blocks)) return [];
    return blocks.map(b => {
        const clone = deepCloneJSON(b);
        if (clone && typeof clone === 'object') {
            const t = clone.dialogueType;
            if (t === undefined || t === null || t === '' || !VALID_DIALOGUE_TYPES.includes(t)) {
                clone.dialogueType = 'normal';
            }
            // 有効値ならそのまま (off/mono/背 を絶対に上書きしない)
        }
        return clone;
    });
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

    // P1-b: assets レジストリ。handwriting / externalTemplate 画像を集約。
    const registry = createAssetRegistry();
    const serializedSheets = sheetsCopy.map((sh, idx) => serializeSheet(sh, registry, idx));

    // 外部テンプレ (任意)
    let externalTemplateBlock = null;
    if (typeof getCurrentExternalTemplate === 'function') {
        const tpl = getCurrentExternalTemplate();
        if (tpl && tpl.image) {
            const tplAssetId = registry.addImage(
                tpl.image, 'externalTemplate', 'main',
                tpl.imageWidth, tpl.imageHeight
            );
            externalTemplateBlock = {
                name: tpl.name || '',
                imageAssetId: tplAssetId,
                imageWidth: tpl.imageWidth || 0,
                imageHeight: tpl.imageHeight || 0,
                bboxes: deepCloneJSON(tpl.bboxes || {})
            };
            if (tpl.id) externalTemplateBlock.sourceTemplateId = tpl.id;
        }
    }

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
                sheets: serializedSheets
            }
        ],
        assets: registry.assets
    };

    if (externalTemplateBlock) projectData.externalTemplate = externalTemplateBlock;

    return projectData;
}

// シート単体のシリアライズ。
// P1-b: handwritingPages[].images[].dataUrl を assets に集約し imageAssetId 参照に置換。
function serializeSheet(sheet, registry, sheetIdx) {
    const handwritingOut = serializeHandwritingPages(sheet.handwritingPages || {}, registry, sheetIdx);
    return {
        name: sheet.name,
        isSharedCut: !!sheet.isSharedCut,
        color: sheet.color || 0,
        metaData: deepCloneJSON(sheet.metaData || {}),
        cellData: deepCloneJSON(sheet.cellData || {}),
        booksData: deepCloneJSON(sheet.booksData || { ACTION: {}, SOUND: {}, CELL: {}, CAMERA: {} }),
        customRepeats: deepCloneJSON(sheet.customRepeats || []),
        dialogueBlocks: normalizeDialogueBlocksArray(sheet.dialogueBlocks || []),
        cameraBlocks: deepCloneJSON(sheet.cameraBlocks || []),
        handwritingPages: handwritingOut,
        sections: deepCloneJSON(sheet.sections || [])
    };
}

// handwritingPages のシリアライズ。images.dataUrl → imageAssetId に置換。strokes はそのまま。
function serializeHandwritingPages(pages, registry, sheetIdx) {
    const out = {};
    Object.keys(pages || {}).forEach(pageKey => {
        const page = pages[pageKey] || {};
        const strokes = Array.isArray(page.strokes) ? deepCloneJSON(page.strokes) : [];
        const images = Array.isArray(page.images) ? page.images.map((img, imgIdx) => {
            const copy = deepCloneJSON(img);
            const scope = `s${sheetIdx}_${String(pageKey).replace(/[^A-Za-z0-9]/g, '')}_i${imgIdx}`;
            if (typeof copy.dataUrl === 'string' && copy.dataUrl) {
                const assetId = registry.addImage(copy.dataUrl, 'handwriting', scope, copy.w, copy.h);
                copy.imageAssetId = assetId;
                delete copy.dataUrl;
            }
            return copy;
        }) : [];
        out[pageKey] = { strokes, images };
    });
    return out;
}

// handwritingPages の復元。imageAssetId → dataUrl に再展開。
function deserializeHandwritingPages(pages, assets) {
    const out = {};
    Object.keys(pages || {}).forEach(pageKey => {
        const page = pages[pageKey] || {};
        const strokes = Array.isArray(page.strokes) ? deepCloneJSON(page.strokes) : [];
        const images = Array.isArray(page.images) ? page.images.map(img => {
            const copy = deepCloneJSON(img);
            // 新フォーマット (imageAssetId) を優先。旧形式 dataUrl もそのまま許容。
            if (copy.imageAssetId) {
                const url = resolveAssetDataUrl(assets, copy.imageAssetId);
                if (url) copy.dataUrl = url;
            }
            return copy;
        }) : [];
        out[pageKey] = { strokes, images };
    });
    return out;
}

// ─── loadProjectData: projectData → state ─────────────────────────────────────

// projectData を現在の state に反映する。
// P1-b: 外部テンプレ画像の Image load があるため async。
// 戻り値: Promise<{ ok: boolean, warnings: string[], error?: string }>
async function loadProjectData(projectData) {
    const result = { ok: false, warnings: [] };
    const v = validateProjectData(projectData);
    if (!v.ok) {
        result.error = v.error;
        return result;
    }

    const doc = projectData.documents[0];
    const assets = projectData.assets || {};

    if (typeof loadAllSheetsData !== 'function') {
        result.error = 'loadAllSheetsData が利用できません';
        return result;
    }
    const sheetsArr = (doc.sheets || []).map(rs => deserializeSheet(rs, assets));
    if (sheetsArr.length === 0) {
        result.error = 'documents[0].sheets が空です';
        return result;
    }

    let activeIdx = (projectData.workspace && typeof projectData.workspace.activeSheetIndex === 'number')
        ? projectData.workspace.activeSheetIndex
        : 0;
    if (activeIdx < 0 || activeIdx >= sheetsArr.length) {
        result.warnings.push(`workspace.activeSheetIndex=${activeIdx} が範囲外。0 に修正`);
        activeIdx = 0;
    }

    // 外部テンプレ復元 (sheets 読み込み前に走らせて、後続の drawAll で反映)
    if (projectData.externalTemplate && typeof applyProjectExternalTemplate === 'function') {
        const et = projectData.externalTemplate;
        const dataUrl = resolveAssetDataUrl(assets, et.imageAssetId);
        if (!dataUrl) {
            result.warnings.push(`externalTemplate.imageAssetId=${et.imageAssetId} が assets に見つかりません`);
            await applyProjectExternalTemplate(null);
        } else {
            await applyProjectExternalTemplate({
                id: et.sourceTemplateId || null,
                name: et.name || '',
                image: dataUrl,
                imageWidth: et.imageWidth || 0,
                imageHeight: et.imageHeight || 0,
                bboxes: deepCloneJSON(et.bboxes || {})
            });
        }
    } else if (typeof applyProjectExternalTemplate === 'function') {
        // 外部テンプレなしのプロジェクトを開いた時は現在のテンプレを解除
        await applyProjectExternalTemplate(null);
    }

    loadAllSheetsData(sheetsArr, activeIdx);

    // 既存 TDTS/XDTS 保存挙動への影響を避けるため、currentFileHandle は触らない
    result.ok = true;
    return result;
}

// シート単体のデシリアライズ。
// P1-b: handwritingPages の imageAssetId を assets から dataUrl に再展開。
function deserializeSheet(rawSheet, assets) {
    return {
        name: rawSheet.name || 'sheet1',
        isSharedCut: !!rawSheet.isSharedCut,
        color: rawSheet.color || 0,
        metaData: deepCloneJSON(rawSheet.metaData || {}),
        cellData: deepCloneJSON(rawSheet.cellData || {}),
        booksData: deepCloneJSON(rawSheet.booksData || { ACTION: {}, SOUND: {}, CELL: {}, CAMERA: {} }),
        customRepeats: deepCloneJSON(rawSheet.customRepeats || []),
        dialogueBlocks: normalizeDialogueBlocksArray(rawSheet.dialogueBlocks || []),
        cameraBlocks: deepCloneJSON(rawSheet.cameraBlocks || []),
        handwritingPages: deserializeHandwritingPages(rawSheet.handwritingPages || {}, assets),
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
