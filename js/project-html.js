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

    // 外部テンプレ (任意)。window 経由で確実にアクセス。
    let externalTemplateBlock = null;
    const getterFn = (typeof window !== 'undefined' && typeof window.getCurrentExternalTemplate === 'function')
        ? window.getCurrentExternalTemplate
        : (typeof getCurrentExternalTemplate === 'function' ? getCurrentExternalTemplate : null);
    if (!getterFn) {
        console.warn('[projectHtml.build] getCurrentExternalTemplate が見つからない (external-template.js 未ロード?)');
    } else {
        const tpl = getterFn();
        if (!tpl) {
            console.info('[projectHtml.build] 外部テンプレ未選択。externalTemplate を含めない。');
        } else if (!tpl.image) {
            console.warn('[projectHtml.build] 外部テンプレに image が無い。書き出しから除外します。tpl=', tpl);
        } else {
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
            if (tpl.temporary) externalTemplateBlock.temporary = true;
            // Phase 2: ページ別テンプレ画像 (pageImages)。各画像を assets 化。
            if (tpl.pageImages && typeof tpl.pageImages === 'object') {
                const pageImagesOut = {};
                Object.keys(tpl.pageImages).forEach(k => {
                    const pi = tpl.pageImages[k];
                    if (!pi || !pi.image) return;
                    const aid = registry.addImage(pi.image, 'externalTemplate', `page${k}`, pi.imageWidth, pi.imageHeight);
                    pageImagesOut[k] = {
                        imageAssetId: aid,
                        imageWidth: pi.imageWidth || 0,
                        imageHeight: pi.imageHeight || 0,
                        name: pi.name || ''
                    };
                });
                if (Object.keys(pageImagesOut).length > 0) externalTemplateBlock.pageImages = pageImagesOut;
            }
        }
    }

    // displayName のフォールバック (Launcher 表示用):
    //   1. extraMeta.displayName (明示指定)
    //   2. 現在のファイル名 (拡張子除去)
    //   3. title + cut の組み合わせ
    //   4. docName ("cutNNN" or "document")
    let resolvedDisplayName = extraMeta.displayName || '';
    if (!resolvedDisplayName) {
        const cfn = (typeof currentFileName === 'string') ? currentFileName : '';
        if (cfn) resolvedDisplayName = cfn.replace(/\.(html?|wtproj\.json|wtproj\.html|tdts|xdts|json)$/i, '');
    }
    if (!resolvedDisplayName) {
        const m0 = sheetsCopy[0] && sheetsCopy[0].metaData ? sheetsCopy[0].metaData : null;
        if (m0 && (m0.title || m0.cut)) {
            resolvedDisplayName = [m0.title, m0.cut ? `cut${m0.cut}` : ''].filter(Boolean).join('_');
        }
    }
    if (!resolvedDisplayName) resolvedDisplayName = docName;

    const projectData = {
        format: PROJECT_HTML_FORMAT,
        formatVersion: PROJECT_HTML_FORMAT_VERSION,
        appVersion: getCurrentAppVersion(),
        meta: {
            projectId: extraMeta.projectId || generateProjectId(),
            createdAt: extraMeta.createdAt || now,
            savedAt: now,
            originalFileName: extraMeta.originalFileName || null,
            displayName: resolvedDisplayName
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
    const applyTplFn = (typeof window !== 'undefined' && window.applyProjectExternalTemplate)
        ? window.applyProjectExternalTemplate
        : (typeof applyProjectExternalTemplate === 'function' ? applyProjectExternalTemplate : null);
    if (projectData.externalTemplate && applyTplFn) {
        const et = projectData.externalTemplate;
        const dataUrl = resolveAssetDataUrl(assets, et.imageAssetId);
        if (!dataUrl) {
            result.warnings.push(`externalTemplate.imageAssetId=${et.imageAssetId} が assets に見つかりません`);
            await applyTplFn(null);
        } else {
            const tplToApply = {
                id: et.sourceTemplateId || null,
                name: et.name || '',
                image: dataUrl,
                imageWidth: et.imageWidth || 0,
                imageHeight: et.imageHeight || 0,
                bboxes: deepCloneJSON(et.bboxes || {})
            };
            if (et.temporary) tplToApply.temporary = true;
            // Phase 2: pageImages 復元 (assetId → dataUrl)
            if (et.pageImages && typeof et.pageImages === 'object') {
                const pageImages = {};
                Object.keys(et.pageImages).forEach(k => {
                    const pi = et.pageImages[k];
                    if (!pi || !pi.imageAssetId) return;
                    const pdu = resolveAssetDataUrl(assets, pi.imageAssetId);
                    if (!pdu) {
                        result.warnings.push(`externalTemplate.pageImages[${k}].imageAssetId が assets に見つかりません`);
                        return;
                    }
                    pageImages[k] = {
                        image: pdu,
                        imageWidth: pi.imageWidth || 0,
                        imageHeight: pi.imageHeight || 0,
                        name: pi.name || ''
                    };
                });
                if (Object.keys(pageImages).length > 0) tplToApply.pageImages = pageImages;
            }
            await applyTplFn(tplToApply);
        }
        // Preview / サイドバー selector 同期
        syncTemplateSelectorAfterProjectLoad(et);
    } else if (applyTplFn) {
        await applyTplFn(null);
        syncTemplateSelectorAfterProjectLoad(null);
    }

    loadAllSheetsData(sheetsArr, activeIdx);

    // Preview 強制再描画 (Preview モードで JSON 読み込み時に標準A3に戻る問題対策)
    if (typeof updateTemplatePreview === 'function') {
        try { updateTemplatePreview(); } catch (e) { console.warn('[projectHtml.load] updateTemplatePreview 失敗:', e); }
    }
    if (typeof drawAll === 'function') {
        try { drawAll(); } catch (e) { /* ignore */ }
    }

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

// プロジェクト読込後、サイドバーの template-select を外部テンプレ選択中状態に同期する。
// 復元した外部テンプレが既存ローカルIDBに無い場合は仮エントリ "(プロジェクト由来) name" を追加。
function syncTemplateSelectorAfterProjectLoad(externalTemplateBlock) {
    const sel = document.getElementById('template-select');
    if (!sel) return;
    if (!externalTemplateBlock) {
        // 標準A3に戻す
        const def = Array.from(sel.options).find(o => o.value === 'default');
        if (def) sel.value = 'default';
        if (typeof updateSidebarTemplateStatus === 'function') updateSidebarTemplateStatus();
        return;
    }
    const wantId = externalTemplateBlock.sourceTemplateId || '';
    const wantValue = wantId ? `ext:${wantId}` : '';
    // 既存 option を探す
    let opt = wantValue ? Array.from(sel.options).find(o => o.value === wantValue) : null;
    if (!opt) {
        // 仮エントリ追加 (project-loaded grouping)
        const group = document.getElementById('template-select-external-group')
            || sel; // optgroup 無ければ select 直下
        opt = document.createElement('option');
        opt.value = wantValue || `ext:__project_loaded__`;
        opt.textContent = `(プロジェクト由来) ${externalTemplateBlock.name || ''}`.trim();
        opt.dataset.projectLoaded = '1';
        group.appendChild(opt);
    }
    sel.value = opt.value;
    if (typeof updateSidebarTemplateStatus === 'function') updateSidebarTemplateStatus();
    if (typeof refreshCustomFieldsSidebar === 'function') refreshCustomFieldsSidebar();
}

// ─── JSON エクスポート / インポート (P1-c) ───────────────────────────────────

// 提案ファイル名: <displayName>.wtproj.json (英数+_-のみに浄化)
function suggestProjectJSONFileName(projectData) {
    if (typeof buildProjectSaveFilename === 'function') {
        return buildProjectSaveFilename(projectData, 'wtproj.json');
    }
    const raw = (projectData && projectData.meta && projectData.meta.displayName) || 'project';
    const safe = String(raw).replace(/[^A-Za-z0-9_\-぀-ヿ一-鿿]/g, '_').slice(0, 60) || 'project';
    return `${safe}.wtproj.json`;
}

// 現在の state を JSON ファイルとして書き出す
// P2-2b: メニュー「書き出し > プロジェクトJSON」専用。Ctrl+S からは呼ばない。
// 明示的な書き出しなので毎回ピッカー (saveAs に依存しない)。
async function exportProjectJSON() {
    const data = buildProjectData();
    const fileContent = JSON.stringify(data, null, 2);
    const suggestedName = suggestProjectJSONFileName(data);
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName,
                types: [{ description: 'Web Timesheet Project (JSON)', accept: { 'application/json': ['.json', '.wtproj.json'] } }]
            });
            const writable = await handle.createWritable();
            await writable.write(fileContent);
            await writable.close();
        } catch (err) {
            if (err && err.name !== 'AbortError') alert('プロジェクトJSONの書き出しに失敗しました: ' + (err.message || err));
        }
    } else {
        const blob = new Blob([fileContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = suggestedName; a.click();
        URL.revokeObjectURL(url);
    }
}

// JSON ファイルを選択させて現在 state に読み込む。
// 既存変更がある場合は確認ダイアログを出す。
function importProjectJSON() {
    if (typeof isDirty !== 'undefined' && isDirty) {
        const msg = '未保存の変更があります。破棄してプロジェクトJSONを読み込みますか？';
        if (!confirm(msg)) return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            let parsed;
            try {
                parsed = JSON.parse(evt.target.result);
            } catch (err) {
                alert('JSON解析エラー: ' + err.message);
                return;
            }
            try {
                const r = await loadProjectData(parsed);
                if (!r.ok) {
                    alert('プロジェクトの読み込みに失敗しました: ' + (r.error || ''));
                    return;
                }
                if (r.warnings && r.warnings.length) {
                    console.warn('[projectHtml] warnings:', r.warnings);
                }
                // 既存 TDTS/XDTS の保存挙動と衝突しないよう、currentFileHandle はリセット
                if (typeof currentFileHandle !== 'undefined') currentFileHandle = null;
                if (typeof currentFileFormat !== 'undefined') currentFileFormat = null;
                if (typeof setCurrentFileName === 'function') setCurrentFileName(file.name, null);
                if (typeof markClean === 'function') markClean();
            } catch (err) {
                alert('プロジェクトの読み込み中にエラー: ' + (err && err.message || err));
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ─── HTML パース (P1-e): 埋め込み JSON 抽出 ──────────────────────────────────

// プロジェクトHTML 内の <script type="application/json" id="wt-project-data"> を取り出す。
// 戻り値: { ok: true, data } | { ok: false, error }
function extractEmbeddedProjectJSON(htmlText) {
    if (typeof htmlText !== 'string' || !htmlText) {
        return { ok: false, error: 'HTML テキストが空です' };
    }
    const re = /<script\b[^>]*\bid\s*=\s*["']wt-project-data["'][^>]*>([\s\S]*?)<\/script\s*>/i;
    const m = re.exec(htmlText);
    if (!m) {
        return { ok: false, error: 'プロジェクト埋め込みデータ (wt-project-data) が見つかりません' };
    }
    const raw = m[1].trim();
    if (!raw) return { ok: false, error: '埋め込み JSON が空です' };
    try {
        const data = JSON.parse(raw);
        return { ok: true, data };
    } catch (err) {
        return { ok: false, error: 'JSON 解析エラー: ' + (err && err.message || err) };
    }
}

// テキストがプロジェクト HTML かの軽量判定 (拡張子非依存)
function looksLikeProjectHTML(text) {
    if (typeof text !== 'string') return false;
    return /id\s*=\s*["']wt-project-data["']/.test(text);
}

// テキストがプロジェクト JSON 本体かの軽量判定 (parse 前)
function looksLikeProjectJSON(text) {
    if (typeof text !== 'string') return false;
    return text.includes('"web-timesheet-project"') && text.includes('"formatVersion"');
}

// プロジェクト HTML または JSON のテキストを受け取り loadProjectData まで通す共通ハンドラ。
// 戻り値: Promise<{ ok, warnings?, error? }>
async function loadProjectFromTextAuto(text, sourceFileName) {
    if (looksLikeProjectHTML(text)) {
        const ex = extractEmbeddedProjectJSON(text);
        if (!ex.ok) return { ok: false, error: ex.error };
        const r = await loadProjectData(ex.data);
        if (r.ok) {
            // P2-2a: project HTML として開いたことを記録。handle は input経由では取れないので null。
            if (typeof currentFileHandle !== 'undefined') currentFileHandle = null;
            if (typeof setCurrentFileName === 'function') setCurrentFileName(sourceFileName || '', 'wtproj-html');
            if (typeof markClean === 'function') markClean();
        }
        return r;
    }
    if (looksLikeProjectJSON(text)) {
        let parsed;
        try { parsed = JSON.parse(text); }
        catch (err) { return { ok: false, error: 'JSON 解析エラー: ' + err.message }; }
        const r = await loadProjectData(parsed);
        if (r.ok) {
            // P2-2a: project JSON として開いたことを記録。Ctrl+S 時は HTML に昇格保存する仕様。
            if (typeof currentFileHandle !== 'undefined') currentFileHandle = null;
            if (typeof setCurrentFileName === 'function') setCurrentFileName(sourceFileName || '', 'wtproj-json');
            if (typeof markClean === 'function') markClean();
        }
        return r;
    }
    return { ok: false, error: 'プロジェクトHTML/JSON ではありません' };
}

// ─── HTML 生成 (P1-d): 最小ランチャ ─────────────────────────────────────────

const DEFAULT_APP_URL = 'https://yoda-y.github.io/web-timesheet-editor/';

// HTML エスケープ (タグ閉じ防止)。JSON 用には embedJsonForScript() を使う。
function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// <script type="application/json"> に安全に埋め込むためのエスケープ。
// `</script>` / `<!--` / `]]>` を壊さないよう '<' を < に置換。
function embedJsonForScript(jsonText) {
    var LS = String.fromCharCode(0x2028);
    var PS = String.fromCharCode(0x2029);
    return String(jsonText)
        .replace(/</g, '\\u003c')
        .replace(/-->/g, '--\\u003e')
        .split(LS).join('\\u2028')
        .split(PS).join('\\u2029');
}

function suggestProjectHTMLFileName(projectData) {
    if (typeof buildProjectSaveFilename === 'function') {
        return buildProjectSaveFilename(projectData, 'html');
    }
    const raw = (projectData && projectData.meta && projectData.meta.displayName) || 'project';
    const safe = String(raw).replace(/[^A-Za-z0-9_\-぀-ヿ一-鿿]/g, '_').slice(0, 60) || 'project';
    return `${safe}.html`;
}

// ランチャ HTML を組み立てて文字列で返す。
// options.appUrl: 「アプリを開く」ボタンの遷移先 (デフォルト: GitHub Pages)
function buildProjectHTML(projectData, options) {
    options = options || {};
    const appUrl = (typeof options.appUrl === 'string' && options.appUrl) ? options.appUrl : DEFAULT_APP_URL;

    // メタ表示用に projectData から要点を抽出
    const meta = projectData.meta || {};
    const doc = (projectData.documents && projectData.documents[0]) || {};
    const sheet0 = (doc.sheets && doc.sheets[0]) || {};
    const sheetMeta = sheet0.metaData || {};
    const displayName = meta.displayName || doc.name || 'project';
    const title = sheetMeta.title || '';
    const episode = sheetMeta.subTitle || '';
    const scene = sheetMeta.scene || '';
    const cut = sheetMeta.cut || '';
    const sheetName = sheetMeta.sheetName || sheet0.name || '';
    const createdAt = meta.createdAt || '';
    const savedAt = meta.savedAt || '';
    const appVersion = projectData.appVersion || '';
    const formatVersion = projectData.formatVersion || '';

    const jsonText = JSON.stringify(projectData);
    const embedded = embedJsonForScript(jsonText);

    // テンプレ。スタイルもインラインで自己完結。
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>Web Timesheet Project: ${escapeHtml(displayName)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 24px; background: #f5f5f5; color: #222; }
  @media (prefers-color-scheme: dark) { body { background: #1e1e1e; color: #ddd; } .card { background: #2a2a2a !important; border-color: #444 !important; } th, td { border-color: #444 !important; } button { background: #3a3a3a; color: #ddd; border-color: #555; } button.primary { background: #2469d4; color: #fff; border-color: #2469d4; } }
  .card { max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  h1 { font-size: 18px; margin: 0 0 4px 0; }
  .sub { color: #888; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 12px 0 20px 0; }
  th, td { border: 1px solid #e0e0e0; padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: rgba(0,0,0,0.04); width: 30%; font-weight: 600; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  button { font-size: 14px; padding: 8px 16px; border-radius: 4px; border: 1px solid #bbb; background: #fafafa; cursor: pointer; }
  button.primary { background: #2469d4; color: #fff; border-color: #2469d4; }
  button:hover { filter: brightness(1.05); }
  .footnote { margin-top: 16px; font-size: 11px; color: #999; line-height: 1.5; }
  code { background: rgba(0,0,0,0.05); padding: 1px 4px; border-radius: 3px; font-size: 12px; }
  .status { margin-top: 12px; min-height: 1.4em; font-size: 13px; padding: 8px 12px; border-radius: 4px; display: none; }
  .status.info { display: block; background: rgba(36,105,212,0.08); color: #2469d4; border: 1px solid rgba(36,105,212,0.3); }
  .status.ok { display: block; background: rgba(46,160,67,0.08); color: #2ea043; border: 1px solid rgba(46,160,67,0.3); }
  .status.err { display: block; background: rgba(218,54,51,0.08); color: #da3633; border: 1px solid rgba(218,54,51,0.3); }
  @media (prefers-color-scheme: dark) {
    .status.info { background: rgba(36,105,212,0.18); color: #8ab4ff; }
    .status.ok { background: rgba(46,160,67,0.18); color: #7ee787; }
    .status.err { background: rgba(218,54,51,0.18); color: #ffa198; }
  }
  details.meta-details { margin: 8px 0 16px 0; font-size: 12px; color: #888; }
  details.meta-details summary { cursor: pointer; padding: 4px 0; user-select: none; }
  table.meta-sub { font-size: 11px; margin: 8px 0 0 0; }
  table.meta-sub th { width: 35%; }
</style>
</head>
<body>
<div class="card">
  <h1>Web Timesheet Project</h1>
  <div class="sub">${escapeHtml(displayName)}</div>

  <table>
    <tr><th>プロジェクト名</th><td>${escapeHtml(displayName)}</td></tr>
    <tr><th>TITLE</th><td>${escapeHtml(title)}</td></tr>
    <tr><th>EPISODE</th><td>${escapeHtml(episode)}</td></tr>
    <tr><th>SCENE</th><td>${escapeHtml(scene)}</td></tr>
    <tr><th>CUT</th><td>${escapeHtml(cut)}</td></tr>
    <tr><th>NAME</th><td>${escapeHtml(sheetName)}</td></tr>
  </table>

  <details class="meta-details">
    <summary>詳細情報</summary>
    <table class="meta-sub">
      <tr><th>作成日時</th><td>${escapeHtml(createdAt)}</td></tr>
      <tr><th>保存日時</th><td>${escapeHtml(savedAt)}</td></tr>
      <tr><th>appVersion</th><td>${escapeHtml(appVersion)}</td></tr>
      <tr><th>formatVersion</th><td>${escapeHtml(String(formatVersion))}</td></tr>
    </table>
  </details>

  <div class="actions">
    <button class="primary" id="btn-open-app" type="button">アプリで開く</button>
    <button id="btn-export-json" type="button">JSONを書き出し</button>
  </div>

  <div id="handoff-status" class="status"></div>

  <div class="footnote">
    このファイルは Web Timesheet Editor のプロジェクトデータを含む単独HTMLです。<br>
    「アプリで開く」を押すと、新しいタブでエディタを開き、プロジェクトデータを自動転送します。<br>
    転送に失敗した場合は「JSONを書き出し」で <code>.wtproj.json</code> を保存し、エディタの「ファイル &gt; インポート &gt; プロジェクトJSON」から読み込んでください。
  </div>
</div>

<script type="application/json" id="wt-project-data">${embedded}</script>
<script>
(function(){
  var APP_URL = ${JSON.stringify(appUrl)};
  var HANDOFF_TIMEOUT_MS = 30 * 1000;
  var APP_ORIGIN = '';
  try { APP_ORIGIN = new URL(APP_URL).origin; } catch (e) { APP_ORIGIN = ''; }

  var statusEl = document.getElementById('handoff-status');
  var btnOpen = document.getElementById('btn-open-app');
  var btnExport = document.getElementById('btn-export-json');

  function setStatus(kind, message) {
    statusEl.className = 'status ' + kind;
    statusEl.textContent = message;
  }

  function getProjectData() {
    var el = document.getElementById('wt-project-data');
    if (!el) throw new Error('wt-project-data が見つかりません');
    return JSON.parse(el.textContent);
  }
  function suggestedJsonName(data) {
    var raw = (data && data.meta && data.meta.displayName) || 'project';
    var safe = String(raw).replace(/[^A-Za-z0-9_\\-぀-ヿ一-鿿]/g, '_').slice(0, 60) || 'project';
    return safe + '.wtproj.json';
  }
  function generateNonce() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'n-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function startHandoff() {
    var data;
    try { data = getProjectData(); }
    catch (err) { setStatus('err', 'プロジェクトデータの解析に失敗しました: ' + (err && err.message || err)); return; }

    var nonce = generateNonce();
    var url = APP_URL + (APP_URL.indexOf('#') >= 0 ? '' : '') + '#wtproj=' + encodeURIComponent(nonce);
    var appWin;
    try { appWin = window.open(url, '_blank'); } catch (e) { appWin = null; }
    if (!appWin) {
      setStatus('err', 'ポップアップがブロックされました。ブラウザ設定でこのページのポップアップを許可するか、下の「JSONを書き出し」をご利用ください。');
      return;
    }

    setStatus('info', 'アプリを開いています…');
    btnOpen.disabled = true;

    var handled = false;
    var timeoutId = setTimeout(function(){
      if (handled) return;
      cleanup();
      setStatus('err', 'アプリからの応答がありません (30秒タイムアウト)。「JSONを書き出し」で手動読み込みをお試しください。');
    }, HANDOFF_TIMEOUT_MS);

    function cleanup() {
      handled = true;
      window.removeEventListener('message', onMessage);
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
      btnOpen.disabled = false;
    }

    function onMessage(event) {
      if (handled) return;
      // origin チェック（APP_ORIGIN と一致のみ受理。file:// の app は想定しない）
      if (APP_ORIGIN && event.origin !== APP_ORIGIN) return;
      var msg = event.data;
      if (!msg || typeof msg !== 'object' || msg.nonce !== nonce) return;

      if (msg.type === 'wt-app-ready') {
        setStatus('info', '接続成功。プロジェクトを転送中…');
        try {
          appWin.postMessage({ type: 'wt-project-data', nonce: nonce, projectData: data }, APP_ORIGIN || '*');
        } catch (e) {
          cleanup();
          setStatus('err', 'データ送信に失敗しました: ' + (e && e.message || e));
        }
        return;
      }
      if (msg.type === 'wt-project-loaded') {
        cleanup();
        if (msg.ok) {
          setStatus('ok', '✓ アプリへ読み込みました。このタブは自動的に閉じます…');
          // 成功後にランチャータブを閉じる試行。
          // ブラウザ制限で script で開かれたタブ以外は閉じられないケースがある。
          // 閉じられなかった場合は手動で閉じるよう案内表示に切り替え。
          setTimeout(function() {
            try { window.close(); } catch (e) {}
            // 1秒後にまだ閉じてなければ案内に切替
            setTimeout(function() {
              if (!window.closed) {
                setStatus('ok', '✓ アプリへ読み込みました。このタブは閉じて構いません。');
              }
            }, 1000);
          }, 1500);
        } else if (msg.error === 'cancelled') {
          setStatus('err', 'アプリ側で読み込みがキャンセルされました。');
        } else {
          var detail = msg.message ? ' (' + msg.message + ')' : '';
          setStatus('err', '読み込みに失敗しました' + detail + '。「JSONを書き出し」で手動読み込みをお試しください。');
        }
        return;
      }
    }

    window.addEventListener('message', onMessage);
  }

  btnOpen.addEventListener('click', startHandoff);
  btnExport.addEventListener('click', function(){
    try {
      var data = getProjectData();
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = suggestedJsonName(data);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    } catch (err) {
      alert('JSON書き出しに失敗しました: ' + (err && err.message || err));
    }
  });
})();
</script>
</body>
</html>
`;
    return html;
}

// 現在の state を HTML ファイルとして書き出す
// P2-2b: exportProjectHTML を silent 上書き対応に拡張。
// options.saveAs:false 時、currentFileHandle が project-html 由来であれば確認なしで上書き。
async function exportProjectHTML(options) {
    options = options || {};
    const saveAs = options.saveAs === true;
    const data = buildProjectData();
    const html = buildProjectHTML(data, options);
    const suggestedName = suggestProjectHTMLFileName(data);

    // silent 上書き: 同一形式のハンドルを保持している場合のみ
    if (!saveAs && typeof currentFileHandle !== 'undefined' && currentFileHandle
        && typeof currentFileFormat !== 'undefined' && currentFileFormat === 'wtproj-html') {
        try {
            const ok = await silentSaveToHandle(currentFileHandle, html);
            if (ok) {
                setCurrentFileName(currentFileHandle.name || currentFileName || suggestedName, 'wtproj-html');
                if (typeof markClean === 'function') markClean();
                return;
            }
        } catch (e) { /* fallthrough to picker */ }
    }

    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName,
                types: [{ description: 'Web Timesheet Project (HTML)', accept: { 'text/html': ['.html', '.htm'] } }]
            });
            const writable = await handle.createWritable();
            await writable.write(html);
            await writable.close();
            // 保存後の状態更新（次回 Ctrl+S で silent 上書き可能になる）
            currentFileHandle = handle;
            setCurrentFileName(handle.name || suggestedName, 'wtproj-html');
            if (typeof markClean === 'function') markClean();
        } catch (err) {
            if (err && err.name !== 'AbortError') alert('プロジェクトHTMLの書き出しに失敗しました: ' + (err.message || err));
        }
    } else {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = suggestedName; a.click();
        URL.revokeObjectURL(url);
        // ハンドル非対応環境では名前だけ反映
        setCurrentFileName(suggestedName, 'wtproj-html');
        if (typeof markClean === 'function') markClean();
    }
}

// ─── window 公開 (デバッグ/将来UI配線用) ─────────────────────────────────────

window.projectHtml = {
    FORMAT: PROJECT_HTML_FORMAT,
    FORMAT_VERSION: PROJECT_HTML_FORMAT_VERSION,
    DEFAULT_APP_URL,
    build: buildProjectData,
    load: loadProjectData,
    validate: validateProjectData,
    generateProjectId,
    exportJSON: exportProjectJSON,
    importJSON: importProjectJSON,
    buildHTML: buildProjectHTML,
    exportHTML: exportProjectHTML,
    extractEmbeddedJSON: extractEmbeddedProjectJSON,
    looksLikeProjectHTML,
    looksLikeProjectJSON,
    loadFromTextAuto: loadProjectFromTextAuto
};
