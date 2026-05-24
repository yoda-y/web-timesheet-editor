// === 自動保存 / 未保存警告 / セッション復元 ===
//
// - pushHistory が呼ばれるたびに markDirty()
// - 3秒アイドルで localStorage に自動保存
// - exportTDTS / exportXDTS 成功で markClean()
// - 未保存のままページを閉じようとすると beforeunload 警告
// - 起動時に前回セッションがあれば復元確認ダイアログ

const SESSION_KEY = 'webTSEditor.lastSession';
const AUTOSAVE_DEBOUNCE_MS = 3000;

let isDirty = false;
let autosaveTimer = null;

function updateModeStatus() {
    const el = document.getElementById('mode-status');
    if (!el) return;
    if (isDirty) {
        el.innerText = (typeof t === 'function') ? t('status.dirty') : '● 未保存';
        el.classList.add('dirty');
    } else {
        el.innerText = (typeof t === 'function') ? t('status.saved') : '保存済み';
        el.classList.remove('dirty');
    }
}

function markDirty() {
    isDirty = true;
    updateModeStatus();
    if (typeof updateActiveDocumentTabMeta === 'function') updateActiveDocumentTabMeta();
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(autoSave, AUTOSAVE_DEBOUNCE_MS);
}

function markClean() {
    isDirty = false;
    updateModeStatus();
    if (typeof updateActiveDocumentTabMeta === 'function') updateActiveDocumentTabMeta();
    if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
    clearLastSession();
}

function buildSessionSnapshot() {
    // 全シートを保存
    const allSheets = (typeof exportAllSheetsData === 'function') ? exportAllSheetsData() : null;
    const draft = getActiveInputDraft();
    const snapMetaData = JSON.parse(JSON.stringify(metaData));
    const snapCellData = JSON.parse(JSON.stringify(cellData));
    if (draft?.type === 'meta') {
        snapMetaData[draft.key] = draft.value;
    } else if (draft?.type === 'cell') {
        if (draft.value === "") delete snapCellData[draft.key];
        else snapCellData[draft.key] = draft.data;
    }
    if (allSheets && typeof currentSheetIndex !== 'undefined' && allSheets[currentSheetIndex]) {
        if (draft?.type === 'meta') {
            allSheets[currentSheetIndex].metaData[draft.key] = draft.value;
        } else if (draft?.type === 'cell') {
            if (draft.value === "") delete allSheets[currentSheetIndex].cellData[draft.key];
            else allSheets[currentSheetIndex].cellData[draft.key] = draft.data;
        }
    }
    return {
        savedAt: Date.now(),
        version: 2,
        sheets: allSheets,
        currentSheetIndex: (typeof currentSheetIndex !== 'undefined') ? currentSheetIndex : 0,
        // 互換: 単一シートとしても残す
        metaData: snapMetaData,
        cellData: snapCellData,
        booksData,
        customRepeats,
        dialogueBlocks,
        cameraBlocks,
        handwritingPages: (typeof exportHandwritingData === 'function') ? exportHandwritingData() : {},
        sections: JSON.parse(JSON.stringify(sections))
    };
}

function getActiveInputDraft() {
    if (typeof selectedMeta !== 'undefined' && selectedMeta) {
        const isMemo = selectedMeta === "memo";
        const input = isMemo ? metaTextArea : metaInput;
        if (input && input.style.display !== 'none') {
            let value = isMemo ? input.value : input.value.trim();
            if (selectedMeta === "lengthFrame") {
                let frm = parseInt(value, 10) || 0;
                value = String(frm % 24).padStart(2, '0');
            } else if (selectedMeta === "lengthSec") {
                value = (parseInt(value, 10) || 0).toString();
            }
            return { type: 'meta', key: selectedMeta, value };
        }
    }
    if (typeof selectionStart !== 'undefined' && selectionStart && typeof cellInput !== 'undefined' && cellInput.style.display !== 'none') {
        const key = `${selectionStart.colType}-${selectionStart.colIndex}-${selectionStart.frame}`;
        let value = cellInput.value.trim();
        if (value === "-") value = "―";
        if (value.toLowerCase() === "x") value = "×";
        if (value === "") return { type: 'cell', key, value: "", data: null };
        const oldData = cellData[key] || {};
        const data = {
            value,
            option: oldData.option || null,
            text: null,
            fontColorId: oldData.fontColorId || 0
        };
        if (selectionStart.colType === "SOUND" && value.match(/[\/,]/)) {
            const p = value.split(/[\/,]/);
            data.value = p[0];
            data.text = p[1];
        }
        return { type: 'cell', key, value, data };
    }
    return null;
}

function autoSave() {
    try {
        const snap = buildSessionSnapshot();
        localStorage.setItem(SESSION_KEY, JSON.stringify(snap));
    } catch (e) {
        console.warn('autosave failed', e);
    }
}

function flushAutoSave() {
    if (!isDirty) return;
    if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
    autoSave();
}

function loadLastSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) { return null; }
}

function applySession(snap) {
    if (!snap) return;
    // 新形式: シート配列
    if (snap.sheets && Array.isArray(snap.sheets) && snap.sheets.length > 0 && typeof loadAllSheetsData === 'function') {
        loadAllSheetsData(snap.sheets, snap.currentSheetIndex || 0);
        return;
    }
    // 旧形式: 単一シート
    metaData = snap.metaData || metaData;
    ensureMetaDataDefaults(metaData);
    cellData = snap.cellData || {};
    booksData = snap.booksData || { ACTION: {}, SOUND: {}, CELL: {}, CAMERA: {} };
    customRepeats = snap.customRepeats || [];
    dialogueBlocks = snap.dialogueBlocks || [];
    cameraBlocks = snap.cameraBlocks || [];
    if (typeof importHandwritingData === 'function') importHandwritingData(snap.handwritingPages || {});
    if (snap.sections) sections = snap.sections;
    if (typeof initSheets === 'function') initSheets();
    if (typeof updateSectionPositions === 'function') updateSectionPositions();
    if (typeof drawAll === 'function') drawAll();
}

function clearLastSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
}

// 復元確認ダイアログを表示
function maybeOfferSessionRestore() {
    // P2: handoff 起動時 (#wtproj=...) は autosave 復元プロンプトをスキップ。
    // launcher から受信する projectData が優先されるため。
    // autosave データは破棄せず保持（後続の通常 autosave 更新に任せる）。
    try {
        if (/(?:^#|&)wtproj=/.test(String(window.location.hash || ''))) {
            return;
        }
    } catch (e) {}
    const snap = loadLastSession();
    if (!snap) return;
    const date = new Date(snap.savedAt);
    const dateStr = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    // setTimeout で onload 後に出す
    setTimeout(() => {
        if (confirm(`前回作業中のシートが残っています (${dateStr})。\n復元しますか？\n\n[OK] 復元する\n[キャンセル] 破棄して新規開始`)) {
            applySession(snap);
            markClean(); // 復元直後はクリーン状態
        } else {
            clearLastSession();
        }
    }, 100);
}

// 未保存警告
window.addEventListener('beforeunload', (e) => {
    flushAutoSave();
    if (isDirty) {
        e.preventDefault();
        e.returnValue = (typeof t === 'function') ? t('beforeunload.warning') : '未保存の変更があります。離れますか？';
        return e.returnValue;
    }
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAutoSave();
});
