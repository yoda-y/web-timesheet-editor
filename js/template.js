// === タイムシートテンプレート描画エンジン ===
// A3縦、edit UI再現

const TEMPLATE = {
    // A3 縦 (mm)
    WIDTH_MM: 297,
    HEIGHT_MM: 420,
    DPI_PREVIEW: 96,
    DPI_EXPORT: 300,

    // テンプレートカラー（統一、変更可能）
    TEMPLATE_COLOR: '#7cb342',

    // その他の色
    TEXT_COLOR: '#333333',
    BG_COLOR: '#ffffff',

    // マージン (mm)
    MARGIN_LEFT: 10,
    MARGIN_TOP: 8,
    MARGIN_RIGHT: 10,
    MARGIN_BOTTOM: 8,

    // ヘッダー
    HEADER_HEIGHT: 12,

    // Direction/BOOK領域
    DIRECTION_HEIGHT: 35,

    // Body構成
    BODY_H_MARGIN: 10,      // 2カラム間の隙間

    // 行
    ROW_HEIGHT: 4.0,
    FRAMES_PER_COL: 72,
    FRAMES_PER_PAGE: 144,

    // タイムラインヘッダー
    COL_HEADER_HEIGHT: 10,

    // 罫線太さ（エクスポート時に消えないよう太めに）
    LINE_THICK: 3,      // 外枠・セクション境界
    LINE_MEDIUM: 2,     // 12コマ線
    LINE_THIN: 1.5,     // 通常線
    LINE_FINE: 1        // 細線
};

// mm → px 変換
function mmToPx(mm, dpi) {
    return mm * dpi / 25.4;
}

// テンプレートキャンバス生成
function createTemplateCanvas(dpi) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(mmToPx(TEMPLATE.WIDTH_MM, dpi));
    canvas.height = Math.round(mmToPx(TEMPLATE.HEIGHT_MM, dpi));
    return canvas;
}

// メインテンプレート描画
function renderTemplate(dpi, pageIndex = 0) {
    const canvas = createTemplateCanvas(dpi);
    const ctx = canvas.getContext('2d');
    const scale = dpi / 25.4;
    const m = (mm) => mm * scale;

    // 背景
    ctx.fillStyle = TEMPLATE.BG_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ヘッダー
    drawHeader(ctx, scale);

    // Body幅計算（左右マージン内に収める）
    const contentW = m(TEMPLATE.WIDTH_MM - TEMPLATE.MARGIN_LEFT - TEMPLATE.MARGIN_RIGHT);
    const bodyW = (contentW - m(TEMPLATE.BODY_H_MARGIN)) / 2;

    // タイムライン高さ計算
    const timelineH = m(TEMPLATE.FRAMES_PER_COL * TEMPLATE.ROW_HEIGHT + TEMPLATE.COL_HEADER_HEIGHT);
    // 下余白を上余白と同じにする
    const bodyY = m(TEMPLATE.HEIGHT_MM - TEMPLATE.MARGIN_BOTTOM) - timelineH;

    // Direction/BOOK領域（タイムライン上部）
    const directionY = m(TEMPLATE.MARGIN_TOP + TEMPLATE.HEADER_HEIGHT + 5);
    const directionH = bodyY - directionY - m(5);
    drawDirectionArea(ctx, scale, directionY, directionH, bodyW, pageIndex);

    // Body 1 (左: frame 0-71)
    const body1X = m(TEMPLATE.MARGIN_LEFT);
    drawTimelineColumn(ctx, scale, body1X, bodyY, bodyW, 0, pageIndex);

    // Body 2 (右: frame 72-143)
    const body2X = body1X + bodyW + m(TEMPLATE.BODY_H_MARGIN);
    drawTimelineColumn(ctx, scale, body2X, bodyY, bodyW, 72, pageIndex);

    return canvas;
}

// テキストを枠内に収めるサイズ計算
function fitTextSize(ctx, text, maxW, maxH, baseSize) {
    let size = baseSize;
    ctx.font = `bold ${size}px sans-serif`;
    let metrics = ctx.measureText(text);

    // 幅に収まるまで縮小
    while (metrics.width > maxW && size > 6) {
        size -= 0.5;
        ctx.font = `bold ${size}px sans-serif`;
        metrics = ctx.measureText(text);
    }

    // 高さチェック
    if (size > maxH * 0.7) {
        size = maxH * 0.7;
    }

    return size;
}

// ヘッダー描画（edit準拠）
function drawHeader(ctx, scale) {
    const m = (mm) => mm * scale;
    const x = m(TEMPLATE.MARGIN_LEFT);
    const y = m(TEMPLATE.MARGIN_TOP);
    const totalW = m(TEMPLATE.WIDTH_MM - TEMPLATE.MARGIN_LEFT - TEMPLATE.MARGIN_RIGHT);
    const h = m(TEMPLATE.HEADER_HEIGHT);

    ctx.strokeStyle = TEMPLATE.TEMPLATE_COLOR;
    ctx.lineWidth = TEMPLATE.LINE_THIN;

    // ヘッダーフィールド（edit準拠、VERSION除外、SHEET半分）
    const fields = [
        { label: 'TITLE', key: 'title', ratio: 0.28 },
        { label: 'EPISODE', key: 'subTitle', ratio: 0.10 },
        { label: 'SCENE', key: 'scene', ratio: 0.10 },
        { label: 'CUT', key: 'cut', ratio: 0.10 },
        { label: 'TIME', key: 'time', ratio: 0.13 },
        { label: 'NAME', key: 'creator', ratio: 0.19 },
        { label: 'SHEET', key: 'sheet', ratio: 0.10 }
    ];

    let cx = x;
    const labelSize = m(2.2);
    const baseValueSize = m(4.5);

    fields.forEach((f) => {
        const fw = totalW * f.ratio;

        // 枠線
        ctx.strokeRect(cx, y, fw, h);

        // ラベル（テンプレートカラー、左上）
        ctx.fillStyle = TEMPLATE.TEMPLATE_COLOR;
        ctx.font = `${labelSize}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(f.label, cx + m(0.8), y + m(0.5));

        // 値
        ctx.fillStyle = TEMPLATE.TEXT_COLOR;
        ctx.textBaseline = 'bottom';

        if (f.key === 'time') {
            const sec = metaData.lengthSec || '0';
            const fr = metaData.lengthFrame || '00';

            const valueSize = fitTextSize(ctx, sec + '+' + fr, fw - m(2), h - m(3), baseValueSize);
            ctx.font = `bold ${valueSize}px sans-serif`;

            ctx.fillStyle = TEMPLATE.TEMPLATE_COLOR;
            ctx.textAlign = 'center';
            ctx.fillText('+', cx + fw / 2, y + h - m(1));

            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            ctx.textAlign = 'right';
            ctx.fillText(sec, cx + fw / 2 - m(1.5), y + h - m(1));

            ctx.textAlign = 'left';
            ctx.fillText(fr, cx + fw / 2 + m(1.5), y + h - m(1));
        } else if (f.key === 'sheet') {
            const val = '1/1';
            const valueSize = fitTextSize(ctx, val, fw - m(2), h - m(3), baseValueSize);
            ctx.font = `bold ${valueSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(val, cx + fw / 2, y + h - m(1));
        } else {
            const val = metaData[f.key] || '';
            const valueSize = fitTextSize(ctx, val, fw - m(2), h - m(3), baseValueSize);
            ctx.font = `bold ${valueSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(val, cx + fw / 2, y + h - m(1));
        }

        cx += fw;
    });

    // タイムコード（ヘッダー右下外）
    ctx.fillStyle = TEMPLATE.TEXT_COLOR;
    ctx.font = `${m(2)}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    const now = new Date();
    const dateStr = `${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    ctx.fillText(dateStr, x + totalW, y + h + m(1));

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

// Direction/BOOK領域描画
function drawDirectionArea(ctx, scale, startY, areaH, bodyW, pageIndex) {
    const m = (mm) => mm * scale;
    const x = m(TEMPLATE.MARGIN_LEFT);
    const totalW = m(TEMPLATE.WIDTH_MM - TEMPLATE.MARGIN_LEFT - TEMPLATE.MARGIN_RIGHT);

    // Direction枠描画
    ctx.strokeStyle = TEMPLATE.TEMPLATE_COLOR;
    ctx.lineWidth = TEMPLATE.LINE_THIN;
    ctx.strokeRect(x, startY, totalW, areaH);

    // Directionラベル
    ctx.fillStyle = TEMPLATE.TEMPLATE_COLOR;
    ctx.font = `${m(2.2)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Direction / BOOK', x + m(1), startY + m(1));

    // Directionテキスト描画
    if (typeof metaData !== 'undefined' && metaData.direction) {
        ctx.fillStyle = TEMPLATE.TEXT_COLOR;
        ctx.font = `${m(3)}px sans-serif`;
        ctx.textBaseline = 'top';
        const lines = metaData.direction.split('\n');
        let ty = startY + m(6);
        lines.forEach(line => {
            ctx.fillText(line, x + m(3), ty);
            ty += m(4);
        });
    }

    // BOOK描画（edit風）
    drawBooksInArea(ctx, scale, startY, areaH, bodyW, pageIndex);
}

// BOOK描画（edit準拠レイアウト）
function drawBooksInArea(ctx, scale, areaY, areaH, bodyW, pageIndex) {
    const m = (mm) => mm * scale;
    if (typeof booksData === 'undefined') return;

    const cols = getActualColCounts();
    const frameNumW = m(5);
    const contentW = m(TEMPLATE.WIDTH_MM - TEMPLATE.MARGIN_LEFT - TEMPLATE.MARGIN_RIGHT);
    const availW = bodyW - frameNumW;

    // 列幅計算
    const actionRatio = 0.8;
    const soundRatio = 1.5;
    const totalParts = cols.ACTION + cols.SOUND * soundRatio + cols.CELL + cols.CAMERA;
    const unitW = availW / totalParts;
    const actionColW = unitW * actionRatio;

    const baseX = m(TEMPLATE.MARGIN_LEFT);
    const bookBoxW = m(12);
    const bookBoxH = m(5);
    const bookRowH = m(7);

    // タイムライン高さ計算（BOOKのラインを引くため）
    const timelineH = m(TEMPLATE.FRAMES_PER_COL * TEMPLATE.ROW_HEIGHT + TEMPLATE.COL_HEADER_HEIGHT);
    const timelineY = m(TEMPLATE.HEIGHT_MM - TEMPLATE.MARGIN_BOTTOM) - timelineH;
    const colHeaderH = m(TEMPLATE.COL_HEADER_HEIGHT);
    const gridY = timelineY + colHeaderH;

    // ACTION列のBOOKのみ描画
    if (booksData['ACTION']) {
        for (const lineIdx in booksData['ACTION']) {
            const books = booksData['ACTION'][lineIdx];
            const colIndex = parseInt(lineIdx);
            const colX = baseX + colIndex * actionColW;

            books.forEach((bookName, bookIdx) => {
                const boxX = colX + m(3);
                const boxY = areaY + areaH - m(8) - bookIdx * bookRowH;

                // ブランチライン（BOOKから列ヘッダーまで）
                ctx.strokeStyle = TEMPLATE.TEMPLATE_COLOR;
                ctx.lineWidth = TEMPLATE.LINE_FINE;
                ctx.beginPath();
                ctx.moveTo(boxX + bookBoxW / 2, boxY + bookBoxH);
                ctx.lineTo(colX + actionColW / 2, boxY + bookBoxH);
                ctx.lineTo(colX + actionColW / 2, gridY);
                ctx.stroke();

                // BOOKボックス
                ctx.fillStyle = TEMPLATE.BG_COLOR;
                ctx.strokeStyle = TEMPLATE.TEMPLATE_COLOR;
                ctx.lineWidth = TEMPLATE.LINE_FINE;
                ctx.beginPath();
                ctx.roundRect(boxX, boxY, bookBoxW, bookBoxH, m(1));
                ctx.fill();
                ctx.stroke();

                // BOOKテキスト
                ctx.fillStyle = TEMPLATE.TEMPLATE_COLOR;
                ctx.font = `bold ${m(2.5)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(bookName, boxX + bookBoxW / 2, boxY + bookBoxH / 2);
            });
        }
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

// タイムラインカラム描画（edit風）
function drawTimelineColumn(ctx, scale, startX, startY, bodyW, startFrame, pageIndex) {
    const m = (mm) => mm * scale;
    const rowH = m(TEMPLATE.ROW_HEIGHT);
    const colHeaderH = m(TEMPLATE.COL_HEADER_HEIGHT);
    const gridH = TEMPLATE.FRAMES_PER_COL * rowH;

    // 列数取得
    const cols = getActualColCounts();

    // 列幅計算（ACTION 80%、余剰をCAMERAへ配分）
    const frameNumW = m(5);
    const availW = bodyW - frameNumW;

    const actionRatio = 0.8;
    const soundRatio = 1.5;
    const totalParts = cols.ACTION + cols.SOUND * soundRatio + cols.CELL + cols.CAMERA;
    const unitW = availW / totalParts;

    const actionColW = unitW * actionRatio;
    const soundColW = unitW * soundRatio;
    const cellColW = unitW;
    const actionSaved = unitW * cols.ACTION * (1 - actionRatio);
    const cameraColW = unitW + actionSaved / cols.CAMERA;

    const gridY = startY + colHeaderH;

    // 全体の外枠
    ctx.strokeStyle = TEMPLATE.TEMPLATE_COLOR;
    ctx.lineWidth = TEMPLATE.LINE_THICK;
    ctx.strokeRect(startX, gridY, bodyW, gridH);

    // タイムラインヘッダー描画
    drawTimelineHeader(ctx, scale, startX, startY, bodyW, frameNumW, actionColW, soundColW, cellColW, cameraColW, cols, colHeaderH);

    let x = startX;
    const absoluteStart = startFrame + pageIndex * TEMPLATE.FRAMES_PER_PAGE;

    // ACTION
    drawDataBlockInner(ctx, x, gridY, actionColW, cols.ACTION, rowH, 'ACTION', startFrame, pageIndex, scale);
    drawBarLines(ctx, x, gridY, actionColW, cols.ACTION, rowH, 'ACTION', absoluteStart, scale);
    x += actionColW * cols.ACTION;

    // フレーム番号列
    drawFrameNumberColumn(ctx, x, gridY, frameNumW, rowH, absoluteStart, scale, gridH);
    x += frameNumW;

    // SOUND（セリフブロック）
    drawDataBlockInner(ctx, x, gridY, soundColW, cols.SOUND, rowH, 'SOUND', startFrame, pageIndex, scale);
    drawDialogueBlocksTemplate(ctx, x, gridY, soundColW, cols.SOUND, rowH, absoluteStart, scale);
    x += soundColW * cols.SOUND;

    // CELL
    drawDataBlockInner(ctx, x, gridY, cellColW, cols.CELL, rowH, 'CELL', startFrame, pageIndex, scale);
    drawBarLines(ctx, x, gridY, cellColW, cols.CELL, rowH, 'CELL', absoluteStart, scale);
    x += cellColW * cols.CELL;

    // CAMERA
    drawDataBlockInner(ctx, x, gridY, cameraColW, cols.CAMERA, rowH, 'CAMERA', startFrame, pageIndex, scale);
    drawCameraBlocksTemplate(ctx, x, gridY, cameraColW, cols.CAMERA, rowH, absoluteStart, scale);
}

// タイムラインヘッダー描画
function drawTimelineHeader(ctx, scale, startX, startY, bodyW, frameNumW, actionColW, soundColW, cellColW, cameraColW, cols, headerH) {
    const m = (mm) => mm * scale;

    const sectionLabelH = headerH * 0.5;
    const colLabelH = headerH * 0.5;

    ctx.strokeStyle = TEMPLATE.TEMPLATE_COLOR;

    // ヘッダー全体の外枠
    ctx.lineWidth = TEMPLATE.LINE_THICK;
    ctx.strokeRect(startX, startY, bodyW, headerH);

    const actionTotalW = actionColW * cols.ACTION;
    const actionFrameW = actionTotalW + frameNumW;

    // ACTION セクション名
    ctx.fillStyle = TEMPLATE.TEMPLATE_COLOR;
    ctx.font = `bold ${m(2.2)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ACTION', startX + actionFrameW / 2, startY + sectionLabelH / 2);

    // 中央の横線
    ctx.lineWidth = TEMPLATE.LINE_FINE;
    ctx.beginPath();
    ctx.moveTo(startX, startY + sectionLabelH);
    ctx.lineTo(startX + actionFrameW, startY + sectionLabelH);
    ctx.stroke();

    // ACTION 列名
    const actionChars = getSectionChars('ACTION');
    ctx.font = `${m(2)}px sans-serif`;
    for (let i = 0; i < cols.ACTION; i++) {
        const cx = startX + i * actionColW;
        if (i > 0) {
            ctx.lineWidth = TEMPLATE.LINE_FINE;
            ctx.beginPath();
            ctx.moveTo(cx, startY + sectionLabelH);
            ctx.lineTo(cx, startY + headerH);
            ctx.stroke();
        }
        ctx.fillStyle = TEMPLATE.TEMPLATE_COLOR;
        ctx.textAlign = 'center';
        ctx.fillText(actionChars[i] || '', cx + actionColW / 2, startY + sectionLabelH + colLabelH / 2);
    }

    // ACTION と FRAME の間の細線
    ctx.lineWidth = TEMPLATE.LINE_FINE;
    ctx.beginPath();
    ctx.moveTo(startX + actionTotalW, startY + sectionLabelH);
    ctx.lineTo(startX + actionTotalW, startY + headerH);
    ctx.stroke();

    // 残りのセクション
    let x = startX + actionFrameW;
    const otherSections = [
        { type: 'SOUND', colW: soundColW, count: cols.SOUND },
        { type: 'CELL', colW: cellColW, count: cols.CELL },
        { type: 'CAMERA', colW: cameraColW, count: cols.CAMERA }
    ];

    otherSections.forEach(sec => {
        if (sec.count === 0) return;
        const totalW = sec.colW * sec.count;

        // セクション区切り線
        ctx.lineWidth = TEMPLATE.LINE_MEDIUM;
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x, startY + headerH);
        ctx.stroke();

        // セクション名
        ctx.fillStyle = TEMPLATE.TEMPLATE_COLOR;
        ctx.font = `bold ${m(2.2)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sec.type, x + totalW / 2, startY + sectionLabelH / 2);

        // 中央の横線
        ctx.lineWidth = TEMPLATE.LINE_FINE;
        ctx.beginPath();
        ctx.moveTo(x, startY + sectionLabelH);
        ctx.lineTo(x + totalW, startY + sectionLabelH);
        ctx.stroke();

        // 列名と縦線
        const chars = getSectionChars(sec.type);
        ctx.font = `${m(2)}px sans-serif`;
        for (let i = 0; i < sec.count; i++) {
            const cx = x + i * sec.colW;
            if (i > 0) {
                ctx.lineWidth = TEMPLATE.LINE_FINE;
                ctx.beginPath();
                ctx.moveTo(cx, startY + sectionLabelH);
                ctx.lineTo(cx, startY + headerH);
                ctx.stroke();
            }
            ctx.fillStyle = TEMPLATE.TEMPLATE_COLOR;
            ctx.textAlign = 'center';
            ctx.fillText(chars[i] || '', cx + sec.colW / 2, startY + sectionLabelH + colLabelH / 2);
        }

        x += totalW;
    });
}

// セクションの列名取得
function getSectionChars(type) {
    if (typeof sections !== 'undefined') {
        const sec = sections.find(s => s.type === type);
        if (sec && sec.chars) return sec.chars;
    }
    if (type === 'ACTION') return ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    if (type === 'CELL') return ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    if (type === 'SOUND') return ['S1', 'S2'];
    if (type === 'CAMERA') return ['C1', 'C2', 'C3'];
    return [];
}

// 列数取得（テンプレート用：CAMERA常に3列）
function getActualColCounts() {
    const result = { ACTION: 7, CELL: 7, SOUND: 2, CAMERA: 3 };
    if (typeof sections !== 'undefined') {
        sections.forEach(sec => {
            if (sec.type === 'CAMERA') return;
            if (result[sec.type] !== undefined) {
                result[sec.type] = sec.cols;
            }
        });
    }
    return result;
}

// フレーム番号列
function drawFrameNumberColumn(ctx, x, y, w, rowH, startFrame, scale, gridH) {
    const m = (mm) => mm * scale;

    // 左の境界線
    ctx.strokeStyle = TEMPLATE.TEMPLATE_COLOR;
    ctx.lineWidth = TEMPLATE.LINE_FINE;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + gridH);
    ctx.stroke();

    // 右の境界線
    ctx.lineWidth = TEMPLATE.LINE_MEDIUM;
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w, y + gridH);
    ctx.stroke();

    ctx.fillStyle = TEMPLATE.TEMPLATE_COLOR;

    for (let i = 0; i < TEMPLATE.FRAMES_PER_COL; i++) {
        const frameNum = startFrame + i + 1;
        const fy = y + i * rowH;

        // 横線
        if (i < TEMPLATE.FRAMES_PER_COL - 1 || frameNum % 24 !== 0) {
            if (frameNum % 24 === 0) {
                ctx.lineWidth = TEMPLATE.LINE_THICK;
            } else if (frameNum % 12 === 0) {
                ctx.lineWidth = TEMPLATE.LINE_MEDIUM;
            } else if (frameNum % 6 === 0) {
                ctx.lineWidth = TEMPLATE.LINE_THIN;
            } else {
                ctx.lineWidth = TEMPLATE.LINE_FINE;
            }
            ctx.strokeStyle = TEMPLATE.TEMPLATE_COLOR;
            ctx.beginPath();
            ctx.moveTo(x, fy + rowH);
            ctx.lineTo(x + w, fy + rowH);
            ctx.stroke();
        }

        // 2コマごとにフレーム番号
        if (frameNum % 2 === 0) {
            ctx.font = `${m(1.8)}px monospace`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            ctx.fillText(String(frameNum), x + w - m(0.3), fy + rowH - m(0.2));
        }

        // 秒マーク
        if (frameNum % 24 === 0) {
            ctx.font = `bold ${m(2.5)}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.fillText(String(frameNum / 24), x + m(0.3), fy + rowH - m(0.2));
        }
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

// データブロック内部描画
function drawDataBlockInner(ctx, x, y, colW, colCount, rowH, colType, startFrame, pageIndex, scale) {
    const m = (mm) => mm * scale;
    const totalW = colW * colCount;
    const totalH = TEMPLATE.FRAMES_PER_COL * rowH;

    if (colCount === 0) return;

    ctx.strokeStyle = TEMPLATE.TEMPLATE_COLOR;

    // セクション左端の縦線
    ctx.lineWidth = TEMPLATE.LINE_MEDIUM;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + totalH);
    ctx.stroke();

    // 内部縦線
    for (let c = 1; c < colCount; c++) {
        ctx.lineWidth = TEMPLATE.LINE_FINE;
        ctx.beginPath();
        ctx.moveTo(x + c * colW, y);
        ctx.lineTo(x + c * colW, y + totalH);
        ctx.stroke();
    }

    // 横線
    for (let i = 1; i < TEMPLATE.FRAMES_PER_COL; i++) {
        const frameNum = startFrame + i;
        if (frameNum % 24 === 0) {
            ctx.lineWidth = TEMPLATE.LINE_THICK;
        } else if (frameNum % 12 === 0) {
            ctx.lineWidth = TEMPLATE.LINE_MEDIUM;
        } else if (frameNum % 6 === 0) {
            ctx.lineWidth = TEMPLATE.LINE_THIN;
        } else {
            ctx.lineWidth = TEMPLATE.LINE_FINE;
        }
        ctx.beginPath();
        ctx.moveTo(x, y + i * rowH);
        ctx.lineTo(x + totalW, y + i * rowH);
        ctx.stroke();
    }

    // セルデータ
    drawCellDataInBlock(ctx, x, y, colW, colCount, rowH, colType, startFrame, pageIndex, scale);
}

// セルデータ描画（中央配置）
function drawCellDataInBlock(ctx, x, y, colW, colCount, rowH, colType, startFrame, pageIndex, scale) {
    const m = (mm) => mm * scale;
    if (typeof cellData === 'undefined') return;

    ctx.fillStyle = TEMPLATE.TEXT_COLOR;
    const absoluteStart = startFrame + pageIndex * TEMPLATE.FRAMES_PER_PAGE;
    const endFrame = absoluteStart + TEMPLATE.FRAMES_PER_COL;

    for (let ci = 0; ci < colCount; ci++) {
        for (let f = absoluteStart; f < endFrame; f++) {
            const key = `${colType}-${ci}-${f}`;
            const data = cellData[key];
            if (!data || !data.value) continue;

            const cx = x + ci * colW + colW / 2;
            const cy = y + (f - absoluteStart) * rowH + rowH / 2;

            drawVerticalTextCentered(ctx, data.value, cx, cy, m(2), rowH * 0.85);
        }
    }
}

// 縦書きテキスト（中央配置）
function drawVerticalTextCentered(ctx, text, x, y, fontSize, maxH) {
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const chars = String(text).split('');
    const charH = fontSize * 1.1;
    let totalH = chars.length * charH;

    let drawScale = 1;
    if (totalH > maxH) {
        drawScale = maxH / totalH;
        totalH = maxH;
    }

    let startY = y - totalH / 2 + charH * drawScale / 2;

    chars.forEach((ch, i) => {
        ctx.fillText(ch, x, startY + i * charH * drawScale);
    });

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

// 棒線・波線描画
function drawBarLines(ctx, x, y, colW, colCount, rowH, colType, absoluteStart, scale) {
    const m = (mm) => mm * scale;
    if (typeof cellData === 'undefined') return;

    const endFrame = absoluteStart + TEMPLATE.FRAMES_PER_COL;
    const lineGap = 3;

    const getVal = (ci, f) => {
        const key = `${colType}-${ci}-${f}`;
        const d = cellData[key];
        return d ? d.value : '';
    };

    const isLinePiercing = (v) => v === '' || v === '―';

    ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
    ctx.lineWidth = TEMPLATE.LINE_THIN;

    for (let ci = 0; ci < colCount; ci++) {
        const tx = x + ci * colW + colW / 2;

        for (let f = absoluteStart; f < endFrame; f++) {
            const val = getVal(ci, f);
            if (!isLinePiercing(val)) continue;

            // 上方向で値を探す
            let startF = -1, startVal = '';
            for (let tmp = f - 1; tmp >= 0; tmp--) {
                const tmpV = getVal(ci, tmp);
                if (!isLinePiercing(tmpV)) {
                    startF = tmp;
                    startVal = tmpV;
                    break;
                }
            }
            if (startF === -1) continue;

            // 下方向で終端を探す
            let nextF = endFrame;
            for (let tmp = f + 1; tmp < endFrame; tmp++) {
                if (!isLinePiercing(getVal(ci, tmp))) {
                    nextF = tmp;
                    break;
                }
            }

            const gap = nextF - startF - 1;
            if (gap < lineGap) continue;
            if (colType === 'ACTION' && (f - startF >= 9)) continue;

            const drawY_top = y + (f - absoluteStart) * rowH;
            const drawY_bottom = y + (f - absoluteStart + 1) * rowH;

            if (startVal === '×') {
                // 波線
                const offset = rowH / 4;
                ctx.beginPath();
                ctx.moveTo(tx, drawY_top);
                ctx.bezierCurveTo(tx - offset, drawY_top + offset, tx + offset, drawY_bottom - offset, tx, drawY_bottom);
                ctx.stroke();
            } else {
                // 棒線
                ctx.beginPath();
                ctx.moveTo(tx, drawY_top);
                ctx.lineTo(tx, drawY_bottom);
                ctx.stroke();
            }
        }
    }
}

// セリフブロック描画（テンプレート用）
function drawDialogueBlocksTemplate(ctx, x, y, colW, colCount, rowH, absoluteStart, scale) {
    const m = (mm) => mm * scale;
    if (typeof dialogueBlocks === 'undefined') return;

    const endFrame = absoluteStart + TEMPLATE.FRAMES_PER_COL;

    dialogueBlocks.forEach(block => {
        if (block.startFrame >= endFrame || block.endFrame < absoluteStart) return;
        if (block.colIndex >= colCount) return;

        const sF = Math.max(block.startFrame, absoluteStart);
        const eF = Math.min(block.endFrame, endFrame - 1);

        const tx = x + block.colIndex * colW;
        const startY = y + (sF - absoluteStart) * rowH;
        const endY = y + (eF - absoluteStart + 1) * rowH;
        const blockH = endY - startY;

        // 背景
        ctx.fillStyle = getSpeakerColorTemplate(block.speakerName);
        ctx.fillRect(tx, startY, colW, blockH);

        // 上下線
        ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
        ctx.lineWidth = TEMPLATE.LINE_THIN;
        ctx.beginPath();
        ctx.moveTo(tx, startY);
        ctx.lineTo(tx + colW, startY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tx, endY);
        ctx.lineTo(tx + colW, endY);
        ctx.stroke();

        // テキスト
        ctx.fillStyle = TEMPLATE.TEXT_COLOR;
        let textStartY = startY + m(4);
        const isShort = blockH <= rowH * 2;

        if (block.speakerName && !isShort) {
            ctx.font = `bold ${m(2.5)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(block.speakerName, tx + colW / 2, startY + m(3));
            textStartY = startY + m(7);
        }

        if (block.text) {
            ctx.font = `bold ${m(3)}px sans-serif`;
            ctx.textAlign = 'center';
            const chars = block.text.split('');
            const charH = m(3.5);
            const availH = endY - textStartY - m(1);
            const spacing = Math.min(charH, availH / chars.length);

            chars.forEach((ch, i) => {
                if (ch === 'ー') ch = '丨';
                ctx.fillText(ch, tx + colW / 2, textStartY + i * spacing + charH / 2);
            });
        }
    });
}

// 話者カラー（テンプレート用）
function getSpeakerColorTemplate(name) {
    const colors = [
        'rgba(255, 200, 200, 0.5)',
        'rgba(200, 255, 200, 0.5)',
        'rgba(200, 200, 255, 0.5)',
        'rgba(255, 255, 200, 0.5)',
        'rgba(255, 200, 255, 0.5)',
        'rgba(200, 255, 255, 0.5)'
    ];
    if (!name) return colors[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

// カメラブロック描画（テンプレート用）
function drawCameraBlocksTemplate(ctx, x, y, colW, colCount, rowH, absoluteStart, scale) {
    const m = (mm) => mm * scale;
    if (typeof cameraBlocks === 'undefined') return;

    const endFrame = absoluteStart + TEMPLATE.FRAMES_PER_COL;

    cameraBlocks.forEach(block => {
        if (block.startFrame >= endFrame || block.endFrame < absoluteStart) return;
        if (block.colIndex >= colCount) return;

        const sF = Math.max(block.startFrame, absoluteStart);
        const eF = Math.min(block.endFrame, endFrame - 1);

        const tx = x + block.colIndex * colW;
        const startY = y + (sF - absoluteStart) * rowH;
        const endY = y + (eF - absoluteStart + 1) * rowH;
        const blockH = endY - startY;

        // 背景
        ctx.fillStyle = 'rgba(200, 200, 255, 0.3)';
        ctx.fillRect(tx, startY, colW, blockH);

        // 上下線
        ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
        ctx.lineWidth = TEMPLATE.LINE_THIN;
        ctx.beginPath();
        ctx.moveTo(tx, startY);
        ctx.lineTo(tx + colW, startY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tx, endY);
        ctx.lineTo(tx + colW, endY);
        ctx.stroke();

        // テキスト描画
        ctx.fillStyle = TEMPLATE.TEXT_COLOR;
        ctx.font = `bold ${m(2.5)}px sans-serif`;
        ctx.textAlign = 'center';

        const lines = [];
        if (block.cameraWork) lines.push(block.cameraWork);
        if (block.text) lines.push(...block.text.split('\n'));

        const lineH = m(3.5);
        const totalTextH = lines.length * lineH;
        let textY = startY + (blockH - totalTextH) / 2 + lineH / 2;

        lines.forEach(line => {
            ctx.fillText(line, tx + colW / 2, textY);
            textY += lineH;
        });
    });
}

// プレビュー用
function getTemplatePreview() {
    return renderTemplate(TEMPLATE.DPI_PREVIEW, 0);
}

// エクスポート用
function getTemplateForExport(dpi) {
    return renderTemplate(dpi || TEMPLATE.DPI_EXPORT, 0);
}

// PNG/JPG エクスポート
async function exportTemplateImage(format) {
    const canvas = getTemplateForExport(TEMPLATE.DPI_EXPORT);
    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const ext = format === 'jpg' ? 'jpg' : 'png';
    const baseName = `${metaData.title || 'timesheet'}_${metaData.cut || '001'}`;

    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: `${baseName}.${ext}`,
                types: [{ description: ext.toUpperCase(), accept: { [mimeType]: [`.${ext}`] } }]
            });
            const blob = await new Promise(r => canvas.toBlob(r, mimeType, 0.95));
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
        } catch (err) {
            if (err.name !== 'AbortError') alert('画像の保存に失敗しました。');
        }
    } else {
        const dataUrl = canvas.toDataURL(mimeType, 0.95);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${baseName}.${ext}`;
        a.click();
    }
}
