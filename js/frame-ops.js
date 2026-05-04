// === コマ挿入 / 削除（4種） ===
//
// 1. コマ挿入（選択列）       insertFramesInSelectedCols()
// 2. コマ削除（選択列）       deleteFramesInSelectedCols()
// 3. 全レイヤにコマ挿入       insertFramesAllLayers()
// 4. 全レイヤからコマ削除     deleteFramesAllLayers()

// --- ヘルパー: 単一列の cellData を frame >= fromF で +shift ずらす ---
function shiftCellsInCol(colType, colIndex, fromF, shift) {
    // 集めて処理（イテレーション中の書き換えを避ける）
    const entries = [];
    for (const k in cellData) {
        const p = parseCellKey(k); if (!p) continue;
        if (p[0] === colType && parseInt(p[1], 10) === colIndex) {
            entries.push({ key: k, frame: parseInt(p[2], 10), data: cellData[k] });
        }
    }
    // 削除→再配置
    entries.forEach(e => { delete cellData[e.key]; });
    entries.forEach(e => {
        if (shift > 0) {
            // 挿入: from以降を +shift
            const newF = e.frame >= fromF ? e.frame + shift : e.frame;
            if (newF < numFrames) cellData[`${colType}-${colIndex}-${newF}`] = e.data;
        } else if (shift < 0) {
            const delLen = -shift;
            // 削除範囲 [fromF, fromF+delLen-1]
            if (e.frame >= fromF && e.frame < fromF + delLen) return; // 削除
            const newF = e.frame >= fromF + delLen ? e.frame + shift : e.frame;
            cellData[`${colType}-${colIndex}-${newF}`] = e.data;
        } else {
            cellData[e.key] = e.data;
        }
    });
}

// --- ヘルパー: ブロック配列を挿入/削除に応じてシフト/トリム ---
// stats: { deleted: 0, trimmed: 0 } を渡すと集計
function shiftBlocks(blocks, fromF, shift, colFilter, stats) {
    const result = [];
    for (let b of blocks) {
        if (colFilter && !colFilter(b)) { result.push(b); continue; }
        if (shift > 0) {
            if (b.startFrame >= fromF) {
                b.startFrame += shift; b.endFrame += shift;
            } else if (b.endFrame >= fromF) {
                b.endFrame += shift;
            }
            if (b.waypoints) {
                b.waypoints.forEach(wp => { if (wp.frame >= fromF) wp.frame += shift; });
            }
            result.push(b);
        } else if (shift < 0) {
            const delLen = -shift;
            const delEnd = fromF + delLen - 1;
            if (b.endFrame < fromF) { result.push(b); continue; }
            if (b.startFrame > delEnd) { b.startFrame -= delLen; b.endFrame -= delLen; }
            else if (b.startFrame >= fromF && b.endFrame <= delEnd) {
                if (stats) stats.deleted++;
                continue;
            }
            else if (b.startFrame < fromF && b.endFrame <= delEnd) {
                b.endFrame = fromF - 1;
                if (stats) stats.trimmed++;
            }
            else if (b.startFrame >= fromF && b.endFrame > delEnd) {
                b.startFrame = fromF; b.endFrame -= delLen;
                if (stats) stats.trimmed++;
            }
            else if (b.startFrame < fromF && b.endFrame > delEnd) {
                b.endFrame -= delLen;
                if (stats) stats.trimmed++;
            }
            if (b.waypoints) {
                b.waypoints = b.waypoints
                    .filter(wp => !(wp.frame >= fromF && wp.frame <= delEnd))
                    .map(wp => { if (wp.frame > delEnd) wp.frame -= delLen; return wp; });
            }
            if (b.endFrame >= b.startFrame) result.push(b);
        }
    }
    return result;
}

// --- ヘルパー: customRepeats のシフト/トリム ---
function shiftCustomRepeats(fromF, shift, colFilter) {
    const result = [];
    for (let r of customRepeats) {
        if (colFilter && !colFilter(r)) { result.push(r); continue; }
        if (shift > 0) {
            if (r.startF >= fromF) { r.startF += shift; r.endF += shift; }
            else if (r.endF >= fromF) { r.endF += shift; }
            result.push(r);
        } else if (shift < 0) {
            const delLen = -shift;
            const delEnd = fromF + delLen - 1;
            if (r.endF < fromF) { result.push(r); continue; }
            if (r.startF > delEnd) { r.startF -= delLen; r.endF -= delLen; }
            else if (r.startF >= fromF && r.endF <= delEnd) continue;
            else if (r.startF < fromF && r.endF <= delEnd) r.endF = fromF - 1;
            else if (r.startF >= fromF && r.endF > delEnd) { r.startF = fromF; r.endF -= delLen; }
            else if (r.startF < fromF && r.endF > delEnd) r.endF -= delLen;
            if (r.endF >= r.startF) result.push(r);
        }
    }
    return result;
}

// --- 選択範囲から (fromF, count, logicalCols) を取り出す ---
function getSelectionRange() {
    if (!selectionStart || !selectionEnd) return null;
    const minF = Math.min(selectionStart.frame, selectionEnd.frame);
    const maxF = Math.max(selectionStart.frame, selectionEnd.frame);
    const count = maxF - minF + 1;
    const sL = getLogicalColIndex(selectionStart.colType, selectionStart.colIndex);
    const eL = getLogicalColIndex(selectionEnd.colType, selectionEnd.colIndex);
    const minL = Math.min(sL, eL), maxL = Math.max(sL, eL);
    const cols = [];
    for (let l = minL; l <= maxL; l++) {
        const c = getCellByLogical(l, 0);
        if (c) cols.push({ colType: c.colType, colIndex: c.colIndex });
    }
    return { fromF: minF, count, cols };
}

// --- targetFrames（カット尺）を ±count 変更 ---
function shiftTargetFrames(delta) {
    const total = (parseInt(metaData.lengthSec, 10) || 0) * 24 + (parseInt(metaData.lengthFrame, 10) || 0);
    const newTotal = Math.max(1, total + delta);
    metaData.lengthSec = Math.floor(newTotal / 24).toString();
    metaData.lengthFrame = String(newTotal % 24).padStart(2, '0');
}

// --- 操作後の表示を最新の cellData に合わせる（cellInput の古い値が残らないように） ---
function refreshAfterFrameOp() {
    drawAll();
    if (selectionStart && typeof focusCell === 'function') focusCell();
}

// --- 削除/トリム集計のメッセージ表示 ---
function reportBlockChanges(stats) {
    const msgs = [];
    if (stats.dialogueDeleted) msgs.push(`セリフブロック ${stats.dialogueDeleted}件 を削除しました`);
    if (stats.dialogueTrimmed) msgs.push(`セリフブロック ${stats.dialogueTrimmed}件 をトリムしました`);
    if (stats.cameraDeleted) msgs.push(`カメラブロック ${stats.cameraDeleted}件 を削除しました`);
    if (stats.cameraTrimmed) msgs.push(`カメラブロック ${stats.cameraTrimmed}件 をトリムしました`);
    if (stats.repeatDeleted) msgs.push(`リピート ${stats.repeatDeleted}件 を削除しました`);
    if (msgs.length) alert(msgs.join('\n'));
}

// === 1. コマ挿入（選択列） ===
window.insertFramesInSelectedCols = function() {
    const sel = getSelectionRange();
    if (!sel) { alert("範囲を選択してください。"); return; }
    if (typeof saveInput === 'function') saveInput();
    pushHistory();
    sel.cols.forEach(c => shiftCellsInCol(c.colType, c.colIndex, sel.fromF, sel.count));
    dialogueBlocks = shiftBlocks(dialogueBlocks, sel.fromF, sel.count,
        (b) => sel.cols.some(c => c.colType === "SOUND" && c.colIndex === b.colIndex));
    cameraBlocks = shiftBlocks(cameraBlocks, sel.fromF, sel.count,
        (b) => sel.cols.some(c => c.colType === "CAMERA" && c.colIndex === b.colIndex));
    customRepeats = shiftCustomRepeats(sel.fromF, sel.count,
        (r) => sel.cols.some(c => c.colType === r.colType && c.colIndex === r.colIndex));
    refreshAfterFrameOp();
};

// === 2. コマ削除（選択列） ===
window.deleteFramesInSelectedCols = function() {
    const sel = getSelectionRange();
    if (!sel) { alert("範囲を選択してください。"); return; }
    if (typeof saveInput === 'function') saveInput();
    pushHistory();
    sel.cols.forEach(c => shiftCellsInCol(c.colType, c.colIndex, sel.fromF, -sel.count));
    const dStats = { deleted: 0, trimmed: 0 };
    const cStats = { deleted: 0, trimmed: 0 };
    const beforeRepCount = customRepeats.length;
    dialogueBlocks = shiftBlocks(dialogueBlocks, sel.fromF, -sel.count,
        (b) => sel.cols.some(c => c.colType === "SOUND" && c.colIndex === b.colIndex), dStats);
    cameraBlocks = shiftBlocks(cameraBlocks, sel.fromF, -sel.count,
        (b) => sel.cols.some(c => c.colType === "CAMERA" && c.colIndex === b.colIndex), cStats);
    customRepeats = shiftCustomRepeats(sel.fromF, -sel.count,
        (r) => sel.cols.some(c => c.colType === r.colType && c.colIndex === r.colIndex));
    refreshAfterFrameOp();
    reportBlockChanges({
        dialogueDeleted: dStats.deleted, dialogueTrimmed: dStats.trimmed,
        cameraDeleted: cStats.deleted, cameraTrimmed: cStats.trimmed,
        repeatDeleted: beforeRepCount - customRepeats.length
    });
};

// === 3. 全レイヤにコマ挿入（カッティング用） ===
window.insertFramesAllLayers = function() {
    const sel = getSelectionRange();
    if (!sel) { alert("挿入位置・コマ数を決めるため、範囲を選択してください。"); return; }
    if (typeof saveInput === 'function') saveInput();
    pushHistory();
    sections.forEach(sec => {
        for (let ci = 0; ci < sec.cols; ci++) shiftCellsInCol(sec.type, ci, sel.fromF, sel.count);
    });
    dialogueBlocks = shiftBlocks(dialogueBlocks, sel.fromF, sel.count, null);
    cameraBlocks = shiftBlocks(cameraBlocks, sel.fromF, sel.count, null);
    customRepeats = shiftCustomRepeats(sel.fromF, sel.count, null);
    shiftTargetFrames(sel.count);
    refreshAfterFrameOp();
};

// === 4. 全レイヤからコマ削除（カッティング用） ===
window.deleteFramesAllLayers = function() {
    const sel = getSelectionRange();
    if (!sel) { alert("削除位置・コマ数を決めるため、範囲を選択してください。"); return; }
    if (!confirm(`カット尺を ${sel.count} コマ縮めて全レイヤから削除します。よろしいですか？`)) return;
    if (typeof saveInput === 'function') saveInput();
    pushHistory();
    sections.forEach(sec => {
        for (let ci = 0; ci < sec.cols; ci++) shiftCellsInCol(sec.type, ci, sel.fromF, -sel.count);
    });
    const dStats = { deleted: 0, trimmed: 0 };
    const cStats = { deleted: 0, trimmed: 0 };
    const beforeRepCount = customRepeats.length;
    dialogueBlocks = shiftBlocks(dialogueBlocks, sel.fromF, -sel.count, null, dStats);
    cameraBlocks = shiftBlocks(cameraBlocks, sel.fromF, -sel.count, null, cStats);
    customRepeats = shiftCustomRepeats(sel.fromF, -sel.count, null);
    shiftTargetFrames(-sel.count);
    refreshAfterFrameOp();
    reportBlockChanges({
        dialogueDeleted: dStats.deleted, dialogueTrimmed: dStats.trimmed,
        cameraDeleted: cStats.deleted, cameraTrimmed: cStats.trimmed,
        repeatDeleted: beforeRepCount - customRepeats.length
    });
};
