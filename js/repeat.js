// === リピート・止メ自動解析ロジック ===

function isNotEmptyOrSymbol(val) {
    return val !== "" && val !== "●" && val !== "○" && val !== "―";
}

// 列データから自動的にリピート/止メ範囲を抽出
function checkRepeatColumns(colData, longestDuration, colIndex, applyExclusion = true) {
    const minCycles = (typeof settings !== 'undefined' && settings.draw && settings.draw.repMinCycles) || 2;
    let minimumRepeatLength = 2;
    let repeatInfos = [];
    let dumpCells = [];
    let firstIsOne = (colData[0] && colData[0].value === "1");

    for (let f = 0; f < longestDuration; f++) {
        let cell = colData[f] ? colData[f].value : "";
        if (cell === "") {
            if (dumpCells.length === 0) dumpCells.push("×");
            else dumpCells.push(dumpCells[dumpCells.length - 1]);
        } else dumpCells.push(cell);
    }

    // 1. 止メ判定: 最初が「1」で、他に番号や記号がない
    let isHold = false;
    if (firstIsOne) {
        isHold = true;
        for (let f = 1; f < longestDuration; f++) {
            let cell = colData[f] ? colData[f].value : "";
            if (cell !== "" && cell !== "1" && cell !== "―") { isHold = false; break; }
        }
    }
    if (isHold) {
        repeatInfos.push({ startF: 0, chunkLen: 1, endF: longestDuration, isHold: true });
        return repeatInfos;
    }

    // 自動Rep無効なら止メ判定済みの結果のみ返す
    if (typeof settings !== 'undefined' && settings.draw && settings.draw.repAutoEnabled === false) return repeatInfos;

    // 2. リピート(rep)列の検出
    let previousRepeatEndFrame = 0;
    for (let fn = 0; fn < dumpCells.length - 4; fn++) {
        if (fn !== 0 && (!colData[fn] || colData[fn].value === "")) continue;
        let fn_cell = dumpCells[fn];
        let foundSameCell = false;
        for (let tmpf = previousRepeatEndFrame; tmpf < fn; tmpf++) {
            if (dumpCells[tmpf] === fn_cell) { foundSameCell = true; break; }
        }
        if (foundSameCell) continue;

        let fmStart = -1;
        for (let i = fn + 1; i < dumpCells.length - 3; i++) {
            if (!colData[i] || colData[i].value === "") continue;
            fmStart = i; break;
        }
        if (fmStart === -1) continue;

        let repeatFound = false;
        for (let fm = fmStart; fm < dumpCells.length - 3; fm++) {
            if (dumpCells[fm] === fn_cell) break;
            let chunkLength = fm - fn + 1;
            let fl_lastNumbered = fm + 1;
            let reachedEnd = false;
            for (let fl = fm + 1; fl < dumpCells.length; fl++) {
                let fk = (fl - fn) % chunkLength + fn;
                if (dumpCells[fk] === dumpCells[fl]) {
                    if (fl < dumpCells.length - 1) {
                        if (colData[fl] && isNotEmptyOrSymbol(colData[fl].value)) fl_lastNumbered = fl;
                        continue;
                    } else { fl_lastNumbered = fl + 1; reachedEnd = true; }
                } else {
                    if (colData[fl] && isNotEmptyOrSymbol(colData[fl].value)) fl_lastNumbered = fl;
                    // 直前までで完全に一致したサイクル境界まで拡張（埋めの連続部分を取り込む）
                    const completedCycles = Math.floor((fl - fn) / chunkLength);
                    const cycleEnd = fn + completedCycles * chunkLength;
                    if (cycleEnd > fl_lastNumbered) fl_lastNumbered = cycleEnd;
                    let repeatLength = fl_lastNumbered - fn;
                    if (repeatLength >= chunkLength * minCycles && repeatLength >= minimumRepeatLength + chunkLength) {
                        repeatInfos.push({ startF: fn, chunkLen: chunkLength, endF: fl_lastNumbered, isHold: false });
                        repeatFound = true;
                        fn = fl_lastNumbered - 1;
                        previousRepeatEndFrame = fl_lastNumbered;
                        break;
                    } else break;
                }
            }
            // 全フレーム一致のまま終端到達した場合もpush
            if (reachedEnd && !repeatFound) {
                let repeatLength = fl_lastNumbered - fn;
                if (repeatLength >= chunkLength * minCycles && repeatLength >= minimumRepeatLength + chunkLength) {
                    repeatInfos.push({ startF: fn, chunkLen: chunkLength, endF: fl_lastNumbered, isHold: false });
                    repeatFound = true;
                    fn = fl_lastNumbered - 1;
                    previousRepeatEndFrame = fl_lastNumbered;
                }
            }
            if (repeatFound) break;
        }
    }
    // 除外リスト適用（colIndex指定 + applyExclusion=true のみ）
    if (applyExclusion && colIndex !== undefined && typeof repExclusions !== 'undefined' && Array.isArray(repExclusions)) {
        repeatInfos = repeatInfos.filter(r => !repExclusions.some(ex => ex.colIndex === colIndex && ex.startF === r.startF));
    }
    return repeatInfos;
}

// 選択範囲を customRepeats として登録（右クリック「下へリピート展開」）
window.applyRepeat = function(mode = 'repeat') {
    if (!selectionStart || !selectionEnd) return;
    const sL = getLogicalColIndex(selectionStart.colType, selectionStart.colIndex);
    const eL = getLogicalColIndex(selectionEnd.colType, selectionEnd.colIndex);
    if (sL !== eL) return;
    const minF = Math.min(selectionStart.frame, selectionEnd.frame);
    const maxF = Math.max(selectionStart.frame, selectionEnd.frame);
    let pattern = [];
    for (let f = minF; f <= maxF; f++) {
        const k = `${selectionStart.colType}-${selectionStart.colIndex}-${f}`;
        pattern.push(cellData[k] ? JSON.parse(JSON.stringify(cellData[k])) : null);
    }
    if (pattern.every(d => d === null)) return;
    pushHistory();
    const repeatLimit = numFrames;
    let endF = repeatLimit - 1;
    for (let f = maxF + 1; f < repeatLimit; f++) {
        if (cellData[`${selectionStart.colType}-${selectionStart.colIndex}-${f}`]) { endF = f - 1; break; }
    }
    if (endF >= maxF + 1) {
        // 入力色 (activeFontColorId) を Rep 専用色として保存
        // 0 なら未設定として扱い、表示色は pattern[0].fontColorId にフォールバック
        const activeColorId = (typeof activeFontColorId !== 'undefined' && activeFontColorId > 0)
            ? activeFontColorId
            : 0;
        customRepeats.push({
            id: Date.now(),
            colType: selectionStart.colType,
            colIndex: selectionStart.colIndex,
            startF: maxF + 1,
            endF: endF,
            pattern: pattern,
            mode,
            fontColorId: activeColorId
        });
    }
    drawAll();
};

window.applyShakeRepeat = function() {
    window.applyRepeat('shake');
};

window.applyRandomShakeRepeat = function() {
    window.applyRepeat('randomShake');
};

function getRepeatMode(rep) {
    return rep?.mode || 'repeat';
}

function getRepeatLabel(rep) {
    const mode = getRepeatMode(rep);
    if (mode === 'shake') return 'ブレ';
    if (mode === 'randomShake') return 'ランダムブレ';
    return 'rep';
}

function getRepeatPatternData(rep, f) {
    if (!rep || !Array.isArray(rep.pattern) || rep.pattern.length === 0) return null;
    const patternIndex = (f - rep.startF) % rep.pattern.length;
    const data = rep.pattern[patternIndex] || null;
    if (!data) return null;
    if (getRepeatMode(rep) !== 'randomShake') return data;

    const numbers = rep.pattern
        .map(d => d && String(d.value || '').trim())
        .filter(v => /^\d+$/.test(v));
    if (!numbers.length || !/^\d+$/.test(String(data.value || '').trim())) return data;

    const seed = Math.abs(Math.sin((rep.id || 1) * 0.001 + f * 12.9898 + patternIndex * 78.233));
    const idx = Math.floor(seed * numbers.length) % numbers.length;
    return { ...data, value: numbers[idx] };
}

// 描画ヘルパー: rep 表記（先頭セル番号 + "rep" + 青点線）
function drawRepMark(ctx, sec, colIndex, chunkStartFrame, endF, firstVal, firstData, label = 'rep', repColorIdOverride) {
    const drawFrameLimit = (typeof numFrames !== 'undefined' && numFrames > 0) ? numFrames : targetFrames;
    if (chunkStartFrame >= drawFrameLimit) return;
    let tx = sec.x + colIndex * sec.cw + sec.cw / 2;
    // 色: rep専用color (適用時のactiveFontColorId) 優先、無ければ firstData.fontColorId
    const colorId = (repColorIdOverride && repColorIdOverride > 0)
        ? repColorIdOverride
        : ((firstData && firstData.fontColorId) || 0);
    const useColor = (colorId > 0 && typeof getFontColorById === 'function')
        ? getFontColorById(colorId)
        : getStyle('--text-color');
    ctx.fillStyle = useColor;
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    const ty = frameY(chunkStartFrame) + 16;
    ctx.fillText(firstVal, tx, ty);
    drawRepOptionMark(ctx, tx, ty, firstData, colorId > 0 ? useColor : null);
    let repFrame = chunkStartFrame + 1;
    if (repFrame < drawFrameLimit) {
        let displayLabel = label;
        if (displayLabel === 'ランダムブレ') displayLabel = 'Rブレ';
        if (displayLabel !== 'rep') {
            ctx.font = "bold 10px sans-serif";
        }
        ctx.fillStyle = useColor;
        ctx.fillText(displayLabel, tx, frameY(repFrame) + 16);
        ctx.font = "bold 12px sans-serif";
    }
    let lineStartF = repFrame + 1;
    let lineEndF = Math.min(endF - 1, repFrame + 6, drawFrameLimit - 1);
    if (lineEndF >= lineStartF && lineStartF < drawFrameLimit) {
        // 点線色: 色付きセルなら useColor、無ければ既定 (blue)
        ctx.strokeStyle = (colorId > 0)
            ? useColor
            : ((typeof settings !== 'undefined' && settings.draw.repeatDashColor) || "rgba(66, 133, 244, 0.8)");
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(tx, frameY(lineStartF) + 4);
        ctx.lineTo(tx, frameY(lineEndF + 1));
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function drawVerticalRepeatLabel(ctx, tx, y, label) {
    const chars = String(label || '').split('');
    const lineH = 11;
    const bgH = chars.length * lineH + 6;
    ctx.fillStyle = getStyle('--bg-color');
    ctx.fillRect(tx - 7, y + 4, 14, bgH);
    ctx.fillStyle = getStyle('--text-color');
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    chars.forEach((c, i) => ctx.fillText(c, tx, y + 15 + i * lineH));
    return y + 4 + bgH;
}

function drawRepOptionMark(ctx, tx, ty, data, overrideColor) {
    if (!data || !data.option || !data.value) return;
    if (["●", "○", "×", "―"].includes(data.value)) return;
    ctx.save();
    if (overrideColor) {
        ctx.strokeStyle = overrideColor;
        ctx.globalAlpha = 0.5;
    } else {
        ctx.strokeStyle = "rgba(180, 180, 180, 0.4)";
    }
    ctx.lineWidth = 1.0;
    if (data.option === "OPTION_KEYFRAME") {
        ctx.beginPath();
        ctx.arc(tx, ty - 4, 10, 0, Math.PI * 2);
        ctx.stroke();
    } else if (data.option === "OPTION_REFERENCEFRAME") {
        ctx.beginPath();
        ctx.moveTo(tx, ty - 14);
        ctx.lineTo(tx + 10, ty + 4);
        ctx.lineTo(tx - 10, ty + 4);
        ctx.closePath();
        ctx.stroke();
    }
    ctx.restore();
}

function getMotionInstruction(value) {
    const raw = String(value || '').trim();
    const normalized = raw.toLowerCase().replace(/\s+/g, '');
    if (!normalized) return null;
    if (['ブレ', 'ぶれ', 'bure', 'shake'].includes(normalized)) {
        return { label: 'ブレ', random: false };
    }
    if (['ランダムブレ', 'ランダムぶれ', 'randomブレ', 'randomshake', 'rshake'].includes(normalized)) {
        return { label: 'ランダムブレ', random: true };
    }
    return null;
}

// 描画ヘルパー: 止メ（縦書き「止/メ」）
function drawHoldMark(ctx, sec, colIndex) {
    let tx = sec.x + colIndex * sec.cw + sec.cw / 2;
    let drawTxtFrame = 1;
    if (drawTxtFrame >= targetFrames) return;
    ctx.fillStyle = getStyle('--bg-color');
    ctx.fillRect(tx - 6, frameY(drawTxtFrame) + 5, 12, 25);
    ctx.fillStyle = getStyle('--text-color');
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    "止\nメ".split('\n').forEach((c, i) => ctx.fillText(c, tx, frameY(drawTxtFrame) + 14 + i * 11));
}
