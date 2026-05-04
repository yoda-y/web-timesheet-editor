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
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(autoSave, AUTOSAVE_DEBOUNCE_MS);
}

function markClean() {
    isDirty = false;
    updateModeStatus();
    if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = null; }
}

function buildSessionSnapshot() {
    // 全シートを保存
    const allSheets = (typeof exportAllSheetsData === 'function') ? exportAllSheetsData() : null;
    return {
        savedAt: Date.now(),
        version: 2,
        sheets: allSheets,
        currentSheetIndex: (typeof currentSheetIndex !== 'undefined') ? currentSheetIndex : 0,
        // 互換: 単一シートとしても残す
        metaData,
        cellData,
        booksData,
        customRepeats,
        dialogueBlocks,
        cameraBlocks,
        sections: JSON.parse(JSON.stringify(sections))
    };
}

function autoSave() {
    try {
        const snap = buildSessionSnapshot();
        localStorage.setItem(SESSION_KEY, JSON.stringify(snap));
    } catch (e) {
        console.warn('autosave failed', e);
    }
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
    cellData = snap.cellData || {};
    booksData = snap.booksData || { ACTION: {}, SOUND: {}, CELL: {}, CAMERA: {} };
    customRepeats = snap.customRepeats || [];
    dialogueBlocks = snap.dialogueBlocks || [];
    cameraBlocks = snap.cameraBlocks || [];
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
    if (isDirty) {
        e.preventDefault();
        e.returnValue = '未保存の変更があります。本当にページを閉じますか？';
        return e.returnValue;
    }
});
