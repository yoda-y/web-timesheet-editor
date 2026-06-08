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
const DEFAULT_SHARED_META_KEYS = ['title', 'subTitle', 'scene', 'lengthSec', 'lengthFrame', 'creator'];
function getSharedMetaKeys() {
    const hasSharedCuts = (Array.isArray(metaData?.sharedCuts) && metaData.sharedCuts.length > 1)
        || (Array.isArray(sheets) && sheets.some(s => Array.isArray(s.metaData?.sharedCuts) && s.metaData.sharedCuts.length > 1));
    const filterKeys = (keys) => keys.filter(k => k !== 'cut' && (!hasSharedCuts || !['lengthSec', 'lengthFrame'].includes(k)));
    if (typeof settings !== 'undefined' && settings.editor && Array.isArray(settings.editor.sharedMetaKeys)) {
        return filterKeys(settings.editor.sharedMetaKeys);
    }
    return filterKeys(DEFAULT_SHARED_META_KEYS);
}

// 現在のグローバル状態を「シート」オブジェクトに収集
function captureCurrentSheet() {
    return {
        name: metaData.sheetName || 'sheet1',
        color: 0,
        isSharedCut: !!(sheets[currentSheetIndex] && sheets[currentSheetIndex].isSharedCut),
        metaData: JSON.parse(JSON.stringify(metaData)),
        cellData: JSON.parse(JSON.stringify(cellData)),
        booksData: JSON.parse(JSON.stringify(booksData)),
        customRepeats: JSON.parse(JSON.stringify(customRepeats)),
        dialogueBlocks: JSON.parse(JSON.stringify(dialogueBlocks)),
        cameraBlocks: JSON.parse(JSON.stringify(cameraBlocks)),
        handwritingPages: (typeof exportHandwritingData === 'function') ? exportHandwritingData() : {},
        sections: JSON.parse(JSON.stringify(sections))
    };
}

// シートを current 状態として展開
function applySheetToGlobal(sheet) {
    metaData = JSON.parse(JSON.stringify(sheet.metaData));
    ensureMetaDataDefaults(metaData);
    cellData = JSON.parse(JSON.stringify(sheet.cellData));
    booksData = JSON.parse(JSON.stringify(sheet.booksData));
    customRepeats = JSON.parse(JSON.stringify(sheet.customRepeats));
    dialogueBlocks = JSON.parse(JSON.stringify(sheet.dialogueBlocks));
    cameraBlocks = JSON.parse(JSON.stringify(sheet.cameraBlocks));
    sections = JSON.parse(JSON.stringify(sheet.sections));
    if (typeof importHandwritingData === 'function') importHandwritingData(sheet.handwritingPages || {});
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
    // バグ2修正: Preview モード中はシート切替後にプレビューも更新する
    if (typeof currentMode !== 'undefined' && currentMode === 'preview'
        && typeof updateTemplatePreview === 'function') {
        updateTemplatePreview();
    }
    if (typeof markDirty === 'function') markDirty();
}

function getSharedCutList() {
    if (Array.isArray(metaData?.sharedCuts) && metaData.sharedCuts.length > 0) {
        return metaData.sharedCuts.map(c => String(c)).filter(Boolean);
    }
    if (Array.isArray(sheets)) {
        const cuts = [];
        sheets.forEach(sheet => {
            const cut = String(sheet.metaData?.cut || '').trim();
            if (cut && !cuts.includes(cut)) cuts.push(cut);
        });
        if (cuts.length > 0) return cuts;
    }
    const current = String(metaData?.cut || '').trim();
    return current ? [current] : [];
}

function hasSharedCuts() {
    return getSharedCutList().length > 1;
}

function switchToSharedCut(cut) {
    const targetCut = String(cut || '').trim();
    if (!targetCut) return;
    if (typeof saveInput === 'function') saveInput();
    if (typeof saveBookInput === 'function') saveBookInput();

    if (Array.isArray(sheets) && sheets.length > 0) {
        sheets[currentSheetIndex] = captureCurrentSheet();
        const targetIndex = sheets.findIndex(sheet => String(sheet.metaData?.cut || '').trim() === targetCut);
        if (targetIndex >= 0) {
            switchToSheet(targetIndex);
        } else if (metaData.cut !== targetCut) {
            pushHistory();
            metaData.cut = targetCut;
            sheets[currentSheetIndex] = captureCurrentSheet();
            if (typeof drawAll === 'function') drawAll();
            if (typeof markDirty === 'function') markDirty();
        }
    } else if (metaData.cut !== targetCut) {
        pushHistory();
        metaData.cut = targetCut;
        if (typeof drawAll === 'function') drawAll();
        if (typeof markDirty === 'function') markDirty();
    }

    if (typeof updatePageIndicator === 'function') updatePageIndicator();
    if (currentMode === 'preview' && typeof updateTemplatePreview === 'function') {
        updateTemplatePreview();
    }
}

function addSharedCut(cut) {
    const newCut = String(cut || '').trim();
    if (!newCut) return false;
    const cuts = getSharedCutList().length ? getSharedCutList() : [String(metaData.cut || '').trim()].filter(Boolean);
    if (cuts.includes(newCut)) {
        switchToSharedCut(newCut);
        return true;
    }
    cuts.push(newCut);

    if (Array.isArray(sheets) && sheets.length > 0) {
        sheets[currentSheetIndex] = captureCurrentSheet();
        sheets.forEach(sheet => { sheet.metaData.sharedCuts = cuts; });
        const baseMeta = JSON.parse(JSON.stringify(metaData));
        const newSheet = {
            name: `cut ${newCut}`,
            color: 0,
            isSharedCut: true,
            metaData: { ...baseMeta, cut: newCut, sharedCuts: cuts, memo: '' },
            cellData: {},
            booksData: JSON.parse(JSON.stringify(booksData)),
            customRepeats: [],
            dialogueBlocks: [],
            cameraBlocks: [],
            handwritingPages: {},
            sections: JSON.parse(JSON.stringify(sections))
        };
        sheets.push(newSheet);
        currentSheetIndex = sheets.length - 1;
        applySheetToGlobal(newSheet);
        sheets.forEach(sheet => { sheet.metaData.sharedCuts = cuts; });
        if (typeof updatePageIndicator === 'function') updatePageIndicator();
        if (typeof drawAll === 'function') drawAll();
        if (currentMode === 'preview' && typeof updateTemplatePreview === 'function') updateTemplatePreview();
        if (typeof markDirty === 'function') markDirty();
        return true;
    }

    pushHistory();
    metaData.cut = newCut;
    metaData.sharedCuts = cuts;
    if (typeof drawAll === 'function') drawAll();
    if (typeof markDirty === 'function') markDirty();
    return true;
}

function renameSharedCut(oldCut, newCut) {
    const from = String(oldCut || '').trim();
    const to = String(newCut || '').trim();
    if (!from || !to || from === to) return false;
    const cuts = getSharedCutList();
    if (!cuts.includes(from)) return false;
    if (cuts.includes(to)) {
        alert('同じカット番号が既にあります。');
        return false;
    }
    pushHistory();
    const nextCuts = cuts.map(cut => String(cut) === from ? to : cut);
    if (Array.isArray(sheets) && sheets.length > 0) {
        sheets[currentSheetIndex] = captureCurrentSheet();
        sheets.forEach(sheet => {
            if (String(sheet.metaData?.cut || '') === from) sheet.metaData.cut = to;
            sheet.metaData.sharedCuts = nextCuts;
            if (String(sheet.name || '') === `cut ${from}`) sheet.name = `cut ${to}`;
        });
        applySheetToGlobal(sheets[currentSheetIndex]);
    } else {
        if (String(metaData.cut || '') === from) metaData.cut = to;
        metaData.sharedCuts = nextCuts;
    }
    if (typeof updatePageIndicator === 'function') updatePageIndicator();
    if (typeof drawAll === 'function') drawAll();
    if (currentMode === 'preview' && typeof updateTemplatePreview === 'function') updateTemplatePreview();
    if (typeof markDirty === 'function') markDirty();
    return true;
}

function deleteSharedCut(cut) {
    const target = String(cut || '').trim();
    const cuts = getSharedCutList();
    if (!target || !cuts.includes(target)) return false;
    if (cuts.length <= 1) {
        alert('最後のカットは削除できません。');
        return false;
    }
    if (!confirm(`カット「${target}」を削除しますか？\nこの操作は事故防止のため確認しています。`)) return false;

    pushHistory();
    const nextCuts = cuts.filter(c => String(c) !== target);
    if (Array.isArray(sheets) && sheets.length > 0) {
        sheets[currentSheetIndex] = captureCurrentSheet();
        let nextSheets = sheets.filter(sheet => String(sheet.metaData?.cut || '') !== target);
        if (nextSheets.length === sheets.length && String(metaData.cut || '') === target) {
            metaData.cut = nextCuts[0] || '';
        }
        if (nextSheets.length === 0) nextSheets = sheets;
        sheets = nextSheets;
        sheets.forEach(sheet => { sheet.metaData.sharedCuts = nextCuts; });
        currentSheetIndex = Math.max(0, Math.min(currentSheetIndex, sheets.length - 1));
        if (String(sheets[currentSheetIndex]?.metaData?.cut || '') === target) {
            currentSheetIndex = Math.max(0, sheets.findIndex(sheet => String(sheet.metaData?.cut || '') === String(nextCuts[0] || '')));
        }
        applySheetToGlobal(sheets[currentSheetIndex]);
    } else {
        metaData.sharedCuts = nextCuts;
        if (String(metaData.cut || '') === target) metaData.cut = nextCuts[0] || '';
    }
    if (typeof updatePageIndicator === 'function') updatePageIndicator();
    if (typeof drawAll === 'function') drawAll();
    if (currentMode === 'preview' && typeof updateTemplatePreview === 'function') updateTemplatePreview();
    if (typeof markDirty === 'function') markDirty();
    return true;
}

function showSharedCutSwitcher(clientX, clientY) {
    const cuts = getSharedCutList();
    closeSharedCutSwitcher();

    const pop = document.createElement('div');
    pop.id = 'shared-cut-switcher';
    pop.className = 'shared-cut-switcher';
    pop.addEventListener('mousedown', ev => ev.stopPropagation());
    pop.innerHTML = '<div class="shared-cut-switcher-title">兼用カット</div>';
    cuts.forEach(cut => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = String(cut) === String(metaData.cut || '') ? 'active' : '';
        btn.textContent = cut;
        btn.onclick = (ev) => {
            ev.stopPropagation();
            switchToSharedCut(cut);
            closeSharedCutSwitcher();
        };
        btn.oncontextmenu = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            showSharedCutItemMenu(cut, ev.pageX, ev.pageY);
        };
        pop.appendChild(btn);
    });
    if (currentMode !== 'preview') {
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'add';
        add.textContent = '+ 新規カット追加';
        add.onclick = (ev) => {
            ev.stopPropagation();
            const value = prompt('追加するカット番号を入力してください。', '');
            if (value) addSharedCut(value);
            closeSharedCutSwitcher();
        };
        pop.appendChild(add);
    }
    document.body.appendChild(pop);

    const x = Math.min(clientX, window.innerWidth - 150);
    const y = Math.min(clientY, window.innerHeight - 40 - cuts.length * 30);
    pop.style.left = Math.max(8, x) + 'px';
    pop.style.top = Math.max(8, y) + 'px';
    setTimeout(() => document.addEventListener('mousedown', closeSharedCutSwitcher, { once: true }), 0);
    return true;
}

function showSharedCutItemMenu(cut, pageX, pageY) {
    if (currentMode === 'preview') return;
    closeSharedCutSwitcher();
    const menu = document.getElementById('context-menu');
    if (!menu) return;
    menu.innerHTML = '';
    const items = [
        {
            label: 'カット名を編集',
            action: () => {
                const value = prompt('新しいカット番号を入力してください。', String(cut));
                if (value) renameSharedCut(cut, value);
            }
        },
        {
            label: 'カットを削除',
            color: '#ff5555',
            action: () => deleteSharedCut(cut)
        }
    ];
    items.forEach(item => {
        const div = document.createElement('div');
        div.textContent = item.label;
        div.style.padding = '6px 12px';
        div.style.whiteSpace = 'nowrap';
        div.style.color = item.color || 'var(--text-color)';
        div.onclick = () => {
            menu.style.display = 'none';
            item.action();
        };
        menu.appendChild(div);
    });
    const title = document.createElement('div');
    title.textContent = `対象カット: ${cut}`;
    title.style.padding = '6px 12px';
    title.style.fontWeight = 'bold';
    title.style.color = 'var(--grid-medium)';
    title.style.borderBottom = '1px solid var(--border-color)';
    menu.insertBefore(title, menu.firstChild);
    menu.style.display = 'block';
    menu.style.left = pageX + 'px';
    menu.style.top = pageY + 'px';
}

function closeSharedCutSwitcher() {
    const pop = document.getElementById('shared-cut-switcher');
    if (pop) pop.remove();
}

function getSheetIndexesForCut(cut) {
    const target = String(cut || '').trim();
    if (!target || !Array.isArray(sheets)) return [];
    const indexes = [];
    sheets.forEach((sheet, idx) => {
        if (String(sheet.metaData?.cut || '').trim() === target) indexes.push(idx);
    });
    return indexes;
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
    const cuts = getSharedCutList();
    const currentCut = String(metaData?.cut || '').trim();
    const isCutVersion = cuts.length > 1 && currentCut;

    let newSheet;
    if (inheritMode === 'new' || sourceIndex < 0 || sourceIndex >= sheets.length) {
        // 完全新規
        newSheet = {
            name: name,
            color: color || 0,
            metaData: { title: "", subTitle: "", scene: "", cut: "", sharedCuts: [], lengthSec: "6", lengthFrame: "00", creator: "", sheetName: name, page: "1/1", memo: "" },
            cellData: {},
            booksData: { ACTION: {}, SOUND: {}, CELL: {}, CAMERA: {} },
            customRepeats: [],
            dialogueBlocks: [],
            cameraBlocks: [],
            handwritingPages: {},
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
            cameraBlocks: [],
            handwritingPages: {}
        };
        newSheet.metaData.sheetName = name;
        // 「シートデータ」: タイムテーブルセル + ブロック
        if (inheritMode === 'all' || inheritMode === 'sheet') {
            newSheet.cellData = JSON.parse(JSON.stringify(src.cellData));
            newSheet.dialogueBlocks = JSON.parse(JSON.stringify(src.dialogueBlocks));
            newSheet.cameraBlocks = JSON.parse(JSON.stringify(src.cameraBlocks));
            newSheet.customRepeats = JSON.parse(JSON.stringify(src.customRepeats));
            newSheet.handwritingPages = JSON.parse(JSON.stringify(src.handwritingPages || {}));
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
    if (isCutVersion) {
        newSheet.isSharedCut = true;
        newSheet.metaData.title = metaData.title || "";
        newSheet.metaData.subTitle = metaData.subTitle || "";
        newSheet.metaData.scene = metaData.scene || "";
        newSheet.metaData.cut = currentCut;
        newSheet.metaData.sharedCuts = cuts;
        newSheet.metaData.lengthSec = metaData.lengthSec || newSheet.metaData.lengthSec || "6";
        newSheet.metaData.lengthFrame = metaData.lengthFrame || newSheet.metaData.lengthFrame || "00";
        newSheet.metaData.creator = metaData.creator || "";
        if (inheritMode === 'new') {
            newSheet.booksData = JSON.parse(JSON.stringify(booksData));
        }
    }
    newSheet.name = name;
    newSheet.metaData.sheetName = name;

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
    const cut = String(sheets[index].metaData?.cut || '').trim();
    const cuts = getSharedCutList();
    if (cuts.length > 1 && cut && getSheetIndexesForCut(cut).length <= 1) {
        alert('このCUTの最後のVERSIONは削除できません。CUT自体を削除する場合はCUT切替UIから削除してください。');
        return;
    }
    if (!confirm(`シート「${sheets[index].name}」を削除しますか？`)) return;
    // 現在編集中のシートが消えるなら、隣のシートに切替
    if (index === currentSheetIndex) {
        sheets.splice(index, 1);
        const sameCutIndex = cut ? sheets.findIndex(sheet => String(sheet.metaData?.cut || '').trim() === cut) : -1;
        currentSheetIndex = sameCutIndex >= 0 ? sameCutIndex : Math.max(0, index - 1);
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
    sheets[index].metaData.sheetName = newName.trim();
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
    if (getSharedCutList().length > 1 && String(cloned.metaData?.cut || '').trim()) {
        cloned.isSharedCut = true;
        cloned.metaData.sharedCuts = getSharedCutList();
    }
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
