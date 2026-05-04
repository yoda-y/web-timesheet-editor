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
    COL_HEADER_HEIGHT: 10
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

    // Memo/BOOK領域
    drawMemoArea(ctx, scale);

    // Body幅計算（左右マージン内に収める）
    const contentW = m(TEMPLATE.WIDTH_MM - TEMPLATE.MARGIN_LEFT - TEMPLATE.MARGIN_RIGHT);
    const bodyW = (contentW - m(TEMPLATE.BODY_H_MARGIN)) / 2;

    // タイムライン高さ計算
    const timelineH = m(TEMPLATE.FRAMES_PER_COL * TEMPLATE.ROW_HEIGHT + TEMPLATE.COL_HEADER_HEIGHT);
    // 下余白を上余白と同じにする
    const bodyY = m(TEMPLATE.HEIGHT_MM - TEMPLATE.MARGIN_BOTTOM) - timelineH;

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
    ctx.lineWidth = 1.5;

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
    const baseValueSize = m(4.5);  // 基本サイズ大きめ

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
            // TIME: "+" をテンプレートカラーで中央に
            const sec = metaData.lengthSec || '0';
            const fr = metaData.lengthFrame || '00';

            const valueSize = fitTextSize(ctx, sec + '+' + fr, fw - m(2), h - m(3), baseValueSize);
            ctx.font = `bold ${valueSize}px sans-serif`;

            // "+"
            ctx.fillStyle = TEMPLATE.TEMPLATE_COLOR;
            ctx.textAlign = 'center';
            ctx.fillText('+', cx + fw / 2, y + h - m(1));

            // 秒（左側）
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            ctx.textAlign = 'right';
            ctx.fillText(sec, cx + fw / 2 - m(1.5), y + h - m(1));

            // コマ（右側）
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

// Memo/BOOK領域
function drawMemoArea(ctx, scale) {
    const m = (mm) => mm * scale;
    const x = m(TEMPLATE.MARGIN_LEFT);
    const y = m(TEMPLATE.MARGIN_TOP + TEMPLATE.HEADER_HEIGHT + 5);

    ctx.fillStyle = TEMPLATE.TEXT_COLOR;
    ctx.font = `${m(2.5)}px sans-serif`;

    // BOOKデータ
    if (typeof booksData !== 'undefined' && booksData['ACTION']) {
        let bx = x;
        let by = y;
        const lineH = m(5);

        for (const lineIdx in booksData['ACTION']) {
            const books = booksData['ACTION'][lineIdx];
            books.forEach(bookName => {
                const textW = ctx.measureText(bookName).width + m(4);
                const contentW = m(TEMPLATE.WIDTH_MM - TEMPLATE.MARGIN_LEFT - TEMPLATE.MARGIN_RIGHT);
                if (bx + textW > x + contentW) {
                    bx = x;
                    by += lineH;
                }
                ctx.strokeStyle = TEMPLATE.TEMPLATE_COLOR;
                ctx.lineWidth = 1;
                ctx.strokeRect(bx, by - m(3), textW, m(4));
                ctx.fillText(bookName, bx + m(2), by);
                bx += textW + m(2);
            });
        }
    }
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

    // 基本単位幅を計算（ACTIONは80%相当、SOUNDは1.5倍）
    const actionRatio = 0.8;
    const soundRatio = 1.5;
    // 全列が使う「部品数」
    const totalParts = cols.ACTION + cols.SOUND * soundRatio + cols.CELL + cols.CAMERA;
    const unitW = availW / totalParts;

    const actionColW = unitW * actionRatio;
    const soundColW = unitW * soundRatio;
    const cellColW = unitW;
    // ACTIONから節約した分をCAMERAに追加
    const actionSaved = unitW * cols.ACTION * (1 - actionRatio);
    const cameraColW = unitW + actionSaved / cols.CAMERA;

    const gridY = startY + colHeaderH;

    // 全体の外枠を先に描画（統一した太さ）
    ctx.strokeStyle = TEMPLATE.TEMPLATE_COLOR;
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, gridY, bodyW, gridH);

    // タイムラインヘッダー描画
    drawTimelineHeader(ctx, scale, startX, startY, bodyW, frameNumW, actionColW, soundColW, cellColW, cameraColW, cols, colHeaderH);

    let x = startX;

    // ACTION（内部のみ描画、外枠は既に描画済み）
    drawDataBlockInner(ctx, x, gridY, actionColW, cols.ACTION, rowH, 'ACTION', startFrame, pageIndex, scale);
    x += actionColW * cols.ACTION;

    // フレーム番号列（ACTIONとSOUNDの間）
    drawFrameNumberColumn(ctx, x, gridY, frameNumW, rowH, startFrame + pageIndex * TEMPLATE.FRAMES_PER_PAGE, scale, gridH);
    x += frameNumW;

    // SOUND
    drawDataBlockInner(ctx, x, gridY, soundColW, cols.SOUND, rowH, 'SOUND', startFrame, pageIndex, scale);
    x += soundColW * cols.SOUND;

    // CELL
    drawDataBlockInner(ctx, x, gridY, cellColW, cols.CELL, rowH, 'CELL', startFrame, pageIndex, scale);
    x += cellColW * cols.CELL;

    // CAMERA
    drawDataBlockInner(ctx, x, gridY, cameraColW, cols.CAMERA, rowH, 'CAMERA', startFrame, pageIndex, scale);
}

// タイムラインヘッダー描画（edit風）
function drawTimelineHeader(ctx, scale, startX, startY, bodyW, frameNumW, actionColW, soundColW, cellColW, cameraColW, cols, headerH) {
    const m = (mm) => mm * scale;

    const sectionLabelH = headerH * 0.5;
    const colLabelH = headerH * 0.5;

    ctx.strokeStyle = TEMPLATE.TEMPLATE_COLOR;

    // ヘッダー全体の外枠
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, startY, bodyW, headerH);

    // ACTION + FRAME を一体として描画
    const actionTotalW = actionColW * cols.ACTION;
    const actionFrameW = actionTotalW + frameNumW;

    // ACTION セクション名（ACTION列+FRAME列の中央）
    ctx.fillStyle = TEMPLATE.TEMPLATE_COLOR;
    ctx.font = `bold ${m(2.2)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ACTION', startX + actionFrameW / 2, startY + sectionLabelH / 2);

    // ACTION+FRAME 中央の横線
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, startY + sectionLabelH);
    ctx.lineTo(startX + actionFrameW, startY + sectionLabelH);
    ctx.stroke();

    // ACTION 列名と縦線
    const actionChars = getSectionChars('ACTION');
    ctx.font = `${m(2)}px sans-serif`;
    for (let i = 0; i < cols.ACTION; i++) {
        const cx = startX + i * actionColW;
        if (i > 0) {
            ctx.lineWidth = 0.5;
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
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(startX + actionTotalW, startY + sectionLabelH);
    ctx.lineTo(startX + actionTotalW, startY + headerH);
    ctx.stroke();

    // FRAME 列ラベル（空欄または番号記号）
    ctx.fillText('', startX + actionTotalW + frameNumW / 2, startY + sectionLabelH + colLabelH / 2);

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
        ctx.lineWidth = 1.5;
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
        ctx.lineWidth = 1;
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
                ctx.lineWidth = 0.5;
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

// 列数取得
function getActualColCounts() {
    const result = { ACTION: 7, CELL: 7, SOUND: 2, CAMERA: 3 };
    if (typeof sections !== 'undefined') {
        sections.forEach(sec => {
            if (result[sec.type] !== undefined) {
                result[sec.type] = sec.cols;
            }
        });
    }
    return result;
}

// フレーム番号列（ACTIONとSOUNDの間）
function drawFrameNumberColumn(ctx, x, y, w, rowH, startFrame, scale, gridH) {
    const m = (mm) => mm * scale;

    // 左の境界線（細線：ACTIONとの境界）
    ctx.strokeStyle = TEMPLATE.TEMPLATE_COLOR;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + gridH);
    ctx.stroke();

    // 右の境界線（太線：SOUNDとの境界）
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w, y + gridH);
    ctx.stroke();

    // フレーム番号はテンプレートカラー
    ctx.fillStyle = TEMPLATE.TEMPLATE_COLOR;

    for (let i = 0; i < TEMPLATE.FRAMES_PER_COL; i++) {
        const frameNum = startFrame + i + 1;
        const fy = y + i * rowH;

        // 横線（最後の行は外枠で描画済みなのでスキップ）
        if (i < TEMPLATE.FRAMES_PER_COL - 1 || frameNum % 24 !== 0) {
            if (frameNum % 24 === 0) {
                ctx.lineWidth = 2.5;
            } else if (frameNum % 12 === 0) {
                ctx.lineWidth = 1.5;
            } else if (frameNum % 6 === 0) {
                ctx.lineWidth = 1;
            } else {
                ctx.lineWidth = 0.5;
            }
            ctx.strokeStyle = TEMPLATE.TEMPLATE_COLOR;
            ctx.beginPath();
            ctx.moveTo(x, fy + rowH);
            ctx.lineTo(x + w, fy + rowH);
            ctx.stroke();
        }

        // 2コマごとにフレーム番号（右寄せ）
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

// データブロック内部描画（外枠は別途描画済み）
function drawDataBlockInner(ctx, x, y, colW, colCount, rowH, colType, startFrame, pageIndex, scale) {
    const m = (mm) => mm * scale;
    const totalW = colW * colCount;
    const totalH = TEMPLATE.FRAMES_PER_COL * rowH;

    if (colCount === 0) return;

    ctx.strokeStyle = TEMPLATE.TEMPLATE_COLOR;

    // セクション左端の縦線（太め）
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + totalH);
    ctx.stroke();

    // 内部縦線（列区切り）
    for (let c = 1; c < colCount; c++) {
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x + c * colW, y);
        ctx.lineTo(x + c * colW, y + totalH);
        ctx.stroke();
    }

    // 横線（最後の行は外枠で描画済み）
    for (let i = 1; i < TEMPLATE.FRAMES_PER_COL; i++) {
        const frameNum = startFrame + i;
        if (frameNum % 24 === 0) {
            ctx.lineWidth = 2.5;
        } else if (frameNum % 12 === 0) {
            ctx.lineWidth = 1.5;
        } else if (frameNum % 6 === 0) {
            ctx.lineWidth = 1;
        } else {
            ctx.lineWidth = 0.5;
        }
        ctx.beginPath();
        ctx.moveTo(x, y + i * rowH);
        ctx.lineTo(x + totalW, y + i * rowH);
        ctx.stroke();
    }

    // セルデータ
    drawCellDataInBlock(ctx, x, y, colW, colCount, rowH, colType, startFrame, pageIndex, scale);
}

// セルデータ描画（縦書き）
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
            const cy = y + (f - absoluteStart) * rowH;

            drawVerticalText(ctx, data.value, cx, cy + m(0.2), m(1.8), rowH * 0.9);
        }
    }
}

// 縦書きテキスト
function drawVerticalText(ctx, text, x, y, fontSize, maxH) {
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const chars = String(text).split('');
    const charH = fontSize * 1.1;
    const totalH = chars.length * charH;

    let drawScale = 1;
    if (totalH > maxH) {
        drawScale = maxH / totalH;
    }

    let cy = y;
    chars.forEach(ch => {
        ctx.fillText(ch, x, cy);
        cy += charH * drawScale;
    });

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
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
