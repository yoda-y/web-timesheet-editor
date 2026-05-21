// === セクション・セル・BOOK 操作 / セル構成パネル ===

// ヘッダクリック: 内容を折りたたみ (パネルは残る)
window.togglePanel = function() {
    isPanelExpanded = !isPanelExpanded;
    const panel = document.getElementById('floating-panel');
    const icon = document.getElementById('panel-toggle-icon');
    if (isPanelExpanded) { panel.classList.remove('collapsed'); icon.innerText = '▼'; }
    else { panel.classList.add('collapsed'); icon.innerText = '◀'; }
};

// === セル構成パネルの表示/非表示 (localStorage 永続化) ===
const CELL_PANEL_VISIBLE_KEY = 'cellLayoutPanelVisible';

function isCellLayoutPanelVisible() {
    const v = localStorage.getItem(CELL_PANEL_VISIBLE_KEY);
    // 未設定時はデフォルト表示
    return v === null ? true : v === '1';
}

function setCellLayoutPanelVisible(visible) {
    const panel = document.getElementById('floating-panel');
    if (!panel) return;
    panel.style.display = visible ? '' : 'none';
    localStorage.setItem(CELL_PANEL_VISIBLE_KEY, visible ? '1' : '0');
    updateCellLayoutPanelMenuCheck();
}
window.setCellLayoutPanelVisible = setCellLayoutPanelVisible;

window.toggleCellLayoutPanelVisible = function() {
    setCellLayoutPanelVisible(!isCellLayoutPanelVisible());
};

// メニュー項目に表示状態のチェックマーク (✓) を付ける
function updateCellLayoutPanelMenuCheck() {
    const menuRow = document.querySelector('[data-action="view.togglePanel"]');
    if (!menuRow) return;
    const visible = isCellLayoutPanelVisible();
    const baseLabel = (typeof t === 'function') ? t('view.togglePanel') : 'セル構成パネル表示';
    menuRow.textContent = (visible ? '✓ ' : '   ') + baseLabel;
}
window.updateCellLayoutPanelMenuCheck = updateCellLayoutPanelMenuCheck;

// 初期化: localStorage の値を反映 + 閉じるボタン配線
document.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('floating-panel');
    if (panel) {
        if (!isCellLayoutPanelVisible()) panel.style.display = 'none';
    }
    const closeBtn = document.getElementById('panel-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setCellLayoutPanelVisible(false);
        });
    }
    updateCellLayoutPanelMenuCheck();
});

window.renameCellByRef = function(type, idx) {
    let sec = sections.find(s => s.type === type);
    if (!sec) return;
    let newName = prompt("レイヤー名を入力してください", sec.chars[idx]);
    if (newName !== null && newName.trim() !== "") {
        pushHistory();
        sec.chars[idx] = newName.trim();
        drawAll();
    }
};

window.deleteCellByRef = function(type, idx) {
    if (!confirm('この列を削除しますか？')) return;
    pushHistory();
    if (type === "ACTION" || type === "CELL") {
        let actSec = sections.find(s => s.type === "ACTION");
        let cellSec = sections.find(s => s.type === "CELL");
        actSec.chars.splice(idx, 1); actSec.cols -= 1;
        cellSec.chars.splice(idx, 1); cellSec.cols -= 1;
        let newCellData = {};
        for (let key in cellData) {
            let p = parseCellKey(key); if (!p) continue; let ct = p[0], ci = parseInt(p[1]), f = parseInt(p[2]);
            if (ct === "ACTION" || ct === "CELL") {
                if (ci < idx) newCellData[key] = cellData[key];
                else if (ci > idx) newCellData[`${ct}-${ci - 1}-${f}`] = cellData[key];
            } else newCellData[key] = cellData[key];
        }
        cellData = newCellData;
        customRepeats = customRepeats.filter(rep => (rep.colType !== "ACTION" && rep.colType !== "CELL") || rep.colIndex !== idx).map(rep => {
            if ((rep.colType === "ACTION" || rep.colType === "CELL") && rep.colIndex > idx) rep.colIndex -= 1;
            return rep;
        });
        if (booksData["ACTION"]) {
            let simpleNewBooks = {};
            for (let l in booksData["ACTION"]) {
                let lineIdx = parseInt(l);
                if (lineIdx < idx) simpleNewBooks[lineIdx] = booksData["ACTION"][l];
                else if (lineIdx > idx) simpleNewBooks[lineIdx - 1] = booksData["ACTION"][l];
            }
            booksData["ACTION"] = simpleNewBooks;
        }
    } else {
        let sec = sections.find(s => s.type === type);
        sec.chars.splice(idx, 1); sec.cols -= 1;
        let newCellData = {};
        for (let key in cellData) {
            let p = parseCellKey(key); if (!p) continue; let ct = p[0], ci = parseInt(p[1]), f = parseInt(p[2]);
            if (ct === type) {
                if (ci < idx) newCellData[key] = cellData[key];
                else if (ci > idx) newCellData[`${ct}-${ci - 1}-${f}`] = cellData[key];
            } else newCellData[key] = cellData[key];
        }
        cellData = newCellData;
        if (type === "SOUND") {
            dialogueBlocks = dialogueBlocks.filter(b => b.colIndex !== idx).map(b => { if (b.colIndex > idx) b.colIndex -= 1; return b; });
        }
        if (type === "CAMERA") {
            cameraBlocks = cameraBlocks.filter(b => b.colIndex !== idx).map(b => { if (b.colIndex > idx) b.colIndex -= 1; return b; });
        }
    }
    updateSectionPositions();
    drawAll();
};

window.addCellByRef = function(type, idx, position) {
    pushHistory();
    let insertIdx = position === 'left' ? idx : idx + 1;
    if (type === "ACTION" || type === "CELL") {
        let actSec = sections.find(s => s.type === "ACTION");
        let cellSec = sections.find(s => s.type === "CELL");
        let newActName = "A", newCellName = "a";
        if (insertIdx === actSec.cols) {
            let lastActCode = actSec.chars[actSec.cols - 1] ? actSec.chars[actSec.cols - 1].charCodeAt(0) : 64;
            let lastCellCode = cellSec.chars[cellSec.cols - 1] ? cellSec.chars[cellSec.cols - 1].charCodeAt(0) : 96;
            newActName = String.fromCharCode(lastActCode + 1);
            newCellName = String.fromCharCode(lastCellCode + 1);
        } else {
            let baseIdx = position === 'right' ? idx : Math.max(0, idx - 1);
            newActName = (actSec.chars[baseIdx] || "A") + "'";
            newCellName = (cellSec.chars[baseIdx] || "a") + "'";
        }
        actSec.chars.splice(insertIdx, 0, newActName); actSec.cols += 1;
        cellSec.chars.splice(insertIdx, 0, newCellName); cellSec.cols += 1;
        let newCellData = {};
        for (let key in cellData) {
            let p = parseCellKey(key); if (!p) continue; let ct = p[0], ci = parseInt(p[1]), f = parseInt(p[2]);
            if (ct === "ACTION" || ct === "CELL") {
                if (ci < insertIdx) newCellData[key] = cellData[key];
                else newCellData[`${ct}-${ci + 1}-${f}`] = cellData[key];
            } else newCellData[key] = cellData[key];
        }
        cellData = newCellData;
        customRepeats.forEach(rep => { if ((rep.colType === "ACTION" || rep.colType === "CELL") && rep.colIndex >= insertIdx) rep.colIndex += 1; });
        if (booksData["ACTION"]) {
            let simpleNewBooks = {};
            for (let l in booksData["ACTION"]) {
                let lineIdx = parseInt(l);
                if (lineIdx < insertIdx) simpleNewBooks[lineIdx] = booksData["ACTION"][l];
                else simpleNewBooks[lineIdx + 1] = booksData["ACTION"][l];
            }
            booksData["ACTION"] = simpleNewBooks;
        }
    }
    updateSectionPositions();
    drawAll();
};

window.addEndLayerByRef = function(type) {
    pushHistory();
    let sec = sections.find(s => s.type === type);
    if (!sec) return;
    let newName = type === "SOUND" ? "S" + (sec.cols + 1) : "CAM" + (sec.cols + 1);
    sec.chars.push(newName); sec.cols += 1;
    updateSectionPositions();
    drawAll();
};

window.addNewCell = function() { window.addCellByRef("ACTION", sections.find(s => s.type === "ACTION").cols - 1, 'right'); };

window.addNewBook = function() {
    pushHistory();
    const actSec = sections.find(s => s.type === "ACTION");
    let targetLine = actSec.cols;
    if (!booksData["ACTION"]) booksData["ACTION"] = {};
    if (!booksData["ACTION"][targetLine]) booksData["ACTION"][targetLine] = [];
    let count = 1;
    for (let l in booksData["ACTION"]) count += booksData["ACTION"][l].length;
    booksData["ACTION"][targetLine].unshift("book" + count);
    drawAll();
};

window.renameCell = function(idx) { window.renameCellByRef("ACTION", idx); };
window.renameBook = function(lineIdx, textIdx) {
    let newName = prompt("BOOK名を入力してください", booksData["ACTION"][lineIdx][textIdx]);
    if (newName !== null && newName.trim() !== "") { pushHistory(); booksData["ACTION"][lineIdx][textIdx] = newName.trim(); drawAll(); }
};
window.deleteCell = function(idx) { window.deleteCellByRef("ACTION", idx); };
window.deleteBook = function(lineIdx, textIdx) {
    if (!confirm('このBOOKを削除しますか？')) return;
    pushHistory();
    booksData["ACTION"][lineIdx].splice(textIdx, 1);
    if (booksData["ACTION"][lineIdx].length === 0) delete booksData["ACTION"][lineIdx];
    drawAll();
};

// セル構成パネル
function handleDragStart(e) { draggedListItem = this; e.dataTransfer.effectAllowed = 'move'; setTimeout(() => this.style.opacity = '0.5', 0); }
function handleDragOver(e) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.config-item');
    if (target && target !== draggedListItem) {
        const rect = target.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) target.before(draggedListItem); else target.after(draggedListItem);
    }
}
function handleDragEnd(e) { this.style.opacity = '1'; draggedListItem = null; rebuildConfigFromDOM(); }

function rebuildConfigFromDOM() {
    pushHistory();
    const items = Array.from(document.getElementById('cell-config-list').children).reverse();
    let newActChars = [], newCellChars = [], newBooksData = {}, colMapping = {}, currentLineIdx = 0;
    const cellSec = sections.find(s => s.type === "CELL");
    items.forEach(item => {
        const type = item.getAttribute('data-type');
        if (type === 'book') {
            if (!newBooksData[currentLineIdx]) newBooksData[currentLineIdx] = [];
            newBooksData[currentLineIdx].push(item.getAttribute('data-name'));
        } else if (type === 'cell') {
            newActChars.push(item.getAttribute('data-name'));
            const oldCol = parseInt(item.getAttribute('data-old-col'));
            newCellChars.push(cellSec.chars[oldCol]);
            colMapping[oldCol] = currentLineIdx;
            currentLineIdx++;
        }
    });
    const actSec = sections.find(s => s.type === "ACTION");
    let newCellData = {};
    for (const key in cellData) {
        let p = parseCellKey(key); if (!p) continue; let ct = p[0], ci = parseInt(p[1]), f = parseInt(p[2]);
        if ((ct === "ACTION" || ct === "CELL") && colMapping[ci] !== undefined) newCellData[`${ct}-${colMapping[ci]}-${f}`] = cellData[key];
        else if (ct !== "ACTION" && ct !== "CELL") newCellData[key] = cellData[key];
    }
    cellData = newCellData;
    customRepeats.forEach(rep => { if ((rep.colType === "ACTION" || rep.colType === "CELL") && colMapping[rep.colIndex] !== undefined) rep.colIndex = colMapping[rep.colIndex]; });
    actSec.cols = newActChars.length; actSec.chars = newActChars;
    cellSec.cols = newCellChars.length; cellSec.chars = newCellChars;
    booksData["ACTION"] = newBooksData;
    updateSectionPositions();
    drawAll();
}

function updateCellConfigPanel() {
    const panel = document.getElementById('cell-config-list');
    if (!panel) return;
    panel.innerHTML = '';
    const actSec = sections.find(s => s.type === "ACTION");
    if (!actSec) return;
    let html = '';
    for (let i = actSec.cols; i >= 0; i--) {
        if (booksData["ACTION"] && booksData["ACTION"][i]) {
            let books = [...booksData["ACTION"][i]].reverse();
            books.forEach((bookName, idx) => {
                let actualTextIdx = booksData["ACTION"][i].length - 1 - idx;
                html += `<div class="config-item book-item" draggable="true" data-type="book" data-name="${bookName}" ondblclick="renameBook(${i}, ${actualTextIdx})"><span class="item-icon icon-book">BOOK</span> <span class="item-name">${bookName}</span><span class="delete-btn" onclick="deleteBook(${i}, ${actualTextIdx}); event.stopPropagation();" title="削除">🗑️</span></div>`;
            });
        }
        if (i > 0) {
            let cellIdx = i - 1;
            let cellName = actSec.chars[cellIdx];
            html += `<div class="config-item cell-item" draggable="true" data-type="cell" data-name="${cellName}" data-old-col="${cellIdx}" ondblclick="renameCell(${cellIdx})"><span class="item-icon icon-cell">CELL</span> <span class="item-name">${cellName}</span><span class="delete-btn" onclick="deleteCell(${cellIdx}); event.stopPropagation();" title="削除">🗑️</span></div>`;
        }
    }
    panel.innerHTML = html;
    panel.querySelectorAll('.config-item').forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('dragend', handleDragEnd);
    });
}
