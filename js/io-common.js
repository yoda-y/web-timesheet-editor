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
            // XDTSはタイムライン中心。meta は merge モードに応じて自動切替（既定はnewなのでON）
            // newSheet/overwrite/addSharedCut に切替時は meta を OFF にする (下のリスナで連動)
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
            const md = { title: meta.title || "", subTitle: meta.subTitle || "", scene: meta.scene || "", cut: meta.cut || "", sharedCuts: Array.isArray(meta.sharedCuts) ? meta.sharedCuts : [], lengthSec: meta.lengthSec || "6", lengthFrame: meta.lengthFrame || "00", creator: meta.creator || "", sheetName: rs.name || meta.sheetName || "sheet1", page: "1/1", memo: rs.direction || "" };
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
    if ((raw.memos && raw.memos.length) || raw.headerMemo) {
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

    // セルメモ
    memos.forEach((memo, i) => {
        const pageIdx = Math.floor(memo.frame / FRAMES_PER_PAGE);
        const frameInPage = memo.frame % FRAMES_PER_PAGE;
        const key = `page-${pageIdx}`;
        if (!handwritingPages[key]) handwritingPages[key] = { strokes: [], images: [] };
        // 画像サイズ算出のため一時Imageを作成
        const dataUrl = `data:image/png;base64,${memo.imageData}`;
        const tmpImg = new Image();
        tmpImg.onload = () => {
            const cellY = gridTopPx + frameInPage * rowHpx + (memo.offsetY || 0);
            const cellX = (memo.offsetX || 0); // 列位置は近似（左端起点）
            handwritingPages[key].images.push({
                id: `tdts-memo-${Date.now()}-${i}`,
                dataUrl,
                x: cellX,
                y: cellY,
                w: tmpImg.width,
                h: tmpImg.height
            });
            if (typeof renderHandwritingLayer === 'function') renderHandwritingLayer();
        };
        tmpImg.src = dataUrl;
    });

    // ヘッダーメモ（Direction欄相当、ページ1の上部）
    if (headerMemo && headerMemo.imageData) {
        const key = 'page-0';
        if (!handwritingPages[key]) handwritingPages[key] = { strokes: [], images: [] };
        const dataUrl = `data:image/png;base64,${headerMemo.imageData}`;
        const tmpImg = new Image();
        tmpImg.onload = () => {
            handwritingPages[key].images.push({
                id: `tdts-headermemo-${Date.now()}`,
                dataUrl,
                x: marginTopPx, // 左マージンと同程度
                y: marginTopPx,
                w: tmpImg.width,
                h: tmpImg.height
            });
            if (typeof renderHandwritingLayer === 'function') renderHandwritingLayer();
        };
        tmpImg.src = dataUrl;
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
        return name.endsWith('.tdts') || name.endsWith('.xdts') || name.endsWith('.json');
    }

    function isImageFile(file) {
        return file.type.startsWith('image/');
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

        applyImportData(raw, opts.checks, opts.merge, { forceLength: opts._forceLength });
        currentFileHandle = null;
        currentDirectoryHandle = null;
        if (typeof setCurrentFileName === 'function') setCurrentFileName(file.name, fmt);
        if (typeof syncActiveDocumentTabAfterLoad === 'function') syncActiveDocumentTabAfterLoad(file.name, fmt, null, null);
        if (opts.merge === 'new' && typeof markClean === 'function') markClean();

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

    async function handleDroppedImage(file) {
        if (typeof currentMode === 'undefined' || currentMode !== 'preview') {
            showToast('画像は プレビューモード でドロップしてください');
            return;
        }
        if (typeof getHandwritingPage !== 'function' || typeof renderHandwritingLayer !== 'function') {
            showToast('手書きレイヤーが利用できません');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const page = getHandwritingPage();
            if (!page.images) page.images = [];
            page.images.push({
                id: `drop-${Date.now()}`,
                dataUrl: reader.result,
                x: 0,
                y: 0,
                w: null,
                h: null
            });
            renderHandwritingLayer();
            if (typeof drawHandwritingUi === 'function') drawHandwritingUi();
            if (typeof markDirty === 'function') markDirty();
            showToast(`画像を手書きレイヤーに追加しました`);
        };
        reader.readAsDataURL(file);
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

    document.addEventListener('drop', async e => {
        e.preventDefault();
        dragCounter = 0;
        hideDragOverlay();

        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;

        for (const file of files) {
            if (isValidFile(file)) {
                await handleDroppedFile(file);
                break; // 1ファイルのみ処理
            } else if (isImageFile(file)) {
                await handleDroppedImage(file);
            }
        }
    });
})();
