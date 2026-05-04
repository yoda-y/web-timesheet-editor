// === 複数シート管理 ===
//
// シートは sheets[] 配列で保持。各シートは独立した
// metaData / cellData / booksData / customRepeats / dialogueBlocks / cameraBlocks / sections / sheetColor を持つ。
// currentSheetIndex で「現在編集中のシート」を示す。
// グローバルの cellData 等は currentSheet への参照（シート切替時に差し替え）。

const MAX_SHEETS = 20;

let sheets = [];
let currentSheetIndex = 0;

// メタデータ共有設定（settings.editorに保存される想定。デフォルト値）
const DEFAULT_SHARED_META_KEYS = ['title', 'subTitle', 'scene', 'cut', 'lengthSec', 'lengthFrame', 'creator'];
function getSharedMetaKeys() {
    if (typeof settings !== 'undefined' && settings.editor && Array.isArray(settings.editor.sharedMetaKeys)) {
        return settings.editor.sharedMetaKeys;
    }
    return DEFAULT_SHARED_META_KEYS;
}

// 現在のグローバル状態を「シート」オブジェクトに収集
function captureCurrentSheet() {
    return {
        name: metaData.sheetName || 'sheet1',
        color: 0,
        metaData: JSON.parse(JSON.stringify(metaData)),
        cellData: JSON.parse(JSON.stringify(cellData)),
        booksData: JSON.parse(JSON.stringify(booksData)),
        customRepeats: JSON.parse(JSON.stringify(customRepeats)),
        dialogueBlocks: JSON.parse(JSON.stringify(dialogueBlocks)),
        cameraBlocks: JSON.parse(JSON.stringify(cameraBlocks)),
        sections: JSON.parse(JSON.stringify(sections))
    };
}

// シートを current 状態として展開
function applySheetToGlobal(sheet) {
    metaData = JSON.parse(JSON.stringify(sheet.metaData));
    cellData = JSON.parse(JSON.stringify(sheet.cellData));
    booksData = JSON.parse(JSON.stringify(sheet.booksData));
    customRepeats = JSON.parse(JSON.stringify(sheet.customRepeats));
    dialogueBlocks = JSON.parse(JSON.stringify(sheet.dialogueBlocks));
    cameraBlocks = JSON.parse(JSON.stringify(sheet.cameraBlocks));
    sections = JSON.parse(JSON.stringify(sheet.sections));
}

// 共有メタデータを全シートに配布
function syncSharedMetaToAllSheets() {
    const sharedKeys = getSharedMetaKeys();
    sheets.forEach((s, i) => {
        if (i === currentSheetIndex) return;
        sharedKeys.forEach(k => {
            s.metaData[k] = metaData[k];
        });
    });
}

// 初期化: 1シートだけの状態にする
function initSheets() {
    sheets = [captureCurrentSheet()];
    currentSheetIndex = 0;
}

// シート切替
function switchToSheet(index) {
    if (index < 0 || index >= sheets.length) return;
    if (index === currentSheetIndex) return;
    if (typeof saveInput === 'function') saveInput();
    if (typeof saveBookInput === 'function') saveBookInput();
    // 現在の状態を保存
    sheets[currentSheetIndex] = captureCurrentSheet();
    // 共有メタを切替前から伝播
    syncSharedMetaToAllSheets();
    currentSheetIndex = index;
    applySheetToGlobal(sheets[currentSheetIndex]);
    // 共有メタは新シートにも反映
    const sharedKeys = getSharedMetaKeys();
    if (sheets.length > 0) {
        const ref = sheets[0].metaData;
        sharedKeys.forEach(k => { metaData[k] = ref[k]; });
    }
    // UI リセット
    selectionStart = null; selectionEnd = null; selectedMeta = null;
    selectedDialogueId = null; selectedCameraId = null;
    if (typeof cellInput !== 'undefined') cellInput.style.display = 'none';
    if (typeof updateSectionPositions === 'function') updateSectionPositions();
    if (typeof drawAll === 'function') drawAll();
    if (typeof markDirty === 'function') markDirty();
}

// シート追加（コピー元と継承データの種類を指定）
// inheritMode: 'all' / 'sheet' / 'aux' / 'new'
function addSheet(name, color, sourceIndex, inheritMode) {
    if (sheets.length >= MAX_SHEETS) {
        alert(`シートは最大 ${MAX_SHEETS} 枚までです。`);
        return false;
    }
    // 現状のシートを保存
    sheets[currentSheetIndex] = captureCurrentSheet();

    let newSheet;
    if (inheritMode === 'new' || sourceIndex < 0 || sourceIndex >= sheets.length) {
        // 完全新規
        newSheet = {
            name: name,
            color: color || 0,
            metaData: { title: "", subTitle: "", scene: "", cut: "", lengthSec: "6", lengthFrame: "00", creator: "", sheetName: name, page: "1/1", memo: "" },
            cellData: {},
            booksData: { ACTION: {}, SOUND: {}, CELL: {}, CAMERA: {} },
            customRepeats: [],
            dialogueBlocks: [],
            cameraBlocks: [],
            sections: [
                { type: "ACTION", x: 25, cols: 7, cw: 32, chars: ["A","B","C","D","E","F","G"] },
                { type: "SOUND",  x: 0, cols: 2, cw: 68, chars: ["S1","S2"] },
                { type: "CELL",   x: 0, cols: 7, cw: 58, chars: ["a","b","c","d","e","f","g"] },
                { type: "CAMERA", x: 0, cols: 3, cw: 58, chars: ["CAM1","CAM2","CAM3"] }
            ]
        };
    } else {
        const src = sheets[sourceIndex];
        newSheet = {
            name: name,
            color: color || 0,
            metaData: JSON.parse(JSON.stringify(src.metaData)),
            sections: JSON.parse(JSON.stringify(src.sections)),
            cellData: {},
            booksData: { ACTION: {}, SOUND: {}, CELL: {}, CAMERA: {} },
            customRepeats: [],
            dialogueBlocks: [],
            cameraBlocks: []
        };
        newSheet.metaData.sheetName = name;
        // 「シートデータ」: タイムテーブルセル + ブロック
        if (inheritMode === 'all' || inheritMode === 'sheet') {
            newSheet.cellData = JSON.parse(JSON.stringify(src.cellData));
            newSheet.dialogueBlocks = JSON.parse(JSON.stringify(src.dialogueBlocks));
            newSheet.cameraBlocks = JSON.parse(JSON.stringify(src.cameraBlocks));
            newSheet.customRepeats = JSON.parse(JSON.stringify(src.customRepeats));
        }
        // 「補助データ」: メモ・BOOK・カメラ詳細メモ等
        if (inheritMode === 'all' || inheritMode === 'aux') {
            newSheet.booksData = JSON.parse(JSON.stringify(src.booksData));
            newSheet.metaData.memo = src.metaData.memo || "";
        } else if (inheritMode === 'sheet') {
            // sheet のみは memo は引き継がない
            newSheet.metaData.memo = "";
        } else if (inheritMode === 'new') {
            newSheet.metaData.memo = "";
        }
    }

    sheets.push(newSheet);
    currentSheetIndex = sheets.length - 1;
    applySheetToGlobal(newSheet);
    if (typeof updateSectionPositions === 'function') updateSectionPositions();
    if (typeof drawAll === 'function') drawAll();
    if (typeof markDirty === 'function') markDirty();
    return true;
}

// シート削除
function deleteSheet(index) {
    if (index < 0 || index >= sheets.length) return;
    if (sheets.length <= 1) {
        alert('最後のシートは削除できません。');
        return;
    }
    if (!confirm(`シート「${sheets[index].name}」を削除しますか？`)) return;
    // 現在編集中のシートが消えるなら、隣のシートに切替
    if (index === currentSheetIndex) {
        sheets.splice(index, 1);
        currentSheetIndex = Math.max(0, index - 1);
        applySheetToGlobal(sheets[currentSheetIndex]);
        if (typeof updateSectionPositions === 'function') updateSectionPositions();
        if (typeof drawAll === 'function') drawAll();
    } else {
        sheets.splice(index, 1);
        if (index < currentSheetIndex) currentSheetIndex--;
    }
    if (typeof markDirty === 'function') markDirty();
}

// シート名変更
function renameSheet(index, newName) {
    if (index < 0 || index >= sheets.length) return;
    if (!newName || !newName.trim()) return;
    sheets[index].name = newName.trim();
    if (index === currentSheetIndex) {
        metaData.sheetName = newName.trim();
        if (typeof drawAll === 'function') drawAll();
    }
    if (typeof markDirty === 'function') markDirty();
}

// シートコピー（現在シートを複製）
function copySheet(index) {
    if (index < 0 || index >= sheets.length) return;
    if (sheets.length >= MAX_SHEETS) {
        alert(`シートは最大 ${MAX_SHEETS} 枚までです。`);
        return;
    }
    sheets[currentSheetIndex] = captureCurrentSheet();
    const src = sheets[index];
    const newName = src.name + '_copy';
    const cloned = JSON.parse(JSON.stringify(src));
    cloned.name = newName;
    cloned.metaData.sheetName = newName;
    sheets.push(cloned);
    currentSheetIndex = sheets.length - 1;
    applySheetToGlobal(cloned);
    if (typeof updateSectionPositions === 'function') updateSectionPositions();
    if (typeof drawAll === 'function') drawAll();
    if (typeof markDirty === 'function') markDirty();
}

// シート配列を保存用にエクスポート
function exportAllSheetsData() {
    // 現状のグローバル状態を current シートに反映してから返す
    sheets[currentSheetIndex] = captureCurrentSheet();
    syncSharedMetaToAllSheets();
    return JSON.parse(JSON.stringify(sheets));
}

// 配列を読込（インポート/復元）
function loadAllSheetsData(arr, index) {
    if (!Array.isArray(arr) || arr.length === 0) return;
    sheets = JSON.parse(JSON.stringify(arr));
    currentSheetIndex = (typeof index === 'number' && index >= 0 && index < sheets.length) ? index : 0;
    applySheetToGlobal(sheets[currentSheetIndex]);
    if (typeof updateSectionPositions === 'function') updateSectionPositions();
    if (typeof drawAll === 'function') drawAll();
}
