// === マウス・キーボード・コンテキストメニュー ===

function focusMeta(fieldOrId, x, y, w, h) {
    saveInput();
    selectionStart = null; selectionEnd = null;
    cellInput.style.display = 'none';
    selectedDialogueId = null; selectedCameraId = null;
    if (fieldOrId === "memo") {
        selectedMeta = "memo";
        metaTextArea.style.cssText = `display:block; left:${x}px; top:${y}px; width:${w}px; height:${h}px;`;
        metaTextArea.value = metaData.memo || "";
        setTimeout(() => metaTextArea.focus(), 10);
    } else {
        selectedMeta = fieldOrId.id;
        metaInput.style.cssText = `display:block; left:${fieldOrId.x}px; top:${fieldOrId.y}px; width:${fieldOrId.w}px; height:${fieldOrId.h}px;`;
        metaInput.value = metaData[fieldOrId.id] || "";
        setTimeout(() => metaInput.focus(), 10);
    }
}

function saveBookInput() {
    if (editingBook) {
        let val = bookInput.value.trim();
        let arr = booksData[editingBook.type][editingBook.idx];
        if (arr && editingBook.textIdx < arr.length && val !== editingBook.text) {
            pushHistory();
            if (val === "") { arr.splice(editingBook.textIdx, 1); if (arr.length === 0) delete booksData[editingBook.type][editingBook.idx]; }
            else arr[editingBook.textIdx] = val;
        }
        editingBook = null;
        bookInput.style.display = 'none';
        drawAll();
    }
}

function saveInput() {
    if (selectedMeta) {
        let val = (selectedMeta === "memo") ? metaTextArea.value : metaInput.value.trim();
        if (selectedMeta === "lengthFrame") {
            let frm = parseInt(val, 10) || 0;
            let sec = parseInt(metaData.lengthSec, 10) || 0;
            if (frm >= 24) { metaData.lengthSec = Math.floor(frm / 24).toString(); frm = frm % 24; }
            val = String(frm).padStart(2, '0');
        } else if (selectedMeta === "lengthSec") { val = (parseInt(val, 10) || 0).toString(); }
        if (metaData[selectedMeta] !== val) { pushHistory(); metaData[selectedMeta] = val; }
        selectedMeta = null;
        metaInput.style.display = 'none';
        metaTextArea.style.display = 'none';
        drawAll();
        return;
    }
    if (!selectionStart) return;
    const key = `${selectionStart.colType}-${selectionStart.colIndex}-${selectionStart.frame}`;
    let val = cellInput.value.trim();
    if (val === "-") val = "―";
    if (val.toLowerCase() === "x") val = "×";
    const oldVal = JSON.stringify(cellData[key] || {});
    const SYMBOL_VALUES = ["●", "○", "×", "―"];
    if (val === "") {
        // 空値は option も含めて完全に削除
        delete cellData[key];
    } else {
        const isNew = !cellData[key];
        const wasNumeric = cellData[key] && /^\d+$/.test(cellData[key].value);
        if (!cellData[key]) cellData[key] = { value: "", option: null, text: null, fontColorId: 0 };
        if (selectionStart.colType === "SOUND" && val.match(/[\/,]/)) {
            let p = val.split(/[\/,]/);
            cellData[key].value = p[0]; cellData[key].text = p[1];
        } else {
            cellData[key].value = val;
            cellData[key].text = null;
            // ACTION数字セル: 新規 or 数字へ"変化"したときのみ自動付与
            const isNumericNow = /^\d+$/.test(val);
            if (selectionStart.colType === "ACTION" && isNumericNow && (isNew || !wasNumeric)) {
                cellData[key].option = "OPTION_KEYFRAME";
            }
        }
        // 記号セル(●/○/×/―) の場合は option を外す
        if (SYMBOL_VALUES.includes(cellData[key].value)) {
            cellData[key].option = null;
        }
        // クイックパレットで選択中の色を新規セルに適用
        if (isNew && typeof activeFontColorId !== 'undefined' && activeFontColorId > 0) {
            cellData[key].fontColorId = activeFontColorId;
        }
    }
    if (val !== "" || cellData[key]) {
        customRepeats = customRepeats.map(rep => {
            if (rep.colType === selectionStart.colType && rep.colIndex === selectionStart.colIndex && selectionStart.frame >= rep.startF && selectionStart.frame <= rep.endF) {
                rep.endF = selectionStart.frame - 1;
            }
            return rep;
        }).filter(rep => rep.endF >= rep.startF);
    }
    if (oldVal !== JSON.stringify(cellData[key] || {})) drawAll();
}

function focusCell() {
    if (!selectionStart) { cellInput.style.display = 'none'; return; }
    selectedMeta = null;
    metaInput.style.display = 'none'; metaTextArea.style.display = 'none';
    saveBookInput();
    selectedDialogueId = null; selectedCameraId = null;
    const key = `${selectionStart.colType}-${selectionStart.colIndex}-${selectionStart.frame}`;
    cellInput.style.cssText = `display:block; left:${selectionStart.x * currentZoom}px; top:${(frameY(selectionStart.frame) + colHeaderH) * currentZoom}px; width:${selectionStart.w * currentZoom}px; height:${rowHeight * currentZoom}px; font-size:${12 * currentZoom}px;`;
    let disp = "";
    if (cellData[key]) disp = cellData[key].text ? `${cellData[key].value}/${cellData[key].text}` : cellData[key].value;
    cellInput.value = disp;
    cellInput.style.color = (disp === "●") ? "transparent" : getStyle('--text-color');
    drawGrid();
    updateCellInputOptionIndicator();
    setTimeout(() => cellInput.focus(), 5);
}

// cellInput の枠装飾は使わない（cellInput の見た目は従来通り）
function updateCellInputOptionIndicator() { /* no-op */ }

function move(dL, dF, expand) {
    if (!selectionStart) return;
    const sL = getLogicalColIndex(selectionStart.colType, selectionStart.colIndex);
    const eL = getLogicalColIndex(selectionEnd.colType, selectionEnd.colIndex);
    if (expand) {
        const next = getCellByLogical(eL + dL, selectionEnd.frame + dF);
        if (next) selectionEnd = next;
    } else {
        const stepF = (dL === 0 && dF === 1) ? (Math.abs(selectionEnd.frame - selectionStart.frame) + 1) : 1;
        const finalDF = dF > 0 ? stepF : (dF < 0 ? -((dL === 0) ? (Math.abs(selectionEnd.frame - selectionStart.frame) + 1) : 1) : 0);
        const nS = getCellByLogical(sL + dL, selectionStart.frame + finalDF);
        const nE = getCellByLogical(eL + dL, selectionEnd.frame + finalDF);
        if (nS && nE) { selectionStart = nS; selectionEnd = nE; }
    }
    focusCell();
    scrollIfNeeded();
}

function scrollIfNeeded() {
    const vp = document.getElementById('scroll-viewport');
    const top = frameY(selectionStart.frame) + colHeaderH;
    const bot = frameY(selectionStart.frame + 1) + colHeaderH;
    if (top < vp.scrollTop + colHeaderH) vp.scrollTop = top - colHeaderH;
    else if (bot > vp.scrollTop + vp.clientHeight) vp.scrollTop = bot - vp.clientHeight;
}

function copy() {
    saveInput();
    if (!selectionStart || !selectionEnd) return;
    const sL = getLogicalColIndex(selectionStart.colType, selectionStart.colIndex);
    const eL = getLogicalColIndex(selectionEnd.colType, selectionEnd.colIndex);
    const minL = Math.min(sL, eL), maxL = Math.max(sL, eL);
    const minF = Math.min(selectionStart.frame, selectionEnd.frame), maxF = Math.max(selectionStart.frame, selectionEnd.frame);
    clipboard = { wL: maxL - minL + 1, hF: maxF - minF + 1, offL: sL - minL, offF: selectionStart.frame - minF, items: [] };
    for (let l = minL; l <= maxL; l++) for (let f = minF; f <= maxF; f++) {
        const c = getCellByLogical(l, f);
        const k = `${c.colType}-${c.colIndex}-${f}`;
        if (cellData[k]) clipboard.items.push({ rL: l - minL, rF: f - minF, data: JSON.parse(JSON.stringify(cellData[k])) });
    }
}

function paste() {
    if (!clipboard || !selectionStart) return;
    pushHistory();
    saveInput();
    const baseL = getLogicalColIndex(selectionStart.colType, selectionStart.colIndex) - clipboard.offL;
    const baseF = selectionStart.frame - clipboard.offF;
    for (let l = 0; l < clipboard.wL; l++) for (let f = 0; f < clipboard.hF; f++) {
        const target = getCellByLogical(baseL + l, baseF + f);
        if (target) delete cellData[`${target.colType}-${target.colIndex}-${target.frame}`];
    }
    clipboard.items.forEach(it => {
        const tL = baseL + it.rL, tF = baseF + it.rF;
        if (tL >= 0 && tL < sections.reduce((acc, s) => acc + s.cols, 0) && tF >= 0 && tF < numFrames) {
            const c = getCellByLogical(tL, tF);
            cellData[`${c.colType}-${c.colIndex}-${tF}`] = it.data;
        }
    });
    focusCell();
}

function deleteSelect() {
    pushHistory();
    saveInput();
    if (selectionStart) {
        const sL = getLogicalColIndex(selectionStart.colType, selectionStart.colIndex);
        const eL = getLogicalColIndex(selectionEnd.colType, selectionEnd.colIndex);
        const minL = Math.min(sL, eL), maxL = Math.max(sL, eL);
        const minF = Math.min(selectionStart.frame, selectionEnd.frame), maxF = Math.max(selectionStart.frame, selectionEnd.frame);
        for (let l = minL; l <= maxL; l++) {
            for (let f = minF; f <= maxF; f++) {
                const c = getCellByLogical(l, f);
                delete cellData[`${c.colType}-${c.colIndex}-${f}`];
            }
            const cTest = getCellByLogical(l, 0);
            if (cTest) customRepeats = customRepeats.filter(rep => rep.colType !== cTest.colType || rep.colIndex !== cTest.colIndex || (maxF < rep.startF || minF > rep.endF));
        }
        focusCell();
    }
}

// === イベントハンドラ登録 ===

window.addEventListener('resize', () => { updateSectionPositions(); drawAll(); });

document.getElementById('panel-header').addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.id === 'panel-toggle-icon') return;
    isDraggingPanel = true; panelHasMoved = false;
    mouseStartX = e.clientX; mouseStartY = e.clientY;
    const panel = document.getElementById('floating-panel');
    const wrapper = document.getElementById('main-wrapper');
    panelOffsetX = e.clientX - panel.getBoundingClientRect().left;
    panelOffsetY = e.clientY - panel.getBoundingClientRect().top;
    panel.style.right = 'auto';
    panel.style.left = (panel.getBoundingClientRect().left - wrapper.getBoundingClientRect().left) + 'px';
    panel.style.top = (panel.getBoundingClientRect().top - wrapper.getBoundingClientRect().top) + 'px';
    e.preventDefault();
});

document.getElementById('cell-config-list').addEventListener('dragover', function(e) {
    e.preventDefault();
    if (!e.target.closest('.config-item') && draggedListItem) this.appendChild(draggedListItem);
});

document.getElementById('meta-wrapper').addEventListener('mousedown', (e) => {
    if (e.target === metaInput || e.target === metaTextArea) return;
    saveBookInput();
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const lines = (metaData.memo || "").split(/\r?\n/);
    const memoH = isMemoExpanded ? Math.max(87, lines.length * 18 + 15) : 40;
    if (lines.length > 4 && cx >= baseWidth - 85 && cx <= baseWidth - 30 && cy >= 60 + memoH - 22 && cy <= 60 + memoH - 4) {
        saveInput();
        isMemoExpanded = !isMemoExpanded;
        if (!isMemoExpanded) memoScrollLine = Math.min(memoScrollLine, Math.max(0, lines.length - 2));
        drawAll();
        return;
    }
    if (cx >= 25 && cx <= baseWidth - 25 && cy >= 60 && cy <= 60 + memoH) {
        focusMeta("memo", 25, 60, baseWidth - 50, memoH);
        return;
    }
    const field = metaFields.find(f => cx >= f.x && cx < f.x + f.w && cy >= f.y && cy < f.y + f.h);
    if (field) {
        if (field.id === 'page') { saveInput(); return; }
        if (field.id === 'sheetName') {
            // VERSION フィールド: ドロップダウンを開く
            saveInput();
            buildVersionSheetList();
            const dropdown = document.getElementById('version-dropdown');
            const wrapperRect = document.getElementById('meta-wrapper').getBoundingClientRect();
            dropdown.style.left = (wrapperRect.left + field.x) + 'px';
            dropdown.style.top = (wrapperRect.top + field.y + field.h) + 'px';
            dropdown.classList.add('open');
            // 直後の click で閉じられないようフラグを立てる
            window._versionDropdownJustOpened = Date.now();
            e.stopPropagation();
            return;
        }
        focusMeta(field);
    }
    else saveInput();
});

// VERSION ドロップダウンに現在のシート一覧をビルド
function buildVersionSheetList() {
    const list = document.getElementById('version-sheet-list');
    if (!list) return;
    list.innerHTML = '';
    if (typeof sheets === 'undefined' || sheets.length === 0) return;
    sheets.forEach((s, idx) => {
        const row = document.createElement('div');
        row.className = 'menu-row';
        row.style.cssText = 'display:flex; align-items:center; gap:6px;';
        const isCurrent = (idx === currentSheetIndex);
        row.innerHTML = `
            <span style="display:inline-block; width:10px; height:10px; border-radius:2px; background:${s.color && s.color !== 0 ? s.color : 'transparent'}; border:1px solid var(--border-color);"></span>
            <span style="flex:1; font-weight:${isCurrent ? 'bold' : 'normal'}; color:${isCurrent ? 'var(--select-border)' : 'var(--text-color)'};">${s.name}</span>
            ${isCurrent ? '<span style="font-size:10px; color:var(--select-border); font-weight:bold;">[現在]</span>' : ''}
        `;
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('version-dropdown').classList.remove('open');
            if (!isCurrent) switchToSheet(idx);
        });
        list.appendChild(row);
    });
}

// VERSION ドロップダウンの動作
document.querySelectorAll('#version-dropdown .menu-row[data-version-action]').forEach(row => {
    row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (row.classList.contains('menu-disabled')) return;
        const action = row.dataset.versionAction;
        document.getElementById('version-dropdown').classList.remove('open');
        if (action === 'rename') {
            const newName = prompt(t('prompt.sheetName'), metaData.sheetName || 'sheet1');
            if (newName !== null && newName.trim() !== '') {
                pushHistory();
                renameSheet(currentSheetIndex, newName.trim());
            }
        } else if (action === 'addSheet') {
            openSheetAddModal();
        } else if (action === 'copySheet') {
            copySheet(currentSheetIndex);
        } else if (action === 'deleteSheet') {
            deleteSheet(currentSheetIndex);
        }
    });
});
document.addEventListener('click', (e) => {
    // 開いた直後 (200ms以内) は無視
    if (window._versionDropdownJustOpened && (Date.now() - window._versionDropdownJustOpened) < 200) return;
    if (!e.target.closest('#version-dropdown')) {
        const d = document.getElementById('version-dropdown');
        if (d) d.classList.remove('open');
    }
});

// シート追加モーダル
function openSheetAddModal() {
    if (sheets.length >= MAX_SHEETS) {
        alert(`シートは最大 ${MAX_SHEETS} 枚までです。`);
        return;
    }
    const modal = document.getElementById('sheet-add-modal');
    // デフォルト名: 既存と被らない sheet{N}
    let n = sheets.length + 1;
    let candidate = 'sheet' + n;
    while (sheets.some(s => s.name === candidate)) { n++; candidate = 'sheet' + n; }
    document.getElementById('sheet-add-name').value = candidate;
    document.getElementById('sheet-add-color').value = '#cccccc';
    // 引継ぎシート選択肢
    const sel = document.getElementById('sheet-add-source');
    sel.innerHTML = '';
    sheets.forEach((s, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.innerText = s.name;
        if (idx === currentSheetIndex) opt.selected = true;
        sel.appendChild(opt);
    });
    document.querySelector('input[name="sheet-inherit"][value="all"]').checked = true;
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('sheet-add-name').focus(), 50);
}
document.getElementById('sheet-add-cancel').addEventListener('click', () => {
    document.getElementById('sheet-add-modal').style.display = 'none';
});
document.getElementById('sheet-add-modal').addEventListener('click', (e) => {
    if (e.target.id === 'sheet-add-modal') document.getElementById('sheet-add-modal').style.display = 'none';
});
document.getElementById('sheet-add-ok').addEventListener('click', () => {
    const name = document.getElementById('sheet-add-name').value.trim();
    if (!name) { alert('シート名を入力してください。'); return; }
    if (sheets.some(s => s.name === name)) { alert('同じ名前のシートが既にあります。'); return; }
    const color = document.getElementById('sheet-add-color').value;
    const sourceIdx = parseInt(document.getElementById('sheet-add-source').value, 10);
    const inherit = (document.querySelector('input[name="sheet-inherit"]:checked') || {}).value || 'all';
    pushHistory();
    if (addSheet(name, color, sourceIdx, inherit)) {
        document.getElementById('sheet-add-modal').style.display = 'none';
    }
});

document.getElementById('columnHeaderCanvas').addEventListener('dblclick', (e) => {
    const rect = e.target.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / currentZoom;
    const cy = (e.clientY - rect.top) / currentZoom;
    if (window.bookLayout) for (let b of window.bookLayout) {
        if (cx >= b.boxX && cx <= b.boxX + b.boxW && cy >= b.boxY && cy <= b.boxY + b.boxH) {
            editingBook = b;
            bookInput.style.cssText = `display:block; left:${b.boxX * currentZoom}px; top:${b.boxY * currentZoom}px; width:${b.boxW * currentZoom}px; height:${b.boxH * currentZoom}px;`;
            bookInput.value = b.text;
            setTimeout(() => { bookInput.focus(); bookInput.select(); }, 10);
            return;
        }
    }
    if (cy < colHeaderH - 50) {
        let nearest = findNearestLine(cx);
        if (nearest) {
            pushHistory();
            if (!booksData[nearest.type]) booksData[nearest.type] = {};
            if (!booksData[nearest.type][nearest.idx]) booksData[nearest.type][nearest.idx] = [];
            booksData[nearest.type][nearest.idx].unshift("book");
            drawAll();
        }
    }
});

document.getElementById('gridCanvas').addEventListener('dblclick', (e) => {
    const rect = e.target.getBoundingClientRect();
    const zX = (e.clientX - rect.left) / currentZoom;
    const zY = (e.clientY - rect.top) / currentZoom;
    let hit = getDialogueHit(zX, zY);
    if (hit) { selectedDialogueId = hit.block.id; window.openDialogueModal(); return; }
    let cHit = getCameraHit(zX, zY);
    if (cHit) {
        if (cHit.type === 'waypoint') {
            let currentLabel = cHit.block.waypoints[cHit.wpIndex].label || "";
            let newLabel = prompt(t('prompt.waypointLabel'), currentLabel);
            if (newLabel !== null) { pushHistory(); cHit.block.waypoints[cHit.wpIndex].label = newLabel.trim(); drawAll(); }
            return;
        } else { selectedCameraId = cHit.block.id; window.openCameraModal(); return; }
    }
});

document.getElementById('columnHeaderCanvas').addEventListener('mousedown', (e) => {
    if (e.button === 2) return;
    saveBookInput(); saveInput();
    const rect = e.target.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / currentZoom, cy = (e.clientY - rect.top) / currentZoom;
    if (window.bookLayout) for (let i = window.bookLayout.length - 1; i >= 0; i--) {
        let b = window.bookLayout[i];
        if (cx >= b.boxX && cx <= b.boxX + b.boxW && cy >= b.boxY && cy <= b.boxY + b.boxH) {
            draggingBook = { ...b, mouseX: e.clientX, mouseY: e.clientY, startX: e.clientX, startY: e.clientY, isMoved: false };
            isDraggingBook = true; e.preventDefault(); return;
        }
    }
});

document.getElementById('gridCanvas').addEventListener('mousedown', (e) => {
    if (e.button === 2) return;
    saveInput(); saveBookInput();
    const rect = e.target.getBoundingClientRect();
    const zX = (e.clientX - rect.left) / currentZoom;
    const zY = (e.clientY - rect.top) / currentZoom;
    const fi = yToFrame(zY);
    const sec = sections.find(s => zX >= s.x && zX < s.x + (s.cols * s.cw));
    let hit = getDialogueHit(zX, zY);
    let cHit = getCameraHit(zX, zY);
    if (hit) {
        pushHistory();
        selectedDialogueId = hit.block.id; selectedCameraId = null;
        dragDialogueInfo = { id: hit.block.id, type: hit.type, origStart: hit.block.startFrame, origEnd: hit.block.endFrame, origCol: hit.block.colIndex, startX: zX, startMouseY: zY, currentStart: hit.block.startFrame, currentEnd: hit.block.endFrame, currentCol: hit.block.colIndex, isColliding: false };
        isDragging = false; selectionStart = null; selectionEnd = null;
        cellInput.style.display = 'none'; drawAll(); return;
    } else if (cHit) {
        pushHistory();
        selectedCameraId = cHit.block.id; selectedDialogueId = null;
        if (cHit.type === 'waypoint') {
            dragCameraInfo = { id: cHit.block.id, type: 'waypoint', wpIndex: cHit.wpIndex, origWpFrame: cHit.block.waypoints[cHit.wpIndex].frame, currentWpFrame: cHit.block.waypoints[cHit.wpIndex].frame, startMouseY: zY, blockStart: cHit.block.startFrame, blockEnd: cHit.block.endFrame };
        } else {
            dragCameraInfo = { id: cHit.block.id, type: cHit.type, origStart: cHit.block.startFrame, origEnd: cHit.block.endFrame, origCol: cHit.block.colIndex, startX: zX, startMouseY: zY, currentStart: cHit.block.startFrame, currentEnd: cHit.block.endFrame, currentCol: cHit.block.colIndex, isColliding: false, colspan: cHit.block.colspan || 1 };
        }
        isDragging = false; selectionStart = null; selectionEnd = null;
        cellInput.style.display = 'none'; drawAll(); return;
    }
    selectedDialogueId = null; selectedCameraId = null;
    // マージンも含めて選択可能（先頭マージンの上限～末尾マージンの下限まで）
    const _hm = getHeadMargin();
    if (sec && fi >= -_hm && fi < numFrames - _hm) {
        const ci = Math.floor((zX - sec.x) / sec.cw);
        const cell = { frame: fi, colType: sec.type, colIndex: ci, x: sec.x + ci * sec.cw, w: sec.cw };
        isDragging = true;
        if (e.shiftKey && selectionStart) selectionEnd = cell;
        else { selectionStart = cell; selectionEnd = cell; }
        focusCell();
    }
});

window.addEventListener('mousemove', (e) => {
    if (isDraggingPanel) {
        const dx = e.clientX - mouseStartX, dy = e.clientY - mouseStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panelHasMoved = true;
        const wrapperRect = document.getElementById('main-wrapper').getBoundingClientRect();
        document.getElementById('floating-panel').style.left = (e.clientX - panelOffsetX - wrapperRect.left) + 'px';
        document.getElementById('floating-panel').style.top = (e.clientY - panelOffsetY - wrapperRect.top) + 'px';
        return;
    }
    if (isDraggingBook && draggingBook) {
        if (Math.abs(e.clientX - draggingBook.startX) > 3 || Math.abs(e.clientY - draggingBook.startY) > 3) draggingBook.isMoved = true;
        draggingBook.mouseX = e.clientX; draggingBook.mouseY = e.clientY;
        drawAll(); return;
    }
    const rect = document.getElementById('gridCanvas').getBoundingClientRect();
    const zX = (e.clientX - rect.left) / currentZoom;
    const zY = (e.clientY - rect.top) / currentZoom;
    if (!isDragging && !dragDialogueInfo && !dragCameraInfo && !isDraggingPanel && !isDraggingBook) {
        let hit = getDialogueHit(zX, zY);
        let cHit = getCameraHit(zX, zY);
        if (hit) document.getElementById('gridCanvas').style.cursor = ((hit.type === 'head' || hit.type === 'tail') ? 'ns-resize' : 'move');
        else if (cHit) {
            if (cHit.type === 'waypoint') document.getElementById('gridCanvas').style.cursor = 'ns-resize';
            else document.getElementById('gridCanvas').style.cursor = ((cHit.type === 'head' || cHit.type === 'tail') ? 'ns-resize' : 'move');
        } else document.getElementById('gridCanvas').style.cursor = 'default';
    }
    if (dragDialogueInfo) {
        let sndSec = sections.find(s => s.type === "SOUND");
        let dF = Math.round((zY - dragDialogueInfo.startMouseY) / rowHeight);
        let dC = Math.round((zX - dragDialogueInfo.startX) / sndSec.cw);
        let nS = dragDialogueInfo.origStart, nE = dragDialogueInfo.origEnd, nC = dragDialogueInfo.origCol;
        if (dragDialogueInfo.type === 'head') { nS += dF; if (nS > nE) nS = nE; }
        else if (dragDialogueInfo.type === 'tail') { nE += dF; if (nE < nS) nE = nS; }
        else if (dragDialogueInfo.type === 'move') { nS += dF; nE += dF; nC += dC; }
        if (nS < 0) { let off = 0 - nS; nS += off; if (dragDialogueInfo.type === 'move') nE += off; }
        if (nE >= targetFrames) { let off = nE - (targetFrames - 1); nE -= off; if (dragDialogueInfo.type === 'move') nS -= off; }
        if (nC < 0) nC = 0; if (nC >= sndSec.cols) nC = sndSec.cols - 1;
        dragDialogueInfo.isColliding = dialogueBlocks.some(b => b.id !== dragDialogueInfo.id && b.colIndex === nC && !(nE < b.startFrame || nS > b.endFrame));
        dragDialogueInfo.currentStart = nS; dragDialogueInfo.currentEnd = nE; dragDialogueInfo.currentCol = nC;
        drawAll(); return;
    }
    if (dragCameraInfo) {
        if (dragCameraInfo.type === 'waypoint') {
            let dF = Math.round((zY - dragCameraInfo.startMouseY) / rowHeight);
            let nF = dragCameraInfo.origWpFrame + dF;
            if (nF <= dragCameraInfo.blockStart) nF = dragCameraInfo.blockStart + 1;
            if (nF >= dragCameraInfo.blockEnd) nF = dragCameraInfo.blockEnd - 1;
            dragCameraInfo.currentWpFrame = nF; drawAll(); return;
        }
        let camSec = sections.find(s => s.type === "CAMERA");
        let dF = Math.round((zY - dragCameraInfo.startMouseY) / rowHeight);
        let dC = Math.round((zX - dragCameraInfo.startX) / camSec.cw);
        let nS = dragCameraInfo.origStart, nE = dragCameraInfo.origEnd, nC = dragCameraInfo.origCol;
        if (dragCameraInfo.type === 'head') { nS += dF; if (nS > nE) nS = nE; }
        else if (dragCameraInfo.type === 'tail') { nE += dF; if (nE < nS) nE = nS; }
        else if (dragCameraInfo.type === 'move') { nS += dF; nE += dF; nC += dC; }
        if (nS < 0) { let off = 0 - nS; nS += off; if (dragCameraInfo.type === 'move') nE += off; }
        if (nE >= targetFrames) { let off = nE - (targetFrames - 1); nE -= off; if (dragCameraInfo.type === 'move') nS -= off; }
        if (nC < 0) nC = 0;
        if (nC + dragCameraInfo.colspan - 1 >= camSec.cols) nC = camSec.cols - dragCameraInfo.colspan;
        dragCameraInfo.isColliding = cameraBlocks.some(b => b.id !== dragCameraInfo.id && !(nE < b.startFrame || nS > b.endFrame) && ((nC >= b.colIndex && nC < b.colIndex + (b.colspan || 1)) || (nC + dragCameraInfo.colspan - 1 >= b.colIndex && nC + dragCameraInfo.colspan - 1 < b.colIndex + (b.colspan || 1))));
        dragCameraInfo.currentStart = nS; dragCameraInfo.currentEnd = nE; dragCameraInfo.currentCol = nC;
        drawAll(); return;
    }
    if (!isDragging) return;
    const fi = yToFrame(zY);
    const sec = sections.find(s => zX >= s.x && zX < s.x + (s.cols * s.cw));
    const _hm2 = getHeadMargin();
    if (sec && fi >= -_hm2 && fi < numFrames - _hm2) {
        const ci = Math.floor((zX - sec.x) / sec.cw);
        selectionEnd = { frame: fi, colType: sec.type, colIndex: ci, x: sec.x + ci * sec.cw, w: sec.cw };
        drawAll();
    }
});

window.addEventListener('mouseup', (e) => {
    if (isDraggingPanel) { isDraggingPanel = false; if (!panelHasMoved) togglePanel(); return; }
    if (isDraggingBook) {
        if (draggingBook && draggingBook.isMoved) {
            const rect = document.getElementById('columnHeaderCanvas').getBoundingClientRect();
            const cx = (e.clientX - rect.left) / currentZoom, cy = (e.clientY - rect.top) / currentZoom;
            let nearest = findNearestLine(cx);
            if (nearest && cy < colHeaderH) {
                pushHistory();
                let oldArray = booksData[draggingBook.type][draggingBook.idx];
                if (oldArray && draggingBook.textIdx < oldArray.length) {
                    oldArray.splice(draggingBook.textIdx, 1);
                    if (oldArray.length === 0) delete booksData[draggingBook.type][draggingBook.idx];
                }
                let targetRow = Math.max(0, Math.round((colHeaderH - 50 - 15 - cy) / 24));
                if (!booksData[nearest.type]) booksData[nearest.type] = {};
                if (!booksData[nearest.type][nearest.idx]) booksData[nearest.type][nearest.idx] = [];
                let newArray = booksData[nearest.type][nearest.idx];
                if (targetRow >= newArray.length) newArray.push(draggingBook.text);
                else newArray.splice(targetRow, 0, draggingBook.text);
            }
        }
        isDraggingBook = false; draggingBook = null; drawAll(); return;
    }
    if (dragDialogueInfo) {
        let block = dialogueBlocks.find(b => b.id === dragDialogueInfo.id);
        if (block && !dragDialogueInfo.isColliding) {
            block.startFrame = dragDialogueInfo.currentStart;
            block.endFrame = dragDialogueInfo.currentEnd;
            block.colIndex = dragDialogueInfo.currentCol;
        }
        dragDialogueInfo = null; drawAll(); return;
    }
    if (dragCameraInfo) {
        let block = cameraBlocks.find(b => b.id === dragCameraInfo.id);
        if (block) {
            pushHistory();
            if (dragCameraInfo.type === 'waypoint') {
                block.waypoints[dragCameraInfo.wpIndex].frame = dragCameraInfo.currentWpFrame;
            } else if (!dragCameraInfo.isColliding) {
                let shiftF = dragCameraInfo.currentStart - block.startFrame;
                let shiftC = dragCameraInfo.currentCol - block.colIndex;
                if (block.isInlineEdit && dragCameraInfo.type === 'move' && (shiftF !== 0 || shiftC !== 0)) {
                    let cellsToMove = [];
                    for (let f = block.startFrame; f <= block.endFrame; f++) {
                        let key = `CAMERA-${block.colIndex}-${f}`;
                        if (cellData[key]) { cellsToMove.push({ f: f, data: JSON.parse(JSON.stringify(cellData[key])) }); delete cellData[key]; }
                    }
                    cellsToMove.forEach(cell => {
                        let newF = cell.f + shiftF; let newC = dragCameraInfo.currentCol;
                        if (newF >= 0 && newF < numFrames) { cellData[`CAMERA-${newC}-${newF}`] = cell.data; }
                    });
                }
                block.startFrame = dragCameraInfo.currentStart;
                block.endFrame = dragCameraInfo.currentEnd;
                block.colIndex = dragCameraInfo.currentCol;
                if (shiftF !== 0 && block.waypoints && block.waypoints.length > 0) {
                    block.waypoints.forEach(wp => { wp.frame += shiftF; });
                }
            }
        }
        dragCameraInfo = null; drawAll(); return;
    }
    isDragging = false;
});

cellInput.addEventListener('keydown', (e) => {
    if (e.key.startsWith('F')) e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' || e.key === 'y' || e.key === 'Z' || e.key === 'Y') return;
        if (e.key === 'c') { e.preventDefault(); copy(); return; }
        if (e.key === 'v') { e.preventDefault(); paste(); return; }
        if (e.key === 'x') { e.preventDefault(); copy(); deleteSelect(); return; }
    }
    if (e.key === 'Delete' || (e.key === 'Backspace' && cellInput.value === "")) { e.preventDefault(); deleteSelect(); return; }
    if (["F2", "F3", "F4", "Enter"].includes(e.key)) {
        if (e.key === "Enter" && selectionStart && selectionStart.colType === "SOUND") {
            e.preventDefault(); e.stopPropagation();
            const modal = document.getElementById('dialogue-modal');
            if (modal && modal.style.display !== 'block') window.openDialogueModal();
            return;
        }
        if (e.key === "Enter" && selectionStart && selectionStart.colType === "CAMERA") {
            let isInline = cameraBlocks.some(b => b.isInlineEdit && b.colIndex === selectionStart.colIndex && selectionStart.frame >= b.startFrame && selectionStart.frame <= b.endFrame);
            if (!isInline) {
                e.preventDefault(); e.stopPropagation();
                const modal = document.getElementById('camera-modal');
                if (modal && modal.style.display !== 'block') window.openCameraModal();
                return;
            }
        }
        pushHistory();
        if (e.key === "F2") cellInput.value = "●";
        if (e.key === "F3") cellInput.value = "○";
        if (e.key === "F4") cellInput.value = "×";
        saveInput();
        move(0, 1, false);
        return;
    }
    if (e.key === "F5" || e.key === "F6") {
        if (selectionStart) {
            const inputVal = cellInput.value.trim();
            // 空値・記号セルでは option を持たないので no-op
            if (inputVal === "" || ["●", "○", "×", "―"].includes(inputVal)) return;
            pushHistory();
            const key = `${selectionStart.colType}-${selectionStart.colIndex}-${selectionStart.frame}`;
            if (!cellData[key]) cellData[key] = { value: inputVal, option: null, text: null, fontColorId: 0 };
            else cellData[key].value = inputVal;
            const target = e.key === 'F5' ? "OPTION_KEYFRAME" : "OPTION_REFERENCEFRAME";
            cellData[key].option = (cellData[key].option === target) ? null : target;
            drawAll();
        }
        return;
    }
    if (e.key.startsWith("Arrow") && !selectedMeta) {
        e.preventDefault();
        if (e.key === "ArrowDown") move(0, 1, e.shiftKey);
        if (e.key === "ArrowUp") move(0, -1, e.shiftKey);
        if (e.key === "ArrowLeft") move(-1, 0, e.shiftKey);
        if (e.key === "ArrowRight") move(1, 0, e.shiftKey);
    }
});

cellInput.addEventListener('input', () => {
    cellInput.value = cellInput.value.replace(/[！-～]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/[^ -~\/]/g, '');
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && document.activeElement === metaInput) { e.preventDefault(); saveInput(); return; }
    if (e.key === 'Tab') {
        const dModal = document.getElementById('dialogue-modal');
        const cModal = document.getElementById('camera-modal');
        if ((dModal && dModal.style.display === 'block') || (cModal && cModal.style.display === 'block')) return;
        e.preventDefault();
        let currentMeta = selectedMeta;
        if (currentMeta) {
            saveInput();
            const order = ['title', 'subTitle', 'scene', 'cut', 'lengthSec', 'lengthFrame', 'creator', 'sheetName', 'memo'];
            let idx = order.indexOf(currentMeta);
            let nextIdx = (idx + (e.shiftKey ? -1 : 1) + order.length) % order.length;
            let nextId = order[nextIdx];
            if (nextId === "memo") {
                const lines = (metaData.memo || "").split(/\r?\n/);
                const memoH = isMemoExpanded ? Math.max(87, lines.length * 18 + 15) : 40;
                focusMeta("memo", 25, 60, baseWidth - 50, memoH);
            } else { let field = metaFields.find(f => f.id === nextId); if (field) focusMeta(field); }
            return;
        }
        if (selectedDialogueId || selectedCameraId) {
            let f = selectionStart ? selectionStart.frame : 0;
            if (selectedDialogueId) { let b = dialogueBlocks.find(b => b.id === selectedDialogueId); if (b) f = b.startFrame; }
            if (selectedCameraId) { let b = cameraBlocks.find(b => b.id === selectedCameraId); if (b) f = b.startFrame; }
            selectedDialogueId = null; selectedCameraId = null;
            let nextType = e.shiftKey ? "ACTION" : "CELL";
            let targetSec = sections.find(s => s.type === nextType);
            selectionStart = { frame: f, colType: nextType, colIndex: 0, x: targetSec.x, w: targetSec.cw };
            selectionEnd = selectionStart;
            focusCell(); scrollIfNeeded();
            return;
        }
        if (selectionStart) {
            saveInput();
            const secOrder = ["ACTION", "SOUND", "CELL", "CAMERA"];
            let currentSecIdx = secOrder.indexOf(selectionStart.colType);
            if (currentSecIdx !== -1) {
                let nextSecIdx = (currentSecIdx + (e.shiftKey ? -1 : 1) + secOrder.length) % secOrder.length;
                let nextType = secOrder[nextSecIdx];
                let targetSec = sections.find(s => s.type === nextType);
                if (targetSec) {
                    if (nextType === "SOUND") {
                        let block = dialogueBlocks.find(b => b.colIndex === 0 && selectionStart.frame >= b.startFrame && selectionStart.frame <= b.endFrame);
                        if (block) { selectedDialogueId = block.id; selectionStart = null; selectionEnd = null; cellInput.style.display = 'none'; drawAll(); return; }
                    }
                    if (nextType === "CAMERA") {
                        let block = cameraBlocks.find(b => b.colIndex === 0 && selectionStart.frame >= b.startFrame && selectionStart.frame <= b.endFrame);
                        if (block) { selectedCameraId = block.id; selectionStart = null; selectionEnd = null; cellInput.style.display = 'none'; drawAll(); return; }
                    }
                    selectionStart = { frame: selectionStart.frame, colType: targetSec.type, colIndex: 0, x: targetSec.x, w: targetSec.cw };
                    selectionEnd = selectionStart;
                    focusCell(); scrollIfNeeded();
                }
            }
            return;
        }
    }
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
        if (e.key === 'Enter') {
            if (['speakerNameInput', 'dialogueTextInput', 'dialogueStartInput', 'dialogueEndInput'].includes(e.target.id)) return;
            if (['cameraKindInput', 'camFromText', 'camToText', 'camLayersFrom', 'camLayersTo', 'camDirection', 'camNumericFr', 'camFairingMode', 'camFreeText', 'camTargetLayers', 'camWaypoints', 'camMemo', 'cameraStartInput', 'cameraEndInput'].includes(e.target.id)) return;
        }
        if (e.target.id !== 'cellInput') return;
    }
    // settings.js の matchShortcut を経由（ユーザー設定で再割り当て可能）
    if (typeof matchShortcut === 'function') {
        // ヘルプ
        if (matchShortcut(e, 'help.shortcuts')) { e.preventDefault(); if (typeof openHelpShortcuts === 'function') openHelpShortcuts(); return; }
        // ファイル操作
        if (matchShortcut(e, 'file.save')) {
            e.preventDefault();
            if (currentFileFormat === 'xdts') window.exportXDTS({ saveAs: false });
            else window.exportTDTS({ saveAs: false });
            return;
        }
        if (matchShortcut(e, 'file.saveAs')) { e.preventDefault(); window.exportTDTS({ saveAs: true }); return; }
        if (matchShortcut(e, 'file.open')) { e.preventDefault(); document.getElementById('fileInput').click(); return; }
        // ズーム
        if (matchShortcut(e, 'view.zoomIn')) { e.preventDefault(); zoomIn(); return; }
        if (matchShortcut(e, 'view.zoomOut')) { e.preventDefault(); zoomOut(); return; }
        if (matchShortcut(e, 'view.zoom100')) { e.preventDefault(); zoom100(); return; }
        if (matchShortcut(e, 'view.fit')) { e.preventDefault(); zoomFit(); return; }
        if (matchShortcut(e, 'edit.redo')) { e.preventDefault(); window.redo(); return; }
        if (matchShortcut(e, 'edit.undo')) { e.preventDefault(); window.undo(); return; }
        if (matchShortcut(e, 'insert.frameAll')) { e.preventDefault(); window.insertFramesAllLayers(); return; }
        if (matchShortcut(e, 'insert.frame')) { e.preventDefault(); window.insertFramesInSelectedCols(); return; }
        if (matchShortcut(e, 'insert.frameAllDelete')) { e.preventDefault(); window.deleteFramesAllLayers(); return; }
        if (matchShortcut(e, 'insert.frameDelete')) { e.preventDefault(); window.deleteFramesInSelectedCols(); return; }
        if (matchShortcut(e, 'edit.repeat')) { e.preventDefault(); window.applyRepeat && window.applyRepeat(); return; }
        if (matchShortcut(e, 'edit.color.0')) { e.preventDefault(); applyFontColor(0); return; }
        if (matchShortcut(e, 'edit.color.1')) { e.preventDefault(); applyFontColor(1); return; }
        if (matchShortcut(e, 'edit.color.2')) { e.preventDefault(); applyFontColor(2); return; }
        if (matchShortcut(e, 'edit.color.3')) { e.preventDefault(); applyFontColor(3); return; }
        if (matchShortcut(e, 'edit.color.4')) { e.preventDefault(); applyFontColor(4); return; }
        if (matchShortcut(e, 'edit.color.5')) { e.preventDefault(); applyFontColor(5); return; }
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDialogueId) { e.preventDefault(); window.deleteDialogueBlock(selectedDialogueId); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCameraId) { e.preventDefault(); window.deleteCameraBlock(selectedCameraId); return; }
    if (e.key === 'Enter' && document.activeElement.id !== 'cellInput') {
        if (selectedDialogueId) { e.preventDefault(); e.stopPropagation(); window.openDialogueModal(); return; }
        if (selectedCameraId) { e.preventDefault(); e.stopPropagation(); window.openCameraModal(); return; }
        if (selectionStart) {
            if (selectionStart.colType === "SOUND") {
                e.preventDefault(); e.stopPropagation();
                const modal = document.getElementById('dialogue-modal');
                if (modal && modal.style.display !== 'block') window.openDialogueModal();
                return;
            }
            if (selectionStart.colType === "CAMERA") {
                let isInline = cameraBlocks.some(b => b.isInlineEdit && b.colIndex === selectionStart.colIndex && selectionStart.frame >= b.startFrame && selectionStart.frame <= b.endFrame);
                if (!isInline) {
                    e.preventDefault(); e.stopPropagation();
                    const modal = document.getElementById('camera-modal');
                    if (modal && modal.style.display !== 'block') window.openCameraModal();
                    return;
                }
            }
            pushHistory(); saveInput(); move(0, 1, false); return;
        }
    }
});

const contextMenu = document.getElementById('context-menu');

document.getElementById('canvas-wrapper').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = e.target.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / currentZoom;
    const cy = (e.clientY - rect.top) / currentZoom;
    contextMenu.innerHTML = '';
    let menuItems = [];
    if (e.target.id === 'columnHeaderCanvas') {
        let clickedBook = null;
        if (window.bookLayout) {
            for (let b of window.bookLayout) {
                if (cx >= b.boxX && cx <= b.boxX + b.boxW && cy >= b.boxY && cy <= b.boxY + b.boxH) { clickedBook = b; break; }
            }
        }
        if (clickedBook) {
            menuItems.push({ label: t('ctx.edit'), action: () => { window.renameBook(clickedBook.idx, clickedBook.textIdx); } });
            menuItems.push({ label: t('ctx.delete'), action: () => { window.deleteBook(clickedBook.idx, clickedBook.textIdx); } });
        } else if (cy > colHeaderH - 25 && cy <= colHeaderH) {
            let clickedSec = sections.find(s => cx >= s.x && cx < s.x + s.cols * s.cw);
            if (clickedSec) {
                let colIndex = Math.floor((cx - clickedSec.x) / clickedSec.cw);
                if (clickedSec.type === "ACTION" || clickedSec.type === "CELL") {
                    menuItems.push({ label: t('ctx.renameLayer'), action: () => window.renameCellByRef(clickedSec.type, colIndex) });
                    menuItems.push({ label: t('ctx.deleteLayer'), action: () => window.deleteCellByRef(clickedSec.type, colIndex) });
                    menuItems.push({ label: t('ctx.addLeft'), action: () => window.addCellByRef(clickedSec.type, colIndex, 'left') });
                    menuItems.push({ label: t('ctx.addRight'), action: () => window.addCellByRef(clickedSec.type, colIndex, 'right') });
                } else if (clickedSec.type === "SOUND" || clickedSec.type === "CAMERA") {
                    menuItems.push({ label: t('ctx.addLayer'), action: () => window.addEndLayerByRef(clickedSec.type) });
                    menuItems.push({ label: t('ctx.deleteLayer'), action: () => window.deleteCellByRef(clickedSec.type, colIndex) });
                }
            }
        }
    } else if (e.target.id === 'gridCanvas') {
        let hit = getDialogueHit(cx, cy);
        let cHit = getCameraHit(cx, cy);
        if (hit) {
            selectedDialogueId = hit.block.id; drawAll();
            menuItems.push({ label: t('ctx.edit'), action: () => { window.openDialogueModal(); } });
            menuItems.push({ label: t('ctx.delete'), action: () => { window.deleteDialogueBlock(hit.block.id); } });
        } else if (cHit) {
            selectedCameraId = cHit.block.id; drawAll();
            if (cHit.type === 'waypoint') {
                menuItems.push({
                    label: t('ctx.editWaypointLabel'), action: () => {
                        let currentLabel = cHit.block.waypoints[cHit.wpIndex].label || "";
                        let newLabel = prompt(t('prompt.waypointLabel'), currentLabel);
                        if (newLabel !== null) { pushHistory(); cHit.block.waypoints[cHit.wpIndex].label = newLabel.trim(); drawAll(); }
                    }
                });
                menuItems.push({ label: t('ctx.deleteWaypoint'), action: () => { pushHistory(); cHit.block.waypoints.splice(cHit.wpIndex, 1); drawAll(); } });
            } else if (cHit.type === 'move' && (cHit.block.valueType === 'fromTo' || cHit.block.valueType === 'multiLayerDirection')) {
                let fi = yToFrame(cy);
                menuItems.push({
                    label: t('ctx.addWaypointHere'), action: () => {
                        pushHistory();
                        if (!cHit.block.waypoints) cHit.block.waypoints = [];
                        cHit.block.waypoints.push({ frame: fi, label: "" });
                        cHit.block.waypoints.sort((a, b) => a.frame - b.frame);
                        drawAll();
                    }
                });
            }
            menuItems.push({ label: t('ctx.edit'), action: () => { window.openCameraModal(); } });
            menuItems.push({ label: t('ctx.delete'), action: () => { window.deleteCameraBlock(cHit.block.id); } });
        } else {
            let fi = Math.floor(cy / rowHeight);
            let sec = sections.find(s => cx >= s.x && cx < s.x + s.cols * s.cw);
            let ci = sec ? Math.floor((cx - sec.x) / sec.cw) : -1;
            let clickedRepeat = customRepeats.find(r => r.colType === sec?.type && r.colIndex === ci && fi >= r.startF && fi <= r.endF);
            if (clickedRepeat) {
                menuItems.push({ label: t('ctx.removeRepeat'), action: () => { pushHistory(); customRepeats = customRepeats.filter(r => r !== clickedRepeat); drawAll(); }, color: '#ff5555' });
            }
            if (selectionStart && selectionEnd) {
                let minF = Math.min(selectionStart.frame, selectionEnd.frame);
                let maxF = Math.max(selectionStart.frame, selectionEnd.frame);
                let sL = getLogicalColIndex(selectionStart.colType, selectionStart.colIndex);
                let eL = getLogicalColIndex(selectionEnd.colType, selectionEnd.colIndex);
                let curL = sec ? getLogicalColIndex(sec.type, ci) : -1;
                if (curL >= Math.min(sL, eL) && curL <= Math.max(sL, eL) && fi >= minF && fi <= maxF) {
                    if (minF !== maxF && (sec.type === "ACTION" || sec.type === "CELL")) {
                        menuItems.push({ label: t('ctx.applyRepeat'), action: () => { window.applyRepeat(); } });
                    }
                }
                // コマ挿入/削除（4種）
                menuItems.push({ separator: true });
                menuItems.push({ label: t('ctx.insertFrame'), action: () => window.insertFramesInSelectedCols() });
                menuItems.push({ label: t('ctx.deleteFrame'), action: () => window.deleteFramesInSelectedCols() });
                menuItems.push({ label: t('ctx.insertFrameAll'), action: () => window.insertFramesAllLayers() });
                menuItems.push({ label: t('ctx.deleteFrameAll'), action: () => window.deleteFramesAllLayers() });
            }
        }
    }
    if (menuItems.length > 0) {
        menuItems.forEach(item => {
            if (item.separator) {
                let sep = document.createElement('div');
                sep.style.cssText = 'height:1px; background:var(--border-color); margin:4px 0; opacity:0.5;';
                contextMenu.appendChild(sep);
                return;
            }
            let div = document.createElement('div');
            div.style.cssText = `padding: 8px 12px; border-radius: 2px; transition: background 0.1s; color: ${item.color || 'var(--text-color)'}; cursor:pointer; font-size:12px;`;
            div.innerHTML = item.label;
            div.onmouseover = () => div.style.background = 'var(--select-bg)';
            div.onmouseout = () => div.style.background = 'transparent';
            div.onclick = () => { contextMenu.style.display = 'none'; item.action(); };
            contextMenu.appendChild(div);
        });
        contextMenu.style.display = 'block';
        contextMenu.style.left = e.pageX + 'px';
        contextMenu.style.top = e.pageY + 'px';
    }
});

window.addEventListener('click', (e) => { if (contextMenu && e.target.closest('#context-menu') === null) contextMenu.style.display = 'none'; });
