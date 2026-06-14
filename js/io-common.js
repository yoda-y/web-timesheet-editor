// === Import / Export 共通ユーティリティ ===

// ----- トースト通知 -----
// onClick が指定された場合、クリック可能なトーストになる
function showToast(message, duration = 3000, onClick = null) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'app-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.cssText = `
        position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
        background:var(--accent,#2196f3);color:#fff;padding:10px 20px;
        border-radius:6px;z-index:10000;opacity:0;transition:opacity 0.3s;
        font-size:14px;
        ${onClick ? 'pointer-events:auto;cursor:pointer;' : 'pointer-events:none;'}
    `;
    toast.onclick = onClick ? () => {
        toast.style.opacity = '0';
        clearTimeout(toast._hideTimer);
        onClick();
    } : null;
    toast.style.opacity = '1';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

// ----- スポイト (色取得) -----
// Phase D: ネイティブ EyeDropper API を優先。非対応なら canvas/img からの手動ピックへ。
// fallbackTarget は HTMLCanvasElement または HTMLImageElement を受け付ける。
// img の場合は一時 canvas へ描画してサンプリングする。
// 戻り値 Promise<string|null> (#rrggbb、キャンセル時 null)
async function pickColorEyedropper(fallbackTarget) {
    // 1. ネイティブ EyeDropper API (Chrome/Edge 95+)。画面全体から拾える・Esc対応・crosshair
    if (typeof window.EyeDropper === 'function') {
        try {
            const res = await new window.EyeDropper().open();
            return (res && res.sRGBHex) ? res.sRGBHex : null;
        } catch (e) {
            return null;  // ユーザーキャンセル (Esc) 含む
        }
    }
    // 2. フォールバック: 指定要素 (canvas または img) 上のクリックで色を取得
    const el = fallbackTarget;
    const isImg = (typeof HTMLImageElement !== 'undefined') && (el instanceof HTMLImageElement);
    const isCanvas = el && typeof el.getContext === 'function';
    if (!el || (!isImg && !isCanvas)) {
        if (typeof showToast === 'function') {
            showToast(typeof t === 'function' ? t('colHeader.eyedropperUnsupported')
                : 'スポイト非対応のブラウザです', 3000);
        }
        return null;
    }
    // img はサンプリング用に内部 canvas を用意 (自然サイズで描画)
    let sampleCanvas = null;
    if (isImg) {
        const iw = el.naturalWidth || el.width;
        const ih = el.naturalHeight || el.height;
        if (!iw || !ih) return null;
        sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = iw; sampleCanvas.height = ih;
        try { sampleCanvas.getContext('2d').drawImage(el, 0, 0, iw, ih); }
        catch (e) { return null; }
    }
    const srcCanvas = isImg ? sampleCanvas : el;
    return new Promise((resolve) => {
        const prevCursor = el.style.cursor;
        el.style.cursor = 'crosshair';
        const cleanup = () => {
            el.style.cursor = prevCursor;
            el.removeEventListener('click', onClick, true);
            window.removeEventListener('keydown', onKey, true);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cleanup(); resolve(null); }
        };
        const onClick = (e) => {
            e.preventDefault(); e.stopPropagation();
            try {
                const rect = el.getBoundingClientRect();
                const sx = (e.clientX - rect.left) * (srcCanvas.width / rect.width);
                const sy = (e.clientY - rect.top) * (srcCanvas.height / rect.height);
                // 端クリックで範囲外にならないよう floor + clamp
                const x = Math.max(0, Math.min(srcCanvas.width - 1, Math.floor(sx)));
                const y = Math.max(0, Math.min(srcCanvas.height - 1, Math.floor(sy)));
                const d = srcCanvas.getContext('2d').getImageData(x, y, 1, 1).data;
                const hex = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
                cleanup(); resolve(hex);
            } catch (err) { cleanup(); resolve(null); }
        };
        el.addEventListener('click', onClick, true);
        window.addEventListener('keydown', onKey, true);
    });
}
window.pickColorEyedropper = pickColorEyedropper;

// ----- 最小セル数定義（G列まで確保） -----
const MIN_SECTION_COLS = {
    ACTION: { cols: 7, chars: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] },
    CELL: { cols: 7, chars: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }
};

// セクションの最小セル数を確保する（G列まで自動補完）
function ensureMinimumSectionCols(sectionsMeta) {
    if (!sectionsMeta) return;
    for (const type in MIN_SECTION_COLS) {
        const minDef = MIN_SECTION_COLS[type];
        const sec = sectionsMeta.find(s => s.type === type);
        if (sec && sec.cols < minDef.cols) {
            // 既存のcharsをベースに、足りない分を補完
            const newChars = [...(sec.chars || [])];
            for (let i = newChars.length; i < minDef.cols; i++) {
                newChars.push(minDef.chars[i] || `${type[0]}${i + 1}`);
            }
            sec.cols = minDef.cols;
            sec.chars = newChars;
        }
    }
}

// ----- 前回保存ファイルハンドル記憶（IndexedDB） -----
// FileSystemFileHandle は localStorage に入れられないため IDB を使う

function _openHandleDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('webTimesheetEditor', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('handles');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveLastFileHandle(format, handle) {
    try {
        const db = await _openHandleDB();
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, format);
        return new Promise(resolve => { tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); });
    } catch (e) { /* 非対応環境は無視 */ }
}

async function getLastFileHandle(format) {
    try {
        const db = await _openHandleDB();
        const tx = db.transaction('handles', 'readonly');
        return await new Promise((resolve) => {
            const req = tx.objectStore('handles').get(format);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (e) { return null; }
}

// 現在編集中のファイル（最後に開いた/保存したハンドル）
// currentFileFormat: 'tdts' | 'xdts' | 'wtproj-html' | 'wtproj-json' | null
//   - 'tdts'/'xdts': 互換書き出しファイル
//   - 'wtproj-html': Project HTML (.html / .wtproj.html) — Ctrl+S は HTML 上書き保存
//   - 'wtproj-json': Project JSON (.wtproj.json) — Ctrl+S は HTML に昇格保存
//   - null: 新規作成 or 形式不明 — Ctrl+S は Project HTML として保存ピッカー
let currentFileHandle = null;
let currentFileFormat = null;
let currentDirectoryHandle = null;
let currentFileName = '';

function updateCurrentFileLabel() {
    const el = document.getElementById('current-file-label');
    if (!el) return;
    const name = currentFileName || (typeof t === 'function' ? t('file.unsaved') : '未保存');
    el.textContent = name;
    el.title = currentFileFormat ? `${name} (${currentFileFormat.toUpperCase()})` : name;
}

function setCurrentFileName(name, format) {
    currentFileName = name || '';
    if (format !== undefined) currentFileFormat = format || null;
    updateCurrentFileLabel();
    if (typeof updateActiveDocumentTabMeta === 'function') updateActiveDocumentTabMeta();
}

document.addEventListener('DOMContentLoaded', updateCurrentFileLabel);

function sanitizeSaveFilename(name) {
    return String(name || '').replace(/[\\/:*?"<>|]/g, '_');
}

// P2-2: project HTML/JSON 用の保存ファイル名を組み立てる。
// projectData が渡されればそこから title/episode/cut を引く。無ければ現在の metaData。
// ext: 'html' | 'wtproj.json' など (先頭の '.' は不要)
function buildProjectSaveFilename(projectData, ext) {
    const template = (typeof settings !== 'undefined' && settings.preview && settings.preview.projectFilenameTemplate)
        ? settings.preview.projectFilenameTemplate
        : '%title_%episode_%cut_ts';
    const useExt = String(ext || 'html').replace(/^\./, '');
    let md = null;
    if (projectData && projectData.documents && projectData.documents[0]
        && projectData.documents[0].sheets && projectData.documents[0].sheets[0]
        && projectData.documents[0].sheets[0].metaData) {
        md = projectData.documents[0].sheets[0].metaData;
    } else if (typeof metaData !== 'undefined') {
        md = metaData;
    } else {
        md = {};
    }
    const displayName = (projectData && projectData.meta && projectData.meta.displayName) || '';
    let baseName = template
        .replace(/%title/g, md.title || displayName || 'project')
        .replace(/%episode/g, md.subTitle || '')
        .replace(/%scene/g, md.scene || '')
        .replace(/%cut/g, md.cut || '')
        .replace(/%sheet/g, md.sheetName || '');
    baseName = baseName.replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    baseName = sanitizeSaveFilename(baseName || 'project');
    return `${baseName}.${useExt}`;
}

function buildTimesheetSaveFilename(formatKey) {
    const ext = String(formatKey || 'tdts').replace(/^\./, '').toLowerCase();
    const template = (typeof settings !== 'undefined' && settings.preview && settings.preview.saveFilenameTemplate)
        ? settings.preview.saveFilenameTemplate
        : '%title_%scene_%cut';
    let baseName = template
        .replace(/%title/g, metaData.title || 'timesheet')
        .replace(/%episode/g, metaData.subTitle || '')
        .replace(/%scene/g, metaData.scene || '')
        .replace(/%cut/g, metaData.cut || '001')
        .replace(/%sheet/g, metaData.sheetName || 'sheet1')
        .replace(/%format/g, ext);
    baseName = baseName.replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    baseName = sanitizeSaveFilename(baseName || 'timesheet');
    return `${baseName}.${ext}`;
}

// 既存ハンドルへ silent 書き込み（上書き保存）
async function silentSaveToHandle(handle, fileContent) {
    let perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return false;
    const writable = await handle.createWritable();
    await writable.write(fileContent);
    await writable.close();
    return true;
}

// 保存処理共通ヘルパー
// opts: { saveAs: boolean }
//   saveAs=false (デフォルト) - currentFileHandle があればサイレント書き込み、なければピッカー
//   saveAs=true              - 必ずピッカーを出す
async function saveFileWithPicker(formatKey, suggestedName, fileContent, accept, opts) {
    opts = opts || {};
    const saveAs = opts.saveAs === true;

    // 上書き保存: 同じフォーマットで currentFileHandle があればサイレント書き込み
    if (!saveAs && currentFileHandle && currentFileFormat === formatKey) {
        try {
            const ok = await silentSaveToHandle(currentFileHandle, fileContent);
            if (ok) {
                setCurrentFileName(currentFileHandle.name || currentFileName || suggestedName, formatKey);
                return currentFileHandle;
            }
        } catch (e) { /* fallthrough to picker */ }
    }

    if (window.showSaveFilePicker) {
        const pickerOpts = { suggestedName, types: [{ description: accept.description, accept: accept.types }] };
        // 現在開いているファイルのディレクトリを優先、なければ前回ハンドル参照
        let startInHandle = null;
        if (currentDirectoryHandle) {
            try {
                let perm = await currentDirectoryHandle.queryPermission({ mode: 'readwrite' });
                if (perm !== 'granted') perm = await currentDirectoryHandle.requestPermission({ mode: 'readwrite' });
                if (perm === 'granted') startInHandle = currentDirectoryHandle;
            } catch (e) {}
        }
        if (!startInHandle) {
            const lastHandle = await getLastFileHandle(formatKey);
            if (lastHandle) {
                try {
                    let perm = await lastHandle.queryPermission({ mode: 'readwrite' });
                    if (perm !== 'granted') perm = await lastHandle.requestPermission({ mode: 'readwrite' });
                    if (perm === 'granted') startInHandle = lastHandle;
                } catch (e) {}
            }
        }
        if (startInHandle) pickerOpts.startIn = startInHandle;
        const handle = await window.showSaveFilePicker(pickerOpts);
        const writable = await handle.createWritable();
        await writable.write(fileContent);
        await writable.close();
        await saveLastFileHandle(formatKey, handle);
        currentFileHandle = handle;
        currentFileFormat = formatKey;
        setCurrentFileName(handle.name || suggestedName, formatKey);
        return handle;
    } else {
        // フォールバック: a タグダウンロード（同名ファイル上書きはOSダウンロード設定に従う）
        const blob = new Blob([fileContent], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = suggestedName; a.click();
        URL.revokeObjectURL(url);
        setCurrentFileName(suggestedName, formatKey);
        return null;
    }
}

// ----- フィールド選択ダイアログを開き、ユーザー選択を Promise で返す -----

let _ioModalResolve = null;

function openIOModal(opts) {
    // opts: { title, mode: 'import'|'export', format: 'tdts'|'xdts', source?: 'file'|'folder', warning?: string }
    // 毎回フォーマットをリセット (前回のモーダル状態が残らないように)
    window._ioModalFormat = opts.format;
    const modal = document.getElementById('io-modal');
    document.getElementById('io-modal-title').innerText = opts.title;
    const warnEl = document.getElementById('io-modal-warn');
    if (opts.warning) { warnEl.innerText = opts.warning; warnEl.style.display = 'block'; }
    else warnEl.style.display = 'none';
    const noteEl = document.getElementById('io-modal-note');
    const noteKey = opts.mode === 'import'
        ? (opts.source === 'folder' ? 'io.note.importFolder' : 'io.note.importFile')
        : (opts.format === 'xdts' ? 'io.note.exportXdts' : 'io.note.exportTdts');
    if (noteEl) noteEl.innerText = (typeof t === 'function') ? t(noteKey) : '';
    const mergeHint = document.getElementById('io-merge-hint');
    if (mergeHint) mergeHint.innerText = (typeof t === 'function') ? t('io.merge.hint') : '';

    // XDTS用UI表示
    document.getElementById('io-xdts-mapping').style.display =
        (opts.format === 'xdts' && opts.mode === 'import') ? 'flex' : 'none';
    document.getElementById('io-xdts-export').style.display =
        (opts.format === 'xdts' && opts.mode === 'export') ? 'flex' : 'none';
    // XDTSインポート時: カット番号入力欄
    const xdtsCutEl = document.getElementById('io-xdts-cut');
    const xdtsCutInput = document.getElementById('io-xdts-cut-input');
    if (xdtsCutEl && xdtsCutInput) {
        if (opts.format === 'xdts' && opts.mode === 'import') {
            xdtsCutEl.style.display = 'flex';
            xdtsCutInput.value = opts.defaultCut || '';
        } else {
            xdtsCutEl.style.display = 'none';
        }
    }
    // インポート時のみマージモード表示
    document.getElementById('io-merge-mode').style.display =
        (opts.mode === 'import') ? 'flex' : 'none';

    // チェックボックス初期値: モード/フォーマットに応じて
    document.querySelectorAll('#io-modal input[type=checkbox][data-io]').forEach(cb => {
        cb.checked = true;
        cb.disabled = false;
    });
    // XDTS 専用の項目制限
    if (opts.format === 'xdts') {
        // ストロボ自動マージ: 無効
        const strobo = document.querySelector('#io-modal input[type=checkbox][data-io="stroboMerge"]');
        if (strobo) { strobo.checked = false; strobo.disabled = true; }
        // BOOK: XDTS には含まれない
        const book = document.querySelector('#io-modal input[type=checkbox][data-io="book"]');
        if (book) { book.checked = false; book.disabled = true; }
        // DIRECTION: XDTS には含まれない（memoとして限定的）
        const direction = document.querySelector('#io-modal input[type=checkbox][data-io="direction"]');
        if (direction) { direction.checked = false; direction.disabled = true; }
        // インポート時: ACTION/CELLチェックは「取込先」オプションに連動
        if (opts.mode === 'import') {
            // デフォルトは「ACTIONのみ」(現場で原画番号をACTIONに取り込むケースを想定)
            const actionOnly = document.querySelector('input[name="xdtsCellTarget"][value="action"]');
            if (actionOnly) actionOnly.checked = true;
            // ACTION/CELLチェックボックスは取込先選択UIで代替するため非表示
            const actionCb = document.querySelector('#io-modal input[type=checkbox][data-io="action"]');
            const cellCb = document.querySelector('#io-modal input[type=checkbox][data-io="cell"]');
            if (actionCb) actionCb.closest('label').style.display = 'none';
            if (cellCb) cellCb.closest('label').style.display = 'none';
            // XDTS時は meta チェックを merge モードに連動 (見た目と実処理を一致させる)
            // リスナはモジュール初期化時に一度だけ付ける (下部参照)
            syncMetaCheckboxToMergeMode();
        }
    } else {
        // TDTS時はACTION/CELLチェックボックスを表示
        const actionCb = document.querySelector('#io-modal input[type=checkbox][data-io="action"]');
        const cellCb = document.querySelector('#io-modal input[type=checkbox][data-io="cell"]');
        if (actionCb) actionCb.closest('label').style.display = '';
        if (cellCb) cellCb.closest('label').style.display = '';
    }
    // XDTS にはACTION欄が無いので、エクスポート時はACTIONチェックを目立たせる注意のみ。インポート時はACTION/CELLの選択は別UI
    modal.style.display = 'flex';
    return new Promise(resolve => { _ioModalResolve = resolve; });
}

function closeIOModal(result) {
    document.getElementById('io-modal').style.display = 'none';
    if (_ioModalResolve) { _ioModalResolve(result); _ioModalResolve = null; }
}

function readIOOptions() {
    const checks = {};
    document.querySelectorAll('#io-modal input[type=checkbox][data-io]').forEach(cb => {
        checks[cb.dataset.io] = cb.checked;
    });
    const xdtsCellTarget = (document.querySelector('input[name="xdtsCellTarget"]:checked') || {}).value || 'both';
    const xdtsExportSource = (document.querySelector('input[name="xdtsExportSource"]:checked') || {}).value || 'action';
    const merge = (document.querySelector('input[name="ioMerge"]:checked') || {}).value || 'new';
    const xdtsCutInput = document.getElementById('io-xdts-cut-input');
    const xdtsCut = xdtsCutInput ? xdtsCutInput.value.trim() : '';
    return { checks, xdtsCellTarget, xdtsExportSource, merge, xdtsCut };
}

// XDTS インポート時: merge モードに応じて meta チェック表示を連動 (実処理と一致させる)
function syncMetaCheckboxToMergeMode() {
    if (window._ioModalFormat !== 'xdts') return;
    const metaCb = document.querySelector('#io-modal input[type=checkbox][data-io="meta"]');
    if (!metaCb) return;
    const merge = (document.querySelector('input[name="ioMerge"]:checked') || {}).value || 'new';
    if (merge === 'new') {
        metaCb.disabled = false;
        metaCb.checked = true;
    } else {
        metaCb.checked = false;
        metaCb.disabled = true;
    }
}
// 初期化時に1回だけリスナ登録 (モーダル開閉ごとに重複登録されない)
document.querySelectorAll('input[name="ioMerge"]').forEach(r => {
    r.addEventListener('change', syncMetaCheckboxToMergeMode);
});

document.getElementById('io-modal-ok').addEventListener('click', () => {
    closeIOModal(readIOOptions());
});
document.getElementById('io-modal-cancel').addEventListener('click', () => closeIOModal(null));
document.getElementById('io-modal').addEventListener('click', (e) => {
    if (e.target.id === 'io-modal') closeIOModal(null);
});

// 全て選択 / 解除トグル
document.getElementById('io-toggle-all').addEventListener('click', () => {
    const cbs = Array.from(document.querySelectorAll('#io-modal input[type=checkbox][data-io]:not(:disabled)'));
    const allChecked = cbs.every(cb => cb.checked);
    cbs.forEach(cb => { cb.checked = !allChecked; });
});

// === ファイル形式判定（プレフィックスで） ===
function detectFileFormat(text) {
    if (text.startsWith("toeiDigitalTimeSheet Save Data")) return 'tdts';
    if (text.startsWith("exchangeDigitalTimeSheet Save Data")) return 'xdts';
    return null;
}

// === フィールド選択結果を踏まえて取り込みデータを既存に反映する ===
// raw: importer が生成した中間データ
// checks: { meta, direction, action, sound, cell, camera, book, stroboMerge }
// mode: 'new' | 'overwrite'
//   new      = 新規タイムシートとして開く（全リセット → チェック項目を取込）
//   overwrite = チェックした項目だけ既存データを破棄 → 取込で差し替え（その他は維持）
// sheetName 重複時の自動採番ヘルパー (sheet2, sheet3, ...)
function makeUniqueSheetName(rawName) {
    const existingNames = (typeof sheets !== 'undefined' && Array.isArray(sheets)) ? sheets.map(s => s.name) : [];
    const candidate = String(rawName || '').trim();
    if (candidate && !existingNames.includes(candidate)) return candidate;
    let n = (existingNames.length || 0) + 1;
    while (existingNames.includes(`sheet${n}`)) n++;
    return `sheet${n}`;
}

function applyImportData(raw, checks, mode, extraOpts) {
    extraOpts = extraOpts || {};
    const fieldFlags = { ACTION: checks.action, SOUND: checks.sound, CELL: checks.cell, CAMERA: checks.camera };

    // 複数シートが含まれており「新規」なら、シート配列ごと差し替え
    if (mode === 'new' && raw.sheets && raw.sheets.length > 1 && typeof loadAllSheetsData === 'function') {
        const sheetArr = raw.sheets.map(rs => {
            const meta = rs.meta || {};
            const md = { title: meta.title || "", subTitle: meta.subTitle || "", scene: meta.scene || "", cut: meta.cut || "", sharedCuts: Array.isArray(meta.sharedCuts) ? meta.sharedCuts : [], lengthSec: meta.lengthSec || "6", lengthFrame: meta.lengthFrame || "00", creator: meta.creator || "", sheetName: rs.name || meta.sheetName || "sheet1", page: "1/1", memo: rs.direction || "", customFields: (meta.customFields && typeof meta.customFields === 'object') ? Object.assign({}, meta.customFields) : {} };
            // フィールドフィルタ反映
            const cells = {};
            if (rs.cellData) {
                for (const k in rs.cellData) {
                    const colType = k.split('-')[0];
                    if (!fieldFlags[colType]) continue;
                    cells[k] = rs.cellData[k];
                }
            }
            const books = { ACTION: {}, SOUND: {}, CELL: {}, CAMERA: {} };
            if (checks.book && rs.booksData) {
                for (const t in rs.booksData) if (fieldFlags[t]) books[t] = rs.booksData[t];
            }
            const sheetSections = rs.sectionsMeta || JSON.parse(JSON.stringify(sections));
            ensureMinimumSectionCols(sheetSections);
            return {
                name: rs.name || md.sheetName,
                color: rs.color || 0,
                isSharedCut: !!rs.isSharedCut,
                metaData: md,
                cellData: cells,
                booksData: books,
                customRepeats: rs.customRepeats || [],
                dialogueBlocks: checks.sound ? (rs.dialogueBlocks || []) : [],
                cameraBlocks: checks.camera ? (rs.cameraBlocks || []) : [],
                handwritingPages: {},
                sections: sheetSections
            };
        });
        if (typeof resetHandwritingData === 'function') resetHandwritingData();
        loadAllSheetsData(sheetArr, 0);
        if (checks.sound && typeof window.normalizeAllDialogueBlockCells === 'function') window.normalizeAllDialogueBlockCells();
        if (checks.camera && typeof window.normalizeAllCameraBlockCells === 'function') window.normalizeAllCameraBlockCells();
        if (typeof saveCurrentSheetData === 'function') saveCurrentSheetData();
        return;
    }

    if (mode === 'addSharedCut') {
        // 兼用カットとして追加: 現在のシートを保持しつつ新カットを追加
        // カット番号: XDTS入力欄/raw.meta.cut から取得
        const newCut = String(raw.meta?.cut || '').trim() || 'cut' + (sheets.length + 1);
        // シート名: XDTS の sheetName を優先、無ければ自動採番 (カット番号とは独立)
        const newSheetName = makeUniqueSheetName(raw.meta?.sheetName);
        const currentCut = String(metaData?.cut || '').trim() || 'cut1';

        // 現在のシートを先に保存（重要: raw適用前に行う）
        if (typeof sheets !== 'undefined' && typeof captureCurrentSheet === 'function') {
            sheets[currentSheetIndex] = captureCurrentSheet();
        }

        // 共有カットリスト作成
        const cuts = [currentCut];
        if (!cuts.includes(newCut)) cuts.push(newCut);

        // 既存シートにsharedCutsのみを設定（他のmetaDataは変更しない）
        if (typeof sheets !== 'undefined') {
            sheets.forEach(sheet => {
                sheet.metaData.sharedCuts = cuts;
            });
        }

        // 新しいシートのメタデータ作成（既存シートの共有項目を継承）
        const baseMeta = sheets[0]?.metaData || metaData;
        const newMeta = {
            title: baseMeta.title || "",
            subTitle: baseMeta.subTitle || "",
            scene: baseMeta.scene || "",
            cut: newCut,  // カット番号は別管理
            sharedCuts: cuts,
            lengthSec: raw.meta?.lengthSec || baseMeta.lengthSec || "6",
            lengthFrame: raw.meta?.lengthFrame || baseMeta.lengthFrame || "00",
            creator: baseMeta.creator || "",
            sheetName: newSheetName,  // シート名は別管理（XDTS由来 or 自動採番）
            page: "1/1",
            memo: raw.direction || raw.meta?.memo || ""
        };
        const newCells = {};
        if (raw.cellData) {
            for (const k in raw.cellData) {
                const colType = k.split('-')[0];
                if (!fieldFlags[colType]) continue;
                newCells[k] = raw.cellData[k];
            }
        }
        const newBooks = { ACTION: {}, SOUND: {}, CELL: {}, CAMERA: {} };
        if (checks.book && raw.booksData) {
            for (const t in raw.booksData) if (fieldFlags[t]) newBooks[t] = raw.booksData[t];
        }
        const newSections = raw.sectionsMeta || JSON.parse(JSON.stringify(sections));
        ensureMinimumSectionCols(newSections);
        const newSheet = {
            name: newSheetName,  // タブ名はシート名（カット番号と分離）
            color: 0,
            isSharedCut: true,
            metaData: newMeta,
            cellData: newCells,
            booksData: newBooks,
            customRepeats: raw.customRepeats || [],
            dialogueBlocks: checks.sound ? (raw.dialogueBlocks || []) : [],
            cameraBlocks: checks.camera ? (raw.cameraBlocks || []) : [],
            handwritingPages: {},
            sections: newSections
        };

        if (typeof sheets !== 'undefined') {
            sheets.push(newSheet);
            // 新しいシートに切り替え
            currentSheetIndex = sheets.length - 1;
            if (typeof applySheetToGlobal === 'function') applySheetToGlobal(newSheet);
        }

        if (checks.sound && typeof window.normalizeAllDialogueBlockCells === 'function') window.normalizeAllDialogueBlockCells();
        if (checks.camera && typeof window.normalizeAllCameraBlockCells === 'function') window.normalizeAllCameraBlockCells();
        if (typeof updateSectionPositions === 'function') updateSectionPositions();
        if (typeof drawAll === 'function') drawAll();
        if (typeof markDirty === 'function') markDirty();
        return;
    }

    if (mode === 'newSheet') {
        // 現ドキュメントに新しいシートとして追加 (既存シート保持)
        // ヘッダー情報は既存シート(共通)を継承、カット尺とタイムラインはXDTS側から取込
        if (typeof sheets !== 'undefined' && typeof captureCurrentSheet === 'function') {
            sheets[currentSheetIndex] = captureCurrentSheet();
        }
        const newSheetName = makeUniqueSheetName(raw.meta?.sheetName);
        const baseMeta = (typeof sheets !== 'undefined' && sheets[0]?.metaData) || metaData;
        const newMeta = {
            title: baseMeta.title || "",
            subTitle: baseMeta.subTitle || "",
            scene: baseMeta.scene || "",
            cut: baseMeta.cut || "",
            sharedCuts: Array.isArray(baseMeta.sharedCuts) ? baseMeta.sharedCuts.slice() : [],
            // カット尺は読み込んだXDTSから (常に取込)
            lengthSec: raw.meta?.lengthSec || baseMeta.lengthSec || "6",
            lengthFrame: raw.meta?.lengthFrame || baseMeta.lengthFrame || "00",
            creator: baseMeta.creator || "",
            sheetName: newSheetName,
            page: "1/1",
            memo: "",
            customFields: {}
        };
        const newCells = {};
        if (raw.cellData) {
            for (const k in raw.cellData) {
                const colType = k.split('-')[0];
                if (!fieldFlags[colType]) continue;
                newCells[k] = raw.cellData[k];
            }
        }
        const newBooks = { ACTION: {}, SOUND: {}, CELL: {}, CAMERA: {} };
        const newSections = raw.sectionsMeta || JSON.parse(JSON.stringify(sections));
        ensureMinimumSectionCols(newSections);
        const newSheet = {
            name: newSheetName,
            color: 0,
            isSharedCut: false,
            metaData: newMeta,
            cellData: newCells,
            booksData: newBooks,
            customRepeats: raw.customRepeats || [],
            dialogueBlocks: checks.sound ? (raw.dialogueBlocks || []) : [],
            cameraBlocks: checks.camera ? (raw.cameraBlocks || []) : [],
            handwritingPages: {},
            sections: newSections
        };
        if (typeof sheets !== 'undefined') {
            sheets.push(newSheet);
            currentSheetIndex = sheets.length - 1;
            if (typeof applySheetToGlobal === 'function') applySheetToGlobal(newSheet);
        }
        if (checks.sound && typeof window.normalizeAllDialogueBlockCells === 'function') window.normalizeAllDialogueBlockCells();
        if (checks.camera && typeof window.normalizeAllCameraBlockCells === 'function') window.normalizeAllCameraBlockCells();
        if (typeof updateSectionPositions === 'function') updateSectionPositions();
        if (typeof drawAll === 'function') drawAll();
        if (typeof markDirty === 'function') markDirty();
        return;
    }

    if (mode === 'new') {
        // 全リセット
        cellData = {};
        booksData = { "ACTION": {}, "SOUND": {}, "CELL": {}, "CAMERA": {} };
        customRepeats = [];
        dialogueBlocks = [];
        cameraBlocks = [];
        metaData = { title: "", subTitle: "", scene: "", cut: "", sharedCuts: [], lengthSec: "6", lengthFrame: "00", creator: "", sheetName: "sheet1", page: "1/1", memo: "", customFields: {} };
        if (raw.sectionsMeta) {
            sections = raw.sectionsMeta;
            ensureMinimumSectionCols(sections);
        }
        if (typeof resetHandwritingData === 'function') resetHandwritingData();
        if (typeof initSheets === 'function') initSheets();
    } else if (mode === 'overwrite') {
        // overwrite: チェック項目だけ既存をクリア
        if (checks.meta || checks.direction) {
            // メタは個別フィールド単位で上書き（部分上書き）
        }
        // 該当 colType のセルデータをクリア
        for (const k in cellData) {
            const colType = k.split('-')[0];
            if (fieldFlags[colType]) delete cellData[k];
        }
        // BOOK
        if (checks.book) {
            for (const t in booksData) {
                if (fieldFlags[t]) booksData[t] = {};
            }
        }
        // ブロック
        if (checks.sound) dialogueBlocks = [];
        if (checks.camera) cameraBlocks = [];
        // customRepeats は該当 colType だけ残す
        customRepeats = customRepeats.filter(r => !fieldFlags[r.colType]);

        // 該当チェック項目のセクション情報も取込で更新したい場合に対応
        if (raw.sectionsMeta) {
            ['ACTION', 'SOUND', 'CELL', 'CAMERA'].forEach(t => {
                if (!fieldFlags[t]) return;
                const newSec = raw.sectionsMeta.find(s => s.type === t);
                const curSec = sections.find(s => s.type === t);
                if (newSec && curSec) { curSec.cols = newSec.cols; curSec.chars = newSec.chars; }
            });
        }
    }

    // メタ情報の取込（new と overwrite 共通）
    if (checks.meta && raw.meta) Object.assign(metaData, raw.meta);
    if (checks.direction && raw.direction !== undefined) metaData.memo = raw.direction;
    // カット尺は forceLength 指定時、meta チェックに関わらず必ず取込 (XDTS用)
    if (extraOpts.forceLength && raw.meta) {
        if (raw.meta.lengthSec !== undefined && raw.meta.lengthSec !== '') metaData.lengthSec = raw.meta.lengthSec;
        if (raw.meta.lengthFrame !== undefined && raw.meta.lengthFrame !== '') metaData.lengthFrame = raw.meta.lengthFrame;
    }

    // セルデータ取込
    if (raw.cellData) {
        for (const k in raw.cellData) {
            const colType = k.split('-')[0];
            if (!fieldFlags[colType]) continue;
            cellData[k] = raw.cellData[k];
        }
    }

    // BOOK 取込
    if (checks.book && raw.booksData) {
        for (const t in raw.booksData) {
            if (!fieldFlags[t]) continue;
            booksData[t] = raw.booksData[t];
        }
    }

    // ブロック取込（new/overwrite どちらも、該当配列はすでに空）
    if (checks.sound && raw.dialogueBlocks) dialogueBlocks = dialogueBlocks.concat(raw.dialogueBlocks);
    if (checks.camera && raw.cameraBlocks) cameraBlocks = cameraBlocks.concat(raw.cameraBlocks);
    if (raw.customRepeats && raw.customRepeats.length) customRepeats = customRepeats.concat(raw.customRepeats);
    if (checks.sound && typeof window.normalizeAllDialogueBlockCells === 'function') window.normalizeAllDialogueBlockCells();
    if (checks.camera && typeof window.normalizeAllCameraBlockCells === 'function') window.normalizeAllCameraBlockCells();

    // TDTS手書きメモを手書きレイヤーに統合
    if (extraOpts.importTdtsMemos !== false && ((raw.memos && raw.memos.length) || raw.headerMemo)) {
        applyTdtsMemosToHandwriting(raw.memos || [], raw.headerMemo);
        if (typeof showToast === 'function') {
            showToast('TDTSの手書きメモを取り込みました。位置がずれている場合があります。', 5000);
        }
    }
}

// TDTS手書きメモ（cell-level + header-level）を手書きレイヤーに変換
function applyTdtsMemosToHandwriting(memos, headerMemo) {
    if (typeof TEMPLATE === 'undefined' || typeof HANDWRITING_BASE_DPI === 'undefined') return;
    const pxPerMm = HANDWRITING_BASE_DPI / 25.4;
    const canvasW = Math.round(TEMPLATE.WIDTH_MM * pxPerMm);
    const rowHpx = TEMPLATE.ROW_HEIGHT * pxPerMm;
    const colHeaderHpx = TEMPLATE.COL_HEADER_HEIGHT * pxPerMm;
    const marginTopPx = (TEMPLATE.MARGIN_TOP || 10) * pxPerMm;
    const gridTopPx = marginTopPx + colHeaderHpx;
    const FRAMES_PER_PAGE = TEMPLATE.FRAMES_PER_COL;

    const splitter = (typeof window !== 'undefined') ? window.splitImageToHandwritingObjects : null;

    // セルメモ
    memos.forEach((memo, i) => {
        const pageIdx = Math.floor(memo.frame / FRAMES_PER_PAGE);
        const frameInPage = memo.frame % FRAMES_PER_PAGE;
        const key = `page-${pageIdx}`;
        if (!handwritingPages[key]) handwritingPages[key] = { strokes: [], images: [] };
        const dataUrl = `data:image/png;base64,${memo.imageData}`;
        const cellY = gridTopPx + frameInPage * rowHpx + (memo.offsetY || 0);
        const cellX = (memo.offsetX || 0);
        if (splitter) {
            splitter(dataUrl, { baseX: cellX, baseY: cellY, idPrefix: `tdts-memo-${i}` }).then(objs => {
                objs.forEach(o => handwritingPages[key].images.push(o));
                if (typeof renderHandwritingLayer === 'function') renderHandwritingLayer();
                if (typeof refreshHandwritingImageList === 'function') refreshHandwritingImageList();
            }).catch(() => {});
        } else {
            const tmpImg = new Image();
            tmpImg.onload = () => {
                handwritingPages[key].images.push({
                    id: `tdts-memo-${Date.now()}-${i}`,
                    dataUrl, x: cellX, y: cellY, w: tmpImg.width, h: tmpImg.height
                });
                if (typeof renderHandwritingLayer === 'function') renderHandwritingLayer();
                if (typeof refreshHandwritingImageList === 'function') refreshHandwritingImageList();
            };
            tmpImg.src = dataUrl;
        }
    });

    // ヘッダーメモ（Direction欄相当、ページ1の上部）
    if (headerMemo && headerMemo.imageData) {
        const key = 'page-0';
        if (!handwritingPages[key]) handwritingPages[key] = { strokes: [], images: [] };
        const dataUrl = `data:image/png;base64,${headerMemo.imageData}`;
        if (splitter) {
            splitter(dataUrl, { baseX: marginTopPx, baseY: marginTopPx, idPrefix: 'tdts-headermemo' }).then(objs => {
                objs.forEach(o => handwritingPages[key].images.push(o));
                if (typeof renderHandwritingLayer === 'function') renderHandwritingLayer();
                if (typeof refreshHandwritingImageList === 'function') refreshHandwritingImageList();
            }).catch(() => {});
        } else {
            const tmpImg = new Image();
            tmpImg.onload = () => {
                handwritingPages[key].images.push({
                    id: `tdts-headermemo-${Date.now()}`,
                    dataUrl, x: marginTopPx, y: marginTopPx, w: tmpImg.width, h: tmpImg.height
                });
                if (typeof renderHandwritingLayer === 'function') renderHandwritingLayer();
                if (typeof refreshHandwritingImageList === 'function') refreshHandwritingImageList();
            };
            tmpImg.src = dataUrl;
        }
    }
}

// === ドラッグ&ドロップ対応 ===
(function initDragAndDrop() {
    let dragOverlay = null;

    function createDragOverlay() {
        if (dragOverlay) return dragOverlay;
        dragOverlay = document.createElement('div');
        dragOverlay.id = 'drag-overlay';
        dragOverlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(33, 150, 243, 0.15);
            border: 4px dashed #2196f3;
            z-index: 99999;
            display: none;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            color: #2196f3;
            pointer-events: none;
        `;
        dragOverlay.innerHTML = '<div style="background:#fff;padding:20px 40px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);">ファイルをドロップして読み込み</div>';
        document.body.appendChild(dragOverlay);
        return dragOverlay;
    }

    function showDragOverlay() {
        createDragOverlay();
        dragOverlay.style.display = 'flex';
    }

    function hideDragOverlay() {
        if (dragOverlay) dragOverlay.style.display = 'none';
    }

    function isValidFile(file) {
        const name = file.name.toLowerCase();
        return name.endsWith('.tdts') || name.endsWith('.xdts') || name.endsWith('.json')
            || name.endsWith('.html') || name.endsWith('.htm');
    }

    function isImageFile(file) {
        if (file.type && file.type.startsWith('image/')) return true;
        // TGA は MIME が付かないことがあるので拡張子でも判定
        const n = (file.name || '').toLowerCase();
        return n.endsWith('.tga');
    }

    async function handleDroppedFile(file) {
        // 既に同名ファイルが開かれていないかチェック
        if (typeof documentTabs !== 'undefined' && Array.isArray(documentTabs)) {
            const alreadyOpen = documentTabs.find(tab => tab.fileName === file.name);
            if (alreadyOpen) {
                alert(`「${file.name}」は既に開かれています。`);
                if (typeof activateDocumentTab === 'function') activateDocumentTab(alreadyOpen.id);
                return;
            }
        }
        const text = await file.text();
        // P1-e: プロジェクトHTML / プロジェクトJSON を先に short-circuit
        const lowerName = (file.name || '').toLowerCase();
        const isHtml = lowerName.endsWith('.html') || lowerName.endsWith('.htm');
        const looksProj = (window.projectHtml && (window.projectHtml.looksLikeProjectHTML(text) || window.projectHtml.looksLikeProjectJSON(text)));
        if (isHtml || looksProj) {
            if (typeof isDirty !== 'undefined' && isDirty) {
                if (!confirm('未保存の変更があります。破棄してプロジェクトを読み込みますか？')) return;
            }
            const r = await window.projectHtml.loadFromTextAuto(text, file.name);
            if (!r.ok) { alert('プロジェクト読み込み失敗: ' + (r.error || '')); return; }
            if (r.warnings && r.warnings.length) console.warn('[projectHtml] warnings:', r.warnings);
            if (typeof showToast === 'function') showToast(`${file.name} を読み込みました`);
            return;
        }
        const fmt = typeof detectFileFormat === 'function' ? detectFileFormat(text) : null;
        if (!fmt) {
            alert('対応していないファイル形式です。');
            return;
        }

        const defaultCut = (fmt === 'xdts' && typeof extractXdtsCut === 'function') ? extractXdtsCut(text) : '';
        const opts = await openIOModal({
            title: `インポート: ${file.name}`,
            mode: 'import',
            format: fmt,
            source: 'file',
            defaultCut
        });
        if (!opts) return;

        let raw;
        if (fmt === 'tdts') {
            raw = typeof parseTDTSToRaw === 'function' ? parseTDTSToRaw(text, { stroboMerge: opts.checks.stroboMerge }) : null;
        } else {
            raw = typeof parseXDTSToRaw === 'function' ? parseXDTSToRaw(text, { cellTarget: opts.xdtsCellTarget }) : null;
            if (raw) {
                opts.checks.action = (opts.xdtsCellTarget === 'both' || opts.xdtsCellTarget === 'action');
                opts.checks.cell = (opts.xdtsCellTarget === 'both' || opts.xdtsCellTarget === 'cell');
                if (opts.xdtsCut && raw.meta) raw.meta.cut = opts.xdtsCut;
                // XDTS整理ルール:
                // - 完全新規(new)以外ではヘッダー(meta)を勝手に上書きしない
                // - カット尺(lengthSec/lengthFrame)はモードによらず常に取込 (applyImportDataのforceLength)
                if (opts.merge !== 'new') {
                    opts.checks.meta = false;
                }
                opts._forceLength = true;
            }
        }

        if (!raw) {
            alert('ファイルを読み込めませんでした。');
            return;
        }

        if (opts.merge === 'new' && typeof createDocumentTabForIncomingDocument === 'function') {
            createDocumentTabForIncomingDocument(file.name, fmt, null, null);
        } else if (typeof pushHistory === 'function') {
            pushHistory();
        }

        if (fmt === 'tdts' && ((raw.memos && raw.memos.length) || raw.headerMemo)) {
            const msg = (typeof t === 'function')
                ? t('confirm.importTdtsMemos')
                : 'このTDTSには本家TDTSの手描きメモが含まれています。手書きレイヤーとして読み込みますか？';
            opts._importTdtsMemos = confirm(msg);
        }

        applyImportData(raw, opts.checks, opts.merge, { forceLength: opts._forceLength, importTdtsMemos: opts._importTdtsMemos });
        // 完全新規(new)のときだけ現在ファイル名/ハンドルを切替。それ以外は既存ドキュメント名を維持。
        if (opts.merge === 'new') {
            currentFileHandle = null;
            currentDirectoryHandle = null;
            if (typeof setCurrentFileName === 'function') setCurrentFileName(file.name, fmt);
            if (typeof syncActiveDocumentTabAfterLoad === 'function') syncActiveDocumentTabAfterLoad(file.name, fmt, null, null);
            if (typeof markClean === 'function') markClean();
        } else {
            // 既存ドキュメントへの追加/変更なので未保存扱い
            if (typeof markDirty === 'function') markDirty();
        }

        redoStack = [];
        selectionStart = null; selectionEnd = null; selectedMeta = null;
        if (typeof updateSectionPositions === 'function') updateSectionPositions();
        if (typeof drawAll === 'function') drawAll();
        if (currentMode === 'preview' && typeof updateTemplatePreview === 'function') updateTemplatePreview();

        if (raw._hasHandwriting) {
            if (typeof promptImportHandwritingBundleForFile === 'function') {
                await promptImportHandwritingBundleForFile(file.name);
                if (typeof drawAll === 'function') drawAll();
                if (currentMode === 'preview' && typeof updateTemplatePreview === 'function') updateTemplatePreview();
            }
            showToast('このファイルには手書きデータがあります。「フォルダから開く」で自動読み込みできます。', 5000);
        } else {
            showToast(`${file.name} を読み込みました`);
        }
    }

    // 画像 File → dataURL (TGA は PNG dataURL に変換)
    async function imageFileToDataUrl(file) {
        if (typeof window.tgaIo !== 'undefined' && window.tgaIo.isTgaFile && window.tgaIo.isTgaFile(file)) {
            const r = await window.tgaIo.tgaFileToPngData(file);
            return r.dataUrl;
        }
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async function handleDroppedImage(file) {
        if (typeof currentMode === 'undefined' || currentMode !== 'preview') {
            showToast('画像は プレビューモード でドロップしてください');
            return;
        }
        if (typeof getHandwritingPage !== 'function' || typeof renderHandwritingLayer !== 'function') {
            showToast('手書きレイヤーが利用できません');
            return;
        }
        let dataUrl;
        try { dataUrl = await imageFileToDataUrl(file); }
        catch (e) { showToast('画像の読み込みに失敗しました'); return; }

        const page = getHandwritingPage();
        if (!page.images) page.images = [];
        // ドラッグ画像もファイル読込と同様にテンプレ全面 (A3 @ 150dpi) にフィット
        const fitW = (typeof TEMPLATE !== 'undefined' && typeof HANDWRITING_BASE_DPI !== 'undefined')
            ? Math.round(TEMPLATE.WIDTH_MM * HANDWRITING_BASE_DPI / 25.4)
            : (handwritingCanvas?.width || 1754);
        const fitH = (typeof TEMPLATE !== 'undefined' && typeof HANDWRITING_BASE_DPI !== 'undefined')
            ? Math.round(TEMPLATE.HEIGHT_MM * HANDWRITING_BASE_DPI / 25.4)
            : (handwritingCanvas?.height || 2480);
        let added = 0;
        if (typeof window.splitImageToHandwritingObjects === 'function') {
            const objs = await window.splitImageToHandwritingObjects(dataUrl, {
                baseX: 0, baseY: 0, fallbackW: fitW, fallbackH: fitH,
                targetW: fitW, targetH: fitH,
                idPrefix: 'drop'
            });
            objs.forEach(o => page.images.push(o));
            added = objs.length;
        } else {
            page.images.push({
                id: `drop-${Date.now()}`, dataUrl, x: 0, y: 0,
                w: fitW, h: fitH
            });
            added = 1;
        }
        renderHandwritingLayer();
        if (typeof drawHandwritingUi === 'function') drawHandwritingUi();
        if (typeof markDirty === 'function') markDirty();
        if (typeof refreshHandwritingImageList === 'function') refreshHandwritingImageList();
        showToast(added > 1 ? `画像を${added}パーツに分割して追加しました` : `画像を手書きレイヤーに追加しました`);
    }

    let dragCounter = 0;

    // ファイルドラッグかを判定（内部要素のドラッグでは types に "Files" が含まれない）
    const isFileDrag = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');

    document.addEventListener('dragenter', e => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        dragCounter++;
        if (dragCounter === 1) showDragOverlay();
    });

    document.addEventListener('dragleave', e => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) hideDragOverlay();
    });

    document.addEventListener('dragover', e => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    // 軽量選択ダイアログ。options: [{label, value}]。Promise<value|null> を返す。
    function showDropChoiceDialog(title, options) {
        return new Promise((resolve) => {
            const isDark = !!(document.body && document.body.classList.contains('dark'));
            const overlay = document.createElement('div');
            overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:100000;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;`;
            const dialog = document.createElement('div');
            dialog.style.cssText = `background:${isDark ? '#2a2a2a' : '#fff'};color:${isDark ? '#ddd' : '#222'};border:1px solid ${isDark ? '#444' : '#ccc'};border-radius:8px;padding:20px 22px;min-width:300px;max-width:460px;box-shadow:0 4px 20px rgba(0,0,0,0.3);`;
            const h = document.createElement('h3');
            h.textContent = title;
            h.style.cssText = 'margin:0 0 14px 0;font-size:15px;font-weight:600;';
            dialog.appendChild(h);
            const btnWrap = document.createElement('div');
            btnWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
            function close(val) { document.removeEventListener('keydown', onKey); if (overlay.parentNode) overlay.parentNode.removeChild(overlay); resolve(val); }
            options.forEach((opt, i) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = opt.label;
                const primary = (i === 0);
                b.style.cssText = `padding:9px 14px;border-radius:4px;cursor:pointer;font-size:13px;text-align:left;border:1px solid ${primary ? '#2469d4' : (isDark ? '#555' : '#bbb')};background:${primary ? '#2469d4' : (isDark ? '#3a3a3a' : '#fafafa')};color:${primary ? '#fff' : (isDark ? '#ddd' : '#222')};${primary ? 'font-weight:600;' : ''}`;
                b.addEventListener('click', () => close(opt.value));
                btnWrap.appendChild(b);
            });
            dialog.appendChild(btnWrap);
            overlay.appendChild(dialog);
            overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(null); });
            function onKey(ev) { if (ev.key === 'Escape') { ev.preventDefault(); close(null); } }
            document.addEventListener('keydown', onKey);
            document.body.appendChild(overlay);
        });
    }

    // ファイル名末尾の数字列をページ番号(1-based)として抽出。無効なら null。
    function inferPageNumberFromFilename(name) {
        const base = String(name || '').replace(/\.[^.]+$/, '');
        const matches = base.match(/\d+/g);
        if (!matches || matches.length === 0) return null;
        const n = parseInt(matches[matches.length - 1], 10);
        if (!isFinite(n) || n <= 0) return null; // 0 は無効
        return n;
    }

    // 一時テンプレ用: 画像File群を pageImages エントリへ変換して適用
    async function applyImagesAsTemporaryTemplate(imageFiles) {
        if (typeof window.pickTemplateImageEntry !== 'function'
            || typeof window.applyTemporaryTemplatePageEntries !== 'function') {
            showToast('一時テンプレ機能が利用できません');
            return;
        }
        const startPage = (typeof currentPage === 'number' && currentPage >= 0) ? currentPage : 0;
        let assignMode = 'sequential';
        if (imageFiles.length > 1) {
            const t2 = (typeof t === 'function') ? t : (k, fb) => fb;
            const mode = await showDropChoiceDialog(
                t2('tempDrop.assignTitle', '一時テンプレ画像をどのページに配置しますか？'),
                [
                    { label: t2('tempDrop.assignSequential', '現在ページから順番に配置'), value: 'sequential' },
                    { label: t2('tempDrop.assignFilename', 'ファイル名からページ番号を推定'), value: 'filename' },
                    { label: t2('tempDrop.cancel', 'キャンセル'), value: null }
                ]
            );
            if (!mode) return;
            assignMode = mode;
        }
        // エントリ生成 (TGA含む)
        const entries = [];
        let seqCursor = startPage;
        const usedPages = new Set();
        for (const f of imageFiles) {
            let entry;
            try { entry = await window.pickTemplateImageEntry(f); }
            catch (e) { console.warn('一時テンプレ画像変換失敗:', f.name, e); continue; }
            let pageIndex;
            if (assignMode === 'filename') {
                const num = inferPageNumberFromFilename(f.name);
                pageIndex = (num != null) ? (num - 1) : null;
            }
            if (pageIndex == null) {
                // 順番配置 (filename推定で数字なしもここで補完)。空きページへ。
                while (usedPages.has(seqCursor)) seqCursor++;
                pageIndex = seqCursor;
            }
            usedPages.add(pageIndex);
            entry.pageIndex = pageIndex;
            entries.push(entry);
        }
        if (entries.length === 0) { showToast('画像の読み込みに失敗しました'); return; }
        await window.applyTemporaryTemplatePageEntries(entries);
    }

    document.addEventListener('drop', async e => {
        e.preventDefault();
        dragCounter = 0;
        hideDragOverlay();

        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;

        // 既存ファイル形式 (TDTS/XDTS/JSON/HTML) が含まれていれば最初の1つを処理
        const dataFile = files.find(f => isValidFile(f));
        if (dataFile) {
            await handleDroppedFile(dataFile);
            return;
        }

        // 画像ファイル群 (TGA含む)
        const imageFiles = files.filter(f => isImageFile(f));
        if (imageFiles.length === 0) return;

        if (typeof currentMode === 'undefined' || currentMode !== 'preview') {
            showToast('画像は プレビューモード でドロップしてください');
            return;
        }

        const t2 = (typeof t === 'function') ? t : (k, fb) => fb;
        const use = await showDropChoiceDialog(
            t2('imageDrop.title', '画像の読み込み方法'),
            [
                { label: t2('imageDrop.handwriting', '手書き画像として追加'), value: 'handwriting' },
                { label: t2('imageDrop.tempTemplate', '一時テンプレ画像として使用'), value: 'temp' },
                { label: t2('imageDrop.cancel', 'キャンセル'), value: null }
            ]
        );
        if (!use) return;

        if (use === 'handwriting') {
            for (const f of imageFiles) {
                await handleDroppedImage(f);
            }
        } else if (use === 'temp') {
            await applyImagesAsTemporaryTemplate(imageFiles);
        }
    });
})();
