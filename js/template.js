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

// 線描画用ピクセルスナップヘルパー: 線の中心を整数ピクセルに合わせて鮮明に
function snapLine(coord, lineWidth) {
    // 1px幅の線はピクセル中央(N+0.5)、それ以外は整数に
    if (lineWidth <= 1) return Math.round(coord) + 0.5;
    if (lineWidth % 2 === 1) return Math.round(coord) + 0.5;
    return Math.round(coord);
}

// カテゴリ別フォントサイズの基準値（mm）。設定値との比でスケール
const FONT_BASE_MM = {
    cell: 2.5,
    dialogue: 3.0,
    camera: 2.5,
    metaValue: 4.5
};
function getFontScale(category) {
    if (typeof settings === 'undefined' || !settings.draw || !settings.draw.fontSize) return 1.0;
    const userMm = settings.draw.fontSize[category];
    const baseMm = FONT_BASE_MM[category];
    if (!userMm || !baseMm) return 1.0;
    return userMm / baseMm;
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

    const isPage0 = (typeof hasPage0 === 'function') && hasPage0() && pageIndex === 0;
    const isFirstNormalPage = isPage0 ? false : (pageIndex === 0 || (hasPage0() && pageIndex === 1));

    // 背景
    ctx.fillStyle = TEMPLATE.BG_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ヘッダー
    drawHeader(ctx, scale, pageIndex);

    // Body幅計算（左右マージン内に収める）
    const contentW = m(TEMPLATE.WIDTH_MM - TEMPLATE.MARGIN_LEFT - TEMPLATE.MARGIN_RIGHT);
    const bodyW = (contentW - m(TEMPLATE.BODY_H_MARGIN)) / 2;

    // タイムライン高さ計算
    const timelineH = m(TEMPLATE.FRAMES_PER_COL * TEMPLATE.ROW_HEIGHT + TEMPLATE.COL_HEADER_HEIGHT);
    // 下余白を上余白と同じにする
    const bodyY = m(TEMPLATE.HEIGHT_MM - TEMPLATE.MARGIN_BOTTOM) - timelineH;

    // Direction領域（最初の通常ページのみ）
    const directionY = m(TEMPLATE.MARGIN_TOP + TEMPLATE.HEADER_HEIGHT + 5);
    const directionH = bodyY - directionY - m(5);
    if (isFirstNormalPage) {
        drawDirectionArea(ctx, scale, directionY, directionH, bodyW, pageIndex);
    }

    // 0ページ目（先頭マージンのみ）の場合
    if (isPage0) {
        const body1X = m(TEMPLATE.MARGIN_LEFT);
        drawPage0Timeline(ctx, scale, body1X, bodyY, bodyW, pageIndex);
    } else {
        // 通常ページ
        // Body 1 (左: frame 0-71)
        const body1X = m(TEMPLATE.MARGIN_LEFT);
        drawTimelineColumn(ctx, scale, body1X, bodyY, bodyW, 0, pageIndex);

        // Body 2 (右: frame 72-143)
        const body2X = body1X + bodyW + m(TEMPLATE.BODY_H_MARGIN);
        drawTimelineColumn(ctx, scale, body2X, bodyY, bodyW, 72, pageIndex);

        // BOOK描画（最初の通常ページのみ）
        if (isFirstNormalPage) {
            drawBooksOnTemplate(ctx, scale, bodyY, bodyW);
        }

        // グリッド外下余白の黒塗り（3の倍数秒のとき）
        drawBelowGridOverlay(ctx, scale, bodyY, bodyW, pageIndex);
    }

    return canvas;
}

// グリッド外の下余白を黒塗り
function drawBelowGridOverlay(ctx, scale, bodyY, bodyW, pageIndex) {
    const m = (mm) => mm * scale;
    const lengthSec = parseInt(metaData.lengthSec) || 0;
    const lengthFrame = parseInt(metaData.lengthFrame) || 0;
    const targetFrames = lengthSec * 24 + lengthFrame;

    // 3の倍数秒かつコマ0の場合のみ
    if (lengthSec % 3 !== 0 || lengthFrame !== 0) return;
    if (targetFrames <= 0) return;

    // このページの開始フレーム
    const pageStartFrame = (typeof getPageStartFrame === 'function') ? getPageStartFrame(pageIndex) : pageIndex * 144;

    // タイムライン下端
    const colHeaderH = m(TEMPLATE.COL_HEADER_HEIGHT);
    const gridH = m(TEMPLATE.FRAMES_PER_COL * TEMPLATE.ROW_HEIGHT);
    const gridEndY = bodyY + colHeaderH + gridH;

    // 用紙下端
    const pageBottomY = m(TEMPLATE.HEIGHT_MM - TEMPLATE.MARGIN_BOTTOM);

    // 左右カラムのX位置
    const body1X = m(TEMPLATE.MARGIN_LEFT);
    const body2X = body1X + bodyW + m(TEMPLATE.BODY_H_MARGIN);

    // カット尺がこのページ内で終わる場合
    const cutFrameInPage = targetFrames - pageStartFrame;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';

    // 左カラム（0-71）の下
    if (cutFrameInPage <= 72 && cutFrameInPage > 0) {
        // 左カラムでカット尺が終わる → 左カラムのグリッド下を黒塗り
        ctx.fillRect(body1X, gridEndY, bodyW, pageBottomY - gridEndY);
    }

    // 右カラム（72-143）の下
    if (cutFrameInPage <= 144 && cutFrameInPage > 0) {
        // 右カラムのグリッド下を黒塗り
        ctx.fillRect(body2X, gridEndY, bodyW, pageBottomY - gridEndY);
    }
}

// 0ページ目（先頭マージンのみ）のタイムライン描画
function drawPage0Timeline(ctx, scale, startX, startY, bodyW, pageIndex) {
    const m = (mm) => mm * scale;
    const rowH = m(TEMPLATE.ROW_HEIGHT);
    const colHeaderH = m(TEMPLATE.COL_HEADER_HEIGHT);
    const headMargin = (typeof getHeadMarginForPage === 'function') ? getHeadMarginForPage() : 0;

    if (headMargin <= 0) return;

    // 先頭マージン分のグリッド高さ
    const marginGridH = headMargin * rowH;
    const gridY = startY + colHeaderH;

    // 列数取得
    const cols = getActualColCounts();

    // 列幅計算
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

    // タイムラインヘッダー描画
    drawTimelineHeader(ctx, scale, startX, startY, bodyW, frameNumW, actionColW, soundColW, cellColW, cameraColW, cols, colHeaderH);

    // 先頭マージン分のグリッドのみ描画
    ctx.strokeStyle = TEMPLATE.TEMPLATE_COLOR;
    ctx.lineWidth = TEMPLATE.LINE_THICK;
    ctx.strokeRect(startX, gridY, bodyW, marginGridH);

    // 各セクションの縦線
    let x = startX;
    ctx.lineWidth = TEMPLATE.LINE_MEDIUM;

    // ACTION列
    for (let i = 0; i <= cols.ACTION; i++) {
        const lx = snapLine(x + i * actionColW, ctx.lineWidth);
        ctx.beginPath();
        ctx.moveTo(lx, snapLine(gridY, ctx.lineWidth));
        ctx.lineTo(lx, snapLine(gridY + marginGridH, ctx.lineWidth));
        ctx.stroke();
    }
    x += actionColW * cols.ACTION;

    // フレーム番号列
    ctx.beginPath();
    ctx.moveTo(snapLine(x, ctx.lineWidth), snapLine(gridY, ctx.lineWidth));
    ctx.lineTo(snapLine(x, ctx.lineWidth), snapLine(gridY + marginGridH, ctx.lineWidth));
    ctx.stroke();

    // フレーム番号描画
    ctx.fillStyle = TEMPLATE.TEXT_COLOR;
    ctx.font = `${m(2.5)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let f = 0; f < headMargin; f++) {
        const frameNum = -headMargin + f;
        const fy = gridY + f * rowH + rowH / 2;
        ctx.fillText(String(frameNum), x + frameNumW / 2, fy);
    }
    x += frameNumW;

    // SOUND列
    for (let i = 0; i <= cols.SOUND; i++) {
        const lx = snapLine(x + i * soundColW, ctx.lineWidth);
        ctx.beginPath();
        ctx.moveTo(lx, snapLine(gridY, ctx.lineWidth));
        ctx.lineTo(lx, snapLine(gridY + marginGridH, ctx.lineWidth));
        ctx.stroke();
    }
    x += soundColW * cols.SOUND;

    // CELL列
    for (let i = 0; i <= cols.CELL; i++) {
        const lx = snapLine(x + i * cellColW, ctx.lineWidth);
        ctx.beginPath();
        ctx.moveTo(lx, snapLine(gridY, ctx.lineWidth));
        ctx.lineTo(lx, snapLine(gridY + marginGridH, ctx.lineWidth));
        ctx.stroke();
    }
    x += cellColW * cols.CELL;

    // CAMERA列
    for (let i = 0; i <= cols.CAMERA; i++) {
        const lx = snapLine(x + i * cameraColW, ctx.lineWidth);
        ctx.beginPath();
        ctx.moveTo(lx, snapLine(gridY, ctx.lineWidth));
        ctx.lineTo(lx, snapLine(gridY + marginGridH, ctx.lineWidth));
        ctx.stroke();
    }

    // 横線（各フレーム）
    ctx.lineWidth = TEMPLATE.LINE_FINE;
    for (let f = 1; f < headMargin; f++) {
        const fy = snapLine(gridY + f * rowH, ctx.lineWidth);
        ctx.beginPath();
        ctx.moveTo(snapLine(startX, ctx.lineWidth), fy);
        ctx.lineTo(snapLine(startX + bodyW, ctx.lineWidth), fy);
        ctx.stroke();
    }
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
function drawHeader(ctx, scale, pageIndex = 0) {
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
    const baseValueSize = m(4.5) * getFontScale('metaValue');

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
            ctx.fillText(sec, cx + fw / 2 - m(3.5), y + h - m(1));

            ctx.textAlign = 'left';
            ctx.fillText(fr, cx + fw / 2 + m(3.5), y + h - m(1));
        } else if (f.key === 'sheet') {
            const val = (typeof getSheetLabel === 'function') ? getSheetLabel(pageIndex) : '1/1';
            const valueSize = fitTextSize(ctx, val, fw - m(2), h - m(3), baseValueSize);
            ctx.font = `bold ${valueSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(val, cx + fw / 2, y + h - m(1));
        } else if (f.key === 'cut' && Array.isArray(metaData.sharedCuts) && metaData.sharedCuts.length > 1) {
            const cuts = metaData.sharedCuts;
            const currentCut = String(metaData.cut || '');
            const valueSize = fitTextSize(ctx, currentCut, fw - m(7), h - m(3), baseValueSize);
            ctx.font = `bold ${valueSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            ctx.fillText(currentCut, cx + fw / 2 - m(2), y + h - m(1));

            const otherCuts = cuts.filter(cut => String(cut) !== currentCut);
            const lineH = m(3.8);
            const totalH = lineH * otherCuts.length;
            let lineY = y + m(4.2) + lineH * 0.78;
            ctx.textAlign = 'center';
            const listX = cx + fw - m(4);
            if (otherCuts.length) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
                ctx.fillRect(listX - m(6), y + m(3.2), m(12), Math.max(h - m(3.2), totalH + m(2)));
            }
            otherCuts.forEach(cut => {
                const fontSize = m(3.3);
                ctx.font = `bold ${fontSize}px sans-serif`;
                ctx.fillStyle = 'rgba(80, 80, 80, 0.58)';
                ctx.fillText(cut, listX, lineY);
                lineY += lineH;
            });
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

// Direction領域描画（BOOK回避対応）
function drawDirectionArea(ctx, scale, startY, areaH, bodyW, pageIndex) {
    const m = (mm) => mm * scale;
    const baseX = m(TEMPLATE.MARGIN_LEFT);

    // Directionラベル
    ctx.fillStyle = TEMPLATE.TEMPLATE_COLOR;
    ctx.font = `${m(2.2)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Direction', baseX, startY);

    if (typeof metaData === 'undefined' || !metaData.memo) {
        drawShootingProcessFrames(ctx, scale, startY, areaH);
        return;
    }

    // BOOKの最上位Y位置を計算
    let bookTopY = areaH + startY; // デフォルト: Direction領域の下端
    if (typeof booksData !== 'undefined' && booksData['ACTION']) {
        const cols = getActualColCounts();
        const frameNumW = m(5);
        const availW = bodyW - frameNumW;
        const actionRatio = 0.8;
        const soundRatio = 1.5;
        const totalParts = cols.ACTION + cols.SOUND * soundRatio + cols.CELL + cols.CAMERA;
        const unitW = availW / totalParts;
        const actionColW = unitW * actionRatio;

        const bookBoxH = m(4.5);
        const bookRowH = m(6);
        const timelineH = m(TEMPLATE.FRAMES_PER_COL * TEMPLATE.ROW_HEIGHT + TEMPLATE.COL_HEADER_HEIGHT);
        const timelineY = m(TEMPLATE.HEIGHT_MM - TEMPLATE.MARGIN_BOTTOM) - timelineH;
        const baseBookY = timelineY - m(2);

        // 全BOOKの最大行数を計算
        let maxRow = 0;
        const allBooks = [];
        for (const lineIdx in booksData['ACTION']) {
            const books = booksData['ACTION'][lineIdx];
            const colIndex = parseInt(lineIdx);
            books.forEach((bookName, bookIdx) => {
                const colX = baseX + colIndex * actionColW;
                allBooks.push({ text: bookName, colIndex, x: colX, seq: bookIdx });
            });
        }
        // 文字幅で boxW を算出
        ctx.font = `bold ${m(2.2)}px sans-serif`;
        const bookBoxWMin = m(11);
        allBooks.forEach(book => {
            const tw = ctx.measureText(book.text || '').width;
            book.boxW = Math.max(bookBoxWMin, tw + m(3));
        });
        allBooks.sort((a, b) => a.x !== b.x ? a.x - b.x : a.seq - b.seq);
        allBooks.forEach(book => {
            let rowIndex = book.seq;
            while (true) {
                let conflict = false;
                for (const placed of allBooks) {
                    if (placed === book) break;
                    if (placed.row === rowIndex) {
                        const bL = book.x + m(3);
                        const bR = bL + book.boxW;
                        const pL = placed.x + m(3);
                        const pR = pL + placed.boxW;
                        if (!(bR + m(2) < pL || bL > pR + m(2))) {
                            conflict = true;
                            break;
                        }
                    }
                }
                if (!conflict) { book.row = rowIndex; break; }
                rowIndex++;
            }
            if (book.row > maxRow) maxRow = book.row;
        });

        // BOOKの最上位Y
        bookTopY = baseBookY - bookBoxH - maxRow * bookRowH - m(2);
    }

    // Direction描画設定
    const fontSize = m(3);
    const lineH = m(4);
    const textStartY = startY + m(5);
    const totalWidth = m(TEMPLATE.WIDTH_MM - TEMPLATE.MARGIN_LEFT - TEMPLATE.MARGIN_RIGHT);
    const colGap = m(2);    // 列間の余白

    // まず3列で計算、足りなければ4列、5列...と増やす
    const lines = metaData.memo.split(/\r\n|\n|\r/);

    // 必要な列数を計算する関数
    const calcRequiredColumns = (numCols) => {
        const colWidth = (totalWidth - colGap * (numCols - 1)) / numCols;
        ctx.font = `${fontSize}px sans-serif`;

        // テキストを行に分割
        const textLines = [];
        lines.forEach(line => {
            if (line.length === 0) {
                textLines.push('');
                return;
            }
            let currentLine = '';
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                const testLine = currentLine + char;
                const testW = ctx.measureText(testLine).width;
                if (testW > colWidth - m(1) && currentLine.length > 0) {
                    textLines.push(currentLine);
                    currentLine = char;
                } else {
                    currentLine = testLine;
                }
            }
            if (currentLine) textLines.push(currentLine);
        });

        // 必要な列数を計算
        const maxLinesPerCol = Math.floor((bookTopY - textStartY) / lineH);
        const requiredCols = Math.ceil(textLines.length / maxLinesPerCol);
        return { textLines, colWidth, requiredCols, maxLinesPerCol };
    };

    // 3列から始めて必要に応じて増やす
    let numCols = 3;
    let result = calcRequiredColumns(numCols);
    while (result.requiredCols > numCols && numCols < 6) {
        numCols++;
        result = calcRequiredColumns(numCols);
    }

    const { textLines, colWidth, maxLinesPerCol } = result;

    // 列情報を生成
    const columns = [];
    for (let c = 0; c < numCols; c++) {
        columns.push({
            x: baseX + c * (colWidth + colGap),
            width: colWidth,
            startY: textStartY,
            endY: bookTopY
        });
    }

    // テキストを描画
    ctx.fillStyle = TEMPLATE.TEXT_COLOR;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = 'top';

    let colIndex = 0;
    let lineInCol = 0;

    for (let i = 0; i < textLines.length; i++) {
        const textLine = textLines[i];
        const ty = columns[colIndex].startY + lineInCol * lineH;

        // テキスト描画
        if (textLine) {
            ctx.fillText(textLine, columns[colIndex].x, ty);
        }

        lineInCol++;

        // 次の列へ移動判定
        if (lineInCol >= maxLinesPerCol && colIndex < numCols - 1) {
            colIndex++;
            lineInCol = 0;
        }
    }

    // 使用した列間に区切り線を描画
    ctx.strokeStyle = TEMPLATE.TEMPLATE_COLOR;
    ctx.lineWidth = TEMPLATE.LINE_FINE;
    const usedCols = Math.min(colIndex + 1, numCols);
    for (let c = 0; c < usedCols - 1; c++) {
        const divX = columns[c].x + colWidth + colGap / 2;
        ctx.beginPath();
        ctx.moveTo(divX, textStartY);
        ctx.lineTo(divX, bookTopY);
        ctx.stroke();
    }

    drawShootingProcessFrames(ctx, scale, startY, areaH);
}

function drawShootingProcessFrames(ctx, scale, startY, areaH) {
    const m = (mm) => mm * scale;
    const baseX = m(TEMPLATE.MARGIN_LEFT);
    const totalWidth = m(TEMPLATE.WIDTH_MM - TEMPLATE.MARGIN_LEFT - TEMPLATE.MARGIN_RIGHT);

    // 撮影処理画面枠（右端に16:9の枠を2つ、Direction縦の7割を使用）
    const screenLabel = '撮影処理画面';
    const screenAreaH = areaH * 0.7;  // Direction縦の7割
    const screenGap = m(6);    // 2つの枠間隔
    const screenBoxH = (screenAreaH - screenGap) / 2;  // 2枠分
    const screenBoxW = screenBoxH * 16 / 9;  // 16:9比率
    const screenX = baseX + totalWidth - screenBoxW;  // 右端に配置
    const screenY1 = startY;
    const screenY2 = screenY1 + screenBoxH + screenGap;

    // ラベル
    ctx.fillStyle = TEMPLATE.TEMPLATE_COLOR;
    ctx.font = `${m(2)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(screenLabel, screenX, screenY1 - m(3));

    // 枠1
    ctx.strokeStyle = TEMPLATE.TEMPLATE_COLOR;
    ctx.lineWidth = TEMPLATE.LINE_THIN;
    ctx.strokeRect(screenX, screenY1, screenBoxW, screenBoxH);

    // 枠2
    ctx.strokeRect(screenX, screenY2, screenBoxW, screenBoxH);
}

// BOOK描画（テンプレートの上に描画）
function drawBooksOnTemplate(ctx, scale, bodyY, bodyW) {
    const m = (mm) => mm * scale;
    if (typeof booksData === 'undefined') return;

    const cols = getActualColCounts();
    const frameNumW = m(5);
    const availW = bodyW - frameNumW;

    // 列幅計算
    const actionRatio = 0.8;
    const soundRatio = 1.5;
    const totalParts = cols.ACTION + cols.SOUND * soundRatio + cols.CELL + cols.CAMERA;
    const unitW = availW / totalParts;
    const actionColW = unitW * actionRatio;

    const baseX = m(TEMPLATE.MARGIN_LEFT);
    const bookBoxW = m(11);
    const bookBoxH = m(4.5);
    const bookRowH = m(6);

    // タイムライン位置計算
    const timelineH = m(TEMPLATE.FRAMES_PER_COL * TEMPLATE.ROW_HEIGHT + TEMPLATE.COL_HEADER_HEIGHT);
    const timelineY = m(TEMPLATE.HEIGHT_MM - TEMPLATE.MARGIN_BOTTOM) - timelineH;
    const colHeaderH = m(TEMPLATE.COL_HEADER_HEIGHT);
    const gridY = timelineY + colHeaderH;  // グリッド開始位置（カラム名の下の罫線）

    // edit準拠: 全BOOKを収集
    const allBooks = [];
    if (booksData['ACTION']) {
        for (const lineIdx in booksData['ACTION']) {
            const books = booksData['ACTION'][lineIdx];
            const colIndex = parseInt(lineIdx);
            books.forEach((bookName, bookIdx) => {
                const colX = baseX + colIndex * actionColW;
                allBooks.push({
                    text: bookName,
                    colIndex: colIndex,
                    x: colX,
                    seq: bookIdx
                });
            });
        }
    }

    // 文字数に応じて幅を自動算出
    ctx.font = `bold ${m(2.2)}px sans-serif`;
    allBooks.forEach(book => {
        const tw = ctx.measureText(book.text || '').width;
        book.boxW = Math.max(bookBoxW, tw + m(3));
    });

    // X座標でソート
    allBooks.sort((a, b) => a.x !== b.x ? a.x - b.x : a.seq - b.seq);

    // 重なり回避: 行番号を割り当て
    allBooks.forEach(book => {
        let rowIndex = book.seq;
        while (true) {
            let conflict = false;
            for (const placed of allBooks) {
                if (placed === book) break;
                if (placed.row === rowIndex) {
                    const bL = book.x + m(3);
                    const bR = bL + book.boxW;
                    const pL = placed.x + m(3);
                    const pR = pL + placed.boxW;
                    if (!(bR + m(2) < pL || bL > pR + m(2))) {
                        conflict = true;
                        break;
                    }
                }
            }
            if (!conflict) {
                book.row = rowIndex;
                break;
            }
            rowIndex++;
        }
    });

    // 基準Y位置（ACTIONヘッダーの上）
    const baseBookY = timelineY - m(2);

    // まずラインを描画
    allBooks.forEach(book => {
        const colX = book.x;
        const boxX = colX + m(3);
        const boxY = baseBookY - bookBoxH - book.row * bookRowH;

        // ブランチライン（黒、少し細め）
        ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
        ctx.lineWidth = TEMPLATE.LINE_MEDIUM;
        ctx.beginPath();
        ctx.moveTo(boxX, boxY + bookBoxH / 2);
        ctx.lineTo(colX, boxY + bookBoxH / 2);
        ctx.lineTo(colX, gridY);  // カラム名下の罫線まで（0frと1frの間）
        ctx.stroke();
    });

    // 次にボックスを描画（ラインの上に）
    allBooks.forEach(book => {
        const colX = book.x;
        const boxX = colX + m(3);
        const boxY = baseBookY - bookBoxH - book.row * bookRowH;
        const bw = book.boxW;

        // BOOKボックス（黒枠）
        ctx.fillStyle = TEMPLATE.BG_COLOR;
        ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
        ctx.lineWidth = TEMPLATE.LINE_THICK;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, bw, bookBoxH, m(1));
        ctx.fill();
        ctx.stroke();

        // BOOKテキスト（黒）
        ctx.fillStyle = TEMPLATE.TEXT_COLOR;
        ctx.font = `bold ${m(2.2)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(book.text, boxX + bw / 2, boxY + bookBoxH / 2);
    });

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
    // ページ開始フレーム計算（headMargin対応）
    const pageStartFrame = (typeof getPageStartFrame === 'function') ? getPageStartFrame(pageIndex) : pageIndex * TEMPLATE.FRAMES_PER_PAGE;
    const absoluteStart = startFrame + pageStartFrame;

    // ACTION
    drawDataBlockInner(ctx, x, gridY, actionColW, cols.ACTION, rowH, 'ACTION', startFrame, pageIndex, scale);
    drawBarLines(ctx, x, gridY, actionColW, cols.ACTION, rowH, 'ACTION', absoluteStart, scale);
    drawMotionInstructionMarksTemplate(ctx, x, gridY, actionColW, cols.ACTION, rowH, 'ACTION', absoluteStart, scale);
    drawRepeatMarksTemplate(ctx, x, gridY, actionColW, cols.ACTION, rowH, absoluteStart, scale);
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
    drawMotionInstructionMarksTemplate(ctx, x, gridY, cellColW, cols.CELL, rowH, 'CELL', absoluteStart, scale);
    x += cellColW * cols.CELL;

    // CAMERA
    drawDataBlockInner(ctx, x, gridY, cameraColW, cols.CAMERA, rowH, 'CAMERA', startFrame, pageIndex, scale);
    drawCameraBlocksTemplate(ctx, x, gridY, cameraColW, cols.CAMERA, rowH, absoluteStart, scale);

    // カット尺ライン・黒塗り
    drawCutLengthOverlay(ctx, startX, gridY, bodyW, rowH, absoluteStart, scale);
}

// カット尺ライン・カット尺以降の黒塗り
function drawCutLengthOverlay(ctx, x, y, w, rowH, absoluteStart, scale) {
    const m = (mm) => mm * scale;

    // カット尺計算
    const lengthSec = parseInt(metaData.lengthSec) || 0;
    const lengthFrame = parseInt(metaData.lengthFrame) || 0;
    const targetFrames = lengthSec * 24 + lengthFrame;
    if (targetFrames <= 0) return;

    // このカラムでのカット尺位置
    const cutFrameInCol = targetFrames - absoluteStart;
    const gridEndY = y + TEMPLATE.FRAMES_PER_COL * rowH;

    // このカラムにカット尺ラインがある場合
    if (cutFrameInCol > 0 && cutFrameInCol <= TEMPLATE.FRAMES_PER_COL) {
        const cutY = y + cutFrameInCol * rowH;

        // カット尺以降を黒塗り（半透明）
        if (cutY < gridEndY) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(x, cutY, w, gridEndY - cutY);
        }

        // カット尺ライン（太め）
        ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
        ctx.lineWidth = TEMPLATE.LINE_THICK + 1;
        ctx.beginPath();
        ctx.moveTo(x, cutY);
        ctx.lineTo(x + w, cutY);
        ctx.stroke();
    }

    // このカラムがカット尺より後（全体が空白）の場合、全体を黒塗り
    if (cutFrameInCol <= 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(x, y, w, gridEndY - y);
    }
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
    ctx.moveTo(snapLine(startX, ctx.lineWidth), snapLine(startY + sectionLabelH, ctx.lineWidth));
    ctx.lineTo(snapLine(startX + actionFrameW, ctx.lineWidth), snapLine(startY + sectionLabelH, ctx.lineWidth));
    ctx.stroke();

    // ACTION 列名
    const actionChars = getSectionChars('ACTION');
    ctx.font = `${m(2)}px sans-serif`;
    for (let i = 0; i < cols.ACTION; i++) {
        const cx = startX + i * actionColW;
        if (i > 0) {
            ctx.lineWidth = TEMPLATE.LINE_FINE;
            ctx.beginPath();
            ctx.moveTo(snapLine(cx, ctx.lineWidth), snapLine(startY + sectionLabelH, ctx.lineWidth));
            ctx.lineTo(snapLine(cx, ctx.lineWidth), snapLine(startY + headerH, ctx.lineWidth));
            ctx.stroke();
        }
        ctx.fillStyle = TEMPLATE.TEMPLATE_COLOR;
        ctx.textAlign = 'center';
        ctx.fillText(actionChars[i] || '', cx + actionColW / 2, startY + sectionLabelH + colLabelH / 2);
    }

    // ACTION と FRAME の間の細線
    ctx.lineWidth = TEMPLATE.LINE_FINE;
    ctx.beginPath();
    ctx.moveTo(snapLine(startX + actionTotalW, ctx.lineWidth), snapLine(startY + sectionLabelH, ctx.lineWidth));
    ctx.lineTo(snapLine(startX + actionTotalW, ctx.lineWidth), snapLine(startY + headerH, ctx.lineWidth));
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
        ctx.moveTo(snapLine(x, ctx.lineWidth), snapLine(startY, ctx.lineWidth));
        ctx.lineTo(snapLine(x, ctx.lineWidth), snapLine(startY + headerH, ctx.lineWidth));
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
        ctx.moveTo(snapLine(x, ctx.lineWidth), snapLine(startY + sectionLabelH, ctx.lineWidth));
        ctx.lineTo(snapLine(x + totalW, ctx.lineWidth), snapLine(startY + sectionLabelH, ctx.lineWidth));
        ctx.stroke();

        // 列名と縦線
        const chars = getSectionChars(sec.type);
        ctx.font = `${m(2)}px sans-serif`;
        for (let i = 0; i < sec.count; i++) {
            const cx = x + i * sec.colW;
            if (i > 0) {
                ctx.lineWidth = TEMPLATE.LINE_FINE;
                ctx.beginPath();
                ctx.moveTo(snapLine(cx, ctx.lineWidth), snapLine(startY + sectionLabelH, ctx.lineWidth));
                ctx.lineTo(snapLine(cx, ctx.lineWidth), snapLine(startY + headerH, ctx.lineWidth));
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
    const defaults = { ACTION: 7, CELL: 7, SOUND: 2, CAMERA: 3 };
    const result = { ...defaults };
    if (typeof sections !== 'undefined') {
        sections.forEach(sec => {
            if (sec.type === 'CAMERA') return;
            if (result[sec.type] !== undefined) {
                // デフォルト値より大きい場合のみ上書き
                result[sec.type] = Math.max(defaults[sec.type], sec.cols);
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
    ctx.moveTo(snapLine(x, ctx.lineWidth), snapLine(y, ctx.lineWidth));
    ctx.lineTo(snapLine(x, ctx.lineWidth), snapLine(y + gridH, ctx.lineWidth));
    ctx.stroke();

    // 右の境界線
    ctx.lineWidth = TEMPLATE.LINE_MEDIUM;
    ctx.beginPath();
    ctx.moveTo(snapLine(x + w, ctx.lineWidth), snapLine(y, ctx.lineWidth));
    ctx.lineTo(snapLine(x + w, ctx.lineWidth), snapLine(y + gridH, ctx.lineWidth));
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
            ctx.moveTo(snapLine(x, ctx.lineWidth), snapLine(fy + rowH, ctx.lineWidth));
            ctx.lineTo(snapLine(x + w, ctx.lineWidth), snapLine(fy + rowH, ctx.lineWidth));
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
    ctx.moveTo(snapLine(x, ctx.lineWidth), snapLine(y, ctx.lineWidth));
    ctx.lineTo(snapLine(x, ctx.lineWidth), snapLine(y + totalH, ctx.lineWidth));
    ctx.stroke();

    // 内部縦線
    for (let c = 1; c < colCount; c++) {
        ctx.lineWidth = TEMPLATE.LINE_FINE;
        ctx.beginPath();
        ctx.moveTo(snapLine(x + c * colW, ctx.lineWidth), snapLine(y, ctx.lineWidth));
        ctx.lineTo(snapLine(x + c * colW, ctx.lineWidth), snapLine(y + totalH, ctx.lineWidth));
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
        ctx.lineWidth = Math.max(0.75, ctx.lineWidth);
        ctx.beginPath();
        ctx.moveTo(snapLine(x, ctx.lineWidth), snapLine(y + i * rowH, ctx.lineWidth));
        ctx.lineTo(snapLine(x + totalW, ctx.lineWidth), snapLine(y + i * rowH, ctx.lineWidth));
        ctx.stroke();
    }

    // セルデータ（SOUND/CAMERAは専用描画関数があるためスキップ）
    if (colType !== 'SOUND' && colType !== 'CAMERA') {
        drawCellDataInBlock(ctx, x, y, colW, colCount, rowH, colType, startFrame, pageIndex, scale);
    }
}

// セルデータ描画（中央配置）
function drawCellDataInBlock(ctx, x, y, colW, colCount, rowH, colType, startFrame, pageIndex, scale) {
    const m = (mm) => mm * scale;
    if (typeof cellData === 'undefined') return;

    ctx.fillStyle = TEMPLATE.TEXT_COLOR;
    const pageStartFrame = (typeof getPageStartFrame === 'function') ? getPageStartFrame(pageIndex) : pageIndex * TEMPLATE.FRAMES_PER_PAGE;
    const absoluteStart = startFrame + pageStartFrame;
    const endFrame = absoluteStart + TEMPLATE.FRAMES_PER_COL;

    // 内部記号をスキップ
    const internalSymbols = ['SYMBOL_HYPHEN', 'SYMBOL_TICK', 'SYMBOL_NULL', 'SYMBOL_STOP', 'SYMBOL_START'];

    const drawCellEntry = (ci, f, data, alpha = 1, useOwnOption = false) => {
        if (!data || !data.value) return;
        if (internalSymbols.includes(data.value)) return;

        const cx = x + ci * colW + colW / 2;
        const cy = y + (f - absoluteStart) * rowH + rowH / 2;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = TEMPLATE.TEXT_COLOR;
        const fontSize = ((colType === 'ACTION' || colType === 'CELL') ? m(2.5) : m(2)) * getFontScale('cell');
        if (data.value === '●') {
            const dotRadius = Math.max(m(0.35), rowH * (2.5 / 18));
            ctx.beginPath();
            ctx.arc(cx, cy, dotRadius, 0, Math.PI * 2);
            ctx.fill();
        } else {
            drawTimelineCellText(ctx, data.value, cx, cy, colW, rowH, fontSize);
        }

        let dispOpt = data.option;
        if (colType === 'CELL' && !useOwnOption) {
            const actKey = `ACTION-${ci}-${f}`;
            if (cellData[actKey]?.option) dispOpt = cellData[actKey].option;
        }

        if (dispOpt && data.value !== '' && !['●', '○', '×', '―'].includes(data.value)) {
            ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
            ctx.lineWidth = TEMPLATE.LINE_FINE;
            const radius = m(2.5);

            if (dispOpt === 'OPTION_KEYFRAME') {
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.stroke();
            } else if (dispOpt === 'OPTION_REFERENCEFRAME') {
                ctx.beginPath();
                ctx.moveTo(cx, cy - radius * 1.2);
                ctx.lineTo(cx + radius, cy + radius * 0.6);
                ctx.lineTo(cx - radius, cy + radius * 0.6);
                ctx.closePath();
                ctx.stroke();
            }
        }
        ctx.restore();
    };

    // autoRepeats のスキップ範囲を事前収集（ACTION列のみ）
    // checkRepeatColumns でカラムごとに自動rep範囲を計算
    const autoRepSkipSet = new Set();
    if (colType === 'ACTION' && typeof checkRepeatColumns === 'function') {
        const targetF = (parseInt(metaData.lengthSec) || 0) * 24 + (parseInt(metaData.lengthFrame) || 0);
        const totalF = Math.max(targetF, endFrame);
        if (totalF > 0) {
            for (let ci = 0; ci < colCount; ci++) {
                const colData = [];
                for (let f = 0; f < totalF; f++) colData[f] = cellData[`ACTION-${ci}-${f}`] || null;
                const reps = checkRepeatColumns(colData, totalF, ci);
                reps.forEach(r => {
                    if (r.isHold) return;
                    for (let f = r.startF + r.chunkLen; f < r.endF; f++) {
                        autoRepSkipSet.add(`${ci}-${f}`);
                    }
                });
            }
        }
    }
    // customRepeats のスキップ範囲を事前収集（ACTION列のみ）
    const customRepSkipSet = new Set();
    if (colType === 'ACTION' && typeof customRepeats !== 'undefined' && Array.isArray(customRepeats)) {
        customRepeats.forEach(rep => {
            if (rep.colType !== 'ACTION') return;
            for (let f = rep.startF; f <= rep.endF; f++) {
                customRepSkipSet.add(`${rep.colIndex}-${f}`);
            }
        });
    }

    for (let ci = 0; ci < colCount; ci++) {
        for (let f = absoluteStart; f < endFrame; f++) {
            if (autoRepSkipSet.has(`${ci}-${f}`)) continue;
            if (customRepSkipSet.has(`${ci}-${f}`)) continue;
            const key = `${colType}-${ci}-${f}`;
            const data = cellData[key];
            drawCellEntry(ci, f, data);
        }
    }

    if (typeof customRepeats !== 'undefined' && Array.isArray(customRepeats) && colType === 'CELL') {
        customRepeats.forEach(rep => {
            if (rep.colType !== colType) return;
            if (rep.colIndex < 0 || rep.colIndex >= colCount) return;
            if (!Array.isArray(rep.pattern) || rep.pattern.length === 0) return;
            if (rep.endF < absoluteStart || rep.startF >= endFrame) return;

            const startF = Math.max(rep.startF, absoluteStart);
            const endF = Math.min(rep.endF, endFrame - 1);
            for (let f = startF; f <= endF; f++) {
                const key = `${colType}-${rep.colIndex}-${f}`;
                if (cellData[key]?.value) continue;
                const pData = getTemplateCustomRepeatData(rep, f, colType, rep.colIndex);
                drawCellEntry(rep.colIndex, f, pData, 1, true);
            }
        });
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

function drawTimelineCellText(ctx, text, x, y, colW, rowH, fontSize) {
    const value = String(text);
    if (value.length <= 1) {
        drawVerticalTextCentered(ctx, value, x, y, fontSize, rowH * 0.9);
        return;
    }

    ctx.save();
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let drawSize = fontSize;
    const maxW = colW * 0.88;
    const minSize = Math.max(6, fontSize * 0.55);
    while (ctx.measureText(value).width > maxW && drawSize > minSize) {
        drawSize -= 0.5;
        ctx.font = `bold ${drawSize}px sans-serif`;
    }
    ctx.fillText(value, x, y);
    ctx.restore();
}

// 棒線・波線描画
function getTemplateCustomRepeatAt(colType, colIndex, frame) {
    if (typeof customRepeats === 'undefined' || !Array.isArray(customRepeats)) return null;
    return customRepeats.find(rep =>
        rep.colType === colType &&
        rep.colIndex === colIndex &&
        frame >= rep.startF &&
        frame <= rep.endF
    ) || null;
}

function getTemplateCustomRepeatData(rep, frame, colType, colIndex) {
    const data = (typeof getRepeatPatternData === 'function') ? getRepeatPatternData(rep, frame) : null;
    if (!data) return null;
    if (colType === 'CELL' && !data.option && typeof cellData !== 'undefined') {
        const patternIndex = (frame - rep.startF) % rep.pattern.length;
        const sourceFrame = rep.startF - rep.pattern.length + patternIndex;
        const inheritedOption = cellData[`ACTION-${colIndex}-${sourceFrame}`]?.option;
        if (inheritedOption) return { ...data, option: inheritedOption };
    }
    return data;
}

function drawRepeatTextWithBg(ctx, text, x, y, font, scale) {
    const m = (mm) => mm * scale;
    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const metrics = ctx.measureText(String(text));
    const h = m(3.4);
    ctx.fillStyle = TEMPLATE.BG_COLOR;
    ctx.fillRect(x - metrics.width / 2 - m(0.8), y - h / 2, metrics.width + m(1.6), h);
    ctx.fillStyle = TEMPLATE.TEXT_COLOR;
    ctx.fillText(text, x, y);
    ctx.restore();
}

function drawTemplateOptionMark(ctx, x, y, data, scale) {
    if (!data || !data.option || !data.value) return;
    if (['●', '○', '×', '―'].includes(data.value)) return;
    const m = (mm) => mm * scale;
    const radius = m(2.5);
    ctx.save();
    ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
    ctx.lineWidth = TEMPLATE.LINE_FINE;
    if (data.option === 'OPTION_KEYFRAME') {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
    } else if (data.option === 'OPTION_REFERENCEFRAME') {
        ctx.beginPath();
        ctx.moveTo(x, y - radius * 1.2);
        ctx.lineTo(x + radius, y + radius * 0.6);
        ctx.lineTo(x - radius, y + radius * 0.6);
        ctx.closePath();
        ctx.stroke();
    }
    ctx.restore();
}

function drawMotionInstructionMarksTemplate(ctx, x, y, colW, colCount, rowH, colType, absoluteStart, scale) {
    if (typeof getMotionInstruction !== 'function') return;
    const m = (mm) => mm * scale;
    const endFrame = absoluteStart + TEMPLATE.FRAMES_PER_COL;
    const targetFrames = (parseInt(metaData.lengthSec) || 0) * 24 + (parseInt(metaData.lengthFrame) || 0);
    for (let ci = 0; ci < colCount; ci++) {
        const tx = x + ci * colW + colW / 2;
        for (let f = absoluteStart; f < endFrame && f < targetFrames; f++) {
            const data = cellData[`${colType}-${ci}-${f}`];
            const mark = getMotionInstruction(data?.value);
            if (!mark) continue;
            let endF = targetFrames - 1;
            for (let nf = f + 1; nf < targetFrames; nf++) {
                const next = cellData[`${colType}-${ci}-${nf}`];
                if (next && String(next.value || '').trim() && !['―', '×'].includes(String(next.value).trim())) {
                    endF = nf - 1;
                    break;
                }
            }
            const labelY = y + (f - absoluteStart) * rowH + rowH / 2;
            const labelBox = drawVerticalRepeatTextWithBg(ctx, mark.label, tx, labelY + rowH * 0.2, `bold ${m(1.7)}px sans-serif`, scale);
            const lineStartF = Math.max(f + 1, absoluteStart);
            const lineEndF = Math.min(endF, endFrame - 1, targetFrames - 1);
            if (lineEndF >= lineStartF) {
                const top = Math.max(y + (lineStartF - absoluteStart) * rowH, labelBox.bottom + m(0.4));
                const bottom = y + (lineEndF - absoluteStart + 1) * rowH;
                ctx.strokeStyle = mark.random
                    ? 'rgba(180, 90, 220, 0.85)'
                    : ((typeof settings !== 'undefined' && settings.draw.repeatDashColor) || 'rgba(66, 133, 244, 0.8)');
                ctx.lineWidth = TEMPLATE.LINE_THIN;
                ctx.setLineDash(mark.random ? [m(0.8), m(1.2)] : []);
                ctx.beginPath();
                const amp = mark.random ? m(1.1) : m(0.8);
                const step = rowH / 2;
                ctx.moveTo(tx, top);
                for (let yy = top; yy <= bottom; yy += step) {
                    const phase = (yy - top) / step;
                    ctx.lineTo(tx + Math.sin(phase * Math.PI) * amp, yy);
                }
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }
}

function drawVerticalRepeatTextWithBg(ctx, text, x, y, font, scale, options = {}) {
    const m = (mm) => mm * scale;
    const chars = String(text || '').split('');
    const lineH = m(2.6);
    const bgW = m(4.0);
    const bgH = chars.length * lineH + m(1.2);
    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TEMPLATE.BG_COLOR;
    const top = options.direction === 'down' ? y - m(0.2) : y - bgH / 2;
    ctx.fillRect(x - bgW / 2, top, bgW, bgH);
    ctx.fillStyle = TEMPLATE.TEXT_COLOR;
    const startY = options.direction === 'down'
        ? top + m(0.75)
        : y - (chars.length - 1) * lineH / 2;
    chars.forEach((c, i) => ctx.fillText(c, x, startY + i * lineH));
    ctx.restore();
    return { top, bottom: top + bgH };
}

function drawBarLines(ctx, x, y, colW, colCount, rowH, colType, absoluteStart, scale) {
    const m = (mm) => mm * scale;
    if (typeof cellData === 'undefined') return;

    // カット尺まで
    const targetFrames = (parseInt(metaData.lengthSec) || 0) * 24 + (parseInt(metaData.lengthFrame) || 0);
    const maxFrame = targetFrames > 0 ? Math.min(absoluteStart + TEMPLATE.FRAMES_PER_COL, targetFrames) : absoluteStart + TEMPLATE.FRAMES_PER_COL;
    const endFrame = maxFrame;
    const lineGap = parseInt(settings?.draw?.lineGap || '3', 10) || 3;

    const getVal = (ci, f) => {
        const key = `${colType}-${ci}-${f}`;
        const d = cellData[key];
        if (d && d.value) return d.value;
        if (colType === 'CELL') {
            const rep = getTemplateCustomRepeatAt(colType, ci, f);
            const repData = getTemplateCustomRepeatData(rep, f);
            return repData?.value || '';
        }
        return '';
    };

    const isLinePiercing = (v) => v === '' || v === '―';

    ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
    ctx.lineWidth = TEMPLATE.LINE_THIN;

    // 自動Repのスキップ範囲を事前収集（ACTION列のみ）
    const autoRepSkipSet = new Set();
    if (colType === 'ACTION' && typeof checkRepeatColumns === 'function') {
        const totalF = (parseInt(metaData.lengthSec) || 0) * 24 + (parseInt(metaData.lengthFrame) || 0);
        if (totalF > 0) {
            for (let ci = 0; ci < colCount; ci++) {
                const colDataArr = [];
                for (let f = 0; f < totalF; f++) colDataArr[f] = cellData[`ACTION-${ci}-${f}`] || null;
                const reps = checkRepeatColumns(colDataArr, totalF, ci);
                reps.forEach(r => {
                    if (r.isHold) return;
                    for (let f = r.startF + r.chunkLen; f < r.endF; f++) {
                        autoRepSkipSet.add(`${ci}-${f}`);
                    }
                });
            }
        }
    }

    for (let ci = 0; ci < colCount; ci++) {
        const tx = x + ci * colW + colW / 2;

        for (let f = absoluteStart; f < endFrame; f++) {
            if (autoRepSkipSet.has(`${ci}-${f}`)) continue;
            if (colType === 'ACTION' && typeof customRepeats !== 'undefined' && Array.isArray(customRepeats)) {
                const inActionRep = customRepeats.some(rep => {
                    const patternLen = Array.isArray(rep.pattern) ? rep.pattern.length : 0;
                    const sourceStart = rep.startF - patternLen;
                    return rep.colType === 'ACTION' && rep.colIndex === ci && patternLen > 0 && f >= sourceStart && f <= rep.endF;
                });
                if (inActionRep) continue;
            }
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

// ACTION止め・Rep表記描画（テンプレート用）
function drawRepeatMarksTemplate(ctx, x, y, colW, colCount, rowH, absoluteStart, scale) {
    const m = (mm) => mm * scale;
    if (typeof cellData === 'undefined') return;
    if (typeof checkRepeatColumns !== 'function') return;

    const targetFrames = (parseInt(metaData.lengthSec) || 0) * 24 + (parseInt(metaData.lengthFrame) || 0);
    const endFrame = absoluteStart + TEMPLATE.FRAMES_PER_COL;
    const drawFrameLimit = Math.max(targetFrames, endFrame);
    if (drawFrameLimit <= 0) return;

    for (let ci = 0; ci < colCount; ci++) {
        // 列データ収集
        const colData = [];
        for (let f = 0; f < drawFrameLimit; f++) {
            colData[f] = cellData[`ACTION-${ci}-${f}`] || null;
        }

        // リピート・止め検出
        const repeats = checkRepeatColumns(colData, drawFrameLimit, ci);
        const tx = x + ci * colW + colW / 2;

        repeats.forEach(r => {
            if (r.isHold) {
                // 止め描画
                const holdFrame = 1;
                if (holdFrame < absoluteStart || holdFrame >= endFrame) return;

                const holdY = y + (holdFrame - absoluteStart) * rowH;

                // 背景
                ctx.fillStyle = TEMPLATE.BG_COLOR;
                ctx.fillRect(tx - m(2), holdY + m(0.5), m(4), m(6));

                // 止/メ
                ctx.fillStyle = TEMPLATE.TEXT_COLOR;
                ctx.font = `bold ${m(2.2)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText('止', tx, holdY + m(0.8));
                ctx.fillText('メ', tx, holdY + m(3.2));
            } else {
                // Rep描画
                const chunkStartFrame = r.startF + r.chunkLen;
                if (chunkStartFrame < absoluteStart || chunkStartFrame >= endFrame) return;

                const firstData = colData[r.startF] || null;
                const firstVal = firstData?.value || '';
                const repY = y + (chunkStartFrame - absoluteStart) * rowH;

                // 先頭セル番号
                drawRepeatTextWithBg(ctx, firstVal, tx, repY + rowH / 2, `bold ${m(2.2) * getFontScale('cell')}px sans-serif`, scale);
                drawTemplateOptionMark(ctx, tx, repY + rowH / 2, firstData, scale);

                // "rep"
                const repTextFrame = chunkStartFrame + 1;
                if (repTextFrame >= absoluteStart && repTextFrame < endFrame && repTextFrame < drawFrameLimit) {
                    const repTextY = y + (repTextFrame - absoluteStart) * rowH;
                    drawRepeatTextWithBg(ctx, 'rep', tx, repTextY + rowH / 2, `bold ${m(2)}px sans-serif`, scale);
                }

                // 点線
                const lineStartF = repTextFrame + 1;
                const lineEndF = Math.min(r.endF - 1, chunkStartFrame + 6, drawFrameLimit - 1);
                if (lineEndF >= lineStartF && lineStartF >= absoluteStart && lineStartF < endFrame) {
                    const lineStartY = y + (lineStartF - absoluteStart) * rowH;
                    const lineEndY = y + (Math.min(lineEndF, endFrame - 1) - absoluteStart + 1) * rowH;

                    ctx.strokeStyle = 'rgba(66, 133, 244, 0.8)';
                    ctx.lineWidth = TEMPLATE.LINE_THIN;
                    ctx.setLineDash([m(1), m(1)]);
                    ctx.beginPath();
                    ctx.moveTo(tx, lineStartY);
                    ctx.lineTo(tx, lineEndY);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }
        });
    }

    if (typeof customRepeats !== 'undefined' && Array.isArray(customRepeats)) {
        customRepeats.forEach(rep => {
            if (rep.colType !== 'ACTION') return;
            if (rep.colIndex < 0 || rep.colIndex >= colCount) return;
            if (rep.endF < absoluteStart || rep.startF >= endFrame) return;

            const tx = x + rep.colIndex * colW + colW / 2;
            const chunkStartFrame = rep.startF;
            const firstData = rep.pattern?.[0] || null;
            const firstVal = firstData?.value || '';

            if (chunkStartFrame >= absoluteStart && chunkStartFrame < endFrame) {
                const repY = y + (chunkStartFrame - absoluteStart) * rowH;
                drawRepeatTextWithBg(ctx, firstVal, tx, repY + rowH / 2, `bold ${m(2.2) * getFontScale('cell')}px sans-serif`, scale);
                drawTemplateOptionMark(ctx, tx, repY + rowH / 2, firstData, scale);
            }

            const repTextFrame = chunkStartFrame + 1;
            let labelBox = null;
            if (repTextFrame >= absoluteStart && repTextFrame < endFrame && repTextFrame < drawFrameLimit) {
                const repTextY = y + (repTextFrame - absoluteStart) * rowH;
                const label = typeof getRepeatLabel === 'function' ? getRepeatLabel(rep) : 'rep';
                if (label === 'rep') {
                    drawRepeatTextWithBg(ctx, label, tx, repTextY + rowH / 2, `bold ${m(2)}px sans-serif`, scale);
                } else {
                    labelBox = drawVerticalRepeatTextWithBg(ctx, label, tx, repTextY + rowH * 0.25, `bold ${m(1.7)}px sans-serif`, scale, { direction: 'down' });
                }
            }

            const lineStartF = repTextFrame + 1;
            const lineEndF = Math.min(rep.endF, chunkStartFrame + 6, drawFrameLimit - 1);
            if (lineEndF >= lineStartF && lineStartF >= absoluteStart && lineStartF < endFrame) {
                const baseLineStartY = y + (lineStartF - absoluteStart) * rowH;
                const lineStartY = labelBox ? Math.max(baseLineStartY, labelBox.bottom + m(0.4)) : baseLineStartY;
                const lineEndY = y + (Math.min(lineEndF, endFrame - 1) - absoluteStart + 1) * rowH;
                ctx.strokeStyle = (typeof settings !== 'undefined' && settings.draw.repeatDashColor) || 'rgba(66, 133, 244, 0.8)';
                ctx.lineWidth = TEMPLATE.LINE_THIN;
                ctx.setLineDash([m(1), m(1)]);
                ctx.beginPath();
                ctx.moveTo(tx, lineStartY);
                ctx.lineTo(tx, lineEndY);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        });
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

// セリフブロック描画（テンプレート用）
function drawDialogueBlocksTemplate(ctx, x, y, colW, colCount, rowH, absoluteStart, scale) {
    const m = (mm) => mm * scale;
    if (typeof dialogueBlocks === 'undefined') return;

    const endFrame = absoluteStart + TEMPLATE.FRAMES_PER_COL;

    dialogueBlocks.forEach(block => {
        if (block.startFrame >= endFrame || block.endFrame < absoluteStart) return;
        if (block.colIndex >= colCount) return;

        // 真の始終点座標（ページ外でも論理位置を計算）
        const tx = x + block.colIndex * colW;
        const trueStartY = y + (block.startFrame - absoluteStart) * rowH;
        const trueEndY = y + (block.endFrame - absoluteStart + 1) * rowH;
        const trueBlockH = trueEndY - trueStartY;
        // 表示クリップ範囲
        const sF = Math.max(block.startFrame, absoluteStart);
        const eF = Math.min(block.endFrame, endFrame - 1);
        const clipStartY = y + (sF - absoluteStart) * rowH;
        const clipEndY = y + (eF - absoluteStart + 1) * rowH;

        // ページ範囲でクリップ。文字切れ防止のため上下にrowH*2の余裕
        ctx.save();
        ctx.beginPath();
        ctx.rect(tx, clipStartY, colW, clipEndY - clipStartY);
        ctx.clip();

        // 背景（真の範囲で描画。クリップで自動的に切り取られる）
        ctx.fillStyle = getSpeakerColorTemplate(block.speakerName);
        ctx.fillRect(tx, trueStartY, colW, trueBlockH);

        // 上下線（太め）: 真の始終点の位置に描画。範囲外ならクリップで消える
        ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
        ctx.lineWidth = TEMPLATE.LINE_THICK + 1;
        ctx.beginPath();
        ctx.moveTo(tx, trueStartY);
        ctx.lineTo(tx + colW, trueStartY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tx, trueEndY);
        ctx.lineTo(tx + colW, trueEndY);
        ctx.stroke();

        // テキスト（真の始点を基準に配置）
        ctx.fillStyle = TEMPLATE.TEXT_COLOR;
        let textStartY = trueStartY + m(4);
        const isShort = trueBlockH <= rowH * 2;

        // 話者名（真の始点直下にのみ表示。複数ページ時もここだけ）
        if (block.speakerName && !isShort) {
            let speakerFontSize = m(2.5) * getFontScale('dialogue');
            ctx.font = `bold ${speakerFontSize}px sans-serif`;
            while (ctx.measureText(block.speakerName).width > colW - m(1) && speakerFontSize > m(1.5) * getFontScale('dialogue')) {
                speakerFontSize -= m(0.2);
                ctx.font = `bold ${speakerFontSize}px sans-serif`;
            }
            ctx.textAlign = 'center';
            ctx.fillText(block.speakerName, tx + colW / 2, trueStartY + m(3));
            textStartY = trueStartY + m(6);
        }

        // セリフテキスト: 真の範囲全体に展開
        if (block.text) {
            const fontSize = m(3) * getFontScale('dialogue');
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            const CHAR_H = fontSize * 1.2;
            const textH = trueEndY - textStartY - m(1);
            const chars = block.text.split('');

            let spacing;
            if (chars.length <= 1) {
                spacing = 0;
            } else {
                // 余白を均等に分配（最小は文字高の0.7倍まで）
                const maxFitSpacing = (textH - CHAR_H) / (chars.length - 1);
                spacing = Math.max(CHAR_H * 0.7, maxFitSpacing);
            }

            const totalTextH = chars.length === 1 ? CHAR_H : (chars.length - 1) * spacing + CHAR_H;
            const actualStartY = textStartY + (CHAR_H / 2) + Math.max(0, (textH - totalTextH) / 2);

            // ページ境界に重なる文字は近いページ側へずらす（切れ防止）
            // 文字の実際の見た目（特に日本語）はCHAR_Hより大きいことがあるので余裕を取る
            const pageH = TEMPLATE.FRAMES_PER_COL * rowH;
            const SAFE = CHAR_H * 0.9; // 安全マージン
            const adjustY = (yy) => {
                const blockTopAbsPage = Math.floor((trueStartY - y) / pageH);
                const blockBotAbsPage = Math.floor((trueEndY - y) / pageH);
                for (let p = blockTopAbsPage; p <= blockBotAbsPage; p++) {
                    const boundary = y + (p + 1) * pageH;
                    if (Math.abs(yy - boundary) < SAFE) {
                        return yy < boundary ? boundary - SAFE : boundary + SAFE;
                    }
                }
                return yy;
            };

            chars.forEach((ch, i) => {
                const trueY = adjustY(actualStartY + i * spacing);
                if (ch === 'ー') ch = '丨';
                ctx.fillText(ch, tx + colW / 2, trueY);
            });
        }
        ctx.restore();
    });
}

// 話者カラー（テンプレート用）- editモードと同一の色を使用
function getSpeakerColorTemplate(name) {
    if (typeof getSpeakerColor === 'function') return getSpeakerColor(name);
    return 'rgba(255, 200, 200, 0.5)';
}

// カメラブロック描画（テンプレート用）- editモード準拠
function drawCameraBlocksTemplate(ctx, x, y, colW, colCount, rowH, absoluteStart, scale) {
    const m = (mm) => mm * scale;
    if (typeof cameraBlocks === 'undefined') return;

    const endFrame = absoluteStart + TEMPLATE.FRAMES_PER_COL;

    cameraBlocks.forEach(block => {
        if (block.startFrame >= endFrame || block.endFrame < absoluteStart) return;
        if (block.colIndex >= colCount) return;

        const sF = Math.max(block.startFrame, absoluteStart);
        const eF = Math.min(block.endFrame, endFrame - 1);
        const drawCols = block.colspan || 1;
        const drawWidth = colW * drawCols;

        const tx = x + block.colIndex * colW;
        // 真の始終点座標で描画。ページ外はクリップで自動的に切り取る
        const startY = y + (block.startFrame - absoluteStart) * rowH;
        const endY = y + (block.endFrame - absoluteStart + 1) * rowH;
        // ページ範囲でクリッピング設定
        const clipStartY = y + (sF - absoluteStart) * rowH;
        const clipEndY = y + (eF - absoluteStart + 1) * rowH;
        ctx.save();
        ctx.beginPath();
        // 横方向は余裕を持たせて文字切れを防ぐ。縦方向もrowH*2の余裕で境界の文字切れ防止
        ctx.rect(tx - colW, clipStartY, drawWidth + colW * 2, clipEndY - clipStartY);
        ctx.clip();

        const vt = block.valueType;
        const pKind = (block.kind || '').split(' (')[0].trim();
        const tgts = (block.targetLayers || []).join(',');
        // 長尺ブロック判定（3秒=72fr以上）
        const isLongBlock = (block.endFrame - block.startFrame + 1) >= 72;
        const labelAnchorY = isLongBlock ? (startY + rowH * 7) : (startY + (endY - startY) / 2);
        // 対象レイヤーリスト（複数を改行で描画）
        const tgtList = block.targetLayers || [];
        // 横書きで [layer] を改行付き描画
        const drawTgtsH = (cx, baseY, fontSize, withBg) => {
            if (!tgtList.length) return baseY;
            ctx.font = `${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            let curY = baseY;
            const lineH = fontSize * 1.2;
            tgtList.forEach(l => {
                const txt = `[${l}]`;
                if (withBg) drawTextBg(txt, cx, curY, fontSize);
                ctx.fillStyle = TEMPLATE.TEXT_COLOR;
                ctx.fillText(txt, cx, curY);
                curY += lineH;
            });
            return curY;
        };

        ctx.fillStyle = TEMPLATE.TEXT_COLOR;
        ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
        ctx.lineWidth = TEMPLATE.LINE_THIN;

        const isShake = pKind.includes("CAM SHAKE") || pKind.includes("Handy") || pKind.includes("カメラぶれ") || pKind.includes("ハンディ");
        const isFill = pKind === "BL K" || pKind === "黒コマ" || pKind === "W K" || pKind === "白コマ";
        const isStrobo = pKind === "Strobo" || pKind === "Strobo2" || pKind === "ストロボ" || pKind === "ストロボ2";
        const isIris = pKind === "IrisIN" || pKind === "IrisOut";

        // 縦書きヘルパー（CAM SHAKE/fromTo用）
        const pageH = TEMPLATE.FRAMES_PER_COL * rowH;
        // ページ境界に重なる文字Yを上下にずらす（切れ防止、文字より少し余裕）
        const adjustCharY = (yy, charH) => {
            const safe = charH * 0.9;
            for (let p = -2; p <= 4; p++) {
                const boundary = y + p * pageH;
                if (Math.abs(yy - boundary) < safe) {
                    return yy < boundary ? boundary - safe : boundary + safe;
                }
            }
            return yy;
        };
        const drawVerticalLabel = (text, cx, cy, fontSize, charH) => {
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            const chars = text.split('');
            const startYt = cy - (chars.length * charH) / 2 + charH / 2;
            chars.forEach((c, i) => {
                const charY = adjustCharY(startYt + i * charH, charH);
                if (c === "ー") c = "丨";
                ctx.fillText(c, cx, charY);
            });
        };

        // テキスト背景描画ヘルパー
        const drawTextBg = (text, cx, cy, fontSize, padding = m(0.8)) => {
            ctx.font = `bold ${fontSize}px sans-serif`;
            const tw = ctx.measureText(text).width;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fillRect(cx - tw / 2 - padding, cy - fontSize * 0.8, tw + padding * 2, fontSize * 1.2);
        };

        // インライン編集（Rolling等）の場合 - 黒線で描画、入力データも表示
        if (block.isInlineEdit) {
            const lineX = tx + m(1);
            ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            ctx.lineWidth = TEMPLATE.LINE_MEDIUM;
            ctx.beginPath(); ctx.moveTo(lineX, startY); ctx.lineTo(lineX, endY); ctx.stroke();
            if (block.startFrame >= absoluteStart) {
                ctx.beginPath(); ctx.moveTo(lineX - m(0.5), startY); ctx.lineTo(lineX + m(2), startY); ctx.stroke();
            }
            if (block.endFrame < endFrame) {
                ctx.beginPath(); ctx.moveTo(lineX - m(0.5), endY); ctx.lineTo(lineX + m(2), endY); ctx.stroke();
            }
            // kind名、Target名を0frの上（ブロック開始位置の上）に表示
            ctx.font = `bold ${m(2) * getFontScale('camera')}px sans-serif`;
            ctx.textAlign = 'left';
            let labelY = labelAnchorY;
            // 対象レイヤーを下から積み上げで描画
            tgtList.slice().reverse().forEach(l => {
                ctx.fillText(`[${l}]`, lineX + m(2.5), labelY);
                labelY -= m(2.5);
            });
            ctx.fillText(pKind, lineX + m(2.5), labelY);
            // インライン入力データを描画（太字）
            ctx.font = `bold ${m(2) * getFontScale('camera')}px sans-serif`;
            for (let f = sF; f <= eF; f++) {
                const key = `CAMERA-${block.colIndex}-${f}`;
                const data = cellData[key];
                if (data && data.value && !['SYMBOL_HYPHEN', 'SYMBOL_TICK', 'SYMBOL_NULL'].includes(data.value)) {
                    const fy = y + (f - absoluteStart) * rowH + rowH / 2 + m(0.8);
                    ctx.fillText(data.value, lineX + m(2.5), fy);
                }
            }
            ctx.lineWidth = TEMPLATE.LINE_THIN;
        } else if (pKind === "FI" || pKind === "WI") {
            // FI/WI: 下向き三角形
            ctx.beginPath();
            ctx.moveTo(tx + drawWidth / 2, startY);
            ctx.lineTo(tx + drawWidth, endY);
            ctx.lineTo(tx, endY);
            ctx.closePath();
            ctx.fillStyle = pKind === "FI" ? 'rgba(100, 100, 100, 0.3)' : 'rgba(255, 255, 255, 0.3)';
            ctx.fill();
            ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
            ctx.stroke();
            const midY = labelAnchorY;
            ctx.textAlign = 'center';
            // kind名（背景付き横書き）
            drawTextBg(pKind, tx + drawWidth / 2, midY - (tgts ? m(1.5) : 0), m(2.5) * getFontScale('camera'));
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            ctx.font = `bold ${m(2.5) * getFontScale('camera')}px sans-serif`;
            ctx.fillText(pKind, tx + drawWidth / 2, midY - (tgts ? m(1.5) : 0));
            // Target名（背景付き横書き、縦に重ねる）
            drawTgtsH(tx + drawWidth / 2, midY + m(2), m(1.8) * getFontScale('camera'), true);
        } else if (pKind === "FO" || pKind === "WO") {
            // FO/WO: 上向き三角形
            ctx.beginPath();
            ctx.moveTo(tx, startY);
            ctx.lineTo(tx + drawWidth, startY);
            ctx.lineTo(tx + drawWidth / 2, endY);
            ctx.closePath();
            ctx.fillStyle = pKind === "FO" ? 'rgba(100, 100, 100, 0.3)' : 'rgba(255, 255, 255, 0.3)';
            ctx.fill();
            ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
            ctx.stroke();
            const midY = labelAnchorY;
            ctx.textAlign = 'center';
            // kind名（背景付き横書き）
            drawTextBg(pKind, tx + drawWidth / 2, midY - (tgts ? m(1.5) : 0), m(2.5) * getFontScale('camera'));
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            ctx.font = `bold ${m(2.5) * getFontScale('camera')}px sans-serif`;
            ctx.fillText(pKind, tx + drawWidth / 2, midY - (tgts ? m(1.5) : 0));
            // Target名（背景付き横書き、縦に重ねる）
            drawTgtsH(tx + drawWidth / 2, midY + m(2), m(1.8) * getFontScale('camera'), true);
        } else if (isFill) {
            // BL K/W K: 塗りつぶし
            const isBlack = pKind === "BL K" || pKind === "黒コマ";
            ctx.fillStyle = isBlack ? '#333' : '#ddd';
            ctx.fillRect(tx + m(0.5), startY, drawWidth - m(1), endY - startY);
            ctx.fillStyle = isBlack ? '#fff' : '#111';
            const midY = labelAnchorY;
            ctx.textAlign = 'center';
            // kind名（横書き）
            ctx.font = `bold ${m(2.2) * getFontScale('camera')}px sans-serif`;
            ctx.fillText(pKind, tx + drawWidth / 2, midY - (tgts ? m(1.5) : 0));
            // Target名（横書き、改行で複数表示）
            drawTgtsH(tx + drawWidth / 2, midY + m(2), m(1.8) * getFontScale('camera'), false);
        } else if (isIris) {
            // Iris: 台形状の開閉表現
            const inset = Math.max(m(1.2), drawWidth * 0.18);
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
            ctx.fillStyle = 'rgba(100, 100, 100, 0.25)';
            ctx.fill();
            ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
            ctx.stroke();
            const midY = labelAnchorY;
            ctx.textAlign = 'center';
            drawTextBg(pKind, tx + drawWidth / 2, midY - (tgts ? m(1.5) : 0), m(2.2) * getFontScale('camera'));
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            ctx.font = `bold ${m(2.2) * getFontScale('camera')}px sans-serif`;
            ctx.fillText(pKind, tx + drawWidth / 2, midY - (tgts ? m(1.5) : 0));
            drawTgtsH(tx + drawWidth / 2, midY + m(2), m(1.8) * getFontScale('camera'), true);
        } else if (isShake) {
            // CAM SHAKE/Handy: 波線
            const lineX = tx + drawWidth / 2;
            ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
            if (block.startFrame >= absoluteStart) {
                ctx.beginPath(); ctx.moveTo(lineX - m(2), startY); ctx.lineTo(lineX + m(2), startY); ctx.stroke();
            }
            if (block.endFrame < endFrame) {
                ctx.beginPath(); ctx.moveTo(lineX - m(2), endY); ctx.lineTo(lineX + m(2), endY); ctx.stroke();
            }
            ctx.beginPath();
            for (let py = startY; py <= endY; py += m(0.5)) {
                const px = lineX + Math.sin((py - startY) * 0.3) * m(1);
                if (py === startY) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            // kind縦書き: 上端を startY + rowH*7 に揃える
            const kindChars = pKind.split('');
            const kindCharH = m(2.8);
            const kindTopY = isLongBlock ? (startY + rowH * 7) : (startY + (endY - startY) / 2 - (kindChars.length * kindCharH) / 2);
            const midY = kindTopY + (kindChars.length * kindCharH) / 2;
            drawVerticalLabel(pKind, lineX, midY, m(2.2) * getFontScale('camera'), m(2.8) * getFontScale('camera'));
            // tgts縦書き（レイヤーごとに区切って積み上げ）
            if (tgtList.length) {
                ctx.font = `${m(1.8) * getFontScale('camera')}px sans-serif`;
                ctx.textAlign = 'center';
                let curY = kindTopY + kindChars.length * kindCharH + m(1);
                tgtList.forEach(l => {
                    const ch = `[${l}]`.split('');
                    ch.forEach((c, i) => {
                        ctx.fillText(c, lineX, adjustCharY(curY + i * m(2.2), m(2.2)));
                    });
                    curY += ch.length * m(2.2) + m(1);
                });
            }
        } else if (vt === 'numericFr' || isStrobo) {
            // Strobo: 砂時計と菱形パターン
            const frGap = block.numericFr || 4;
            const stepY = frGap * rowH;
            const totalFrames = eF - sF + 1;
            const segments = Math.ceil(totalFrames / frGap);
            ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
            ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
            const isType2 = pKind === "Strobo2" || pKind === "ストロボ2";
            for (let seg = 0; seg < segments; seg++) {
                const curY = startY + seg * stepY;
                const cEndY = Math.min(curY + stepY, endY);
                const segMidY = curY + (cEndY - curY) / 2;
                const lx = tx, rx = tx + drawWidth, cx = tx + drawWidth / 2;
                const halfW = drawWidth / 2;
                // 左半分
                ctx.beginPath();
                if (isType2 ? false : true) { // hourglass for left on Strobo1
                    ctx.moveTo(lx, curY); ctx.lineTo(cx, curY); ctx.lineTo(lx + halfW / 2, segMidY);
                    ctx.lineTo(cx, cEndY); ctx.lineTo(lx, cEndY); ctx.lineTo(lx + halfW / 2, segMidY);
                } else { // diamond
                    ctx.moveTo(lx + halfW / 2, curY); ctx.lineTo(cx, segMidY);
                    ctx.lineTo(lx + halfW / 2, cEndY); ctx.lineTo(lx, segMidY);
                }
                ctx.closePath(); ctx.fill(); ctx.stroke();
                // 右半分
                ctx.beginPath();
                if (isType2 ? true : false) { // hourglass for right on Strobo1
                    ctx.moveTo(cx, curY); ctx.lineTo(rx, curY); ctx.lineTo(cx + halfW / 2, segMidY);
                    ctx.lineTo(rx, cEndY); ctx.lineTo(cx, cEndY); ctx.lineTo(cx + halfW / 2, segMidY);
                } else { // diamond
                    ctx.moveTo(cx + halfW / 2, curY); ctx.lineTo(rx, segMidY);
                    ctx.lineTo(cx + halfW / 2, cEndY); ctx.lineTo(cx, segMidY);
                }
                ctx.closePath(); ctx.fill(); ctx.stroke();
            }
            // ラベル（背景付き横書き縦重ね）
            const midY = labelAnchorY;
            ctx.textAlign = 'center';
            drawTextBg(pKind, tx + drawWidth / 2, midY - (tgts ? m(1.5) : 0), m(2.2) * getFontScale('camera'));
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            ctx.font = `bold ${m(2.2) * getFontScale('camera')}px sans-serif`;
            ctx.fillText(pKind, tx + drawWidth / 2, midY - (tgts ? m(1.5) : 0));
            drawTgtsH(tx + drawWidth / 2, midY + m(2), m(1.8) * getFontScale('camera'), true);
        } else if (vt === 'fromToLayers') {
            // O.L: 砂時計形状
            ctx.beginPath();
            ctx.moveTo(tx, startY); ctx.lineTo(tx + drawWidth, startY);
            ctx.lineTo(tx + drawWidth / 2, startY + (endY - startY) / 2);
            ctx.lineTo(tx + drawWidth, endY); ctx.lineTo(tx, endY);
            ctx.lineTo(tx + drawWidth / 2, startY + (endY - startY) / 2);
            ctx.closePath();
            ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
            ctx.fill();
            ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
            ctx.stroke();
            ctx.textAlign = 'center';
            const midY = labelAnchorY;
            // O.L/Wipe横書き（背景付き）
            const olLabel = pKind === "Wipe" ? "Wipe" : "O.L";
            drawTextBg(olLabel, tx + drawWidth / 2, midY, m(2.5) * getFontScale('camera'));
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            ctx.font = `bold ${m(2.5) * getFontScale('camera')}px sans-serif`;
            ctx.fillText(olLabel, tx + drawWidth / 2, midY);
            // from/to横書き縦重ね（背景付き）
            const fromL = (block.layersFrom || []).join(',');
            const toL = (block.layersTo || []).join(',');
            ctx.font = `${m(1.8) * getFontScale('camera')}px sans-serif`;
            if (fromL) {
                drawTextBg(fromL, tx + drawWidth / 2, startY + m(3), m(1.8) * getFontScale('camera'));
                ctx.fillStyle = TEMPLATE.TEXT_COLOR;
                ctx.fillText(fromL, tx + drawWidth / 2, startY + m(3));
            }
            if (toL) {
                drawTextBg(toL, tx + drawWidth / 2, endY - m(1.5), m(1.8) * getFontScale('camera'));
                ctx.fillStyle = TEMPLATE.TEXT_COLOR;
                ctx.fillText(toL, tx + drawWidth / 2, endY - m(1.5));
            }
        } else if (vt === 'instructionText') {
            // 処理・効果系: 範囲線 + 縦書き指示テキスト
            const lineX = tx + drawWidth / 2;
            ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            if (block.startFrame >= absoluteStart) {
                ctx.beginPath(); ctx.moveTo(lineX - m(2), startY); ctx.lineTo(lineX + m(2), startY); ctx.stroke();
            }
            if (block.endFrame < endFrame) {
                ctx.beginPath(); ctx.moveTo(lineX - m(2), endY); ctx.lineTo(lineX + m(2), endY); ctx.stroke();
            }
            ctx.beginPath(); ctx.moveTo(lineX, startY); ctx.lineTo(lineX, endY); ctx.stroke();
            // 縦書き: [layer1] [layer2] ... [layerN] pKind の順で積み上げ
            const charH = m(2.6) * getFontScale('camera');
            const fontSize = m(2.1) * getFontScale('camera');
            // 全体の文字数を計算
            const tgtSegments = tgtList.map(l => `[${l}]`.split(''));
            const pKindChars = pKind.split('');
            const totalChars = tgtSegments.reduce((s, seg) => s + seg.length, 0) + pKindChars.length + tgtSegments.length; // tgt間にmargin1コマ相当
            const labelTopY = isLongBlock ? (startY + rowH * 7) : (startY + (endY - startY) / 2 - (totalChars * charH) / 2);
            // 背景
            const bgW = Math.max(m(4), fontSize * 1.35);
            const bgH = totalChars * charH + m(1.6);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
            ctx.fillRect(lineX - bgW / 2, labelTopY - m(0.8), bgW, bgH);
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            ctx.font = `${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            let curY = labelTopY + charH / 2;
            const drawCharAdj = (c) => {
                ctx.fillText(c, lineX, adjustCharY(curY, charH));
                curY += charH;
            };
            tgtSegments.forEach(seg => {
                seg.forEach(drawCharAdj);
                curY += charH; // レイヤー間のスペース
            });
            pKindChars.forEach(drawCharAdj);
        } else if (vt === 'fromTo' || vt === 'multiLayerDirection') {
            // fromTo: 矢印と縦線 + 中間点
            const lineX = tx + m(3);
            ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            // 上下矢印
            ctx.beginPath(); ctx.moveTo(lineX - m(1), startY); ctx.lineTo(lineX + m(1), startY); ctx.lineTo(lineX, startY + m(1.5)); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(lineX - m(1), endY); ctx.lineTo(lineX + m(1), endY); ctx.lineTo(lineX, endY - m(1.5)); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(lineX, startY + m(1.5)); ctx.lineTo(lineX, endY - m(1.5)); ctx.stroke();
            // 中間点(waypoints)
            if (block.waypoints && block.waypoints.length > 0) {
                block.waypoints.forEach(wp => {
                    if (wp.frame >= sF && wp.frame <= eF) {
                        const wpY = y + (wp.frame - absoluteStart) * rowH + rowH / 2;
                        ctx.lineWidth = TEMPLATE.LINE_MEDIUM;
                        ctx.beginPath(); ctx.moveTo(lineX - m(1.5), wpY); ctx.lineTo(lineX + m(1.5), wpY); ctx.stroke();
                        ctx.lineWidth = TEMPLATE.LINE_THIN;
                        if (wp.label) {
                            ctx.font = `${m(2)}px sans-serif`;
                            ctx.textAlign = 'left';
                            ctx.fillText(wp.label, lineX + m(2.5), wpY + m(0.8));
                        }
                    }
                });
            }
            // フェアリング描画（同カラム内）
            if (block.hasFairing && block.waypoints && block.waypoints.length > 0) {
                const fMode = block.fairingMode;
                const wpYs = block.waypoints.filter(wp => wp.frame >= sF && wp.frame <= eF)
                    .map(wp => y + (wp.frame - absoluteStart) * rowH + rowH / 2).sort((a, b) => a - b);
                if (wpYs.length > 0) {
                    const drawFairingLabel = (yStart, yEnd) => {
                        // カラム右端に描画（中間ラベルと被らないよう右寄せ）
                        const bracketX = tx + drawWidth - m(0.5);
                        const bW = m(1);
                        ctx.lineWidth = TEMPLATE.LINE_FINE;
                        ctx.beginPath();
                        ctx.moveTo(bracketX - bW, yStart); ctx.lineTo(bracketX, yStart);
                        ctx.lineTo(bracketX, yEnd); ctx.lineTo(bracketX - bW, yEnd);
                        ctx.stroke();
                        ctx.font = `${m(1.5)}px sans-serif`;
                        ctx.textAlign = 'center';
                        const fairChars = 'フェアリング'.split('');
                        const fairMidY = (yStart + yEnd) / 2;
                        const fCharH = m(2);
                        const fStartY = fairMidY - (fairChars.length * fCharH) / 2 + fCharH / 2;
                        fairChars.forEach((c, i) => {
                            ctx.fillText(c, bracketX - m(2), fStartY + i * fCharH);
                        });
                    };
                    if (fMode === 'in' || fMode === 'both') drawFairingLabel(startY, wpYs[0]);
                    if (fMode === 'out' || fMode === 'both') drawFairingLabel(wpYs[wpYs.length - 1], endY);
                }
            }
            // from/to テキスト
            ctx.font = `${m(2.2) * getFontScale('camera')}px sans-serif`;
            ctx.textAlign = 'left';
            if (block.fromText) ctx.fillText(block.fromText, lineX + m(2.5), startY + m(3));
            if (block.toText) ctx.fillText(block.toText, lineX + m(2.5), endY - m(1));
            // kind縦書き
            ctx.font = `bold ${m(2.8) * getFontScale('camera')}px sans-serif`;
            ctx.textAlign = 'center';
            const chars = pKind.split('');
            const midY = labelAnchorY;
            const charH = m(3.5) * getFontScale('camera');
            const textStartY = midY - (chars.length * charH) / 2 + charH / 2;
            chars.forEach((c, i) => {
                if (c === "ー") c = "丨";
                ctx.fillText(c, lineX + m(5), textStartY + i * charH);
            });
            if (tgtList.length) {
                ctx.font = `${m(2) * getFontScale('camera')}px sans-serif`;
                let y2 = textStartY - m(2.5);
                tgtList.slice().reverse().forEach(l => {
                    ctx.fillText(`[${l}]`, lineX + m(5), y2);
                    y2 -= m(2.5);
                });
            }
        } else {
            // デフォルト: 縦線とテキスト
            const lineX = tx + drawWidth / 2;
            ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
            if (block.startFrame >= absoluteStart) {
                ctx.beginPath(); ctx.moveTo(lineX - m(2), startY); ctx.lineTo(lineX + m(2), startY); ctx.stroke();
            }
            if (block.endFrame < endFrame) {
                ctx.beginPath(); ctx.moveTo(lineX - m(2), endY); ctx.lineTo(lineX + m(2), endY); ctx.stroke();
            }
            ctx.beginPath(); ctx.moveTo(lineX, startY); ctx.lineTo(lineX, endY); ctx.stroke();
            const midY = labelAnchorY;
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            ctx.font = `bold ${m(2.5) * getFontScale('camera')}px sans-serif`;
            ctx.textAlign = 'center';
            // tgts を上、pKind を下に積み上げ
            let dispY = midY + m(1);
            if (tgtList.length) {
                const lineH = m(3) * getFontScale('camera');
                let tgtY = dispY - lineH * tgtList.length;
                tgtList.forEach(l => { ctx.fillText(`[${l}]`, lineX, tgtY); tgtY += lineH; });
            }
            ctx.fillText(pKind, lineX, dispY);
        }
        ctx.restore();
    });
}

// プレビュー用
function getTemplatePreview() {
    return renderTemplate(TEMPLATE.DPI_PREVIEW, 0);
}

// エクスポート用
function getTemplateForExport(dpi) {
    return renderTemplate(dpi || TEMPLATE.DPI_EXPORT, currentPage);
}

let imageExportDirectoryHandle = null;

function openImageExportDialog(format, dpi) {
    const modal = document.getElementById('image-export-modal');
    if (!modal) {
        return exportTemplateImagePages({
            format: format || 'png',
            dpi: dpi || TEMPLATE.DPI_EXPORT,
            filenameTemplate: (typeof settings !== 'undefined' && settings.preview && settings.preview.exportFilenameTemplate) || '%title_%scene_%cut',
            pages: [currentPage],
            directoryHandle: null
        });
    }

    const saved = (typeof settings !== 'undefined' && settings.preview) ? settings.preview : {};
    const exportFormat = format || saved.imageExportFormat || 'png';
    const exportDpi = dpi || saved.imageExportDpi || TEMPLATE.DPI_EXPORT;
    document.getElementById('image-export-format').value = ['png', 'jpg', 'psd'].includes(exportFormat) ? exportFormat : 'png';
    document.getElementById('image-export-dpi').value = String(exportDpi);
    document.getElementById('image-export-filename').value = saved.exportFilenameTemplate || '%title_%scene_%cut';
    document.getElementById('image-export-include-handwriting').checked = saved.imageExportIncludeHandwriting !== false;

    imageExportDirectoryHandle = imageExportDirectoryHandle || (typeof currentDirectoryHandle !== 'undefined' ? currentDirectoryHandle : null);
    updateImageExportDestinationLabel();
    buildImageExportPageThumbnails();
    updateImageExportPageZeroOption();
    updateImageExportSizeHint();
    updateImageExportFilenamePreview();

    document.getElementById('image-export-cancel').onclick = closeImageExportDialog;
    document.getElementById('image-export-ok').onclick = runImageExportFromDialog;
    document.getElementById('image-export-choose-dir').onclick = chooseImageExportDirectory;
    document.getElementById('image-export-select-all').onclick = () => setImageExportPageSelection(true);
    document.getElementById('image-export-clear-all').onclick = () => setImageExportPageSelection(false);
    document.getElementById('image-export-format').onchange = updateImageExportFilenamePreview;
    document.getElementById('image-export-dpi').onchange = () => {
        updateImageExportSizeHint();
        updateImageExportFilenamePreview();
    };
    document.getElementById('image-export-filename').oninput = updateImageExportFilenamePreview;
    document.getElementById('image-export-include-handwriting').onchange = updateImageExportFilenamePreview;
    document.getElementById('image-export-include-page-zero').onchange = (event) => {
        setImageExportPageSelected(0, event.target.checked);
        updateImageExportFilenamePreview();
    };

    modal.style.display = 'flex';
}

function closeImageExportDialog() {
    const modal = document.getElementById('image-export-modal');
    if (modal) modal.style.display = 'none';
}

function updateImageExportDestinationLabel() {
    const el = document.getElementById('image-export-destination');
    if (!el) return;
    if (imageExportDirectoryHandle) {
        el.textContent = imageExportDirectoryHandle.name
            ? `TDTSと同じフォルダ / ${imageExportDirectoryHandle.name}`
            : 'TDTSと同じフォルダ';
    } else {
        el.textContent = '未選択（書き出し時に保存先を選択）';
    }
}

async function chooseImageExportDirectory() {
    if (!window.showDirectoryPicker) {
        alert('このブラウザでは保存先フォルダを選択できません。ダウンロード保存になります。');
        return;
    }
    try {
        imageExportDirectoryHandle = await window.showDirectoryPicker();
        updateImageExportDestinationLabel();
    } catch (err) {
        if (!err || err.name !== 'AbortError') alert('保存先の選択に失敗しました。');
    }
}

function buildImageExportPageThumbnails() {
    const container = document.getElementById('image-export-pages');
    if (!container) return;
    container.innerHTML = '';
    const totalPages = (typeof getTotalPages === 'function') ? getTotalPages() : 1;
    const includePageZero = getInitialImageExportPageZeroSelection();
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
        const selected = !isImageExportPageZero(pageIndex) || includePageZero;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `image-export-page${selected ? ' selected' : ''}`;
        button.dataset.pageIndex = String(pageIndex);

        const thumb = renderTemplate(36, pageIndex);
        const img = document.createElement('img');
        img.alt = `page ${pageIndex + 1}`;
        img.src = thumb.toDataURL('image/png');

        const label = document.createElement('div');
        label.className = 'image-export-page-label';
        const check = document.createElement('span');
        check.className = 'image-export-page-check';
        check.textContent = selected ? '[x]' : '[ ]';
        const text = document.createElement('span');
        text.textContent = getImageExportPageLabel(pageIndex);
        label.appendChild(check);
        label.appendChild(text);

        button.onclick = () => {
            const selected = !button.classList.contains('selected');
            button.classList.toggle('selected', selected);
            check.textContent = selected ? '[x]' : '[ ]';
            if (isImageExportPageZero(pageIndex)) syncImageExportPageZeroCheckbox();
            updateImageExportFilenamePreview();
        };
        button.appendChild(img);
        button.appendChild(label);
        container.appendChild(button);
    }
}

function getInitialImageExportPageZeroSelection() {
    if (!hasExportablePageZero()) return false;
    const saved = (typeof settings !== 'undefined' && settings.preview) ? settings.preview : {};
    return saved.includePageZero !== false;
}

function isImageExportPageZero(pageIndex) {
    return pageIndex === 0 && typeof hasPage0 === 'function' && hasPage0();
}

function hasExportablePageZero() {
    if (typeof hasPage0 !== 'function' || !hasPage0()) return false;
    const startFrame = (typeof getPageStartFrame === 'function') ? getPageStartFrame(0) : 0;
    const endFrame = -1;
    if (typeof cellData !== 'undefined' && cellData) {
        for (const [key, cell] of Object.entries(cellData)) {
            const match = key.match(/^[^-]+-\d+-(-?\d+)$/);
            if (!match) continue;
            const frame = parseInt(match[1], 10);
            if (frame >= startFrame && frame <= endFrame && cell && String(cell.value || '').trim()) {
                return true;
            }
        }
    }
    return typeof hasHandwritingOnPage === 'function' && hasHandwritingOnPage(0);
}

function updateImageExportPageZeroOption() {
    const row = document.getElementById('image-export-page-zero-row');
    const checkbox = document.getElementById('image-export-include-page-zero');
    if (!row || !checkbox) return;
    const available = hasExportablePageZero();
    row.style.display = available ? 'inline-flex' : 'none';
    checkbox.checked = available && isImageExportPageSelected(0);
}

function isImageExportPageSelected(pageIndex) {
    const button = document.querySelector(`#image-export-pages .image-export-page[data-page-index="${pageIndex}"]`);
    return !!(button && button.classList.contains('selected'));
}

function setImageExportPageSelected(pageIndex, selected) {
    const button = document.querySelector(`#image-export-pages .image-export-page[data-page-index="${pageIndex}"]`);
    if (!button) return;
    button.classList.toggle('selected', selected);
    const check = button.querySelector('.image-export-page-check');
    if (check) check.textContent = selected ? '[x]' : '[ ]';
}

function syncImageExportPageZeroCheckbox() {
    const checkbox = document.getElementById('image-export-include-page-zero');
    if (checkbox) checkbox.checked = isImageExportPageSelected(0);
}

function setImageExportPageSelection(selected) {
    document.querySelectorAll('#image-export-pages .image-export-page').forEach(button => {
        button.classList.toggle('selected', selected);
        const check = button.querySelector('.image-export-page-check');
        if (check) check.textContent = selected ? '[x]' : '[ ]';
    });
    syncImageExportPageZeroCheckbox();
    updateImageExportFilenamePreview();
}

function getSelectedImageExportPages() {
    return Array.from(document.querySelectorAll('#image-export-pages .image-export-page.selected'))
        .map(button => parseInt(button.dataset.pageIndex, 10))
        .filter(pageIndex => Number.isFinite(pageIndex));
}

function getImageExportPageLabel(pageIndex) {
    if (typeof getSheetLabel === 'function') return getSheetLabel(pageIndex);
    return `${pageIndex + 1}`;
}

function updateImageExportSizeHint() {
    const hint = document.getElementById('image-export-size-hint');
    const dpi = parseInt(document.getElementById('image-export-dpi')?.value || TEMPLATE.DPI_EXPORT, 10);
    if (!hint || !dpi) return;
    const w = Math.round(TEMPLATE.WIDTH_MM / 25.4 * dpi);
    const h = Math.round(TEMPLATE.HEIGHT_MM / 25.4 * dpi);
    hint.textContent = `${w} x ${h}px`;
}

function updateImageExportFilenamePreview() {
    const pages = getSelectedImageExportPages();
    const countEl = document.getElementById('image-export-page-count');
    if (countEl) countEl.textContent = `${pages.length}ページ選択`;

    const preview = document.getElementById('image-export-filename-preview');
    if (!preview) return;
    const selectedFormat = document.getElementById('image-export-format')?.value || 'png';
    const format = ['png', 'jpg', 'psd'].includes(selectedFormat) ? selectedFormat : 'png';
    const template = document.getElementById('image-export-filename')?.value.trim() || '%title_%scene_%cut';
    if (pages.length === 0) {
        preview.textContent = '出力するページが選択されていません。';
        return;
    }
    if (format === 'psd' && pages.length > 1) {
        preview.textContent = buildImageExportBundleFilename(template, 'psd');
        return;
    }
    const names = pages.map(pageIndex => buildImageExportFilename(template, pageIndex, pages.length, format));
    preview.textContent = names.slice(0, 8).join('\n') + (names.length > 8 ? `\n...ほか ${names.length - 8} 件` : '');
}

async function runImageExportFromDialog() {
    const selectedFormat = document.getElementById('image-export-format').value || 'png';
    const format = ['png', 'jpg', 'psd'].includes(selectedFormat) ? selectedFormat : 'png';
    const dpi = parseInt(document.getElementById('image-export-dpi').value, 10) || TEMPLATE.DPI_EXPORT;
    const filenameTemplate = document.getElementById('image-export-filename').value.trim() || '%title_%scene_%cut';
    const includeHandwriting = document.getElementById('image-export-include-handwriting').checked;
    const pages = getSelectedImageExportPages();
    if (pages.length === 0) {
        alert('出力するページを選択してください。');
        return;
    }

    if (typeof settings !== 'undefined') {
        if (!settings.preview) settings.preview = {};
        settings.preview.imageExportFormat = format;
        settings.preview.imageExportDpi = dpi;
        settings.preview.imageExportIncludeHandwriting = includeHandwriting;
        settings.preview.exportFilenameTemplate = filenameTemplate;
        if (hasExportablePageZero()) settings.preview.includePageZero = pages.includes(0);
        if (typeof saveSettings === 'function') saveSettings();
    }

    // 保存先を先に確認（複数ページならフォルダ、単一なら個別ファイル）
    // 重要: ユーザーのクリック直後に picker を呼ばないと一部ブラウザでブロックされる
    let directoryHandle = null;
    const needsDirectory = pages.length > 1 || (format === 'psd' && pages.length > 1);
    if (needsDirectory && window.showDirectoryPicker) {
        try {
            directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            imageExportDirectoryHandle = directoryHandle;
            if (typeof updateImageExportDestinationLabel === 'function') updateImageExportDestinationLabel();
        } catch (err) {
            if (err && err.name === 'AbortError') return; // ユーザーがキャンセル
            console.error(err);
            alert('保存先フォルダの選択に失敗しました。');
            return;
        }
    }

    try {
        setImageExportBusy(true, '書き出し準備中...', 0);
        await exportTemplateImagePages({
            format,
            dpi,
            filenameTemplate,
            pages,
            includeHandwriting,
            directoryHandle,
            onProgress: updateImageExportProgress
        });
        closeImageExportDialog();
    } catch (err) {
        if (err && err.name === 'AbortError') return;
        console.error(err);
        alert('画像の保存に失敗しました。\n' + (err && err.message ? err.message : ''));
    } finally {
        setImageExportBusy(false);
    }
}

function setImageExportBusy(busy, label = '', value = 0) {
    const row = document.getElementById('image-export-progress-row');
    const progress = document.getElementById('image-export-progress');
    const labelEl = document.getElementById('image-export-progress-label');
    const ok = document.getElementById('image-export-ok');
    const cancel = document.getElementById('image-export-cancel');
    if (row) row.style.display = busy ? 'block' : 'none';
    if (progress) progress.value = value;
    if (labelEl) labelEl.textContent = label;
    if (ok) ok.disabled = busy;
    if (cancel) cancel.disabled = busy;
}

function updateImageExportProgress(label, value) {
    const progress = document.getElementById('image-export-progress');
    const labelEl = document.getElementById('image-export-progress-label');
    if (progress) progress.value = Math.max(0, Math.min(100, value));
    if (labelEl) labelEl.textContent = label;
}

async function exportTemplateImagePages(options) {
    const format = ['jpg', 'psd'].includes(options.format) ? options.format : 'png';
    const mimeType = format === 'jpg' ? 'image/jpeg' : format === 'psd' ? 'image/vnd.adobe.photoshop' : 'image/png';
    const ext = format === 'jpg' ? 'jpg' : format === 'psd' ? 'psd' : 'png';
    // 保存先 directoryHandle は呼び出し側（runImageExportFromDialog）で取得済み
    let directoryHandle = options.directoryHandle || null;

    if (format === 'psd' && options.pages.length > 1) {
        if (typeof buildTemplateMultiPagePsdBlob !== 'function') throw new Error('PSD exporter is not available.');
        const filename = buildImageExportBundleFilename(options.filenameTemplate, ext);
        const blob = await buildTemplateMultiPagePsdBlob(options.pages, options.dpi, options.includeHandwriting !== false, options.onProgress);
        if (options.onProgress) options.onProgress('PSDを書き込み中...', 92);
        await saveBlobFile(blob, filename, mimeType, directoryHandle);
        if (options.onProgress) options.onProgress('完了', 100);
        return;
    }

    for (let i = 0; i < options.pages.length; i++) {
        const pageIndex = options.pages[i];
        const filename = buildImageExportFilename(options.filenameTemplate, pageIndex, options.pages.length, ext);
        if (options.onProgress) options.onProgress(`${filename} を生成中...`, Math.round(i / options.pages.length * 90));
        if (format === 'psd') {
            if (typeof buildTemplatePsdBlob !== 'function') throw new Error('PSD exporter is not available.');
            const blob = await buildTemplatePsdBlob(pageIndex, options.dpi, options.includeHandwriting !== false);
            await saveBlobFile(blob, filename, mimeType, directoryHandle);
        } else {
            const canvas = await renderImageExportPageCanvas(pageIndex, options.dpi, options.includeHandwriting !== false);
            await saveImageCanvas(canvas, filename, mimeType, directoryHandle);
        }
        if (options.onProgress) options.onProgress(`${filename} を保存しました`, Math.round((i + 1) / options.pages.length * 100));
    }
}

async function renderImageExportPageCanvas(pageIndex, dpi, includeHandwriting) {
    const canvas = renderTemplate(dpi, pageIndex);
    if (!includeHandwriting || typeof renderHandwritingPageToCanvas !== 'function') return canvas;
    if (typeof hasHandwritingOnPage === 'function' && !hasHandwritingOnPage(pageIndex)) return canvas;
    const handwritingCanvas = await renderHandwritingPageToCanvas(pageIndex, dpi);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(handwritingCanvas, 0, 0, canvas.width, canvas.height);
    return canvas;
}

async function saveImageCanvas(canvas, filename, mimeType, directoryHandle) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, 0.95));
    await saveBlobFile(blob, filename, mimeType, directoryHandle);
}

async function saveBlobFile(blob, filename, mimeType, directoryHandle) {
    if (!blob) return;
    if (directoryHandle) {
        const handle = await directoryHandle.getFileHandle(filename, { create: true });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
    }

    if (window.showSaveFilePicker) {
        const ext = filename.split('.').pop();
        const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: ext.toUpperCase(), accept: { [mimeType]: [`.${ext}`] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function buildImageExportFilename(template, pageIndex, selectedCount, ext) {
    const sheetLabel = getImageExportPageLabel(pageIndex);
    let baseName = template
        .replace(/%title/g, metaData.title || 'timesheet')
        .replace(/%episode/g, metaData.subTitle || '')
        .replace(/%scene/g, metaData.scene || '')
        .replace(/%cut/g, metaData.cut || '001')
        .replace(/%page/g, String(pageIndex + 1))
        .replace(/%sheet/g, sheetLabel);
    const totalPages = (typeof getTotalPages === 'function') ? getTotalPages() : selectedCount;
    if (!/%page|%sheet/.test(template) && totalPages > 1) {
        baseName += `_${pageIndex + 1}`;
    }
    baseName = baseName.replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    baseName = sanitizeImageExportFilename(baseName || 'timesheet');
    return `${baseName}.${ext}`;
}

function buildImageExportBundleFilename(template, ext) {
    let baseName = template
        .replace(/%title/g, metaData.title || 'timesheet')
        .replace(/%episode/g, metaData.subTitle || '')
        .replace(/%scene/g, metaData.scene || '')
        .replace(/%cut/g, metaData.cut || '001')
        .replace(/%page/g, 'all')
        .replace(/%sheet/g, 'all');
    baseName = baseName.replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    baseName = sanitizeImageExportFilename(baseName || 'timesheet');
    return `${baseName}.${ext}`;
}

function sanitizeImageExportFilename(name) {
    return name.replace(/[\\/:*?"<>|]/g, '_');
}

// PNG/JPG エクスポート
async function exportTemplateImage(format, dpi) {
    openImageExportDialog(format, dpi);
}
