// === カメラワーク（CAMERA列）モーダル & ヒットテスト & 描画 ===

window.updateCameraKindList = function() {
    const categorySelect = document.getElementById('cameraCategorySelect');
    let cat = categorySelect ? categorySelect.value : '全て';
    let dl = document.getElementById('camera-kind-list'); dl.innerHTML = '';
    let list = CAMERA_CATEGORIES[cat] || CAMERA_CATEGORIES["全て"];
    list.forEach(kind => { let opt = document.createElement('option'); opt.value = kind; dl.appendChild(opt); });
    renderCameraRecentKinds();
    handleCameraKindChange();
};

window.handleCameraKindChange = function() {
    let rawKind = document.getElementById('cameraKindInput').value.trim();
    let kind = rawKind.split(' (')[0].trim();
    let vt = getCameraValueType(kind);
    ['vt-fromTo', 'vt-fromToLayers', 'vt-multiLayerDirection', 'vt-numericFr', 'vt-fairing', 'vt-freeText'].forEach(id => { let el = document.getElementById(id); if (el) el.style.display = 'none'; });
    if (vt !== "none") { let tgtEl = document.getElementById(`vt-${vt}`); if (tgtEl) tgtEl.style.display = 'block'; }
    let targetArea = document.getElementById('cam-target-area');
    if (targetArea) targetArea.style.display = (vt === "fromToLayers" || vt === "multiLayerDirection") ? 'none' : 'block';
    updateCameraKindMeta(kind, vt);
    if (kind === 'Rolling' || kind === 'WipeIN') document.getElementById('camInlineEditCheck').checked = true;
};

window.handleCameraKey = function(e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); saveCameraBlock(); } };

const CAMERA_RECENT_KEY = 'webTSEditor.cameraRecentKinds';

function getCameraKindBase(kind) {
    return (kind || '').split(' (')[0].trim();
}

function findCameraCategoryForKind(kind) {
    const base = getCameraKindBase(kind);
    if (!base) return '';
    for (let cat in CAMERA_CATEGORIES) {
        if (cat === '全て') continue;
        if ((CAMERA_CATEGORIES[cat] || []).some(k => getCameraKindBase(k) === base)) return cat;
    }
    return '';
}

function findCameraKindDisplay(kind) {
    const base = getCameraKindBase(kind);
    for (let cat in CAMERA_CATEGORIES) {
        const found = (CAMERA_CATEGORIES[cat] || []).find(k => getCameraKindBase(k) === base);
        if (found) return found;
    }
    return '';
}

function getCameraValueTypeLabel(vt) {
    const labels = {
        fromTo: 'cam.vt.fromTo',
        fromToLayers: 'cam.vt.transition',
        multiLayerDirection: 'cam.vt.multiLayer',
        numericFr: 'cam.vt.numeric',
        iris: 'cam.vt.iris',
        fairing: 'cam.vt.fairing',
        freeText: 'cam.vt.inline',
        instructionText: 'cam.vt.instruction'
    };
    const key = labels[vt] || 'cam.vt.none';
    return (typeof t === 'function') ? t(key) : vt;
}

function updateCameraKindMeta(kind, vt) {
    const el = document.getElementById('camera-kind-meta');
    if (!el) return;
    const cat = findCameraCategoryForKind(kind);
    if (!kind || !cat) {
        el.textContent = (typeof t === 'function') ? t('cam.kindHint') : '';
        return;
    }
    el.textContent = `${cat} / ${getCameraValueTypeLabel(vt)}`;
}

function getCameraRecentKinds() {
    try {
        const raw = localStorage.getItem(CAMERA_RECENT_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list.filter(Boolean) : [];
    } catch (e) {
        return [];
    }
}

function saveCameraRecentKind(kind) {
    const base = getCameraKindBase(kind);
    if (!base) return;
    const display = findCameraKindDisplay(base) || kind;
    const list = [display, ...getCameraRecentKinds().filter(k => getCameraKindBase(k) !== base)].slice(0, 6);
    try { localStorage.setItem(CAMERA_RECENT_KEY, JSON.stringify(list)); } catch (e) {}
}

function removeCameraRecentKind(kind) {
    const base = getCameraKindBase(kind);
    const list = getCameraRecentKinds().filter(k => getCameraKindBase(k) !== base);
    try { localStorage.setItem(CAMERA_RECENT_KEY, JSON.stringify(list)); } catch (e) {}
}

function renderCameraRecentKinds() {
    const el = document.getElementById('camera-recent-kinds');
    if (!el) return;
    const recent = getCameraRecentKinds();
    el.innerHTML = '';
    recent.slice(0, 4).forEach(kind => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'camera-recent-kind';
        btn.textContent = getCameraKindBase(kind);
        btn.title = `${kind} / 右クリックで履歴から削除`;
        btn.onclick = () => {
            const input = document.getElementById('cameraKindInput');
            input.value = kind;
            window.handleCameraKindChange();
            input.focus();
        };
        btn.oncontextmenu = (e) => {
            e.preventDefault();
            removeCameraRecentKind(kind);
            renderCameraRecentKinds();
        };
        el.appendChild(btn);
    });
}

function getCameraBlockCols(block) {
    const cols = [];
    const span = block ? (block.colspan || 1) : 0;
    for (let c = 0; c < span; c++) cols.push(block.colIndex + c);
    return cols;
}

function clearCameraBlockCells(block) {
    if (!block) return;
    getCameraBlockCols(block).forEach(colI => {
        for (let f = block.startFrame; f <= block.endFrame; f++) {
            delete cellData[`CAMERA-${colI}-${f}`];
        }
    });
}

function isInsideCameraBlock(block, colI, frame) {
    if (!block) return false;
    const span = block.colspan || 1;
    return colI >= block.colIndex && colI < block.colIndex + span && frame >= block.startFrame && frame <= block.endFrame;
}

function clearCameraCellsOutsideBlock(previousBlock, block) {
    if (!previousBlock) return;
    getCameraBlockCols(previousBlock).forEach(colI => {
        for (let f = previousBlock.startFrame; f <= previousBlock.endFrame; f++) {
            if (!isInsideCameraBlock(block, colI, f)) delete cellData[`CAMERA-${colI}-${f}`];
        }
    });
}

window.normalizeCameraBlockCells = function(block, previousBlock = null) {
    if (!block) return;
    if (block.isInlineEdit) {
        clearCameraCellsOutsideBlock(previousBlock, block);
        return;
    }
    if (previousBlock) clearCameraBlockCells(previousBlock);
    clearCameraBlockCells(block);
    const pKind = (block.kind || '').split(' (')[0].trim();
    for (let f = block.startFrame; f <= block.endFrame; f++) {
        const key = `CAMERA-${block.colIndex}-${f}`;
        if (f === block.startFrame) {
            cellData[key] = {
                value: pKind,
                text: block.value || '',
                option: null,
                fontColorId: 0
            };
        } else {
            cellData[key] = { value: '―', option: null, text: null, fontColorId: 0 };
        }
    }
};

window.normalizeAllCameraBlockCells = function() {
    cameraBlocks.forEach(block => window.normalizeCameraBlockCells(block));
};

window.addCamWaypointRow = function(frame = '', label = '') {
    let container = document.getElementById('camWaypointsContainer');
    if (frame === '' && label === '') {
        let existingRows = container.querySelectorAll('.waypoint-row');
        let lastLabel = document.getElementById('camFromText').value.trim() || 'A';
        if (existingRows.length > 0) lastLabel = existingRows[existingRows.length - 1].querySelector('.wp-label').value.trim();
        let core = lastLabel.replace(/セル/g, '').trim();
        let numMatch = core.match(/(\d+)$/);
        let charMatch = core.match(/([a-zA-Z])$/);
        if (numMatch) label = core.substring(0, core.length - numMatch[1].length) + (parseInt(numMatch[1], 10) + 1);
        else if (charMatch) label = core.substring(0, core.length - 1) + String.fromCharCode(charMatch[1].charCodeAt(0) + 1);
        else label = core + "'";
        let startF = parseInt(document.getElementById('cameraStartInput').value, 10) || 1;
        let endF = parseInt(document.getElementById('cameraEndInput').value, 10) || 24;
        let prevF = startF - 1;
        if (existingRows.length > 0) { let lastFrame = parseInt(existingRows[existingRows.length - 1].dataset.frame, 10); if (!isNaN(lastFrame)) prevF = lastFrame; }
        let end0 = endF - 1;
        let calcF = Math.floor((prevF + end0) / 2);
        if (calcF <= prevF) calcF = prevF + 1;
        if (calcF >= end0) calcF = end0 - 1;
        frame = calcF;
    }
    let row = document.createElement('div'); row.className = "waypoint-row";
    row.style.cssText = "display:flex; align-items:center; gap:5px;"; row.dataset.frame = frame;
    const tt = (k, fb) => (typeof t === 'function') ? t(k) : fb;
    row.innerHTML = `<span style="font-size:10px; color:var(--grid-medium);">↓</span><input type="text" class="wp-label" placeholder="${tt('cam.waypointLabel','ラベル')}" value="${label}" style="width:60px; padding:4px; background:var(--highlight); color:var(--text-color); border:1px solid var(--grid-thick);"><span style="font-size:10px; color:var(--grid-medium); flex:1;">${tt('cam.waypointHint','※位置はタイムラインで調整')}</span><button onclick="this.parentElement.remove()" style="padding:2px 6px; background:transparent; color:#ff5555; border:1px solid var(--border-color); cursor:pointer;">✖</button>`;
    container.appendChild(row);
};

window.addCamMultiDirRow = function(layer = '', dir = 'TD') {
    let container = document.getElementById('camMultiDirContainer');
    let row = document.createElement('div');
    row.style.cssText = "display:flex; align-items:center; gap:5px;";
    const tt = (k, fb) => (typeof t === 'function') ? t(k) : fb;
    const placeholder = tt('cam.fromPlaceholder', 'Aセル');
    row.innerHTML = `<input type="text" class="multi-layer-name" placeholder="${placeholder}" value="${layer}" style="width:30%; padding:4px; background:var(--highlight); color:var(--text-color); border:1px solid var(--grid-thick);"><select class="multi-layer-dir" style="width:55%; padding:4px; background:var(--highlight); color:var(--text-color); border:1px solid var(--grid-thick);"><option value="TD" ${dir==='TD'?'selected':''}>${tt('cam.dir.TD','上 → 下 (TD)')}</option><option value="DT" ${dir==='DT'?'selected':''}>${tt('cam.dir.DT','下 → 上 (DT)')}</option><option value="LR" ${dir==='LR'?'selected':''}>${tt('cam.dir.LR','左 → 右 (LR)')}</option><option value="RL" ${dir==='RL'?'selected':''}>${tt('cam.dir.RL','右 → 左 (RL)')}</option><option value="TU" ${dir==='TU'?'selected':''}>${tt('cam.dir.TU','手前 → 奥 (TU)')}</option><option value="TB" ${dir==='TB'?'selected':''}>${tt('cam.dir.TB','奥 → 手前 (TB)')}</option></select><button onclick="this.parentElement.remove()" style="width:15%; padding:4px; background:transparent; color:#ff5555; border:1px solid var(--border-color); cursor:pointer;">✖</button>`;
    container.appendChild(row);
};

function getCameraHit(zX, zY) {
    let camSec = sections.find(s => s.type === "CAMERA");
    if (!camSec) return null;
    for (let b of cameraBlocks) {
        let drawCols = b.colspan || 1;
        let drawWidth = camSec.cw * drawCols;
        let tx = camSec.x + b.colIndex * camSec.cw;
        if (zX >= tx && zX <= tx + drawWidth) {
            let startY = frameY(b.startFrame);
            let endY = frameY(b.endFrame + 1);
            if (zY >= startY && zY <= endY) {
                if (!b.isInlineEdit && b.waypoints && b.waypoints.length > 0) {
                    for (let i = 0; i < b.waypoints.length; i++) {
                        let wpY = frameY(b.waypoints[i].frame) + (rowHeight / 2);
                        if (Math.abs(zY - wpY) <= 12) return { block: b, type: 'waypoint', wpIndex: i };
                    }
                }
                if (Math.abs(zY - startY) <= 10) return { block: b, type: 'head' };
                if (Math.abs(zY - endY) <= 10) return { block: b, type: 'tail' };
                if (b.isInlineEdit) { if (zX - tx <= 20) return { block: b, type: 'move' }; return null; }
                return { block: b, type: 'move' };
            }
        }
    }
    return null;
}

window.openCameraModal = function() {
    let existingBlock = null; let minF, maxF;
    if (selectedCameraId) { existingBlock = cameraBlocks.find(b => b.id === selectedCameraId); }
    editingCameraId = null;
    const categorySelect = document.getElementById('cameraCategorySelect');
    if (categorySelect) categorySelect.value = '全て';
    let tgtContainer = document.getElementById('camera-target-suggestions'); tgtContainer.innerHTML = '';
    let addTgt = (val, inputId) => {
        let btn = document.createElement('span'); btn.innerText = val;
        btn.style.cssText = "font-size:11px; padding:3px 8px; background:var(--accent-color); color:#fff; border-radius:3px; cursor:pointer;";
        btn.onclick = () => { let input = document.getElementById(inputId); if (input.value.trim()) input.value += ", " + val; else input.value = val; };
        tgtContainer.appendChild(btn);
    };
    let layerNames = [];
    sections.find(s => s.type === "ACTION")?.chars.forEach(c => layerNames.push(c + "セル"));
    if (booksData["ACTION"]) { for (let k in booksData["ACTION"]) { booksData["ACTION"][k].forEach(b => layerNames.push(b)); } }
    layerNames.forEach(n => addTgt(n, 'camTargetLayers'));
    window.updateCameraKindList();
    document.getElementById('cameraKindInput').value = "";
    document.getElementById('camFromText').value = "";
    document.getElementById('camToText').value = "";
    document.getElementById('camWaypointsContainer').innerHTML = "";
    document.getElementById('camLayersFrom').value = "";
    document.getElementById('camLayersTo').value = "";
    document.getElementById('camNumericFr').value = "";
    document.getElementById('camFairingMode').value = "const";
    document.getElementById('camFreeText').value = "";
    document.getElementById('camTargetLayers').value = "";
    document.getElementById('camMemo').value = "";
    document.getElementById('camAddFairingCheck').checked = false;
    document.getElementById('camFairingUI').style.display = 'none';
    document.getElementById('camSubFairingMode').value = "in";
    document.getElementById('camSubFairingStart').value = "";
    document.getElementById('camSubFairingEnd').value = "";
    document.getElementById('camInlineEditCheck').checked = false;
    let fsInput = document.getElementById('camSubFairingStart');
    let feInput = document.getElementById('camSubFairingEnd');
    if (fsInput) fsInput.style.display = 'none';
    if (feInput) feInput.style.display = 'none';

    if (existingBlock) {
        editingCameraId = existingBlock.id;
        document.getElementById('cameraKindInput').value = existingBlock.kind;
        document.getElementById('camTargetLayers').value = (existingBlock.targetLayers || []).join(", ");
        document.getElementById('cameraStartInput').value = existingBlock.startFrame + 1;
        document.getElementById('cameraEndInput').value = existingBlock.endFrame + 1;
        if (existingBlock.isInlineEdit) document.getElementById('camInlineEditCheck').checked = true;
        window.handleCameraKindChange();
        let vt = existingBlock.valueType;
        if (vt === "fromTo") {
            document.getElementById('camFromText').value = existingBlock.fromText || "";
            document.getElementById('camToText').value = existingBlock.toText || "";
            if (existingBlock.waypoints && existingBlock.waypoints.length > 0) { existingBlock.waypoints.forEach(w => window.addCamWaypointRow(w.frame, w.label || '')); }
            if (existingBlock.hasFairing) {
                document.getElementById('camAddFairingCheck').checked = true;
                document.getElementById('camFairingUI').style.display = 'block';
                document.getElementById('camSubFairingMode').value = existingBlock.fairingMode || "in";
            }
        }
        if (vt === "fromToLayers") { document.getElementById('camLayersFrom').value = (existingBlock.layersFrom || []).join(", "); document.getElementById('camLayersTo').value = (existingBlock.layersTo || []).join(", "); }
        if (vt === "numericFr") { document.getElementById('camNumericFr').value = existingBlock.numericFr || "4"; }
        if (vt === "fairing") { document.getElementById('camFairingMode').value = existingBlock.fairingMode || "const"; }
        if (vt === "freeText") { document.getElementById('camFreeText').value = existingBlock.freeText || ""; }
        document.getElementById('camMemo').value = existingBlock.memo || "";
    } else if (selectionStart && selectionEnd && selectionStart.colType === "CAMERA") {
        minF = Math.min(selectionStart.frame, selectionEnd.frame);
        maxF = Math.max(selectionStart.frame, selectionEnd.frame);
        document.getElementById('cameraStartInput').value = minF + 1;
        document.getElementById('cameraEndInput').value = maxF + 1;
        window.handleCameraKindChange();
    } else return;
    document.getElementById('camera-modal').style.display = 'block';
    setTimeout(() => document.getElementById('cameraKindInput').focus(), 10);
};

window.closeCameraModal = function() { document.getElementById('camera-modal').style.display = 'none'; editingCameraId = null; };

window.saveCameraBlock = function() {
    let rawKind = document.getElementById('cameraKindInput').value.trim();
    if (!rawKind) { alert("種別 (Kind) を入力・選択してください。"); return; }
    let pKind = rawKind.split(' (')[0].trim();
    let vt = getCameraValueType(pKind);
    let startF = parseInt(document.getElementById('cameraStartInput').value, 10) - 1;
    let endF = parseInt(document.getElementById('cameraEndInput').value, 10) - 1;
    if (isNaN(startF) || isNaN(endF)) { alert("開始Frameと終了Frameを正しく入力してください。"); return; }

    let blockToEdit = cameraBlocks.find(b => b.id === editingCameraId);
    let previousBlock = blockToEdit ? JSON.parse(JSON.stringify(blockToEdit)) : null;
    let colIndex = blockToEdit ? blockToEdit.colIndex : (selectionStart ? selectionStart.colIndex : 0);

    let newBlock = {
        id: blockToEdit ? blockToEdit.id : Date.now(),
        colIndex: colIndex, startFrame: startF, endFrame: endF, colspan: 1,
        kind: rawKind, valueType: vt,
        memo: document.getElementById('camMemo').value.trim(),
        targetLayers: document.getElementById('camTargetLayers').value.split(',').map(s => s.trim()).filter(s => s),
        isInlineEdit: document.getElementById('camInlineEditCheck').checked
    };
    let finalValue = "";

    if (vt === 'numericFr') {
        let frVal = parseInt(document.getElementById('camNumericFr').value, 10);
        if (isNaN(frVal) || frVal <= 0) frVal = 4;
        if (frVal % 2 !== 0) { alert("エラー: ストロボの間隔フレーム（fr）は偶数を指定してください。"); return; }
        newBlock.numericFr = frVal; finalValue = "";
    }

    if (vt === 'fromTo') {
        let fromV = document.getElementById('camFromText').value.trim();
        let toV = document.getElementById('camToText').value.trim();
        newBlock.fromText = fromV; newBlock.toText = toV; newBlock.waypoints = [];
        let wpParts = []; if (fromV) wpParts.push(fromV);
        document.querySelectorAll('#camWaypointsContainer .waypoint-row').forEach(row => {
            let f = parseInt(row.dataset.frame, 10);
            let l = row.querySelector('.wp-label').value.trim();
            if (!isNaN(f) || l) {
                let wFrame = isNaN(f) ? startF : f;
                newBlock.waypoints.push({ frame: wFrame, label: l });
                if (l) wpParts.push(l);
            }
        });
        if (toV) wpParts.push(toV);
        finalValue = wpParts.join("→");

        let hasFairing = document.getElementById('camAddFairingCheck').checked;
        if (hasFairing) {
            newBlock.hasFairing = true;
            newBlock.fairingMode = document.getElementById('camSubFairingMode').value;
            if (newBlock.waypoints.length === 0) {
                let third = Math.floor((endF - startF) / 3) || 1;
                if (newBlock.fairingMode === 'in') newBlock.waypoints.push({ frame: startF + third, label: '' });
                else if (newBlock.fairingMode === 'out') newBlock.waypoints.push({ frame: endF - third, label: '' });
                else if (newBlock.fairingMode === 'both') {
                    newBlock.waypoints.push({ frame: startF + third, label: '' });
                    newBlock.waypoints.push({ frame: endF - third, label: '' });
                }
            } else if (newBlock.fairingMode === 'both' && newBlock.waypoints.length === 1) {
                newBlock.waypoints.push({ frame: endF - Math.floor((endF - startF) / 3), label: '' });
            }
            newBlock.waypoints.sort((a, b) => a.frame - b.frame);
        }
    }
    if (vt === 'fromToLayers') {
        newBlock.layersFrom = document.getElementById('camLayersFrom').value.split(',').map(s => s.trim()).filter(s => s);
        newBlock.layersTo = document.getElementById('camLayersTo').value.split(',').map(s => s.trim()).filter(s => s);
        finalValue = `${newBlock.layersFrom.join(',')}⋈${newBlock.layersTo.join(',')}`;
    }
    if (vt === 'fairing') { newBlock.fairingMode = document.getElementById('camFairingMode').value; finalValue = newBlock.fairingMode; }
    if (vt === 'freeText') { newBlock.freeText = document.getElementById('camFreeText').value.trim(); finalValue = newBlock.freeText; }

    newBlock.value = finalValue;
    if (startF > endF) { let temp = startF; startF = endF; endF = temp; }
    newBlock.startFrame = startF;
    newBlock.endFrame = endF;
    let collision = cameraBlocks.some(b => b.id !== editingCameraId && !(endF < b.startFrame || startF > b.endFrame) && ((colIndex >= b.colIndex && colIndex < b.colIndex + (b.colspan || 1)) || (colIndex + newBlock.colspan - 1 >= b.colIndex && colIndex + newBlock.colspan - 1 < b.colIndex + (b.colspan || 1))));
    if (collision) { alert("エラー: 他のカメラブロックと範囲が重なっています。"); return; }

    let fullKind = rawKind;
    for (let cat in CAMERA_CATEGORIES) {
        if (cat === "全て") continue;
        let found = CAMERA_CATEGORIES[cat].find(k => k.split(' (')[0].trim() === pKind || k === rawKind);
        if (found) { fullKind = found; break; }
    }
    fullKind = fullKind.replace(' (', '(');

    let dirParts = []; let tgts = newBlock.targetLayers.join(', ');
    if (tgts) dirParts.push(tgts);
    if (vt === "numericFr") dirParts.push(pKind); else dirParts.push(fullKind);
    if (finalValue && !newBlock.isInlineEdit && vt !== "numericFr") dirParts.push(finalValue);
    if (newBlock.hasFairing) { dirParts.push(`[フェアリング ${newBlock.fairingMode}]`); }
    if (newBlock.memo) dirParts.push(newBlock.memo);
    let dirLine = dirParts.join(' '); newBlock.dirText = dirLine;

    pushHistory();
    if (document.getElementById('camAutoDirCheck').checked) {
        let currentMemo = metaData.memo || "";
        if (editingCameraId && blockToEdit && blockToEdit.dirText && currentMemo.includes(blockToEdit.dirText)) {
            metaData.memo = currentMemo.replace(blockToEdit.dirText, dirLine); isMemoExpanded = true;
        } else if (!currentMemo.includes(dirLine)) {
            metaData.memo = currentMemo ? currentMemo + "\n" + dirLine : dirLine; isMemoExpanded = true;
        }
    }
    if (editingCameraId) { cameraBlocks = cameraBlocks.map(b => b.id === editingCameraId ? newBlock : b); }
    else { cameraBlocks.push(newBlock); }
    window.normalizeCameraBlockCells(newBlock, previousBlock);
    saveCameraRecentKind(rawKind);
    window.closeCameraModal(); selectedCameraId = null; drawAll();
};

window.deleteCameraBlock = function(blockId) {
    let block = cameraBlocks.find(b => b.id === blockId);
    if (!block) return;
    pushHistory();
    if (block.dirText && metaData.memo) {
        let lines = metaData.memo.split(/\r?\n/);
        lines = lines.filter(line => line.trim() !== block.dirText.trim());
        metaData.memo = lines.join('\n');
    }
    let drawCols = block.colspan || 1;
    for (let c = 0; c < drawCols; c++) {
        let colI = block.colIndex + c;
        for (let f = block.startFrame; f <= block.endFrame; f++) { delete cellData[`CAMERA-${colI}-${f}`]; }
    }
    cameraBlocks = cameraBlocks.filter(b => b.id !== blockId);
    if (selectedCameraId === blockId) selectedCameraId = null;
    drawAll();
};

// === カメラブロック描画 ===
function drawCameraBlocks(ctx) {
    let camSec = sections.find(s => s.type === "CAMERA");
    if (!camSec) return;
    cameraBlocks.forEach(block => {
        let sF = block.startFrame; let eF = block.endFrame; let colI = block.colIndex;
        // ダミー部分（マージン）も含めて描画（numFramesを使用）
        if (sF >= numFrames) return;
        let drawCols = block.colspan || 1;
        let drawWidth = camSec.cw * drawCols;
        let tx = camSec.x + colI * camSec.cw;
        let startY = frameY(sF);
        let endY = frameY(Math.min(eF, numFrames - 1) + 1);
        let vt = block.valueType;
        let pKind = block.kind.split(' (')[0].trim();
        let isRed = false;
        if (dragCameraInfo && dragCameraInfo.id === block.id && dragCameraInfo.type !== 'waypoint') isRed = dragCameraInfo.isColliding;
        ctx.fillStyle = isRed ? 'red' : getStyle('--text-color');
        ctx.strokeStyle = isRed ? 'red' : getStyle('--text-color');
        ctx.lineWidth = 1.5;
        let tgts = (block.targetLayers || []).join(',');

        let isShake = pKind.includes("CAM SHAKE") || pKind.includes("Handy") || pKind.includes("カメラぶれ") || pKind.includes("ハンディ");
        let isFill = pKind === "BL K" || pKind === "黒コマ" || pKind === "W K" || pKind === "白コマ";
        let isIris = pKind === "IrisIN" || pKind === "IrisOut";

        if (block.isInlineEdit) {
            let lineX = tx + 2; ctx.lineWidth = 3;
            ctx.strokeStyle = isRed ? 'red' : 'rgba(66, 133, 244, 0.8)';
            ctx.fillStyle = ctx.strokeStyle;
            ctx.beginPath(); ctx.moveTo(lineX, startY); ctx.lineTo(lineX, endY); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(lineX - 1, startY); ctx.lineTo(lineX + 8, startY); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(lineX - 1, endY); ctx.lineTo(lineX + 8, endY); ctx.stroke();
            // kind名/target名はブロック開始位置の上に積む (inline入力値との重なり回避)
            ctx.textAlign = "left";
            const labelLines = [pKind, ...(block.targetLayers || []).map(l => `[${l}]`)];
            const labelLineH = 11;
            let firstBaseline = startY - 5 - (labelLines.length - 1) * labelLineH;
            // 画面上端に近く上に描けない場合は欄上端付近へクランプ
            if (firstBaseline < 12) firstBaseline = 12;
            labelLines.forEach((txt, i) => {
                ctx.font = i === 0 ? "bold 10px sans-serif" : "9px sans-serif";
                ctx.fillText(txt, lineX + 6, firstBaseline + i * labelLineH);
            });
            ctx.lineWidth = 1.5;
        } else if (pKind === "FI" || pKind === "WI") {
            if (selectedCameraId === block.id) { ctx.strokeStyle = getStyle('--select-border'); ctx.lineWidth = 2; ctx.strokeRect(tx, startY, drawWidth, endY - startY); ctx.strokeStyle = isRed ? 'red' : getStyle('--text-color'); ctx.lineWidth = 1.5; }
            ctx.beginPath(); ctx.moveTo(tx + drawWidth / 2, startY); ctx.lineTo(tx + drawWidth, endY); ctx.lineTo(tx, endY); ctx.closePath();
            ctx.fillStyle = isRed ? 'rgba(255, 0, 0, 0.4)' : (pKind === "FI" ? 'rgba(100, 100, 100, 0.3)' : 'rgba(255, 255, 255, 0.3)');
            ctx.fill(); ctx.strokeStyle = isRed ? 'red' : getStyle('--text-color'); ctx.stroke();
            let midY = startY + (endY - startY) / 2 + 10;
            ctx.fillStyle = getStyle('--bg-color'); ctx.fillRect(tx + drawWidth / 2 - 15, midY - 10, 30, 14);
            ctx.fillStyle = isRed ? 'red' : getStyle('--text-color');
            ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
            ctx.fillText(pKind, tx + drawWidth / 2, midY);
            if (tgts) { ctx.font = "9px sans-serif"; ctx.fillText(`[${tgts}]`, tx + drawWidth / 2, midY + 12); }
        } else if (pKind === "FO" || pKind === "WO") {
            if (selectedCameraId === block.id) { ctx.strokeStyle = getStyle('--select-border'); ctx.lineWidth = 2; ctx.strokeRect(tx, startY, drawWidth, endY - startY); ctx.strokeStyle = isRed ? 'red' : getStyle('--text-color'); ctx.lineWidth = 1.5; }
            ctx.beginPath(); ctx.moveTo(tx, startY); ctx.lineTo(tx + drawWidth, startY); ctx.lineTo(tx + drawWidth / 2, endY); ctx.closePath();
            ctx.fillStyle = isRed ? 'rgba(255, 0, 0, 0.4)' : (pKind === "FO" ? 'rgba(100, 100, 100, 0.3)' : 'rgba(255, 255, 255, 0.3)');
            ctx.fill(); ctx.strokeStyle = isRed ? 'red' : getStyle('--text-color'); ctx.stroke();
            let midY = startY + (endY - startY) / 2 - 10;
            ctx.fillStyle = getStyle('--bg-color'); ctx.fillRect(tx + drawWidth / 2 - 15, midY - 10, 30, 14);
            ctx.fillStyle = isRed ? 'red' : getStyle('--text-color');
            ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
            ctx.fillText(pKind, tx + drawWidth / 2, midY);
            if (tgts) { ctx.font = "9px sans-serif"; ctx.fillText(`[${tgts}]`, tx + drawWidth / 2, midY - 12); }
        } else if (isFill) {
            if (selectedCameraId === block.id) { ctx.strokeStyle = getStyle('--select-border'); ctx.lineWidth = 2; ctx.strokeRect(tx, startY, drawWidth, endY - startY); ctx.strokeStyle = isRed ? 'red' : getStyle('--text-color'); ctx.lineWidth = 1.5; }
            let isBlack = pKind === "BL K" || pKind === "黒コマ";
            ctx.fillStyle = isBlack ? (isRed ? 'rgba(255, 0, 0, 0.8)' : '#333') : (isRed ? 'rgba(255, 0, 0, 0.4)' : '#ddd');
            ctx.fillRect(tx + 2, startY, drawWidth - 4, endY - startY);
            ctx.fillStyle = isBlack ? '#fff' : '#111';
            let midY = startY + (endY - startY) / 2;
            let dispText = tgts ? `[${tgts}] ${pKind}` : pKind;
            ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
            ctx.fillText(dispText, tx + drawWidth / 2, midY + 4);
        } else if (isIris) {
            if (selectedCameraId === block.id) { ctx.strokeStyle = getStyle('--select-border'); ctx.lineWidth = 2; ctx.strokeRect(tx, startY, drawWidth, endY - startY); ctx.strokeStyle = isRed ? 'red' : getStyle('--text-color'); ctx.lineWidth = 1.5; }
            let inset = Math.max(3, drawWidth * 0.18);
            ctx.beginPath();
            if (pKind === "IrisIN") {
                ctx.moveTo(tx + inset, startY);
                ctx.lineTo(tx + drawWidth - inset, startY);
                ctx.lineTo(tx + drawWidth, endY);
                ctx.lineTo(tx, endY);
            } else {
                ctx.moveTo(tx, startY);
                ctx.lineTo(tx + drawWidth, startY);
                ctx.lineTo(tx + drawWidth - inset, endY);
                ctx.lineTo(tx + inset, endY);
            }
            ctx.closePath();
            ctx.fillStyle = isRed ? 'rgba(255, 0, 0, 0.4)' : 'rgba(100, 100, 100, 0.25)';
            ctx.fill();
            ctx.strokeStyle = isRed ? 'red' : getStyle('--text-color');
            ctx.stroke();
            let midY = startY + (endY - startY) / 2;
            let dispText = tgts ? `[${tgts}] ${pKind}` : pKind;
            ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
            let tWidth = ctx.measureText(dispText).width + 8;
            ctx.fillStyle = getStyle('--bg-color'); ctx.fillRect(tx + drawWidth / 2 - tWidth / 2, midY - 10, tWidth, 20);
            ctx.fillStyle = isRed ? 'red' : getStyle('--text-color');
            ctx.fillText(dispText, tx + drawWidth / 2, midY + 4);
        } else if (isShake) {
            if (selectedCameraId === block.id) { ctx.strokeStyle = getStyle('--select-border'); ctx.lineWidth = 2; ctx.strokeRect(tx, startY, drawWidth, endY - startY); ctx.strokeStyle = isRed ? 'red' : getStyle('--text-color'); ctx.lineWidth = 1.5; }
            let lineX = tx + drawWidth / 2;
            ctx.beginPath(); ctx.moveTo(lineX - 10, startY); ctx.lineTo(lineX + 10, startY); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(lineX - 10, endY); ctx.lineTo(lineX + 10, endY); ctx.stroke();
            ctx.beginPath();
            for (let y = startY; y <= endY; y += 2) {
                let x = lineX + Math.sin((y - startY) * 0.4) * 4;
                if (y === startY) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
            let midY = startY + (endY - startY) / 2;
            let dispText = tgts ? `[${tgts}] ${pKind}` : pKind;
            ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
            let tWidth = ctx.measureText(dispText).width + 8;
            ctx.fillStyle = getStyle('--bg-color'); ctx.fillRect(lineX - tWidth / 2, midY - 10, tWidth, 20);
            ctx.fillStyle = isRed ? 'red' : getStyle('--text-color');
            ctx.fillText(dispText, lineX, midY + 4);
        } else if (vt === 'numericFr') {
            if (selectedCameraId === block.id) { ctx.strokeStyle = getStyle('--select-border'); ctx.lineWidth = 2; ctx.strokeRect(tx, startY, drawWidth, endY - startY); ctx.strokeStyle = isRed ? 'red' : getStyle('--text-color'); ctx.lineWidth = 1.5; }
            let frGap = block.numericFr || 4;
            let stepY = frGap * rowHeight;
            let cw = camSec.cw;
            ctx.fillStyle = isRed ? 'rgba(255, 0, 0, 0.4)' : 'rgba(100, 100, 100, 0.3)';
            ctx.strokeStyle = isRed ? 'red' : getStyle('--text-color');
            // クリップ領域を設定
            ctx.save();
            ctx.beginPath();
            ctx.rect(tx, startY, cw, endY - startY);
            ctx.clip();
            // 間隔を常に維持して描画
            for (let curY = startY; curY < endY; curY += stepY) {
                let cEndY = curY + stepY; // 常に間隔を維持
                let midY = curY + stepY / 2;
                let drawLeft = (type) => {
                    ctx.beginPath();
                    let lx = tx, rx = tx + cw / 2, cx = tx + cw / 4;
                    if (type === "hourglass") { ctx.moveTo(lx, curY); ctx.lineTo(rx, curY); ctx.lineTo(cx, midY); ctx.lineTo(rx, cEndY); ctx.lineTo(lx, cEndY); ctx.lineTo(cx, midY); }
                    else { ctx.moveTo(cx, curY); ctx.lineTo(rx, midY); ctx.lineTo(cx, cEndY); ctx.lineTo(lx, midY); }
                    ctx.closePath(); ctx.fill(); ctx.stroke();
                };
                let drawRight = (type) => {
                    ctx.beginPath();
                    let lx = tx + cw / 2, rx = tx + cw, cx = tx + cw * 0.75;
                    if (type === "hourglass") { ctx.moveTo(lx, curY); ctx.lineTo(rx, curY); ctx.lineTo(cx, midY); ctx.lineTo(rx, cEndY); ctx.lineTo(lx, cEndY); ctx.lineTo(cx, midY); }
                    else { ctx.moveTo(cx, curY); ctx.lineTo(rx, midY); ctx.lineTo(cx, cEndY); ctx.lineTo(lx, midY); }
                    ctx.closePath(); ctx.fill(); ctx.stroke();
                };
                if (pKind === "Strobo2" || pKind === "ストロボ2") { drawLeft("diamond"); drawRight("hourglass"); }
                else { drawLeft("hourglass"); drawRight("diamond"); }
            }
            ctx.restore();
            let dispText = tgts ? `[${tgts}] ${pKind}` : pKind;
            ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
            let tWidth = ctx.measureText(dispText).width + 8;
            let topTextY = startY + 14;
            ctx.fillStyle = getStyle('--bg-color'); ctx.fillRect(tx + drawWidth / 2 - tWidth / 2, topTextY - 10, tWidth, 16);
            ctx.fillStyle = isRed ? 'red' : getStyle('--text-color');
            ctx.fillText(dispText, tx + drawWidth / 2, topTextY + 2);
        } else if (vt === 'fromTo' || vt === 'multiLayerDirection') {
            if (selectedCameraId === block.id) { ctx.strokeStyle = getStyle('--select-border'); ctx.lineWidth = 2; ctx.strokeRect(tx, startY, drawWidth, endY - startY); ctx.strokeStyle = isRed ? 'red' : getStyle('--text-color'); ctx.lineWidth = 1.5; }
            let lineX = tx + 8;
            let labelX = lineX + 14;
            let wpYs = [];
            if (block.waypoints && block.waypoints.length > 0) {
                block.waypoints.forEach((wp, idx) => {
                    let f = wp.frame;
                    let isDraggingWp = (dragCameraInfo && dragCameraInfo.id === block.id && dragCameraInfo.type === 'waypoint' && dragCameraInfo.wpIndex === idx);
                    if (isDraggingWp) f = dragCameraInfo.currentWpFrame;
                    let wpY = frameY(f) + (rowHeight / 2);
                    if (wpY > startY && wpY < endY) { wpYs.push(wpY); }
                });
            }
            ctx.beginPath(); ctx.moveTo(lineX - 4, startY); ctx.lineTo(lineX + 4, startY); ctx.lineTo(lineX, startY + 6); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(lineX - 4, endY); ctx.lineTo(lineX + 4, endY); ctx.lineTo(lineX, endY - 6); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(lineX, startY + 6); ctx.lineTo(lineX, endY - 6); ctx.stroke();

            if (block.waypoints && block.waypoints.length > 0) {
                ctx.font = "10px sans-serif"; ctx.textAlign = "left";
                block.waypoints.forEach((wp, idx) => {
                    let f = wp.frame;
                    let isDraggingWp = (dragCameraInfo && dragCameraInfo.id === block.id && dragCameraInfo.type === 'waypoint' && dragCameraInfo.wpIndex === idx);
                    if (isDraggingWp) f = dragCameraInfo.currentWpFrame;
                    let wpY = frameY(f) + (rowHeight / 2);
                    if (wpY > startY && wpY < endY) {
                        ctx.strokeStyle = isDraggingWp ? 'red' : getStyle('--text-color');
                        ctx.fillStyle = isDraggingWp ? 'red' : getStyle('--text-color');
                        ctx.beginPath(); ctx.moveTo(lineX - 6, wpY); ctx.lineTo(lineX + 6, wpY); ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1.5;
                        if (wp.label) ctx.fillText(wp.label, lineX + 8, wpY + 4);
                        ctx.strokeStyle = getStyle('--text-color'); ctx.fillStyle = getStyle('--text-color');
                    }
                });
            }

            if (block.hasFairing && block.waypoints && block.waypoints.length > 0) {
                let fMode = block.fairingMode; wpYs.sort((a, b) => a - b);
                let drawFairingLabel = (yStart, yEnd) => {
                    let fMidY = yStart + (yEnd - yStart) / 2;
                    let fLineX = lineX + 10;
                    ctx.beginPath(); ctx.moveTo(fLineX + 3, yStart); ctx.lineTo(fLineX, yStart); ctx.lineTo(fLineX, yEnd); ctx.lineTo(fLineX + 3, yEnd); ctx.stroke();
                    ctx.fillStyle = isRed ? 'red' : getStyle('--text-color'); ctx.font = "9px sans-serif";
                    let fText = "フェアリング"; let textTop = fMidY - (fText.length * 10) / 2;
                    for (let i = 0; i < fText.length; i++) ctx.fillText(fText[i], fLineX + 7, textTop + i * 10 + 8);
                };
                if (fMode === "in" || fMode === "both") drawFairingLabel(startY, wpYs[0]);
                if (fMode === "out" || fMode === "both") drawFairingLabel(wpYs[wpYs.length - 1], endY);
            }

            wpYs.sort((a, b) => a - b);
            let points = [startY + 20, ...wpYs, endY - 20];
            let maxGap = 0; let bestCenterY = startY + (endY - startY) / 2;
            for (let i = 0; i < points.length - 1; i++) { let gap = points[i + 1] - points[i]; if (gap > maxGap) { maxGap = gap; bestCenterY = points[i] + gap / 2; } }
            ctx.fillStyle = isRed ? 'red' : getStyle('--text-color'); ctx.font = "10px sans-serif"; ctx.textAlign = "left";
            if (block.fromText) ctx.fillText(block.fromText, lineX + 8, startY + 12);
            if (block.toText) ctx.fillText(block.toText, lineX + 8, endY - 4);
            ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
            let chars = pKind.split('');
            let targetRows = tgts ? Math.max(1, String(tgts).split(',').filter(Boolean).length) : 0;
            let targetBlockH = targetRows ? targetRows * 13 + 6 : 0;
            let textHeight = chars.length * 14 + targetBlockH;
            let avoidRanges = [];
            if (block.fromText) avoidRanges.push({ top: startY + 5, bottom: startY + 20 });
            if (block.toText) avoidRanges.push({ top: endY - 12, bottom: endY + 4 });
            if (block.waypoints && block.waypoints.length > 0) {
                block.waypoints.forEach((wp) => {
                    let wpY = frameY(wp.frame) + (rowHeight / 2);
                    if (wpY > startY && wpY < endY) avoidRanges.push({ top: wpY - 12, bottom: wpY + 12 });
                });
            }
            let chooseOpenTop = (desiredCenter, labelH) => {
                let safeTop = startY + 4;
                let safeBottom = endY - 4;
                let blocked = avoidRanges
                    .map(r => ({ top: Math.max(safeTop, r.top), bottom: Math.min(safeBottom, r.bottom) }))
                    .filter(r => r.bottom > r.top)
                    .sort((a, b) => a.top - b.top);
                let free = [];
                let cur = safeTop;
                blocked.forEach(r => {
                    if (r.top > cur) free.push({ top: cur, bottom: r.top });
                    cur = Math.max(cur, r.bottom);
                });
                if (cur < safeBottom) free.push({ top: cur, bottom: safeBottom });
                if (!free.length) return Math.max(safeTop, Math.min(safeBottom - labelH, desiredCenter - labelH / 2));
                return free.map(r => {
                    let canFit = (r.bottom - r.top) >= labelH;
                    let top = canFit
                        ? Math.max(r.top, Math.min(r.bottom - labelH, desiredCenter - labelH / 2))
                        : r.top + (r.bottom - r.top - labelH) / 2;
                    return { top, canFit, distance: Math.abs(top + labelH / 2 - desiredCenter), size: r.bottom - r.top };
                }).sort((a, b) => (b.canFit - a.canFit) || (a.distance - b.distance) || (b.size - a.size))[0].top;
            };
            let labelTopY = chooseOpenTop(bestCenterY, textHeight);
            let textStartY = labelTopY + targetBlockH + 10;
            ctx.fillStyle = getStyle('--bg-color');
            let bgWidth = tgts ? Math.max(14, ctx.measureText(`[${tgts}]`).width + 4) : 14;
            ctx.fillRect(labelX - bgWidth / 2, labelTopY - 2, bgWidth, textHeight + 4);
            ctx.fillStyle = isRed ? 'red' : getStyle('--text-color');
            if (tgts) { ctx.font = "9px sans-serif"; ctx.fillText(`[${tgts}]`, labelX, labelTopY + 8); }
            ctx.font = "bold 12px sans-serif";
            chars.forEach((c, i) => { if (c === "ー") c = "丨"; ctx.fillText(c, labelX, textStartY + i * 14); });
        } else if (vt === 'fromToLayers') {
            if (selectedCameraId === block.id) { ctx.strokeStyle = getStyle('--select-border'); ctx.lineWidth = 2; ctx.strokeRect(tx, startY, drawWidth, endY - startY); ctx.strokeStyle = isRed ? 'red' : getStyle('--text-color'); ctx.lineWidth = 1.5; }
            ctx.beginPath();
            ctx.moveTo(tx, startY); ctx.lineTo(tx + drawWidth, startY); ctx.lineTo(tx + drawWidth / 2, startY + (endY - startY) / 2);
            ctx.lineTo(tx + drawWidth, endY); ctx.lineTo(tx, endY); ctx.lineTo(tx + drawWidth / 2, startY + (endY - startY) / 2); ctx.closePath();
            ctx.fillStyle = isRed ? 'rgba(255, 0, 0, 0.4)' : 'rgba(100, 100, 100, 0.3)';
            ctx.fill(); ctx.strokeStyle = isRed ? 'red' : getStyle('--text-color'); ctx.stroke();
            ctx.font = "10px sans-serif"; ctx.textAlign = "center";
            ctx.fillStyle = isRed ? 'red' : getStyle('--text-color');
            let fromL = (block.layersFrom || []).join(',');
            let toL = (block.layersTo || []).join(',');
            if (fromL) ctx.fillText(fromL, tx + drawWidth / 2, startY + 12);
            if (toL) ctx.fillText(toL, tx + drawWidth / 2, endY - 4);
            ctx.fillStyle = getStyle('--bg-color');
            ctx.fillRect(tx + drawWidth / 2 - 12, startY + (endY - startY) / 2 - 8, 24, 16);
            ctx.fillStyle = isRed ? 'red' : getStyle('--text-color');
            ctx.fillText(pKind === "Wipe" ? "Wipe" : "O.L", tx + drawWidth / 2, startY + (endY - startY) / 2 + 4);
        } else if (vt === 'instructionText') {
            if (selectedCameraId === block.id) { ctx.strokeStyle = getStyle('--select-border'); ctx.lineWidth = 2; ctx.strokeRect(tx, startY, drawWidth, endY - startY); ctx.strokeStyle = isRed ? 'red' : getStyle('--text-color'); ctx.lineWidth = 1.5; }
            let lineX = tx + drawWidth / 2;
            ctx.beginPath(); ctx.moveTo(lineX - 10, startY); ctx.lineTo(lineX + 10, startY); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(lineX - 10, endY); ctx.lineTo(lineX + 10, endY); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(lineX, startY); ctx.lineTo(lineX, endY); ctx.stroke();
            let midY = startY + (endY - startY) / 2;
            let dispText = tgts ? `[${tgts}]${pKind}` : pKind;
            let chars = dispText.split('');
            ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
            ctx.fillStyle = getStyle('--bg-color');
            ctx.fillRect(lineX - 10, midY - chars.length * 6 - 6, 20, chars.length * 12 + 12);
            ctx.fillStyle = isRed ? 'red' : getStyle('--text-color');
            chars.forEach((c, i) => { if (c === "ー") c = "丨"; ctx.fillText(c, lineX, midY - chars.length * 6 + i * 12 + 10); });
        } else {
            if (selectedCameraId === block.id) { ctx.strokeStyle = getStyle('--select-border'); ctx.lineWidth = 2; ctx.strokeRect(tx, startY, drawWidth, endY - startY); ctx.strokeStyle = isRed ? 'red' : getStyle('--text-color'); ctx.lineWidth = 1.5; }
            let lineX = tx + drawWidth / 2;
            ctx.beginPath(); ctx.moveTo(lineX - 10, startY); ctx.lineTo(lineX + 10, startY); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(lineX - 10, endY); ctx.lineTo(lineX + 10, endY); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(lineX, startY); ctx.lineTo(lineX, endY); ctx.stroke();
            let midY = startY + (endY - startY) / 2;
            let dispText = tgts ? `[${tgts}] ${pKind}` : pKind;
            ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
            let tWidth = ctx.measureText(dispText).width + 8;
            ctx.fillStyle = getStyle('--bg-color'); ctx.fillRect(lineX - tWidth / 2, midY - 10, tWidth, 20);
            ctx.fillStyle = isRed ? 'red' : getStyle('--text-color');
            ctx.fillText(dispText, lineX, midY + 4);
        }

        if (dragCameraInfo && dragCameraInfo.id === block.id && dragCameraInfo.type !== 'waypoint') {
            let gTx = camSec.x + dragCameraInfo.currentCol * camSec.cw;
            let gStartY = frameY(dragCameraInfo.currentStart);
            let gEndY = frameY(Math.min(dragCameraInfo.currentEnd, numFrames - 1) + 1);
            let isR = dragCameraInfo.isColliding;
            if (block.isInlineEdit) {
                let gLineX = gTx + 2;
                ctx.strokeStyle = isR ? 'red' : 'rgba(66, 133, 244, 0.4)'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(gLineX, gStartY); ctx.lineTo(gLineX, gEndY); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(gLineX - 1, gStartY); ctx.lineTo(gLineX + 8, gStartY); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(gLineX - 1, gEndY); ctx.lineTo(gLineX + 8, gEndY); ctx.stroke();
                ctx.lineWidth = 1.5;
            } else {
                ctx.fillStyle = isR ? 'rgba(255, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.3)';
                ctx.fillRect(gTx, gStartY, drawWidth, gEndY - gStartY);
                ctx.strokeStyle = isR ? 'red' : 'rgba(255, 255, 255, 0.8)'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(gTx, gStartY); ctx.lineTo(gTx + drawWidth, gStartY); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(gTx, gEndY); ctx.lineTo(gTx + drawWidth, gEndY); ctx.stroke();
            }
        }
    });
}
