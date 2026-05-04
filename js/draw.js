// === Canvas 描画 ===

function resizeCanvases() {
    const lines = (metaData.memo || "").split(/\r?\n/);
    const memoH = isMemoExpanded ? Math.max(87, lines.length * 18 + 15) : 40;
    metadataH = 65 + memoH + 10;
    const mc = document.getElementById('metadataCanvas');
    mc.width = baseWidth * dpr; mc.height = metadataH * dpr;
    mc.style.width = baseWidth + 'px'; mc.style.height = metadataH + 'px';
    mCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let allBooks = [];
    for (let type in booksData) for (let idx in booksData[type]) {
        let sec = sections.find(s => s.type === type);
        if (sec) {
            let x = sec.x + parseInt(idx) * sec.cw;
            let arr = booksData[type][idx];
            for (let i = 0; i < arr.length; i++) allBooks.push({ text: arr[i], type, idx: parseInt(idx), textIdx: i, x, seq: i });
        }
    }
    allBooks.sort((a, b) => (a.x !== b.x) ? a.x - b.x : a.seq - b.seq);
    let maxRow = -1;
    for (let book of allBooks) {
        let rowIndex = book.seq;
        while (true) {
            let conflict = false;
            for (let placed of allBooks) {
                if (placed === book) break;
                if (placed.row === rowIndex && !(book.x + 65 < placed.x || book.x > placed.x + 65)) { conflict = true; break; }
            }
            if (!conflict) { book.row = rowIndex; if (rowIndex > maxRow) maxRow = rowIndex; break; }
            rowIndex++;
        }
    }
    window.bookLayout = allBooks;
    colHeaderH = Math.max(70, 70 + (maxRow >= 0 ? (maxRow + 1) * 24 : 0));
    for (let book of window.bookLayout) {
        let branchY = colHeaderH - 50 - 15 - (book.row * 24);
        book.boxX = book.x + 12; book.boxY = branchY - 9; book.branchY = branchY;
        book.boxW = 40; book.boxH = 18;
    }
    const hc = document.getElementById('columnHeaderCanvas');
    hc.width = baseWidth * dpr * currentZoom; hc.height = colHeaderH * dpr * currentZoom;
    hc.style.width = (baseWidth * currentZoom) + 'px'; hc.style.height = (colHeaderH * currentZoom) + 'px';
    hCtx.setTransform(dpr * currentZoom, 0, 0, dpr * currentZoom, 0, 0);

    targetFrames = (parseInt(metaData.lengthSec) || 0) * 24 + (parseInt(metaData.lengthFrame) || 0);
    if (targetFrames <= 0) targetFrames = 24;
    const headMargin = (typeof settings !== 'undefined' && settings.draw && settings.draw.headMargin) || 0;
    const tailMargin = (typeof settings !== 'undefined' && settings.draw && settings.draw.tailMargin != null) ? settings.draw.tailMargin : 18;
    numFrames = headMargin + targetFrames + tailMargin;
    // 最低でも 24（1秒）は確保
    if (numFrames < 24) numFrames = 24;
    const gc = document.getElementById('gridCanvas');
    gc.width = baseWidth * dpr * currentZoom;
    gc.height = (numFrames * rowHeight + 50) * dpr * currentZoom;
    gc.style.width = (baseWidth * currentZoom) + 'px';
    gc.style.height = ((numFrames * rowHeight + 50) * currentZoom) + 'px';
    gCtx.setTransform(dpr * currentZoom, 0, 0, dpr * currentZoom, 0, 0);
}

function drawAll() {
    resizeCanvases();
    drawMetadata();
    drawColumnHeader();
    drawGrid();
    updateCellConfigPanel();
    const zd = document.getElementById('zoomDisplay');
    if (zd) zd.innerText = Math.round(currentZoom * 100) + '%';
}

// ズーム制御
function setZoom(z) {
    currentZoom = Math.max(0.25, Math.min(4.0, z));
    drawAll();
}
function zoomIn()  { setZoom(currentZoom * 1.2); }
function zoomOut() { setZoom(currentZoom / 1.2); }
function zoom100() { setZoom(1.0); }
function zoomFit() {
    if (!endX) return;
    // ビューポート幅から有効幅を計算
    const vp = document.getElementById('scroll-viewport');
    const targetW = (vp ? vp.clientWidth : window.innerWidth) - 40;
    if (targetW <= 0 || endX <= 0) return;
    setZoom(targetW / endX);
}

function drawMetadata() {
    const ctx = mCtx;
    ctx.fillStyle = getStyle('--bg-color'); ctx.fillRect(0, 0, baseWidth, metadataH);
    ctx.lineWidth = 1;
    metaFields.forEach(f => {
        ctx.strokeStyle = (selectedMeta === f.id) ? getStyle('--select-border') : getStyle('--border-color');
        ctx.lineWidth = (selectedMeta === f.id) ? 2 : 1;
        if (f.id === 'page') ctx.fillStyle = "rgba(100, 100, 100, 0.1)"; else ctx.fillStyle = "transparent";
        ctx.fillRect(f.x, f.y, f.w, f.h); ctx.strokeRect(f.x, f.y, f.w, f.h);
        ctx.fillStyle = getStyle('--grid-medium'); ctx.font = "bold 9px sans-serif";
        ctx.fillText(f.label, f.x + 5, f.y + 11);
        ctx.fillStyle = getStyle('--text-color'); ctx.font = "bold 14px sans-serif";
        ctx.fillText(metaData[f.id] || "", f.x + 8, f.y + 30);
    });
    const lines = (metaData.memo || "").split(/\r?\n/);
    const memoH = isMemoExpanded ? Math.max(87, lines.length * 18 + 15) : 40;
    ctx.strokeStyle = (selectedMeta === "memo") ? getStyle('--select-border') : getStyle('--border-color');
    ctx.lineWidth = (selectedMeta === "memo") ? 2 : 1;
    ctx.strokeRect(25, 60, baseWidth - 50, memoH);
    ctx.fillStyle = getStyle('--grid-medium'); ctx.font = "bold 9px sans-serif";
    ctx.fillText("DIRECTION (指示)", 30, 71);
    ctx.fillStyle = getStyle('--text-color'); ctx.font = "bold 13px sans-serif";
    const maxDraw = isMemoExpanded ? lines.length : Math.min(2, lines.length);
    for (let i = 0; i < maxDraw; i++) if (memoScrollLine + i < lines.length) ctx.fillText(lines[memoScrollLine + i], 33, 90 + i * 18);
    if (!isMemoExpanded && lines.length > 2) {
        ctx.fillStyle = getStyle('--border-color'); ctx.fillRect(baseWidth - 35, 62, 8, memoH - 4);
        ctx.fillStyle = getStyle('--grid-thick'); ctx.fillRect(baseWidth - 35, 62 + (memoH - 24) * (memoScrollLine / (lines.length - 2)), 8, 15);
        ctx.fillStyle = getStyle('--select-bg'); ctx.fillRect(baseWidth - 85, 60 + memoH - 22, 55, 18);
        ctx.fillStyle = getStyle('--text-color'); ctx.textAlign = "center"; ctx.font = "10px sans-serif";
        ctx.fillText("▼ 展開", baseWidth - 57, 60 + memoH - 9);
        ctx.textAlign = "left";
    } else if (isMemoExpanded && lines.length > 4) {
        ctx.fillStyle = getStyle('--select-bg'); ctx.fillRect(baseWidth - 85, 60 + memoH - 22, 55, 18);
        ctx.fillStyle = getStyle('--text-color'); ctx.textAlign = "center"; ctx.font = "10px sans-serif";
        ctx.fillText("▲ 閉じる", baseWidth - 57, 60 + memoH - 9);
        ctx.textAlign = "left";
    }
}

function drawColumnHeader() {
    const ctx = hCtx;
    ctx.fillStyle = getStyle('--bg-color'); ctx.fillRect(0, 0, baseWidth, colHeaderH);
    sections.forEach(s => {
        ctx.strokeStyle = getStyle('--border-color'); ctx.lineWidth = 2;
        ctx.strokeRect(s.x, colHeaderH - 50, s.cols * s.cw, 25);
        ctx.textAlign = "center"; ctx.fillStyle = getStyle('--text-color'); ctx.font = "bold 10px sans-serif";
        ctx.fillText(s.type, s.x + (s.cols * s.cw) / 2, colHeaderH - 35);
        for (let i = 0; i < s.cols; i++) {
            ctx.fillText(s.chars[i], s.x + s.cw * i + s.cw / 2, colHeaderH - 8);
            ctx.strokeStyle = getStyle('--grid-thin'); ctx.lineWidth = (i === 0) ? 2 : 1;
            ctx.beginPath(); ctx.moveTo(s.x + i * s.cw, colHeaderH - 25); ctx.lineTo(s.x + i * s.cw, colHeaderH); ctx.stroke();
        }
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x + s.cols * s.cw, colHeaderH - 25); ctx.lineTo(s.x + s.cols * s.cw, colHeaderH); ctx.stroke();
    });
    if (window.bookLayout) window.bookLayout.forEach(book => {
        let isDraggingThis = (isDraggingBook && draggingBook && draggingBook.type === book.type && draggingBook.idx === book.idx && draggingBook.textIdx === book.textIdx);
        if (isDraggingThis) ctx.globalAlpha = 0.3;
        ctx.strokeStyle = getStyle('--book-line'); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(book.x + 12, book.branchY); ctx.lineTo(book.x, book.branchY); ctx.lineTo(book.x, colHeaderH); ctx.stroke();
        ctx.fillStyle = getStyle('--book-bg');
        ctx.beginPath(); ctx.roundRect(book.boxX, book.boxY, book.boxW, book.boxH, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = getStyle('--book-line'); ctx.textAlign = "center"; ctx.font = "bold 10px sans-serif";
        ctx.fillText(book.text, book.boxX + 20, book.boxY + 13);
        if (isDraggingThis) ctx.globalAlpha = 1.0;
    });
    if (isDraggingBook && draggingBook) {
        const rect = document.getElementById('columnHeaderCanvas').getBoundingClientRect();
        const cx = (draggingBook.mouseX - rect.left) / currentZoom;
        const cy = (draggingBook.mouseY - rect.top) / currentZoom;
        let nearest = findNearestLine(cx);
        if (nearest) {
            ctx.strokeStyle = "rgba(77, 208, 225, 0.6)"; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(nearest.x, colHeaderH); ctx.lineTo(nearest.x, 20); ctx.stroke();
            let snappedY = colHeaderH - 50 - 15 - Math.max(0, Math.round((colHeaderH - 50 - 15 - cy) / 24)) * 24;
            ctx.beginPath(); ctx.moveTo(nearest.x + 12, snappedY); ctx.lineTo(nearest.x, snappedY); ctx.stroke();
            ctx.fillStyle = getStyle('--select-bg'); ctx.strokeStyle = getStyle('--book-line'); ctx.lineWidth = 2;
            ctx.beginPath(); ctx.roundRect(nearest.x + 12, snappedY - 9, 40, 18, 4); ctx.fill(); ctx.stroke();
            ctx.fillStyle = getStyle('--text-color'); ctx.textAlign = "center"; ctx.font = "bold 10px sans-serif";
            ctx.fillText(draggingBook.text, nearest.x + 32, snappedY + 4);
        }
    }
}

function drawGrid() {
    const ctx = gCtx;
    ctx.fillStyle = getStyle('--bg-color'); ctx.fillRect(0, 0, baseWidth, numFrames * rowHeight + 50);
    let actSec = sections.find(s => s.type === "ACTION");
    let sndSec = sections.find(s => s.type === "SOUND");
    let cellSec = sections.find(s => s.type === "CELL");
    let camSec = sections.find(s => s.type === "CAMERA");
    let actStartX = actSec.x, actEndX = sndSec.x, cellStartX = cellSec.x, camEndX = camSec.x + camSec.cols * camSec.cw;

    const _headM = getHeadMargin();
    // 先頭マージン部分を暗く
    if (_headM > 0) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.fillRect(actStartX, 0, camEndX - actStartX, _headM * rowHeight);
    }
    // 末尾マージン部分を暗く（カット尺以降）
    const cutEndY = (_headM + targetFrames) * rowHeight;
    const totalEndY = numFrames * rowHeight;
    if (cutEndY < totalEndY) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
        ctx.fillRect(actStartX, cutEndY, camEndX - actStartX, totalEndY - cutEndY);
    }
    sections.forEach(s => {
        for (let i = 0; i <= s.cols; i++) {
            ctx.strokeStyle = (i === 0 || i === s.cols) ? getStyle('--border-color') : getStyle('--grid-thin');
            ctx.lineWidth = (i === 0 || i === s.cols) ? 2 : 1;
            ctx.beginPath(); ctx.moveTo(s.x + i * s.cw, 0); ctx.lineTo(s.x + i * s.cw, numFrames * rowHeight); ctx.stroke();
        }
    });
    const lastActX = actSec.x + (actSec.cw * actSec.cols);
    for (let i = 0; i <= numFrames; i++) {
        let y = i * rowHeight;
        // フレーム番号表示はカット相対（先頭マージンより前は負数）
        const cutFrame = i - _headM;
        if (cutFrame !== 0 && cutFrame % 2 === 0) {
            ctx.fillStyle = getStyle('--grid-medium');
            ctx.font = "8px monospace";
            ctx.textAlign = "left";
            let dispText;
            if (cutFrame > 0 && cutFrame % 24 === 0) dispText = `${cutFrame} (${cutFrame / 24}秒)`;
            else dispText = String(cutFrame);
            ctx.fillText(dispText, lastActX + 3, y - 3);
        }
        // グリッド線：太線/中線/細線
        if (cutFrame === 0 || cutFrame % 24 === 0) { ctx.lineWidth = 2; ctx.strokeStyle = getStyle('--grid-thick'); }
        else if (cutFrame % 6 === 0) { ctx.lineWidth = 1; ctx.strokeStyle = getStyle('--grid-medium'); }
        else { ctx.lineWidth = 0.5; ctx.strokeStyle = getStyle('--grid-thin'); }
        ctx.beginPath(); ctx.moveTo(actStartX, y); ctx.lineTo(actEndX, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cellStartX, y); ctx.lineTo(camEndX, y); ctx.stroke();
    }
    const lineGap = parseInt(document.getElementById('gapSetting')?.value || "3", 10);

    // 自動リピート/止メ解析
    let autoRepeats = [];
    for (let s of sections) {
        if (s.type === "ACTION") {
            for (let ci = 0; ci < s.cols; ci++) {
                let colData = [];
                for (let f = 0; f < numFrames; f++) colData[f] = cellData[`${s.type}-${ci}-${f}`] || null;
                let rInfos = checkRepeatColumns(colData, numFrames);
                for (let r of rInfos) autoRepeats.push({ colType: s.type, colIndex: ci, startF: r.startF, chunkLen: r.chunkLen, endF: r.endF, isHold: r.isHold });
            }
        }
    }

    const getEffectiveCellValue = (ct, ci, f) => {
        let d = cellData[`${ct}-${ci}-${f}`];
        if (d && d.value !== "") return d.value;
        let rep = customRepeats.find(r => r.colType === ct && r.colIndex === ci && f >= r.startF && f <= r.endF);
        if (rep) {
            let pData = rep.pattern[(f - rep.startF) % rep.pattern.length];
            if (pData && pData.value !== "") return pData.value;
        }
        return "";
    };
    const isLinePiercing = (v) => v === "" || v === "―";

    // 棒線・波線
    for (let s of sections) {
        if (s.type !== "ACTION" && s.type !== "CELL") continue;
        for (let ci = 0; ci < s.cols; ci++) {
            let tx = s.x + ci * s.cw + s.cw / 2;
            let isSelectedCol = (selectionStart && selectionStart.colType === s.type && selectionStart.colIndex === ci);
            ctx.globalAlpha = isSelectedCol ? 0.3 : 1.0;
            for (let f = 0; f < targetFrames; f++) {
                let skipLine = false;
                if (s.type === "ACTION") {
                    if (autoRepeats.some(r => !r.isHold && r.colIndex === ci && f >= r.startF + r.chunkLen && f < r.endF)) skipLine = true;
                    if (autoRepeats.some(r => r.isHold && r.colIndex === ci && f >= 1 && f < r.endF)) skipLine = true;
                    if (customRepeats.some(rep => rep.colIndex === ci && f >= rep.startF && f <= rep.endF)) skipLine = true;
                }
                if (skipLine) continue;
                let val = getEffectiveCellValue(s.type, ci, f);
                if (isLinePiercing(val)) {
                    let startF = -1, startVal = "";
                    for (let tmp_f = f - 1; tmp_f >= 0; tmp_f--) {
                        let tmpV = getEffectiveCellValue(s.type, ci, tmp_f);
                        if (!isLinePiercing(tmpV)) { startF = tmp_f; startVal = tmpV; break; }
                    }
                    if (startF !== -1) {
                        let nextF = targetFrames;
                        for (let tmp_f = f + 1; tmp_f < targetFrames; tmp_f++) {
                            if (!isLinePiercing(getEffectiveCellValue(s.type, ci, tmp_f))) { nextF = tmp_f; break; }
                        }
                        let currentGap = nextF - startF - 1;
                        if (currentGap >= lineGap && (s.type === "CELL" || (f - startF < 9))) {
                            let drawY_top = frameY(f);
                            let drawY_bottom = frameY(f + 1);
                            if (startVal === "×") {
                                let offset = rowHeight / 4;
                                ctx.strokeStyle = getStyle('--text-color'); ctx.lineWidth = 1.5;
                                ctx.beginPath(); ctx.moveTo(tx, drawY_top);
                                ctx.bezierCurveTo(tx - offset, drawY_top + offset, tx + offset, drawY_bottom - offset, tx, drawY_bottom);
                                ctx.stroke();
                            } else {
                                ctx.strokeStyle = getStyle('--text-color'); ctx.lineWidth = 1.5;
                                ctx.beginPath(); ctx.moveTo(tx, drawY_top); ctx.lineTo(tx, drawY_bottom); ctx.stroke();
                            }
                        }
                    }
                }
            }
            ctx.globalAlpha = 1.0;
        }
    }

    // セリフ・カメラブロック描画
    drawDialogueBlocks(ctx);
    drawCameraBlocks(ctx);

    // 1. 自動解析リピート（rep記号）
    autoRepeats.forEach(r => {
        if (r.isHold) return;
        const sec = sections.find(s => s.type === r.colType);
        if (!sec) return;
        let isSelectedCol = (selectionStart && selectionStart.colType === sec.type && selectionStart.colIndex === r.colIndex);
        ctx.globalAlpha = isSelectedCol ? 0.3 : 1.0;
        let chunkStartFrame = r.startF + r.chunkLen;
        let firstCellData = cellData[`${r.colType}-${r.colIndex}-${r.startF}`];
        let firstVal = firstCellData ? firstCellData.value : "";
        drawRepMark(ctx, sec, r.colIndex, chunkStartFrame, r.endF, firstVal);
        ctx.globalAlpha = 1.0;
    });

    // 2. 手動 customRepeats（rep記号 / 動画欄は薄文字）
    customRepeats.forEach(rep => {
        const sec = sections.find(s => s.type === rep.colType);
        if (!sec) return;
        let tx = sec.x + rep.colIndex * sec.cw + sec.cw / 2;
        let isSelectedCol = (selectionStart && selectionStart.colType === sec.type && selectionStart.colIndex === rep.colIndex);
        ctx.globalAlpha = isSelectedCol ? 0.3 : 1.0;
        if (sec.type === "ACTION") {
            let firstVal = rep.pattern[0] ? rep.pattern[0].value : "";
            drawRepMark(ctx, sec, rep.colIndex, rep.startF, rep.endF + 1, firstVal);
        } else {
            ctx.fillStyle = "rgba(200, 200, 200, 0.5)"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
            let endF = Math.min(rep.endF, targetFrames - 1);
            for (let f = rep.startF; f <= endF; f++) {
                let pData = rep.pattern[(f - rep.startF) % rep.pattern.length];
                if (pData && pData.value !== "") {
                    let ty = frameY(f) + 16;
                    if (pData.value === "●") { ctx.beginPath(); ctx.arc(tx, ty - 4, 2.5, 0, Math.PI * 2); ctx.fill(); }
                    else if (pData.value === "―") {
                        ctx.strokeStyle = "rgba(200, 200, 200, 0.5)"; ctx.lineWidth = 1.5;
                        ctx.beginPath(); ctx.moveTo(tx - 6, ty - 4); ctx.lineTo(tx + 6, ty - 4); ctx.stroke();
                    } else { ctx.fillText(pData.value, tx, ty); }
                    if (pData.option === "OPTION_KEYFRAME") {
                        ctx.strokeStyle = "rgba(180, 180, 180, 0.4)"; ctx.lineWidth = 1.0;
                        ctx.beginPath(); ctx.arc(tx, ty - 4, 10, 0, Math.PI * 2); ctx.stroke();
                    } else if (pData.option === "OPTION_REFERENCEFRAME") {
                        ctx.strokeStyle = "rgba(180, 180, 180, 0.4)"; ctx.lineWidth = 1.0;
                        ctx.beginPath(); ctx.moveTo(tx, ty - 14); ctx.lineTo(tx + 10, ty + 4); ctx.lineTo(tx - 10, ty + 4); ctx.closePath(); ctx.stroke();
                    }
                }
            }
        }
        ctx.globalAlpha = 1.0;
    });

    // セルデータの描画
    ctx.textAlign = "center";
    for (const key in cellData) {
        const data = cellData[key], p = parseCellKey(key);
        if (!p) continue;
        const ct = p[0], ci = parseInt(p[1]), f = parseInt(p[2]);
        if (selectionStart && selectionStart.colType === ct && selectionStart.colIndex === ci && selectionStart.frame === f) continue;
        if (ct === "SOUND") continue;
        // マージン部含めて描画（cut外も表示）
        let tx = 0, ty = frameY(f) + 16;
        const sec = sections.find(s => s.type === ct);
        if (sec) tx = sec.x + ci * sec.cw + sec.cw / 2;
        if (ct === "CAMERA") {
            let isInline = cameraBlocks.some(b => b.isInlineEdit && b.colIndex === ci && f >= b.startFrame && f <= b.endFrame);
            if (!isInline) continue;
            tx += 10;
        }
        let isOmitted = false;
        if (ct === "ACTION") {
            let r = autoRepeats.find(rep => !rep.isHold && rep.colIndex === ci && f >= rep.startF + rep.chunkLen && f < rep.endF);
            if (r) isOmitted = true;
            // 止メの場合: 1コマ目以外は省略
            let h = autoRepeats.find(rep => rep.isHold && rep.colIndex === ci && f >= 1 && f < rep.endF);
            if (h) isOmitted = true;
        }
        if (isOmitted) continue;
        let isSelectedCol = (selectionStart && selectionStart.colType === ct && selectionStart.colIndex === ci);
        ctx.globalAlpha = isSelectedCol ? 0.3 : 1.0;
        // fontColorId が設定されていればそのパレット色、無ければ既定
        const colorId = data.fontColorId || 0;
        const useColor = (colorId > 0 && typeof getFontColorById === 'function')
            ? getFontColorById(colorId)
            : getStyle('--text-color');
        ctx.fillStyle = useColor;
        if (data.value === "●") { ctx.beginPath(); ctx.arc(tx, ty - 4, 2.5, 0, Math.PI * 2); ctx.fill(); }
        else if (data.value === "―") {
            ctx.strokeStyle = useColor; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(tx - 6, ty - 4); ctx.lineTo(tx + 6, ty - 4); ctx.stroke();
        } else { ctx.font = "bold 12px sans-serif"; ctx.fillText(data.value, tx, ty); }
        let dispOpt = data.option;
        if (ct === "CELL") { const actKey = `ACTION-${ci}-${f}`; if (cellData[actKey]?.option) dispOpt = cellData[actKey].option; }
        if (dispOpt && data.value !== "" && !["●", "○", "×", "―"].includes(data.value)) {
            ctx.strokeStyle = "rgba(180, 180, 180, 0.4)"; ctx.lineWidth = 1.0;
            if (dispOpt === "OPTION_KEYFRAME") { ctx.beginPath(); ctx.arc(tx, ty - 4, 10, 0, Math.PI * 2); ctx.stroke(); }
            else if (dispOpt === "OPTION_REFERENCEFRAME") {
                ctx.beginPath(); ctx.moveTo(tx, ty - 14); ctx.lineTo(tx + 10, ty + 4); ctx.lineTo(tx - 10, ty + 4); ctx.closePath(); ctx.stroke();
            }
        }
        ctx.globalAlpha = 1.0;
    }

    // 止メのテキスト描画（自動解析）
    if (typeof settings === 'undefined' || settings.draw.tomeEnabled !== false) {
        autoRepeats.forEach(r => {
            if (!r.isHold) return;
            const sec = sections.find(s => s.type === r.colType);
            if (!sec) return;
            let isSelectedCol = (selectionStart && selectionStart.colType === sec.type && selectionStart.colIndex === r.colIndex);
            ctx.globalAlpha = isSelectedCol ? 0.3 : 1.0;
            drawHoldMark(ctx, sec, r.colIndex);
            ctx.globalAlpha = 1.0;
        });
    }

    // 選択中セルの option マークも描画（cellInput が canvas を覆って見えなくなるのを補う）
    if (selectionStart) {
        const skey = `${selectionStart.colType}-${selectionStart.colIndex}-${selectionStart.frame}`;
        const sdata = cellData[skey];
        if (sdata && sdata.option) {
            const sec = sections.find(s => s.type === selectionStart.colType);
            if (sec) {
                const stx = sec.x + selectionStart.colIndex * sec.cw + sec.cw / 2;
                const sty = frameY(selectionStart.frame) + 16;
                ctx.strokeStyle = "rgba(180, 180, 180, 0.7)";
                ctx.lineWidth = 1.5;
                if (sdata.option === "OPTION_KEYFRAME") {
                    ctx.beginPath(); ctx.arc(stx, sty - 4, 10, 0, Math.PI * 2); ctx.stroke();
                } else if (sdata.option === "OPTION_REFERENCEFRAME") {
                    ctx.beginPath(); ctx.moveTo(stx, sty - 14); ctx.lineTo(stx + 10, sty + 4); ctx.lineTo(stx - 10, sty + 4); ctx.closePath(); ctx.stroke();
                }
            }
        }
    }

    // 範囲選択
    if (selectionStart && selectionEnd) {
        const minX = Math.min(selectionStart.x, selectionEnd.x);
        const maxX = Math.max(selectionStart.x + selectionStart.w, selectionEnd.x + selectionEnd.w);
        const minF = Math.min(selectionStart.frame, selectionEnd.frame);
        const maxF = Math.max(selectionStart.frame, selectionEnd.frame);
        ctx.fillStyle = getStyle('--range-bg');
        ctx.fillRect(minX, frameY(minF), maxX - minX, (maxF - minF + 1) * rowHeight);
        ctx.strokeStyle = getStyle('--select-border'); ctx.lineWidth = 1;
        ctx.strokeRect(minX, frameY(minF), maxX - minX, (maxF - minF + 1) * rowHeight);
        ctx.fillStyle = getStyle('--select-bg');
        ctx.fillRect(selectionStart.x, frameY(selectionStart.frame), selectionStart.w, rowHeight);
    }
}
