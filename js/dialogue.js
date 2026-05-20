// === セリフ（SOUND列）モーダル & ヒットテスト & 描画 ===

function getDialogueHit(zX, zY) {
    let sndSec = sections.find(s => s.type === "SOUND");
    if (!sndSec) return null;
    for (let b of dialogueBlocks) {
        let tx = sndSec.x + b.colIndex * sndSec.cw;
        if (zX >= tx && zX <= tx + sndSec.cw) {
            let startY = frameY(b.startFrame);
            let endY = frameY(b.endFrame + 1);
            if (zY >= startY && zY <= endY) {
                if (Math.abs(zY - startY) <= 20) return { block: b, type: 'head' };
                if (Math.abs(zY - endY) <= 20) return { block: b, type: 'tail' };
                return { block: b, type: 'move' };
            }
        }
    }
    return null;
}

window.handleDialogueKey = function(e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); saveDialogueBlock(); } };

function clearDialogueBlockCells(block) {
    if (!block) return;
    for (let f = block.startFrame; f <= block.endFrame; f++) {
        delete cellData[`SOUND-${block.colIndex}-${f}`];
    }
}

window.normalizeDialogueBlockCells = function(block, previousBlock = null) {
    if (!block) return;
    if (previousBlock) clearDialogueBlockCells(previousBlock);
    clearDialogueBlockCells(block);
    for (let f = block.startFrame; f <= block.endFrame; f++) {
        const key = `SOUND-${block.colIndex}-${f}`;
        if (f === block.startFrame) {
            cellData[key] = {
                value: block.speakerName || '',
                text: block.text || '',
                option: null,
                fontColorId: 0
            };
        } else {
            cellData[key] = { value: '―', option: null, text: null, fontColorId: 0 };
        }
    }
};

window.normalizeAllDialogueBlockCells = function() {
    dialogueBlocks.forEach(block => window.normalizeDialogueBlockCells(block));
};

window.openDialogueModal = function() {
    let existingBlock = null; let minF, maxF;
    if (selectedDialogueId) { existingBlock = dialogueBlocks.find(b => b.id === selectedDialogueId); }
    editingDialogueId = null;
    if (existingBlock) {
        editingDialogueId = existingBlock.id;
        document.getElementById('speakerNameInput').value = existingBlock.speakerName;
        document.getElementById('dialogueTextInput').value = existingBlock.text;
        document.getElementById('dialogueStartInput').value = existingBlock.startFrame + 1;
        document.getElementById('dialogueEndInput').value = existingBlock.endFrame + 1;
        const typeSel = document.getElementById('dialogueTypeInput');
        if (typeSel) typeSel.value = existingBlock.dialogueType || 'normal';
    } else if (selectionStart && selectionEnd && selectionStart.colType === "SOUND") {
        minF = Math.min(selectionStart.frame, selectionEnd.frame);
        maxF = Math.max(selectionStart.frame, selectionEnd.frame);
        document.getElementById('speakerNameInput').value = "";
        document.getElementById('dialogueTextInput').value = "";
        document.getElementById('dialogueStartInput').value = minF + 1;
        document.getElementById('dialogueEndInput').value = maxF + 1;
        const typeSel = document.getElementById('dialogueTypeInput');
        if (typeSel) typeSel.value = 'normal';
    } else return;
    document.getElementById('dialogue-modal').style.display = 'block';
    setTimeout(() => document.getElementById('speakerNameInput').focus(), 10);
};

window.closeDialogueModal = function() { document.getElementById('dialogue-modal').style.display = 'none'; editingDialogueId = null; };

window.saveDialogueBlock = function() {
    let speakerName = document.getElementById('speakerNameInput').value.trim();
    let text = document.getElementById('dialogueTextInput').value.trim();
    let startF = parseInt(document.getElementById('dialogueStartInput').value, 10) - 1;
    let endF = parseInt(document.getElementById('dialogueEndInput').value, 10) - 1;
    const typeSel = document.getElementById('dialogueTypeInput');
    let dialogueType = typeSel ? typeSel.value : 'normal';
    if (!['normal', 'off', 'mono', '背'].includes(dialogueType)) dialogueType = 'normal';
    let blockToEdit = dialogueBlocks.find(b => b.id === editingDialogueId);
    let previousBlock = blockToEdit ? JSON.parse(JSON.stringify(blockToEdit)) : null;
    let colIndex = blockToEdit ? blockToEdit.colIndex : (selectionStart ? selectionStart.colIndex : 0);
    if (isNaN(startF) || isNaN(endF)) { alert("開始/終了フレームを入力してください。"); return; }
    if (startF > endF) { let temp = startF; startF = endF; endF = temp; }
    let collision = dialogueBlocks.some(b => b.id !== editingDialogueId && b.colIndex === colIndex && !(endF < b.startFrame || startF > b.endFrame));
    if (collision) { alert("エラー: 他のセリフブロックと範囲が重なっています。"); return; }
    pushHistory();
    if (editingDialogueId && blockToEdit) {
        blockToEdit.speakerName = speakerName;
        blockToEdit.text = text;
        blockToEdit.startFrame = startF;
        blockToEdit.endFrame = endF;
        blockToEdit.dialogueType = dialogueType;
        window.normalizeDialogueBlockCells(blockToEdit, previousBlock);
    } else {
        let newBlock = { id: Date.now(), colIndex: colIndex, speakerName: speakerName, text: text, startFrame: startF, endFrame: endF, dialogueType: dialogueType };
        dialogueBlocks.push(newBlock);
        window.normalizeDialogueBlockCells(newBlock);
    }
    window.closeDialogueModal();
    selectedDialogueId = null;
    drawAll();
};

window.deleteDialogueBlock = function(blockId) {
    let block = dialogueBlocks.find(b => b.id === blockId);
    if (!block) return;
    pushHistory();
    for (let f = block.startFrame; f <= block.endFrame; f++) {
        delete cellData[`SOUND-${block.colIndex}-${f}`];
    }
    dialogueBlocks = dialogueBlocks.filter(b => b.id !== blockId);
    if (selectedDialogueId === blockId) selectedDialogueId = null;
    drawAll();
};

// 共通: セリフタイプ → 表示ラベル ('normal' は null = 非表示)
// 描画3経路 (edit / 標準A3 / 外部テンプレ) で共通利用
window.getDialogueTypeLabel = function(type) {
    switch (type) {
        case 'off':  return '(off)';
        case 'mono': return '(mono)';
        case '背':   return '(背)';
        default:     return null;  // normal or unknown
    }
};

// 共通: 話者名を枠付きで描画 (白背景+黒枠+黒文字)
// ctx.font / ctx.textAlign は呼出側で設定済み前提。padding/角丸はscale引数で調整
window.drawSpeakerNameWithBox = function(ctx, text, cx, baselineY, opts) {
    if (!text) return;
    opts = opts || {};
    const padX = opts.padX != null ? opts.padX : 2;
    const padY = opts.padY != null ? opts.padY : 1;
    const radius = opts.radius != null ? opts.radius : 1.5;
    const strokeColor = opts.strokeColor || '#000';
    const fillColor = opts.fillColor || '#fff';
    const textColor = opts.textColor || '#000';
    const lineWidth = opts.lineWidth != null ? opts.lineWidth : 0.8;
    // フォントサイズの抽出 (font文字列から px数値)
    const fontMatch = /(\d+(?:\.\d+)?)px/.exec(ctx.font || '');
    const fontPx = fontMatch ? parseFloat(fontMatch[1]) : 12;
    const tw = ctx.measureText(String(text)).width;
    // baselineY を alphabetic 基準として、ボックスは文字の上下に padding
    const boxW = tw + padX * 2;
    const boxH = fontPx + padY * 2;
    const boxX = cx - boxW / 2;
    // alphabetic 基準なので、文字の上端は baselineY - fontPx*0.8 程度
    const boxY = baselineY - fontPx * 0.85 - padY;
    ctx.save();
    // 背景
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(boxX, boxY, boxW, boxH, radius);
    } else {
        ctx.rect(boxX, boxY, boxW, boxH);
    }
    ctx.fill();
    ctx.stroke();
    // テキスト
    ctx.fillStyle = textColor;
    ctx.fillText(text, cx, baselineY);
    ctx.restore();
};

// === セリフブロック描画 ===
function drawDialogueBlocks(ctx) {
    let sndSec = sections.find(s => s.type === "SOUND");
    if (!sndSec) return;
    dialogueBlocks.forEach(block => {
        let sF = block.startFrame; let eF = block.endFrame; let colI = block.colIndex;
        // ダミー部分（マージン）も含めて描画（numFramesを使用）
        if (sF >= numFrames) return;
        let tx = sndSec.x + colI * sndSec.cw;
        let startY = frameY(sF);
        let endY = frameY(Math.min(eF, numFrames - 1) + 1);
        if (selectedDialogueId === block.id) { ctx.strokeStyle = getStyle('--select-border'); ctx.lineWidth = 2; ctx.strokeRect(tx, startY, sndSec.cw, endY - startY); }
        ctx.fillStyle = getSpeakerColor(block.speakerName);
        ctx.fillRect(tx, startY, sndSec.cw, endY - startY);
        ctx.strokeStyle = getStyle('--text-color'); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(tx, startY); ctx.lineTo(tx + sndSec.cw, startY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(tx, endY); ctx.lineTo(tx + sndSec.cw, endY); ctx.stroke();
        let blockH = endY - startY;
        let isShort = blockH <= rowHeight * 2;
        ctx.fillStyle = getStyle('--text-color');
        ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center";
        let textStartY = startY + 14;
        // セリフタイプラベル (normal以外時): ブロック内上部に「(off)」「(mono)」「(背)」
        const typeLabel = (typeof getDialogueTypeLabel === 'function') ? getDialogueTypeLabel(block.dialogueType) : null;
        if (typeLabel && !isShort) {
            ctx.fillText(typeLabel, tx + sndSec.cw / 2, startY + 12);
            textStartY = startY + 28;
        }
        // 話者名は常にブロック上端の外側 (タイプ問わず、frame 0 でも上に出す)
        // 枠背景は話者色 (セリフブロック背景と同色)
        if (block.speakerName) {
            const labelY = Math.max(10, startY - 2);
            ctx.font = "bold 10px sans-serif";
            ctx.textAlign = "center";
            const fillColor = (typeof getSpeakerColor === 'function')
                ? getSpeakerColor(block.speakerName)
                : '#fff';
            if (typeof drawSpeakerNameWithBox === 'function') {
                drawSpeakerNameWithBox(ctx, block.speakerName, tx + sndSec.cw / 2, labelY, {
                    padX: 3, padY: 1, radius: 2, fillColor
                });
            } else {
                ctx.fillText(block.speakerName, tx + sndSec.cw / 2, labelY);
            }
        }
        if (block.text) {
            ctx.font = "bold 12px sans-serif";
            const CHAR_H = 14; // 12px font + 余白
            let textH = endY - textStartY - 4;
            let chars = block.text.split('');
            let targetSpacing = rowHeight * 3;
            // n 文字を高さ textH に収めるため、最終文字の高さ分を引いて n-1 で割る
            let spacing;
            if (chars.length <= 1) {
                spacing = 0;
            } else {
                const maxFitSpacing = (textH - CHAR_H) / (chars.length - 1);
                spacing = Math.max(CHAR_H * 0.7, Math.min(targetSpacing, maxFitSpacing));
            }
            let totalTextH = chars.length === 1 ? CHAR_H : (chars.length - 1) * spacing + CHAR_H;
            let actualStartY = textStartY + (CHAR_H / 2) + Math.max(0, (textH - totalTextH) / 2);
            for (let i = 0; i < chars.length; i++) {
                let char = chars[i]; if (char === "ー") char = "丨";
                let charY = actualStartY + (i * spacing);
                ctx.fillText(char, tx + sndSec.cw / 2, charY);
            }
        }
        if (dragDialogueInfo && dragDialogueInfo.id === block.id) {
            let gTx = sndSec.x + dragDialogueInfo.currentCol * sndSec.cw;
            let gStartY = frameY(dragDialogueInfo.currentStart);
            let gEndY = frameY(Math.min(dragDialogueInfo.currentEnd, numFrames - 1) + 1);
            let isR = dragDialogueInfo.isColliding;
            ctx.fillStyle = isR ? 'rgba(255, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(gTx, gStartY, sndSec.cw, gEndY - gStartY);
            ctx.strokeStyle = isR ? 'red' : 'rgba(255, 255, 255, 0.8)'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(gTx, gStartY); ctx.lineTo(gTx + sndSec.cw, gStartY); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(gTx, gEndY); ctx.lineTo(gTx + sndSec.cw, gEndY); ctx.stroke();
        }
    });
}
