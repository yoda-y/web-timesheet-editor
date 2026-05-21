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
// 外部テンプレ専用: image-only (白背景+画像のみ。BBox描画なし) — PSDのtemplate層用
// 標準A3 と同じパターン (白塗り → 内容) にして makeWhiteTransparentPsdImageData 適用可能にする
function renderExternalTemplateImageOnly(dpi, pageIndex) {
    const canvas = createTemplateCanvas(dpi);
    const ctx = canvas.getContext('2d');
    // まず白背景
    ctx.fillStyle = (typeof TEMPLATE !== 'undefined' && TEMPLATE.BG_COLOR) || '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const extImg = (typeof getCurrentExternalTemplateImage === 'function') ? getCurrentExternalTemplateImage() : null;
    if (!extImg) return canvas;
    const cw = canvas.width, ch = canvas.height;
    const iw = extImg.naturalWidth || extImg.width;
    const ih = extImg.naturalHeight || extImg.height;
    if (iw > 0 && ih > 0) {
        const ratio = Math.min(cw / iw, ch / ih);
        const dw = iw * ratio;
        const dh = ih * ratio;
        const dx = (cw - dw) / 2;
        const dy = (ch - dh) / 2;
        ctx.drawImage(extImg, dx, dy, dw, dh);
    }
    return canvas;
}
window.renderExternalTemplateImageOnly = renderExternalTemplateImageOnly;

// 外部テンプレ専用: data-only (透明背景+BBox描画のみ。画像なし) — PSDのdata層用
// グレーアウト等の半透明描画を保持するため白塗りはしない (native alpha を維持)
function renderExternalTemplateDataOnly(dpi, pageIndex) {
    const canvas = createTemplateCanvas(dpi);
    const ctx = canvas.getContext('2d');
    const scale = dpi / 25.4;
    const extTpl = (typeof getCurrentExternalTemplate === 'function') ? getCurrentExternalTemplate() : null;
    const extImg = (typeof getCurrentExternalTemplateImage === 'function') ? getCurrentExternalTemplateImage() : null;
    if (!extTpl || !extImg) return canvas;
    const cw = canvas.width, ch = canvas.height;
    const iw = extImg.naturalWidth || extImg.width;
    const ih = extImg.naturalHeight || extImg.height;
    if (iw <= 0 || ih <= 0) return canvas;
    const ratio = Math.min(cw / iw, ch / ih);
    const dw = iw * ratio;
    const dh = ih * ratio;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    const bboxToCanvas = (b) => ({ x: dx + b.x * dw, y: dy + b.y * dh, w: b.w * dw, h: b.h * dh });
    const pageOffset = (typeof getExternalTemplatePageStartFrame === 'function')
        ? getExternalTemplatePageStartFrame(pageIndex)
        : 0;
    drawExternalTemplateMetaBoxes(ctx, extTpl, bboxToCanvas, scale, pageIndex);
    drawExternalTemplateTimelineBoxes(ctx, extTpl, bboxToCanvas, scale, pageOffset);
    drawExternalTemplateBooks(ctx, extTpl, bboxToCanvas, scale, pageIndex);
    return canvas;
}
window.renderExternalTemplateDataOnly = renderExternalTemplateDataOnly;

function renderTemplate(dpi, pageIndex = 0) {
    const canvas = createTemplateCanvas(dpi);
    const ctx = canvas.getContext('2d');
    const scale = dpi / 25.4;
    const m = (mm) => mm * scale;

    // 外部テンプレートが選択されていれば、画像のみを描画してreturn
    const extTpl = (typeof getCurrentExternalTemplate === 'function') ? getCurrentExternalTemplate() : null;
    const extImg = (typeof getCurrentExternalTemplateImage === 'function') ? getCurrentExternalTemplateImage() : null;
    if (extTpl && extImg) {
        ctx.fillStyle = TEMPLATE.BG_COLOR;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const cw = canvas.width, ch = canvas.height;
        const iw = extImg.naturalWidth || extImg.width;
        const ih = extImg.naturalHeight || extImg.height;
        if (iw > 0 && ih > 0) {
            const ratio = Math.min(cw / iw, ch / ih);
            const dw = iw * ratio;
            const dh = ih * ratio;
            const dx = (cw - dw) / 2;
            const dy = (ch - dh) / 2;
            ctx.drawImage(extImg, dx, dy, dw, dh);

            // Phase 3b: メタ/staff BBox 描画
            const bboxToCanvas = (b) => ({
                x: dx + b.x * dw,
                y: dy + b.y * dh,
                w: b.w * dw,
                h: b.h * dh
            });
            // ページオフセット計算（外部テンプレ用ページング）
            const pageOffset = (typeof getExternalTemplatePageStartFrame === 'function')
                ? getExternalTemplatePageStartFrame(pageIndex)
                : 0;
            drawExternalTemplateMetaBoxes(ctx, extTpl, bboxToCanvas, scale, pageIndex);
            drawExternalTemplateTimelineBoxes(ctx, extTpl, bboxToCanvas, scale, pageOffset);
            drawExternalTemplateBooks(ctx, extTpl, bboxToCanvas, scale, pageIndex);
        }
        return canvas;
    }

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

// === Phase 3b: 外部テンプレート メタ/staff BBox 描画 ===

function drawExternalTemplateMetaBoxes(ctx, extTpl, bboxToCanvas, scale, pageIndex) {
    if (!extTpl.bboxes || typeof metaData === 'undefined') return;

    // 1ページ目限定で描画するタグ（標準A3のDirection欄ルールに準拠）
    // 将来BOOKラベルを実装する際も同じルールを適用する
    const PAGE1_ONLY_TAGS = new Set(['direction']);
    // hasPage0() の場合は 0ページ(headMargin) があるので、最初の通常ページは pageIndex === 1
    const hasZeroPage = (typeof hasPage0 === 'function') && hasPage0();
    const isFirstPage = (typeof pageIndex !== 'number')
        || (hasZeroPage ? pageIndex === 1 : pageIndex === 0);

    const tagDefs = (window.externalTemplate && window.externalTemplate.tags) || {};

    const getMetaValue = (tag) => {
        const m = metaData;
        switch (tag) {
            case 'title':       return m.title || '';
            case 'episode':     return m.subTitle || '';
            case 'scene':       return m.scene || '';
            case 'cut':         return m.cut || '';
            case 'sheet':       return '';  // 廃止タグ（後方互換: 空文字を返す）
            case 'currentPage': {
                // hasPage0時: pageIndex 0 → 0(headMargin), pageIndex 1 → 1, ...
                // 通常: pageIndex 0 → 1
                const hasZero = (typeof hasPage0 === 'function') && hasPage0();
                const pi = (typeof pageIndex === 'number') ? pageIndex : 0;
                const cp = hasZero ? pi : pi + 1;
                return String(cp);
            }
            case 'totalPages': {
                // 通常ページ数を返す (0ページは含めない)
                const tp = (typeof getTotalPages === 'function') ? getTotalPages() : 1;
                const hasZero = (typeof hasPage0 === 'function') && hasPage0();
                return String(hasZero ? Math.max(1, tp - 1) : tp);
            }
            case 'date':        return '';
            case 'studio':      return '';
            case 'memo':        return '';
            case 'direction':   return m.memo || '';
            case 'lengthFrame': return m.lengthFrame || '';
            case 'lengthSec':   return m.lengthSec || '';
            case 'name':        return m.creator || '';
            case 'director':    return '';
            case 'supervisor':  return '';
            case 'inbetween':   return '';
            case 'custom1':
            case 'custom2':
            case 'custom3':
            case 'custom4':     return (m.customFields && m.customFields[tag]) || '';
            default: return '';
        }
    };

    const MULTILINE_TAGS = ['direction', 'memo'];

    for (const tagKey in extTpl.bboxes) {
        const bbox = extTpl.bboxes[tagKey];
        if (!bbox || !bbox.enabled) continue;

        // 1ページ目限定のタグは、2ページ目以降スキップ
        if (PAGE1_ONLY_TAGS.has(tagKey) && !isFirstPage) continue;

        const tagDef = tagDefs[tagKey];
        if (!tagDef) continue;
        if (tagDef.category !== 'meta' && tagDef.category !== 'staff' && tagDef.category !== 'custom') continue;

        let value = getMetaValue(tagKey);
        if (!value) continue;

        if (tagDef.prefixable && bbox.prefix) {
            value = bbox.prefix + value;
        }

        const rect = bboxToCanvas(bbox);

        ctx.save();
        ctx.fillStyle = '#000000';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        const isMultiline = MULTILINE_TAGS.includes(tagKey) ||
            (tagDef.category === 'custom' && bbox.type === 'multiline');
        const userMm = (() => {
            if (typeof bbox.fontSize === 'number' && bbox.fontSize > 0) return bbox.fontSize;
            if (tagKey === 'direction') return (typeof settings !== 'undefined' && settings.draw && settings.draw.fontSize && settings.draw.fontSize.direction) || 3.5;
            return (typeof settings !== 'undefined' && settings.draw && settings.draw.fontSize && settings.draw.fontSize.metaValue) || 4.5;
        })();
        if (isMultiline) {
            // direction は BOOK/タイムラインを自動回避 + 多列自動展開
            if (tagKey === 'direction') {
                const effectiveRect = clipDirectionRectForExternal(rect, extTpl, bboxToCanvas);
                drawWrappedMultiColumnText(ctx, value, effectiveRect, scale, userMm, {
                    minCols: 1, maxCols: 6, drawDividers: true
                });
            } else {
                drawMultilineInBBox(ctx, value, rect, scale, userMm);
            }
        } else {
            const padding = Math.max(1, rect.w * 0.04);
            const usableW = Math.max(1, rect.w - padding * 2);
            const usableH = Math.max(1, rect.h - padding * 2);
            const fontSize = fitTextSize(ctx, value, usableW, usableH, Math.min(usableH * 0.85, userMm * scale));
            ctx.font = `${fontSize}px sans-serif`;
            ctx.fillText(value, rect.x + rect.w / 2, rect.y + rect.h / 2);
        }
        ctx.restore();
    }
}

// 外部テンプレ Direction 専用: BBox を BOOK / timeline と干渉しないようクリップ
// 戻り値: 効果的に使える rect (高さ縮小可能性あり)
function clipDirectionRectForExternal(rect, extTpl, bboxToCanvas) {
    if (!extTpl || !extTpl.bboxes) return rect;
    let bottomLimit = rect.y + rect.h;
    const dirL = rect.x, dirR = rect.x + rect.w;
    const m = (mm) => mm * (rect.w > 0 ? rect.w / rect.w : 1);  // scaleが取れないのでpx直接指定

    // BOOK 積み上げの最大行数を計算 (drawExternalTemplateBooks と同じロジック)
    let bookMaxRow = 0;
    if (typeof booksData !== 'undefined' && booksData && booksData['ACTION']) {
        const allBookCounts = [];
        for (const lineIdx in booksData['ACTION']) {
            const books = booksData['ACTION'][lineIdx];
            if (books && books.length) allBookCounts.push(books.length);
        }
        // 各カラムのBOOK数の最大値が概ね積み上げの最大行数 (簡易計算)
        bookMaxRow = allBookCounts.length ? Math.max(...allBookCounts) - 1 : 0;
    }

    Object.entries(extTpl.bboxes).forEach(([tag, bb]) => {
        if (!bb || !bb.enabled) return;
        if (tag === 'direction') return;
        const cat = (window.externalTemplate && window.externalTemplate.tags && window.externalTemplate.tags[tag]) ? window.externalTemplate.tags[tag].category : '';
        if (cat !== 'timeline' && cat !== 'custom') return;
        const r = bboxToCanvas(bb);
        const overlapX = !(r.x + r.w < dirL || r.x > dirR);
        if (!overlapX) return;
        if (r.y >= rect.y) {
            let reserve = 0;
            // action1: BOOK 領域を考慮 (drawExternalTemplateBooks と同じ計算)
            //   baseBookY = action1.y - cellH * 2
            //   bookBoxH ≈ 約4.5mm相当 → px換算 (rect.h を 72cells 想定で逆算は不可なので近似値)
            //   topmost book = baseBookY - bookBoxH - maxRow * bookRowH
            if (tag === 'action1') {
                const frames = bb.frames || 72;
                const cellH = r.h / frames;
                // 4.5mm/6mm を cellHから逆算する代わりに、px ベースの近似:
                //   bookBoxH ≈ cellH * 1.5、bookRowH ≈ cellH * 2.0 (typical 3mmrowH時)
                //   safer: 直接px ベース、ただしdpiにそって調整
                // bbox.frames=72 / cellH=2.4mm を想定すると bookBoxH=4.5mm ≈ 1.875*cellH
                const bookBoxH = cellH * 1.875;  // ≈ 4.5mm 相当 (cellH=2.4mm想定)
                const bookRowH = cellH * 2.5;    // ≈ 6mm 相当
                const cellsAbove = cellH * 2;     // 2コマ分余裕
                reserve = cellsAbove + bookBoxH + bookMaxRow * bookRowH + cellH * 0.5;
            }
            const effectiveTop = r.y - reserve;
            if (effectiveTop < bottomLimit) bottomLimit = effectiveTop;
        }
    });
    const newH = Math.max(rect.h * 0.2, bottomLimit - rect.y);
    return { x: rect.x, y: rect.y, w: rect.w, h: newH };
}

// 文字単位の自動折り返し + 多列自動展開
// options: { minCols, maxCols, drawDividers, dividerColor }
function drawWrappedMultiColumnText(ctx, text, rect, scale, fontMm, options) {
    options = options || {};
    const minCols = options.minCols || 1;
    const maxCols = options.maxCols || 6;
    const drawDividers = options.drawDividers !== false;
    const dividerColor = options.dividerColor || (typeof TEMPLATE !== 'undefined' && TEMPLATE.TEMPLATE_COLOR) || '#999';
    const padding = Math.max(2, rect.w * 0.02);
    const colGap = Math.max(2, rect.w * 0.015);
    const baseFontSize = (fontMm != null ? fontMm : 3.5) * scale;
    const lineH = baseFontSize * 1.2;
    const rawLines = String(text || '').split(/\r?\n/);

    // 指定列数でテキストを折り返した結果を返す
    const wrapWithCols = (numCols) => {
        const colW = (rect.w - padding * 2 - colGap * (numCols - 1)) / numCols;
        ctx.font = `${baseFontSize}px sans-serif`;
        const lines = [];
        rawLines.forEach(line => {
            if (line.length === 0) { lines.push(''); return; }
            let buf = '';
            for (const ch of line) {
                const test = buf + ch;
                if (ctx.measureText(test).width > colW - scale && buf.length > 0) {
                    lines.push(buf);
                    buf = ch;
                } else {
                    buf = test;
                }
            }
            if (buf) lines.push(buf);
        });
        const usableH = rect.h - padding * 2;
        const maxLinesPerCol = Math.max(1, Math.floor(usableH / lineH));
        const requiredCols = Math.ceil(lines.length / maxLinesPerCol);
        return { lines, colW, maxLinesPerCol, requiredCols };
    };

    // 列数を minCols から増やして必要列数に追いつくまで
    let numCols = minCols;
    let result = wrapWithCols(numCols);
    while (result.requiredCols > numCols && numCols < maxCols) {
        numCols++;
        result = wrapWithCols(numCols);
    }
    const { lines, colW, maxLinesPerCol } = result;

    // 描画
    ctx.fillStyle = (typeof TEMPLATE !== 'undefined' && TEMPLATE.TEXT_COLOR) || '#000';
    ctx.font = `${baseFontSize}px sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    let colIdx = 0, lineInCol = 0;
    let usedCols = 1;
    for (let i = 0; i < lines.length; i++) {
        if (colIdx >= numCols) break;
        const x = rect.x + padding + colIdx * (colW + colGap);
        const y = rect.y + padding + lineInCol * lineH;
        if (y + lineH > rect.y + rect.h) {
            // 列満杯 → 次の列へ
            colIdx++;
            lineInCol = 0;
            if (colIdx >= numCols) break;
            i--;  // この行を次列の先頭で再処理
            continue;
        }
        if (lines[i]) ctx.fillText(lines[i], x, y);
        lineInCol++;
        usedCols = Math.max(usedCols, colIdx + 1);
        if (lineInCol >= maxLinesPerCol && colIdx < numCols - 1) {
            colIdx++;
            lineInCol = 0;
        }
    }

    // 列区切り線
    if (drawDividers && usedCols > 1) {
        ctx.save();
        ctx.strokeStyle = dividerColor;
        ctx.lineWidth = Math.max(0.5, scale * 0.15);
        for (let c = 0; c < usedCols - 1; c++) {
            const divX = rect.x + padding + (c + 1) * colW + c * colGap + colGap / 2;
            ctx.beginPath();
            ctx.moveTo(divX, rect.y + padding);
            ctx.lineTo(divX, rect.y + rect.h - padding);
            ctx.stroke();
        }
        ctx.restore();
    }
}

function drawMultilineInBBox(ctx, text, rect, scale, fontMm) {
    const padding = Math.max(2, rect.w * 0.02);
    const usableW = Math.max(1, rect.w - padding * 2);
    const usableH = Math.max(1, rect.h - padding * 2);

    const rawLines = text.split(/\r?\n/);
    // フォントサイズ: 呼び出し元から fontMm を受け取る（未指定時は metaValue or 4.5mm）
    const userMm = fontMm != null ? fontMm : ((typeof settings !== 'undefined' && settings.draw && settings.draw.fontSize && settings.draw.fontSize.metaValue) || 4.5);
    const baseFontSize = Math.min(userMm * scale, usableH / Math.max(rawLines.length, 1) * 0.7);
    ctx.font = `${baseFontSize}px sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    const wrappedLines = [];
    rawLines.forEach(line => {
        if (!line) { wrappedLines.push(''); return; }
        let buf = '';
        for (const ch of line) {
            const test = buf + ch;
            if (ctx.measureText(test).width > usableW && buf.length > 0) {
                wrappedLines.push(buf);
                buf = ch;
            } else {
                buf = test;
            }
        }
        if (buf) wrappedLines.push(buf);
    });

    const lineHeight = baseFontSize * 1.2;
    let y = rect.y + padding;
    for (const line of wrappedLines) {
        if (y + lineHeight > rect.y + rect.h) break;
        ctx.fillText(line, rect.x + padding, y);
        y += lineHeight;
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

        // BOOKボックス（黒枠のみ、背景塗りなし）
        ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
        ctx.lineWidth = TEMPLATE.LINE_THICK;
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, bw, bookBoxH, m(1));
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
        // fontColorId が設定されていればそのパレット色を使用
        const colorId = data.fontColorId || 0;
        const cellColor = (colorId > 0 && typeof getFontColorById === 'function')
            ? getFontColorById(colorId)
            : TEMPLATE.TEXT_COLOR;
        ctx.fillStyle = cellColor;
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
            // セル寸法にクランプ + 半透明 (外部テンプレと統一)
            const radius = Math.min(m(2.5), colW * 0.42, rowH * 0.42);
            ctx.save();
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = (colorId > 0) ? cellColor : TEMPLATE.TEXT_COLOR;
            ctx.lineWidth = Math.max(1.0, scale * 0.25);
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
            ctx.restore();
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

// セル寸法 (colW/rowH) を渡すと囲いをクランプ + 半透明化
// 渡さない場合は従来通り m(2.5) 固定 (互換)
function drawTemplateOptionMark(ctx, x, y, data, scale, colW, rowH) {
    if (!data || !data.option || !data.value) return;
    if (['●', '○', '×', '―'].includes(data.value)) return;
    const m = (mm) => mm * scale;
    const baseRadius = m(2.5);
    // colW/rowH が渡されたらセル寸法にクランプ + 半透明 (外部テンプレと統一)
    const useClamp = (typeof colW === 'number' && colW > 0) || (typeof rowH === 'number' && rowH > 0);
    const radius = useClamp
        ? Math.min(baseRadius, (colW || baseRadius) * 0.42, (rowH || baseRadius) * 0.42)
        : baseRadius;
    ctx.save();
    if (useClamp) ctx.globalAlpha = 0.5;
    ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
    ctx.lineWidth = useClamp ? Math.max(1.0, scale * 0.25) : TEMPLATE.LINE_FINE;
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
            // ブレ/ランダムブレを横書き + 点線に統一 (Rep系統と表記を揃える)
            // 色: 該当セル data の fontColorId を反映
            let displayLabel = mark.label;
            if (displayLabel === 'ランダムブレ') displayLabel = 'Rブレ';
            const miColorId = (data && data.fontColorId) || 0;
            const miColor = (miColorId > 0 && typeof getFontColorById === 'function')
                ? getFontColorById(miColorId)
                : null;
            ctx.save();
            ctx.fillStyle = miColor || TEMPLATE.TEXT_COLOR;
            ctx.font = `bold ${m(2)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const labelY = y + (f - absoluteStart) * rowH + rowH / 2;
            ctx.fillText(displayLabel, tx, labelY);
            ctx.restore();

            const lineStartF = Math.max(f + 1, absoluteStart);
            const lineEndF = Math.min(endF, endFrame - 1, targetFrames - 1);
            if (lineEndF >= lineStartF) {
                const top = y + (lineStartF - absoluteStart) * rowH;
                const bottom = y + (lineEndF - absoluteStart + 1) * rowH;
                ctx.strokeStyle = miColor || (mark.random
                    ? 'rgba(180, 90, 220, 0.85)'
                    : ((typeof settings !== 'undefined' && settings.draw.repeatDashColor) || 'rgba(66, 133, 244, 0.8)'));
                ctx.lineWidth = TEMPLATE.LINE_THIN;
                ctx.setLineDash(mark.random ? [m(0.8), m(1.2)] : [m(1), m(1)]);
                ctx.beginPath();
                ctx.moveTo(tx, top);
                ctx.lineTo(tx, bottom);
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

            // 線色: startVal セルの fontColorId を反映 (数字と同色)
            const startCell = cellData[`${colType}-${ci}-${startF}`];
            const startColorId = (startCell && startCell.fontColorId) || 0;
            const lineColor = (startColorId > 0 && typeof getFontColorById === 'function')
                ? getFontColorById(startColorId)
                : TEMPLATE.TEXT_COLOR;
            ctx.strokeStyle = lineColor;

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

    // 下地なしテキスト (rep/firstVal用)。color指定可
    const drawPlainText = (text, px, py, font, color) => {
        ctx.save();
        ctx.font = font;
        ctx.fillStyle = color || TEMPLATE.TEXT_COLOR;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(text), px, py);
        ctx.restore();
    };
    // 縦書き 1セル1文字 (ブレ/ランダムブレ用)。ランダムブレ→Rブレ略記。
    const drawVerticalLabelPerCell = (text, px, startY, font) => {
        let label = String(text || '');
        if (label === 'ランダムブレ') label = 'Rブレ';
        const chars = label.split('');
        ctx.save();
        ctx.font = font;
        ctx.fillStyle = TEMPLATE.TEXT_COLOR;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        chars.forEach((c, i) => ctx.fillText(c, px, startY + rowH * (i + 0.5)));
        ctx.restore();
        return { top: startY, bottom: startY + rowH * chars.length, charCount: chars.length };
    };

    const targetFrames = (parseInt(metaData.lengthSec) || 0) * 24 + (parseInt(metaData.lengthFrame) || 0);
    const endFrame = absoluteStart + TEMPLATE.FRAMES_PER_COL;
    const drawFrameLimit = Math.max(targetFrames, endFrame);
    if (drawFrameLimit <= 0) return;

    for (let ci = 0; ci < colCount; ci++) {
        // 列データ収集（Rep継続が尺を超える場合も検出するため範囲拡張）
        const colData = [];
        for (let f = 0; f < drawFrameLimit; f++) {
            colData[f] = cellData[`ACTION-${ci}-${f}`] || null;
        }

        // リピート・止め検出
        const repeats = checkRepeatColumns(colData, drawFrameLimit, ci);
        const tx = x + ci * colW + colW / 2;

        repeats.forEach(r => {
            if (r.isHold) {
                // 止め描画 (外部テンプレと同じ方針: 下地なし・セル中央・2セル分割)
                const holdFrame = 1;
                if (holdFrame >= endFrame) return;

                ctx.save();
                ctx.fillStyle = TEMPLATE.TEXT_COLOR;
                ctx.font = `bold ${Math.min(rowH * 0.8, m(2.2))}px "Yu Gothic UI", "Meiryo", sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                if (holdFrame >= absoluteStart && holdFrame < endFrame) {
                    const y1 = y + (holdFrame - absoluteStart) * rowH;
                    ctx.fillText('止', tx, y1 + rowH * 0.5);
                }
                if (holdFrame + 1 >= absoluteStart && holdFrame + 1 < endFrame) {
                    const y2 = y + (holdFrame + 1 - absoluteStart) * rowH;
                    ctx.fillText('メ', tx, y2 + rowH * 0.5);
                }
                ctx.restore();
            } else {
                // Rep描画
                const chunkStartFrame = r.startF + r.chunkLen;
                if (chunkStartFrame < absoluteStart || chunkStartFrame >= endFrame) return;

                const firstData = colData[r.startF] || null;
                const firstVal = firstData?.value || '';
                const repY = y + (chunkStartFrame - absoluteStart) * rowH;

                // 色: firstData の fontColorId を Rep 全体に反映
                const repColorId = (firstData && firstData.fontColorId) || 0;
                const repColor = (repColorId > 0 && typeof getFontColorById === 'function')
                    ? getFontColorById(repColorId)
                    : null;
                const repLineColor = repColor || 'rgba(66, 133, 244, 0.8)';

                // 先頭セル番号 (下地なし)
                drawPlainText(firstVal, tx, repY + rowH / 2, `bold ${m(2.2) * getFontScale('cell')}px sans-serif`, repColor);
                drawTemplateOptionMark(ctx, tx, repY + rowH / 2, firstData, scale, colW, rowH);

                // "rep" (下地なし)
                const repTextFrame = chunkStartFrame + 1;
                if (repTextFrame >= absoluteStart && repTextFrame < endFrame && repTextFrame < drawFrameLimit) {
                    const repTextY = y + (repTextFrame - absoluteStart) * rowH;
                    drawPlainText('rep', tx, repTextY + rowH / 2, `bold ${m(2)}px sans-serif`, repColor);
                }

                // 点線
                const lineStartF = repTextFrame + 1;
                const lineEndF = Math.min(r.endF - 1, chunkStartFrame + 6, drawFrameLimit - 1);
                if (lineEndF >= lineStartF && lineStartF >= absoluteStart && lineStartF < endFrame) {
                    const lineStartY = y + (lineStartF - absoluteStart) * rowH;
                    const lineEndY = y + (Math.min(lineEndF, endFrame - 1) - absoluteStart + 1) * rowH;

                    ctx.strokeStyle = repLineColor;
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

            // 色: firstData の fontColorId を Rep 全体に反映
            const cRepColorId = (firstData && firstData.fontColorId) || 0;
            const cRepColor = (cRepColorId > 0 && typeof getFontColorById === 'function')
                ? getFontColorById(cRepColorId)
                : null;
            const cRepLineColor = cRepColor || ((typeof settings !== 'undefined' && settings.draw.repeatDashColor) || 'rgba(66, 133, 244, 0.8)');

            if (chunkStartFrame >= absoluteStart && chunkStartFrame < endFrame) {
                const repY = y + (chunkStartFrame - absoluteStart) * rowH;
                drawPlainText(firstVal, tx, repY + rowH / 2, `bold ${m(2.2) * getFontScale('cell')}px sans-serif`, cRepColor);
                drawTemplateOptionMark(ctx, tx, repY + rowH / 2, firstData, scale, colW, rowH);
            }

            const repTextFrame = chunkStartFrame + 1;
            let labelBox = null;
            if (repTextFrame >= absoluteStart && repTextFrame < endFrame && repTextFrame < drawFrameLimit) {
                const repTextY = y + (repTextFrame - absoluteStart) * rowH;
                const label = typeof getRepeatLabel === 'function' ? getRepeatLabel(rep) : 'rep';
                let displayLabel = label;
                if (displayLabel === 'ランダムブレ') displayLabel = 'Rブレ';
                const labelFont = (displayLabel === 'rep')
                    ? `bold ${m(2)}px sans-serif`
                    : `${m(1.8)}px "Yu Gothic UI", "Meiryo", sans-serif`;
                drawPlainText(displayLabel, tx, repTextY + rowH / 2, labelFont, cRepColor);
                labelBox = { bottom: repTextY + rowH };
            }

            const lineStartF = repTextFrame + 1;
            const lineEndF = Math.min(rep.endF, chunkStartFrame + 6, drawFrameLimit - 1);
            if (lineEndF >= lineStartF && lineStartF >= absoluteStart && lineStartF < endFrame) {
                const baseLineStartY = y + (lineStartF - absoluteStart) * rowH;
                const lineStartY = labelBox ? Math.max(baseLineStartY, labelBox.bottom + m(0.4)) : baseLineStartY;
                const lineEndY = y + (Math.min(lineEndF, endFrame - 1) - absoluteStart + 1) * rowH;
                ctx.strokeStyle = cRepLineColor;
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

        // ページ範囲でクリップ
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

        // 主たるページ判定: ブロック開始フレームがこのページ範囲内のときのみ話者名/タイプを描く
        const isPrimaryPage = block.startFrame >= absoluteStart && block.startFrame < endFrame;
        const typeLabel = (typeof getDialogueTypeLabel === 'function') ? getDialogueTypeLabel(block.dialogueType) : null;

        // 話者名: 元位置 (ブロック内上部、枠なし、主たるページのみ)
        if (isPrimaryPage && block.speakerName && !isShort) {
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
        // タイプラベル (normal以外、主たるページのみ): 話者名の下に小さめで併記
        if (isPrimaryPage && typeLabel && !isShort) {
            let typeFontSize = m(2.0) * getFontScale('dialogue');
            ctx.font = `${typeFontSize}px sans-serif`;
            ctx.textAlign = 'center';
            const typeY = block.speakerName ? trueStartY + m(6) : trueStartY + m(3);
            ctx.fillText(typeLabel, tx + colW / 2, typeY);
            textStartY = block.speakerName ? trueStartY + m(9) : trueStartY + m(6);
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

        // テキスト背景描画ヘルパー (no-op: 下地撤廃で外部テンプレと統一)
        const drawTextBg = () => {};
        // ラベル右優先・左フォールバック (外部テンプレ pickLabelXSide 相当)
        // 標準A3 では body 全幅を境界に使用 (BBox外余白なし)
        const pickLabelXStd = (cxArg, offset, estLabelW) => {
            const margin = m(0.5);
            const halfW = estLabelW / 2;
            const rightX = cxArg + offset;
            const leftX = cxArg - offset;
            // page範囲はctx.canvas.width で代用 (粗いがstd A3では十分)
            const pageW = (ctx.canvas && ctx.canvas.width) || (x + colW * colCount);
            if (rightX + halfW <= pageW - margin) return rightX;
            if (leftX - halfW >= margin) return leftX;
            return Math.min(Math.max(rightX, margin + halfW), pageW - margin - halfW);
        };
        // 主要範囲線幅 (外部テンプレ rangeLineW 相当)
        const rangeLineW = Math.max(1.6, scale * 0.35);
        const chooseOpenLabelTop = (desiredCenter, labelH, avoidRanges, topLimit, bottomLimit) => {
            const safeTop = topLimit + m(1);
            const safeBottom = bottomLimit - m(1);
            const blocked = avoidRanges
                .map(r => ({ top: Math.max(safeTop, r.top), bottom: Math.min(safeBottom, r.bottom) }))
                .filter(r => r.bottom > r.top)
                .sort((a, b) => a.top - b.top);
            const free = [];
            let cur = safeTop;
            blocked.forEach(r => {
                if (r.top > cur) free.push({ top: cur, bottom: r.top });
                cur = Math.max(cur, r.bottom);
            });
            if (cur < safeBottom) free.push({ top: cur, bottom: safeBottom });
            if (!free.length) return Math.max(safeTop, Math.min(safeBottom - labelH, desiredCenter - labelH / 2));
            const scored = free.map(r => {
                const canFit = (r.bottom - r.top) >= labelH;
                const top = canFit
                    ? Math.max(r.top, Math.min(r.bottom - labelH, desiredCenter - labelH / 2))
                    : r.top + (r.bottom - r.top - labelH) / 2;
                return { top, canFit, distance: Math.abs((top + labelH / 2) - desiredCenter), size: r.bottom - r.top };
            }).sort((a, b) => (b.canFit - a.canFit) || (a.distance - b.distance) || (b.size - a.size));
            return scored[0].top;
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
            const kindFontSize = m(2.2) * getFontScale('camera');
            const kindCharH = m(2.8) * getFontScale('camera');
            const targetCharH = m(2.2) * getFontScale('camera');
            const kindTopY = isLongBlock ? (startY + rowH * 7) : (startY + (endY - startY) / 2 - (kindChars.length * kindCharH) / 2);
            const midY = kindTopY + (kindChars.length * kindCharH) / 2;
            let labelBgH = kindChars.length * kindCharH;
            if (tgtList.length) {
                labelBgH += m(1);
                tgtList.forEach(l => { labelBgH += `[${l}]`.length * targetCharH + m(1); });
            }
            const labelBgW = Math.max(m(4.2), kindFontSize * 1.45);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
            ctx.fillRect(lineX - labelBgW / 2, kindTopY - m(0.8), labelBgW, labelBgH + m(1.6));
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            drawVerticalLabel(pKind, lineX, midY, kindFontSize, kindCharH);
            // tgts縦書き（レイヤーごとに区切って積み上げ）
            if (tgtList.length) {
                ctx.font = `${m(1.8) * getFontScale('camera')}px sans-serif`;
                ctx.textAlign = 'center';
                let curY = kindTopY + kindChars.length * kindCharH + m(1);
                tgtList.forEach(l => {
                    const ch = `[${l}]`.split('');
                    ch.forEach((c, i) => {
                        ctx.fillText(c, lineX, adjustCharY(curY + i * targetCharH, targetCharH));
                    });
                    curY += ch.length * targetCharH + m(1);
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
            // 処理・効果系: 範囲線 + 縦書き指示テキスト (太め+右寄せラベル)
            const lineX = tx + drawWidth / 2;
            ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            ctx.lineWidth = rangeLineW;
            if (block.startFrame >= absoluteStart) {
                ctx.beginPath(); ctx.moveTo(lineX - m(2), startY); ctx.lineTo(lineX + m(2), startY); ctx.stroke();
            }
            if (block.endFrame < endFrame) {
                ctx.beginPath(); ctx.moveTo(lineX - m(2), endY); ctx.lineTo(lineX + m(2), endY); ctx.stroke();
            }
            ctx.beginPath(); ctx.moveTo(lineX, startY); ctx.lineTo(lineX, endY); ctx.stroke();
            ctx.lineWidth = TEMPLATE.LINE_THIN;
            // 縦書き: [layer1] [layer2] ... [layerN] pKind の順で積み上げ
            const charH = m(2.6) * getFontScale('camera');
            const fontSize = m(2.1) * getFontScale('camera');
            const tgtSegments = tgtList.map(l => `[${l}]`.split(''));
            const pKindChars = pKind.split('');
            const totalChars = tgtSegments.reduce((s, seg) => s + seg.length, 0) + pKindChars.length + tgtSegments.length;
            const labelTopY = isLongBlock ? (startY + rowH * 7) : (startY + (endY - startY) / 2 - (totalChars * charH) / 2);
            // 下地撤廃 (外部テンプレと統一)
            // ラベル位置: ライン右寄せ。BBoxからはみ出すなら左に逃がす
            const labelX = pickLabelXStd(lineX, m(2.5), fontSize + m(1));
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            ctx.font = `${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            let curY = labelTopY + charH / 2;
            const drawCharAdj = (c) => {
                ctx.fillText(c, labelX, adjustCharY(curY, charH));
                curY += charH;
            };
            tgtSegments.forEach(seg => {
                seg.forEach(drawCharAdj);
                curY += charH;
            });
            pKindChars.forEach(drawCharAdj);
        } else if (vt === 'fromTo' || vt === 'multiLayerDirection') {
            // fromTo: 矢印と縦線 + 中間点 (太め+ラベル右寄せ/自動逃がし)
            const lineX = tx + m(2.2);
            let labelX = lineX + m(3.6);
            ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            // 上下矢印
            ctx.beginPath(); ctx.moveTo(lineX - m(1), startY); ctx.lineTo(lineX + m(1), startY); ctx.lineTo(lineX, startY + m(1.5)); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(lineX - m(1), endY); ctx.lineTo(lineX + m(1), endY); ctx.lineTo(lineX, endY - m(1.5)); ctx.closePath(); ctx.fill();
            ctx.lineWidth = rangeLineW;
            ctx.beginPath(); ctx.moveTo(lineX, startY + m(1.5)); ctx.lineTo(lineX, endY - m(1.5)); ctx.stroke();
            ctx.lineWidth = TEMPLATE.LINE_THIN;
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
                            ctx.fillText(wp.label, lineX + m(2), wpY + m(0.8));
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
            if (block.fromText) ctx.fillText(block.fromText, lineX + m(2), startY + m(3));
            if (block.toText) ctx.fillText(block.toText, lineX + m(2), endY - m(1));
            // kind縦書き
            ctx.font = `bold ${m(2.8) * getFontScale('camera')}px sans-serif`;
            ctx.textAlign = 'center';
            const chars = pKind.split('');
            const midY = labelAnchorY;
            const charH = m(3.5) * getFontScale('camera');
            const targetGap = m(3.2);
            const targetBlockH = tgtList.length ? tgtList.length * targetGap + m(1.4) : 0;
            const labelTotalH = targetBlockH + chars.length * charH;
            const avoidRanges = [];
            if (block.fromText) avoidRanges.push({ top: startY + m(3) - m(3.2), bottom: startY + m(3) + m(2) });
            if (block.toText) avoidRanges.push({ top: endY - m(1) - m(3.2), bottom: endY - m(1) + m(2) });
            if (block.waypoints && block.waypoints.length > 0) {
                block.waypoints.forEach(wp => {
                    if (wp.frame >= sF && wp.frame <= eF) {
                        const wpY = y + (wp.frame - absoluteStart) * rowH + rowH / 2;
                        avoidRanges.push({ top: wpY - m(3.4), bottom: wpY + m(3.4) });
                    }
                });
            }
            const labelTopY = chooseOpenLabelTop(midY, labelTotalH, avoidRanges, startY, endY);
            const textStartY = labelTopY + targetBlockH + charH / 2;
            // ラベルX: 右寄せ + ページ幅に応じた自動逃がし
            const kindFontPx = m(2.8) * getFontScale('camera');
            labelX = pickLabelXStd(lineX, m(3.6), kindFontPx + m(1));
            // 下地撤廃
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            chars.forEach((c, i) => {
                if (c === "ー") c = "丨";
                ctx.fillText(c, labelX, textStartY + i * charH);
            });
            if (tgtList.length) {
                ctx.font = `${m(2) * getFontScale('camera')}px sans-serif`;
                let y2 = labelTopY + targetGap;
                tgtList.slice().reverse().forEach(l => {
                    ctx.fillStyle = TEMPLATE.TEXT_COLOR;
                    ctx.fillText(`[${l}]`, labelX, y2);
                    y2 += targetGap;
                });
            }
        } else {
            // デフォルト (fallback): 縦範囲線 + kind縦書き + targets小 (外部テンプレ J 相当)
            const lineX = tx + drawWidth / 2;
            ctx.strokeStyle = TEMPLATE.TEXT_COLOR;
            ctx.lineWidth = rangeLineW;
            if (block.startFrame >= absoluteStart) {
                ctx.beginPath(); ctx.moveTo(lineX - m(2), startY); ctx.lineTo(lineX + m(2), startY); ctx.stroke();
            }
            if (block.endFrame < endFrame) {
                ctx.beginPath(); ctx.moveTo(lineX - m(2), endY); ctx.lineTo(lineX + m(2), endY); ctx.stroke();
            }
            ctx.beginPath(); ctx.moveTo(lineX, startY); ctx.lineTo(lineX, endY); ctx.stroke();
            ctx.lineWidth = TEMPLATE.LINE_THIN;
            const midY = labelAnchorY;
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
            // kind縦書き + targets小、ラベル右寄せ
            const kindFontPx = m(2.5) * getFontScale('camera');
            const kindCharH = kindFontPx * 1.15;
            const tgtFontPx = m(1.8) * getFontScale('camera');
            const tgtCharH = tgtFontPx * 1.2;
            const kindChars = pKind.split('');
            const labelX = pickLabelXStd(lineX, m(3), kindFontPx + m(1));
            const kindMidY = midY;
            const kindStartY = kindMidY - (kindChars.length - 1) * kindCharH / 2;
            ctx.font = `bold ${kindFontPx}px sans-serif`;
            ctx.textAlign = 'center';
            kindChars.forEach((c, i) => {
                ctx.fillText(c === 'ー' ? '丨' : c, labelX, kindStartY + i * kindCharH);
            });
            if (tgtList.length) {
                ctx.font = `${tgtFontPx}px sans-serif`;
                const tgtTopY = kindStartY - kindCharH / 2 - tgtCharH * tgtList.length - m(0.5);
                let ty = tgtTopY + tgtCharH / 2;
                tgtList.forEach(l => { ctx.fillText(`[${l}]`, labelX, ty); ty += tgtCharH; });
            }
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
            ? `${typeof t === 'function' ? t('imageExport.sameAsTdts') : 'TDTSと同じフォルダ'} / ${imageExportDirectoryHandle.name}`
            : (typeof t === 'function' ? t('imageExport.sameAsTdts') : 'TDTSと同じフォルダ');
    } else {
        el.textContent = typeof t === 'function' ? t('imageExport.destinationNotSelected') : '未選択（書き出し時に保存先を選択）';
    }
}

async function chooseImageExportDirectory() {
    if (!window.showDirectoryPicker) {
        alert(typeof t === 'function' ? t('imageExport.noDirectoryPicker') : 'このブラウザでは保存先フォルダを選択できません。ダウンロード保存になります。');
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
    if (countEl) countEl.textContent = typeof t === 'function'
        ? t('imageExport.pagesSelected').replace('{count}', pages.length)
        : `${pages.length}ページ選択`;

    const preview = document.getElementById('image-export-filename-preview');
    if (!preview) return;
    const selectedFormat = document.getElementById('image-export-format')?.value || 'png';
    const format = ['png', 'jpg', 'psd'].includes(selectedFormat) ? selectedFormat : 'png';
    const template = document.getElementById('image-export-filename')?.value.trim() || '%title_%scene_%cut';
    if (pages.length === 0) {
        preview.textContent = typeof t === 'function' ? t('imageExport.noPagesSelected') : '出力するページが選択されていません。';
        return;
    }
    if (format === 'psd' && pages.length > 1) {
        preview.textContent = buildImageExportBundleFilename(template, 'psd');
        return;
    }
    const names = pages.map(pageIndex => buildImageExportFilename(template, pageIndex, pages.length, format));
    preview.textContent = names.slice(0, 8).join('\n') + (names.length > 8
        ? '\n' + (typeof t === 'function' ? t('imageExport.moreFiles').replace('{count}', names.length - 8) : `...ほか ${names.length - 8} 件`)
        : '');
}

async function runImageExportFromDialog() {
    const selectedFormat = document.getElementById('image-export-format').value || 'png';
    const format = ['png', 'jpg', 'psd'].includes(selectedFormat) ? selectedFormat : 'png';
    const dpi = parseInt(document.getElementById('image-export-dpi').value, 10) || TEMPLATE.DPI_EXPORT;
    const filenameTemplate = document.getElementById('image-export-filename').value.trim() || '%title_%scene_%cut';
    const includeHandwriting = document.getElementById('image-export-include-handwriting').checked;
    const pages = getSelectedImageExportPages();
    if (pages.length === 0) {
        alert(typeof t === 'function' ? t('imageExport.selectPagesAlert') : '出力するページを選択してください。');
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
            alert(typeof t === 'function' ? t('imageExport.chooseFolderFailed') : '保存先フォルダの選択に失敗しました。');
            return;
        }
    }

    try {
        setImageExportBusy(true, typeof t === 'function' ? t('imageExport.preparing') : '書き出し準備中...', 0);
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
        alert((typeof t === 'function' ? t('imageExport.saveFailed') : '画像の保存に失敗しました。') + '\n' + (err && err.message ? err.message : ''));
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
        if (options.onProgress) options.onProgress(typeof t === 'function' ? t('imageExport.writingPsd') : 'PSDを書き込み中...', 92);
        await saveBlobFile(blob, filename, mimeType, directoryHandle);
        if (options.onProgress) options.onProgress(typeof t === 'function' ? t('imageExport.done') : '完了', 100);
        return;
    }

    for (let i = 0; i < options.pages.length; i++) {
        const pageIndex = options.pages[i];
        const filename = buildImageExportFilename(options.filenameTemplate, pageIndex, options.pages.length, ext);
        if (options.onProgress) options.onProgress(typeof t === 'function'
            ? t('imageExport.generatingFile').replace('{filename}', filename)
            : `${filename} を生成中...`, Math.round(i / options.pages.length * 90));
        if (format === 'psd') {
            if (typeof buildTemplatePsdBlob !== 'function') throw new Error('PSD exporter is not available.');
            const blob = await buildTemplatePsdBlob(pageIndex, options.dpi, options.includeHandwriting !== false);
            await saveBlobFile(blob, filename, mimeType, directoryHandle);
        } else {
            const canvas = await renderImageExportPageCanvas(pageIndex, options.dpi, options.includeHandwriting !== false);
            await saveImageCanvas(canvas, filename, mimeType, directoryHandle);
        }
        if (options.onProgress) options.onProgress(typeof t === 'function'
            ? t('imageExport.savedFile').replace('{filename}', filename)
            : `${filename} を保存しました`, Math.round((i + 1) / options.pages.length * 100));
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

// BBoxエディタから参照できるよう公開
window.drawExternalTemplateMetaBoxes = drawExternalTemplateMetaBoxes;

// ─── Phase 3c: タイムライン系 BBox 描画 ───────────────────────────────────────

// === TODO (Phase 3c.5以降で対応) ===
// - BOOKラベル描画（※ direction と同じく1ページ目のみ描画ルールを適用すること）
// - 棒線/波線（cell連続時）
// - 止メ / Rep / ブレ / ランダムブレ
// - fontColorId によるセル文字色
// - camera kindの完全描画（FI/WI三角形、O.L砂時計、CAM SHAKE波線等）
// - セルのオプションマーク（OPTION_KEYFRAME 円 / OPTION_REFERENCEFRAME 三角）
// - セリフブロックの話者色（getSpeakerColor相当のパステル背景）
// - 列跨ぎ時のブロック内容重複対策（sound/camera）
//   現状: action1/sound1等のframes1を超えるブロックが action2/sound2 等にも
//   そのまま描画されるため、話者名やkind名が両側で重複する。
//   標準A3で実装済みのクリッピング+真の始終点判定方式を移植する想定。
// =====================================

// 外部テンプレ用 BOOKラベル描画
// - action1 BBox がある場合のみ
// - 1ページ目のみ (pageIndex === 0)
// - action1 の上側にボックスを並べ、各列位置に分岐ライン
function drawExternalTemplateBooks(ctx, extTpl, bboxToCanvas, scale, pageIndex) {
    // 0ページ存在時は最初の通常ページ (pageIndex === 1) で描画
    const hasZeroPage = (typeof hasPage0 === 'function') && hasPage0();
    const firstNormalIdx = hasZeroPage ? 1 : 0;
    if (pageIndex !== firstNormalIdx) return;
    if (typeof booksData === 'undefined' || !booksData || !booksData['ACTION']) return;
    if (!extTpl.bboxes) return;
    const b1 = extTpl.bboxes['action1'];
    if (!b1 || !b1.enabled) return;

    const rect = bboxToCanvas(b1);
    const columns = b1.columns || 5;
    const colW = rect.w / columns;
    const m = (mm) => mm * scale;

    // 全BOOKを収集
    const allBooks = [];
    for (const lineIdx in booksData['ACTION']) {
        const books = booksData['ACTION'][lineIdx];
        const colIndex = parseInt(lineIdx);
        if (colIndex >= columns) continue;
        books.forEach((bookName, bookIdx) => {
            const colX = rect.x + colIndex * colW;
            allBooks.push({ text: bookName, colIndex, x: colX, seq: bookIdx });
        });
    }
    if (allBooks.length === 0) return;

    const bookBoxW = m(11);
    const bookBoxH = m(4.5);
    const bookRowH = m(6);

    // 文字幅で自動拡張
    ctx.font = `bold ${m(2.2)}px sans-serif`;
    allBooks.forEach(book => {
        const tw = ctx.measureText(book.text || '').width;
        book.boxW = Math.max(bookBoxW, tw + m(3));
    });

    allBooks.sort((a, b) => a.x !== b.x ? a.x - b.x : a.seq - b.seq);

    // 重なり回避: 行番号割当
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
    });

    // 基準Y (action1の上端から 2コマ分 上)
    const frames1 = b1.frames || 72;
    const cellH = rect.h / frames1;
    const baseBookY = rect.y - cellH * 2;
    const gridY = rect.y;

    // ライン
    allBooks.forEach(book => {
        const colX = book.x;
        const boxX = colX + m(3);
        const boxY = baseBookY - bookBoxH - book.row * bookRowH;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = Math.max(1.4, scale * 0.28);
        ctx.beginPath();
        ctx.moveTo(boxX, boxY + bookBoxH / 2);
        ctx.lineTo(colX, boxY + bookBoxH / 2);
        ctx.lineTo(colX, gridY);
        ctx.stroke();

        // 先端の下向き三角で強調
        ctx.fillStyle = '#000';
        const th = Math.max(m(1.2), scale * 0.6);  // 高さ
        const tw = th * 0.9;                        // 幅
        ctx.beginPath();
        ctx.moveTo(colX, gridY);
        ctx.lineTo(colX - tw / 2, gridY - th);
        ctx.lineTo(colX + tw / 2, gridY - th);
        ctx.closePath();
        ctx.fill();
    });

    // ボックス & テキスト
    allBooks.forEach(book => {
        const colX = book.x;
        const boxX = colX + m(3);
        const boxY = baseBookY - bookBoxH - book.row * bookRowH;
        const bw = book.boxW;
        // 背景塗りなし、枠のみ
        ctx.strokeStyle = '#000';
        ctx.lineWidth = Math.max(1, scale * 0.3);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(boxX, boxY, bw, bookBoxH, m(1));
        else ctx.rect(boxX, boxY, bw, bookBoxH);
        ctx.stroke();

        ctx.fillStyle = '#000';
        ctx.font = `bold ${m(2.2)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(book.text, boxX + bw / 2, boxY + bookBoxH / 2);
    });

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
}

function drawExternalTemplateTimelineBoxes(ctx, extTpl, bboxToCanvas, scale, pageOffset) {
    if (!extTpl.bboxes || typeof cellData === 'undefined') return;
    if (typeof pageOffset !== 'number') pageOffset = 0;

    const groups = [
        { type: 'action', tag1: 'action1', tag2: 'action2' },
        { type: 'cell',   tag1: 'cell1',   tag2: 'cell2'   },
        { type: 'sound',  tag1: 'sound1',  tag2: 'sound2'  },
        { type: 'camera', tag1: 'camera1', tag2: 'camera2' }
    ];

    // 0ページ判定: pageOffset < 0 のとき headMargin 分だけ描画
    const isPage0 = pageOffset < 0;
    const totalToRender = isPage0 ? (-pageOffset) : null;  // null = 通常 (BBox容量分すべて)

    groups.forEach(grp => {
        const b1 = extTpl.bboxes[grp.tag1];
        const b2 = extTpl.bboxes[grp.tag2];
        if (!b1 || !b1.enabled) return;

        const frames1Cap = b1.frames || 72;
        const cols1   = b1.columns || 5;

        // BBox1 で使うフレーム数: 通常は容量分、0ページなら残量と容量の小さい方
        const use1 = isPage0 ? Math.min(totalToRender, frames1Cap) : frames1Cap;
        drawTimelineBBox(ctx, grp.type, b1, bboxToCanvas, scale, pageOffset, pageOffset + use1, cols1, frames1Cap);

        // BBox2: 0ページで残量がなければスキップ
        if (b2 && b2.enabled) {
            const frames2Cap = b2.frames || 72;
            const cols2   = b2.columns || 5;
            const remaining2 = isPage0 ? Math.max(0, totalToRender - use1) : frames2Cap;
            if (remaining2 > 0) {
                drawTimelineBBox(ctx, grp.type, b2, bboxToCanvas, scale, pageOffset + use1, pageOffset + use1 + remaining2, cols2, frames2Cap);
            }
        }
    });
}

// 外部テンプレ ACTION列のRep省略フレームを収集 (止メ範囲は3aでは省略しない)
function computeActionRepeatSkipSet(columns, frameStart, frameEnd) {
    const skip = new Set();
    if (typeof checkRepeatColumns !== 'function' || typeof cellData === 'undefined') return skip;
    const targetF = (parseInt(metaData?.lengthSec) || 0) * 24 + (parseInt(metaData?.lengthFrame) || 0);
    const totalF = Math.max(targetF, frameEnd);
    if (totalF <= 0) return skip;
    for (let ci = 0; ci < columns; ci++) {
        const colData = [];
        for (let f = 0; f < totalF; f++) colData[f] = cellData[`ACTION-${ci}-${f}`] || null;
        const reps = checkRepeatColumns(colData, totalF, ci);
        reps.forEach(r => {
            if (r.isHold) {
                // 止メ: 1コマ目以外を省略
                for (let f = 1; f < r.endF; f++) skip.add(`${ci}-${f}`);
            } else {
                for (let f = r.startF + r.chunkLen; f < r.endF; f++) skip.add(`${ci}-${f}`);
            }
        });
    }
    if (typeof customRepeats !== 'undefined' && Array.isArray(customRepeats)) {
        customRepeats.forEach(rep => {
            if (rep.colType !== 'ACTION') return;
            if (rep.colIndex < 0 || rep.colIndex >= columns) return;
            for (let f = rep.startF; f <= rep.endF; f++) skip.add(`${rep.colIndex}-${f}`);
        });
    }
    return skip;
}

// 外部テンプレ ACTION列のRep/ブレ/ランダムブレ描画 (BBox範囲にクリップ)
// 止メは含まず (3b で対応)
function drawActionRepeatsInBBox(ctx, rect, cellW, cellH, columns, frameStart, frameEnd, scale) {
    if (typeof checkRepeatColumns !== 'function' || typeof cellData === 'undefined') return;
    const m = (mm) => mm * scale;
    const targetF = (parseInt(metaData?.lengthSec) || 0) * 24 + (parseInt(metaData?.lengthFrame) || 0);
    const totalF = Math.max(targetF, frameEnd);
    if (totalF <= 0) return;

    const yOfFrame = (f) => rect.y + (f - frameStart) * cellH;
    const inRange = (f) => f >= frameStart && f < frameEnd;
    const dashColor = (typeof settings !== 'undefined' && settings.draw && settings.draw.repeatDashColor) || 'rgba(66, 133, 244, 0.8)';

    // 下地なしのテキスト描画 (rep/firstVal用)
    const drawPlainText = (text, x, y, font) => {
        ctx.save();
        ctx.font = font;
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(text), x, y);
        ctx.restore();
    };
    // 同上、色指定対応版
    const drawPlainTextColored = (text, x, y, font, color) => {
        ctx.save();
        ctx.font = font;
        ctx.fillStyle = color || '#000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(text), x, y);
        ctx.restore();
    };
    // 縦書きテキスト (1セル1文字、下地なし)
    // ランダムブレは「Rブレ」に略記
    const drawVerticalLabelPerCell = (text, x, startY, font) => {
        let label = String(text || '');
        if (label === 'ランダムブレ') label = 'Rブレ';
        const chars = label.split('');
        ctx.save();
        ctx.font = font;
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        chars.forEach((c, i) => ctx.fillText(c, x, startY + cellH * (i + 0.5)));
        ctx.restore();
        return { top: startY, bottom: startY + cellH * chars.length, charCount: chars.length };
    };

    const drawDashedLine = (tx, lineStartF, lineEndF, overrideColor) => {
        if (lineEndF < lineStartF) return;
        const sf = Math.max(lineStartF, frameStart);
        const ef = Math.min(lineEndF, frameEnd - 1);
        if (ef < sf) return;
        const lineStartY = rect.y + (sf - frameStart) * cellH;
        const lineEndY = rect.y + (ef - frameStart + 1) * cellH;
        ctx.strokeStyle = overrideColor || dashColor;
        ctx.lineWidth = Math.max(0.5, scale * 0.15);
        ctx.setLineDash([m(1), m(1)]);
        ctx.beginPath();
        ctx.moveTo(tx, lineStartY);
        ctx.lineTo(tx, lineEndY);
        ctx.stroke();
        ctx.setLineDash([]);
    };
    // Rep 先頭セル用の小さめ option mark (通常セルと同じ計算)
    // drawTemplateOptionMark は radius=m(2.5) 固定で大きすぎるので、セル寸法にクランプ
    const drawSmallOptionMark = (px, py, data) => {
        if (!data || !data.option || !data.value) return;
        if (['●','○','×','―'].includes(data.value)) return;
        const r = Math.min(scale * 2.5, cellW * 0.42, cellH * 0.42);
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = Math.max(1.0, scale * 0.25);
        if (data.option === 'OPTION_KEYFRAME') {
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.stroke();
        } else if (data.option === 'OPTION_REFERENCEFRAME') {
            ctx.beginPath();
            ctx.moveTo(px, py - r * 1.2);
            ctx.lineTo(px + r, py + r * 0.6);
            ctx.lineTo(px - r, py + r * 0.6);
            ctx.closePath();
            ctx.stroke();
        }
        ctx.restore();
    };

    for (let ci = 0; ci < columns; ci++) {
        const colData = [];
        for (let f = 0; f < totalF; f++) colData[f] = cellData[`ACTION-${ci}-${f}`] || null;
        const reps = checkRepeatColumns(colData, totalF, ci);
        const tx = rect.x + ci * cellW + cellW / 2;

        reps.forEach(r => {
            if (r.isHold) {
                // 止メ: 1コマ目に縦書き「止/メ」を描画
                const holdFrame = 1;
                if (!inRange(holdFrame)) return;
                const holdY = yOfFrame(holdFrame);
                ctx.save();
                ctx.fillStyle = '#000';
                ctx.font = `bold ${Math.min(cellH * 0.8, m(2.2))}px "Yu Gothic UI", "Meiryo", sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('止', tx, holdY + cellH * 0.5);
                if (inRange(holdFrame + 1)) {
                    ctx.fillText('メ', tx, yOfFrame(holdFrame + 1) + cellH * 0.5);
                }
                ctx.restore();
                return;
            }
            const chunkStartFrame = r.startF + r.chunkLen;
            const firstData = colData[r.startF] || null;
            const firstVal = firstData?.value || '';

            // 色: firstData の fontColorId を Rep 全体に反映
            const repColorId = (firstData && firstData.fontColorId) || 0;
            const repColor = (repColorId > 0 && typeof getFontColorById === 'function')
                ? getFontColorById(repColorId)
                : null;

            // 先頭セル番号 (下地なし、囲いは通常セルと同じ小さめ半透明)
            if (inRange(chunkStartFrame)) {
                const repY = yOfFrame(chunkStartFrame);
                drawSmallOptionMark(tx, repY + cellH / 2, firstData);
                drawPlainTextColored(firstVal, tx, repY + cellH / 2, `bold ${m(2.2)}px sans-serif`, repColor);
            }
            // "rep" ラベル (下地なし)
            const repTextFrame = chunkStartFrame + 1;
            if (inRange(repTextFrame) && repTextFrame < totalF) {
                const repTextY = yOfFrame(repTextFrame);
                drawPlainTextColored('rep', tx, repTextY + cellH / 2, `bold ${m(2)}px sans-serif`, repColor);
            }
            // 点線
            const lineStartF = repTextFrame + 1;
            const lineEndF = Math.min(r.endF - 1, chunkStartFrame + 6, totalF - 1);
            drawDashedLine(tx, lineStartF, lineEndF, repColor);
        });
    }

    // customRepeats (ACTION のみ, ブレ/ランダムブレ含む)
    if (typeof customRepeats !== 'undefined' && Array.isArray(customRepeats)) {
        customRepeats.forEach(rep => {
            if (rep.colType !== 'ACTION') return;
            if (rep.colIndex < 0 || rep.colIndex >= columns) return;
            if (rep.endF < frameStart || rep.startF >= frameEnd) return;
            const tx = rect.x + rep.colIndex * cellW + cellW / 2;
            const chunkStartFrame = rep.startF;
            const firstData = rep.pattern?.[0] || null;
            const firstVal = firstData?.value || '';

            // 色: firstData の fontColorId を Rep 全体に反映
            const cRepColorId = (firstData && firstData.fontColorId) || 0;
            const cRepColor = (cRepColorId > 0 && typeof getFontColorById === 'function')
                ? getFontColorById(cRepColorId)
                : null;

            if (inRange(chunkStartFrame)) {
                const repY = yOfFrame(chunkStartFrame);
                drawSmallOptionMark(tx, repY + cellH / 2, firstData);
                drawPlainTextColored(firstVal, tx, repY + cellH / 2, `bold ${m(2.2)}px sans-serif`, cRepColor);
            }

            const repTextFrame = chunkStartFrame + 1;
            let labelBox = null;
            if (inRange(repTextFrame) && repTextFrame < totalF) {
                const repTextY = yOfFrame(repTextFrame);
                const label = typeof getRepeatLabel === 'function' ? getRepeatLabel(rep) : 'rep';
                let displayLabel = label;
                if (displayLabel === 'ランダムブレ') displayLabel = 'Rブレ';
                const labelFont = (displayLabel === 'rep')
                    ? `bold ${m(2)}px sans-serif`
                    : `${Math.min(cellH * 0.7, m(1.8))}px "Yu Gothic UI", "Meiryo", sans-serif`;
                drawPlainTextColored(displayLabel, tx, repTextY + cellH / 2, labelFont, cRepColor);
                labelBox = { bottom: repTextY + cellH };
            }

            const lineStartF = repTextFrame + 1;
            const lineEndF = Math.min(rep.endF, chunkStartFrame + 6, totalF - 1);
            // labelBox 下端より下から線を引く
            if (lineEndF >= lineStartF) {
                const sf = Math.max(lineStartF, frameStart);
                const ef = Math.min(lineEndF, frameEnd - 1);
                if (ef >= sf) {
                    const baseStartY = rect.y + (sf - frameStart) * cellH;
                    const lineStartY = labelBox ? Math.max(baseStartY, labelBox.bottom + m(0.4)) : baseStartY;
                    const lineEndY = rect.y + (ef - frameStart + 1) * cellH;
                    ctx.strokeStyle = cRepColor || dashColor;
                    ctx.lineWidth = Math.max(0.5, scale * 0.15);
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
}

// 外部テンプレ ACTION/CELL の連続線(棒線/波線)描画
// 標準A3 drawBarLines の移植版。BBox座標系で動作。
// - 空白("") / "―" の連続セルを上下の値で繋ぐ縦線
// - 上端の値が "×" なら波線(bezier)、それ以外は棒線
// - autoRep / customRepeat の範囲はスキップ
function drawBarLinesInBBox(ctx, type, rect, cellW, cellH, columns, frameStart, frameEnd, scale) {
    if (typeof cellData === 'undefined') return;
    const upperType = type.toUpperCase();
    const m = (mm) => mm * scale;

    // カット尺
    const targetFrames = (parseInt(metaData?.lengthSec) || 0) * 24 + (parseInt(metaData?.lengthFrame) || 0);
    const endFrame = targetFrames > 0 ? Math.min(frameEnd, targetFrames) : frameEnd;
    const lineGap = parseInt((typeof settings !== 'undefined' && settings?.draw?.lineGap) || '3', 10) || 3;

    const getVal = (ci, f) => {
        const key = `${upperType}-${ci}-${f}`;
        const d = cellData[key];
        if (d && d.value) return d.value;
        if (upperType === 'CELL' && typeof getTemplateCustomRepeatAt === 'function') {
            const rep = getTemplateCustomRepeatAt(upperType, ci, f);
            const repData = (typeof getTemplateCustomRepeatData === 'function') ? getTemplateCustomRepeatData(rep, f) : null;
            return repData?.value || '';
        }
        return '';
    };

    const isLinePiercing = (v) => v === '' || v === '―';

    ctx.save();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = Math.max(0.6, scale * 0.18);

    // autoRep のスキップ範囲 (ACTION のみ)
    // - 非hold: chunk継続部分をスキップ (rep表記領域)
    // - hold: 「止」「メ」が描かれる frame 1, 2 をスキップ (棒線が止メ表記と被らないように)
    const autoRepSkipSet = new Set();
    if (upperType === 'ACTION' && typeof checkRepeatColumns === 'function') {
        const totalF = Math.max(targetFrames, frameEnd);
        if (totalF > 0) {
            for (let ci = 0; ci < columns; ci++) {
                const colDataArr = [];
                for (let f = 0; f < totalF; f++) colDataArr[f] = cellData[`ACTION-${ci}-${f}`] || null;
                const reps = checkRepeatColumns(colDataArr, totalF, ci);
                reps.forEach(r => {
                    if (r.isHold) {
                        // 止メ表記の 「止」(frame 1) と 「メ」(frame 2) のセルをスキップ
                        autoRepSkipSet.add(`${ci}-1`);
                        autoRepSkipSet.add(`${ci}-2`);
                    } else {
                        for (let f = r.startF + r.chunkLen; f < r.endF; f++) autoRepSkipSet.add(`${ci}-${f}`);
                    }
                });
            }
        }
    }

    for (let ci = 0; ci < columns; ci++) {
        const tx = rect.x + ci * cellW + cellW / 2;

        for (let f = frameStart; f < endFrame; f++) {
            if (autoRepSkipSet.has(`${ci}-${f}`)) continue;
            // customRepeat のソース範囲(参照元)もスキップ (ACTION のみ)
            if (upperType === 'ACTION' && typeof customRepeats !== 'undefined' && Array.isArray(customRepeats)) {
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
                if (!isLinePiercing(tmpV)) { startF = tmp; startVal = tmpV; break; }
            }
            if (startF === -1) continue;

            // 下方向で終端を探す。BBox範囲ではなくデータ全体を探索
            // (ページまたぎ時、次値が後続BBoxにあっても正しいgapを得るため)
            const searchEnd = Math.max(targetFrames, frameEnd) || frameEnd;
            let nextF = searchEnd;
            for (let tmp = f + 1; tmp < searchEnd; tmp++) {
                if (!isLinePiercing(getVal(ci, tmp))) { nextF = tmp; break; }
            }

            const gap = nextF - startF - 1;
            if (gap < lineGap) continue;
            if (upperType === 'ACTION' && (f - startF >= 9)) continue;

            const drawY_top = rect.y + (f - frameStart) * cellH;
            const drawY_bottom = rect.y + (f - frameStart + 1) * cellH;

            // 線色: startVal セルの fontColorId を反映 (数字と同色)
            const startCell = cellData[`${upperType}-${ci}-${startF}`];
            const startColorId = (startCell && startCell.fontColorId) || 0;
            const lineColor = (startColorId > 0 && typeof getFontColorById === 'function')
                ? getFontColorById(startColorId)
                : '#000';
            ctx.strokeStyle = lineColor;

            if (startVal === '×') {
                // 波線 (bezier)
                const offset = cellH / 4;
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
    ctx.restore();
}

// 外部テンプレ用: BBox 内のカット尺終わりライン + 尺以降グレー塗り
// 標準A3 drawCutLengthOverlay の BBox 移植版
function drawCutLengthInBBox(ctx, rect, cellH, frameStart, frameEnd, scale) {
    if (typeof metaData === 'undefined') return;
    const lengthSec = parseInt(metaData.lengthSec) || 0;
    const lengthFrame = parseInt(metaData.lengthFrame) || 0;
    const targetFrames = lengthSec * 24 + lengthFrame;
    if (targetFrames <= 0) return;

    const cutFrameInBBox = targetFrames - frameStart;
    const bboxFrames = frameEnd - frameStart;
    const m = (mm) => mm * scale;

    ctx.save();
    if (cutFrameInBBox <= 0) {
        // BBox 全体が尺以降 → 全面グレー
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    } else if (cutFrameInBBox <= bboxFrames) {
        // 尺終わりが BBox 内 (途中 or 末尾ぴったり)
        const cutY = rect.y + cutFrameInBBox * cellH;
        // 尺以降グレーは BBox 途中の場合のみ (末尾ぴったりは塗らない)
        if (cutFrameInBBox < bboxFrames) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(rect.x, cutY, rect.w, (rect.y + rect.h) - cutY);
        }
        // カット尺ライン (太め黒) は末尾ぴったり含めて常に描く
        ctx.strokeStyle = '#000';
        ctx.lineWidth = Math.max(1.5, scale * 0.35);
        ctx.beginPath();
        ctx.moveTo(rect.x, cutY);
        ctx.lineTo(rect.x + rect.w, cutY);
        ctx.stroke();
    }
    // cutFrameInBBox > bboxFrames: BBox 全体が尺内 → 何もしない
    ctx.restore();
}

function drawTimelineBBox(ctx, type, bbox, bboxToCanvas, scale, frameStart, frameEnd, columns, bboxCapacity) {
    const rect = bboxToCanvas(bbox);
    if (rect.w <= 0 || rect.h <= 0) return;

    const cellW = rect.w / columns;
    const usedFrames = frameEnd - frameStart;
    if (usedFrames <= 0) return;
    // cellH は BBox容量基準 (bboxCapacity未指定なら usedFrames で互換)
    // → 0ページで一部しか使わない時でもセル高が変わらない
    const capacity = (typeof bboxCapacity === 'number' && bboxCapacity > 0) ? bboxCapacity : usedFrames;
    const cellH = rect.h / capacity;

    ctx.save();

    // BBox個別の文字サイズ (mm)。未設定なら null を渡す（呼出先がデフォルト適用）
    const bboxFontMm = (typeof bbox.fontSize === 'number' && bbox.fontSize > 0) ? bbox.fontSize : null;

    if (type === 'action' || type === 'cell') {
        // ACTION列のみ Rep省略を有効化
        const skipSet = (type === 'action')
            ? computeActionRepeatSkipSet(columns, frameStart, frameEnd)
            : null;
        drawActionCellInBBox(ctx, type, rect, cellW, cellH, columns, frameStart, frameEnd, scale, bboxFontMm, skipSet);
        // 連続線(棒線/波線) を ACTION/CELL の両方で描画
        drawBarLinesInBBox(ctx, type, rect, cellW, cellH, columns, frameStart, frameEnd, scale);
        if (type === 'action') {
            drawActionRepeatsInBBox(ctx, rect, cellW, cellH, columns, frameStart, frameEnd, scale);
        }
    } else if (type === 'sound') {
        drawSoundInBBox(ctx, rect, cellW, cellH, columns, frameStart, frameEnd, scale, bboxFontMm);
    } else if (type === 'camera') {
        drawCameraInBBox(ctx, rect, cellW, cellH, columns, frameStart, frameEnd, scale, bboxFontMm);
    }

    // カット尺ライン + 尺以降グレー (action/cell/sound/camera 全タイムラインに適用)
    drawCutLengthInBBox(ctx, rect, cellH, frameStart, frameEnd, scale);

    // BBox容量より使用フレーム数が少ない場合 (主に0ページ) 残り領域を半透明グレー
    if (usedFrames < capacity) {
        const usedH = usedFrames * cellH;
        const grayTop = rect.y + usedH;
        const grayH = rect.h - usedH;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(rect.x, grayTop, rect.w, grayH);
        // 0ページ表記 (action/cell BBox のみ。sound/camera は表示せず重複を避ける)
        if (type === 'action' || type === 'cell') {
            const m = (mm) => mm * scale;
            const labelFontPx = Math.max(m(1.8), scale * 0.5);
            if (grayH > labelFontPx * 1.5) {
                ctx.save();
                ctx.fillStyle = '#000';
                ctx.font = `bold ${labelFontPx}px "Yu Gothic UI", "Meiryo", sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText('0ページ（先頭余白）', rect.x + rect.w / 2, grayTop + m(0.8));
                ctx.restore();
            }
        }
    }

    ctx.restore();
}

function drawActionCellInBBox(ctx, type, rect, cellW, cellH, columns, frameStart, frameEnd, scale, bboxFontMm, skipSet) {
    const upperType = type.toUpperCase();
    const defaultMm = (typeof settings !== 'undefined' && settings.draw && settings.draw.fontSize && settings.draw.fontSize.cell) || 2.7;
    const isExplicit = (typeof bboxFontMm === 'number' && bboxFontMm > 0);
    const userMm = isExplicit ? bboxFontMm : defaultMm;
    const fontSize = isExplicit ? (userMm * scale) : Math.min(cellH * 0.7, userMm * scale);
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let ci = 0; ci < columns; ci++) {
        for (let f = frameStart; f < frameEnd; f++) {
            const key  = `${upperType}-${ci}-${f}`;
            const data = cellData[key];
            if (!data || !data.value) continue;

            // Rep範囲内のセルはスキップ (ACTION のみ skipSet 適用)
            if (skipSet && skipSet.has(`${ci}-${f}`)) continue;

            // raw SYMBOL値の防御: 標準表示記号へ正規化
            // （SYMBOL_STOP/SYMBOL_START はrepeatマーカーなので非表示）
            let value = data.value;
            if (value === 'SYMBOL_HYPHEN') value = '―';
            else if (value === 'SYMBOL_TICK_1' || value === 'SYMBOL_TICK') value = '●';
            else if (value === 'SYMBOL_TICK_2') value = '○';
            else if (value === 'SYMBOL_NULL_CELL' || value === 'SYMBOL_NULL') value = '×';
            else if (value === 'SYMBOL_STOP' || value === 'SYMBOL_START') continue;

            const cx = rect.x + ci * cellW + cellW / 2;
            const cy = rect.y + (f - frameStart) * cellH + cellH / 2;

            // fontColorId によるセル色
            const colorId = data.fontColorId || 0;
            const cellColor = (colorId > 0 && typeof getFontColorById === 'function')
                ? getFontColorById(colorId)
                : '#000';
            ctx.fillStyle = cellColor;
            ctx.strokeStyle = cellColor;

            if (value === '●') {
                // 標準A3と同じ比率: max(0.35mm, cellH * 2.5/18)
                const dotR = Math.max(scale * 0.35, cellH * (2.5 / 18));
                ctx.beginPath();
                ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
                ctx.fill();
            } else if (value === '○') {
                ctx.beginPath();
                ctx.arc(cx, cy, fontSize * 0.25, 0, Math.PI * 2);
                ctx.stroke();
            } else if (value === '×') {
                const s = fontSize * 0.3;
                ctx.save();
                ctx.lineWidth = Math.max(1.5, scale * 0.3) * 1.5;
                ctx.beginPath();
                ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s);
                ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s);
                ctx.stroke();
                ctx.restore();
            } else if (value === '―') {
                ctx.beginPath();
                ctx.moveTo(cx - fontSize * 0.3, cy);
                ctx.lineTo(cx + fontSize * 0.3, cy);
                ctx.stroke();
            } else {
                // option装飾（KEYFRAME円 / REFERENCEFRAME三角）を先に描画
                let dispOpt = data.option;
                if (type === 'cell') {
                    const actKey = `ACTION-${ci}-${f}`;
                    if (cellData[actKey] && cellData[actKey].option) dispOpt = cellData[actKey].option;
                }
                if (dispOpt && !['●','○','×','―'].includes(value)) {
                    ctx.save();
                    ctx.globalAlpha = 0.5;
                    ctx.strokeStyle = cellColor;
                    ctx.lineWidth = Math.max(1.0, scale * 0.25);
                    const r = Math.min(scale * 2.5, cellW * 0.42, cellH * 0.42);
                    if (dispOpt === 'OPTION_KEYFRAME') {
                        ctx.beginPath();
                        ctx.arc(cx, cy, r, 0, Math.PI * 2);
                        ctx.stroke();
                    } else if (dispOpt === 'OPTION_REFERENCEFRAME') {
                        ctx.beginPath();
                        ctx.moveTo(cx, cy - r * 1.2);
                        ctx.lineTo(cx + r, cy + r * 0.6);
                        ctx.lineTo(cx - r, cy + r * 0.6);
                        ctx.closePath();
                        ctx.stroke();
                    }
                    ctx.restore();
                }
                // 数字を囲いの上に描画
                ctx.fillText(value, cx, cy);
            }
        }
    }
}

function drawSoundInBBox(ctx, rect, cellW, cellH, columns, frameStart, frameEnd, scale, bboxFontMm) {
    if (typeof dialogueBlocks === 'undefined') return;
    const defaultMm = (typeof settings !== 'undefined' && settings.draw && settings.draw.fontSize && settings.draw.fontSize.dialogue) || 3.5;
    const isExplicit = (typeof bboxFontMm === 'number' && bboxFontMm > 0);
    const userMm = isExplicit ? bboxFontMm : defaultMm;
    const fontSize = isExplicit ? (userMm * scale) : Math.min(cellH * 0.7, userMm * scale);

    dialogueBlocks.forEach(block => {
        if (block.startFrame >= frameEnd || block.endFrame < frameStart) return;
        if (block.colIndex >= columns) return;

        const sF = Math.max(block.startFrame, frameStart);
        const eF = Math.min(block.endFrame, frameEnd - 1);
        const bx = rect.x + block.colIndex * cellW;
        const by = rect.y + (sF - frameStart) * cellH;
        const bh = (eF - sF + 1) * cellH;
        // 主たるBBox = 開始フレームを含む側。継続側は名前/テキスト省略
        const isPrimary = block.startFrame >= frameStart;

        // 話者色 (標準A3と統一)
        const fillColor = (typeof getSpeakerColor === 'function')
            ? getSpeakerColor(block.speakerName)
            : 'rgba(200,200,200,0.3)';
        ctx.fillStyle = fillColor;
        ctx.fillRect(bx, by, cellW, bh);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // 上境界線: 開始側のみ。継続側では描かない
        if (isPrimary) { ctx.moveTo(bx, by); ctx.lineTo(bx + cellW, by); }
        // 下境界線: 終端を含む側のみ
        if (block.endFrame < frameEnd) { ctx.moveTo(bx, by + bh); ctx.lineTo(bx + cellW, by + bh); }
        ctx.stroke();

        // セル罫線に張り付かないよう左右に余白
        const sidePad = Math.max(0.5, scale * 0.3);
        const innerW = Math.max(cellW - sidePad * 2, cellW * 0.4);

        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const typeLabel = (typeof getDialogueTypeLabel === 'function') ? getDialogueTypeLabel(block.dialogueType) : null;
        // 話者名: 元位置 (ブロック内上部、枠なし、主たるBBoxのみ)
        if (isPrimary && block.speakerName) {
            let nameFont = fontSize * 0.8;
            ctx.font = `bold ${nameFont}px sans-serif`;
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const nameW = ctx.measureText(block.speakerName).width;
            if (nameW > innerW) {
                nameFont = nameFont * (innerW / nameW);
                ctx.font = `bold ${nameFont}px sans-serif`;
            }
            ctx.fillText(block.speakerName, bx + cellW / 2, by + 2);
        }
        // タイプラベル (normal以外、主たるBBoxのみ): 話者名の下に小さめで併記
        if (isPrimary && typeLabel) {
            let typeFont = fontSize * 0.65;
            ctx.font = `${typeFont}px sans-serif`;
            const typeW = ctx.measureText(typeLabel).width;
            if (typeW > innerW) {
                typeFont = typeFont * (innerW / typeW);
                ctx.font = `${typeFont}px sans-serif`;
            }
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const typeY = block.speakerName ? by + 2 + fontSize * 0.95 : by + 2;
            ctx.fillText(typeLabel, bx + cellW / 2, typeY);
        }

        if (block.text) {
            // 改行で複数行 (縦書き列を横並びに配置、右から左へ)
            const lines = String(block.text).split('\n').filter(s => s.length > 0);
            if (lines.length === 0) return;
            const lineW = innerW / lines.length;
            // 話者名/タイプラベル分のコマ予約 (両方とも内部表示に戻ったため)
            let headerReserveCells = 0;
            if (block.speakerName) headerReserveCells += 1;
            if (typeLabel) headerReserveCells += 1;
            // 全体のframe範囲で間隔を決める (列跨ぎでも同じ位置に来るよう)
            const fullStart = block.startFrame + headerReserveCells;
            const fullEnd = block.endFrame;
            const availableFrames = fullEnd - fullStart + 1;
            if (availableFrames <= 0) return;

            ctx.textBaseline = 'middle';
            lines.forEach((line, li) => {
                const chars = line.split('');
                const charCount = chars.length;
                if (charCount === 0) return;

                // 字間 (frame単位): 3コマ基準、少ないと均等、多いと2コマ以下まで詰める
                let interval;
                if (charCount <= Math.floor(availableFrames / 3)) {
                    interval = availableFrames / charCount;       // ふわっと均等
                } else if (charCount <= Math.floor(availableFrames / 2)) {
                    interval = availableFrames / charCount;       // 2〜3コマ
                } else {
                    interval = Math.max(1.6, availableFrames / charCount);  // 詰め+下限1.6
                }
                const intervalPx = interval * cellH;

                // フォントサイズ: 縦間隔と横列幅 両方に収まるよう自動縮小
                let charFont = Math.min(fontSize, intervalPx);
                ctx.font = `${charFont}px sans-serif`;
                const maxCharW = chars.reduce((mx, c) => Math.max(mx, ctx.measureText(c === 'ー' ? '丨' : c).width), 0);
                if (maxCharW > lineW) {
                    charFont = charFont * (lineW / maxCharW);
                    ctx.font = `${charFont}px sans-serif`;
                }

                // 列X (右から左の並び)
                const colX = bx + sidePad + lineW * (lines.length - 1 - li) + lineW / 2;
                chars.forEach((ch, i) => {
                    // 文字の絶対frame位置 (block基準)
                    const absFrame = fullStart + (i + 0.5) * interval;
                    // 現BBox範囲外はスキップ (列跨ぎ時に正側に出ないようにする)
                    if (absFrame < frameStart || absFrame >= frameEnd) return;
                    const y = rect.y + (absFrame - frameStart) * cellH;
                    ctx.fillText(ch === 'ー' ? '丨' : ch, colX, y);
                });
            });
        }
    });
}

function drawCameraInBBox(ctx, rect, cellW, cellH, columns, frameStart, frameEnd, scale, bboxFontMm) {
    if (typeof cameraBlocks === 'undefined') return;
    const m = (mm) => mm * scale;
    const defaultMm = (typeof settings !== 'undefined' && settings.draw && settings.draw.fontSize && settings.draw.fontSize.camera) || 2.7;
    const isExplicit = (typeof bboxFontMm === 'number' && bboxFontMm > 0);
    const userMm = isExplicit ? bboxFontMm : defaultMm;
    const baseFontPx = isExplicit ? (userMm * scale) : Math.min(cellH * 0.7, userMm * scale);
    const tgtFontPx = Math.max(baseFontPx * 0.7, m(1.5));
    // 線幅: I/H/J は外部テンプレ画像の罫線に負けない太さ、その他は控えめ
    const lineW = Math.max(0.8, scale * 0.2);         // G / B/B' / C / D / その他 用 (元の細い線)
    const rangeLineW = Math.max(1.6, scale * 0.35);   // I / H / J の主要範囲線用
    const inlineLineW = Math.max(1.3, scale * 0.28);  // A インライン用 (やや控えめ)
    const fontFamily = '"Yu Gothic UI", "Meiryo", sans-serif';

    // ─ 共通ヘルパー ─
    const drawCrossTick = (cx, y) => {
        ctx.beginPath();
        ctx.moveTo(cx - m(2), y); ctx.lineTo(cx + m(2), y);
        ctx.stroke();
    };
    const drawRangeLine = (cx, topY, botY, hasStart, hasEnd) => {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = rangeLineW;
        ctx.beginPath();
        ctx.moveTo(cx, topY); ctx.lineTo(cx, botY);
        ctx.stroke();
        if (hasStart) drawCrossTick(cx, topY);
        if (hasEnd) drawCrossTick(cx, botY);
    };
    const drawVerticalLabel = (text, cx, cy, fontPx, color = '#000') => {
        const chars = String(text || '').split('');
        if (!chars.length) return { top: cy, bottom: cy, charH: 0 };
        const charH = fontPx * 1.1;
        const startY = cy - (chars.length - 1) * charH / 2;
        ctx.save();
        ctx.font = `bold ${fontPx}px ${fontFamily}`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        chars.forEach((c, i) => ctx.fillText(c === 'ー' ? '丨' : c, cx, startY + i * charH));
        ctx.restore();
        return { top: startY - charH / 2, bottom: startY + (chars.length - 1) * charH + charH / 2, charH };
    };
    // ラベル位置選定 (標準A3 chooseOpenLabelTop の移植: 衝突範囲を避けて空き領域から選ぶ)
    const chooseOpenLabelTop = (desiredCenter, labelH, avoidRanges, topLimit, bottomLimit) => {
        const safeTop = topLimit + m(1);
        const safeBottom = bottomLimit - m(1);
        const blocked = avoidRanges
            .map(r => ({ top: Math.max(safeTop, r.top), bottom: Math.min(safeBottom, r.bottom) }))
            .filter(r => r.bottom > r.top)
            .sort((a, b) => a.top - b.top);
        const free = [];
        let cur = safeTop;
        blocked.forEach(r => {
            if (r.top > cur) free.push({ top: cur, bottom: r.top });
            cur = Math.max(cur, r.bottom);
        });
        if (cur < safeBottom) free.push({ top: cur, bottom: safeBottom });
        if (!free.length) return Math.max(safeTop, Math.min(safeBottom - labelH, desiredCenter - labelH / 2));
        const scored = free.map(r => {
            const canFit = (r.bottom - r.top) >= labelH;
            const top = canFit
                ? Math.max(r.top, Math.min(r.bottom - labelH, desiredCenter - labelH / 2))
                : r.top + (r.bottom - r.top - labelH) / 2;
            return { top, canFit, distance: Math.abs((top + labelH / 2) - desiredCenter), size: r.bottom - r.top };
        }).sort((a, b) => (b.canFit - a.canFit) || (a.distance - b.distance) || (b.size - a.size));
        return scored[0].top;
    };
    // ラベル位置の自動逃がし:
    // - 原則ラインの右側にラベル
    // - BBox外への一定量(overflowAllowance)のはみ出しは許可 (外部テンプレ画像の余白も活用)
    // - それでも右に置けない場合のみ左へ反転 (同じ許容量で判定)
    // - 最終的にページ(canvas)外に出ないようクランプ
    const overflowAllowance = m(6);
    const pageW = (ctx.canvas && ctx.canvas.width) || (rect.x + rect.w);
    const pickLabelXSide = (cxArg, offset, estLabelW) => {
        const margin = m(0.5);
        const halfW = estLabelW / 2;
        const rightX = cxArg + offset;
        const leftX = cxArg - offset;
        // 1. 右が収まる (BBox右端 + overflowAllowance まで許容)
        const rightBoundary = rect.x + rect.w + overflowAllowance;
        if (rightX + halfW <= rightBoundary) return rightX;
        // 2. 左が収まる (BBox左端 - overflowAllowance まで許容)
        const leftBoundary = rect.x - overflowAllowance;
        if (leftX - halfW >= leftBoundary) return leftX;
        // 3. 両方溢れる場合は最終的にページ内に収まる範囲でクランプ
        const minX = margin + halfW;
        const maxX = pageW - margin - halfW;
        return Math.min(Math.max(rightX, minX), maxX);
    };
    const drawTargetsSmall = (cx, topY, tgtList, color = '#000') => {
        if (!tgtList || !tgtList.length) return topY;
        ctx.save();
        ctx.font = `${tgtFontPx}px ${fontFamily}`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const lineH = tgtFontPx * 1.25;
        let curY = topY;
        tgtList.forEach(l => { ctx.fillText(`[${l}]`, cx, curY); curY += lineH; });
        ctx.restore();
        return curY;
    };

    cameraBlocks.forEach(block => {
        if (block.startFrame >= frameEnd || block.endFrame < frameStart) return;
        if (block.colIndex >= columns) return;

        const sF = Math.max(block.startFrame, frameStart);
        const eF = Math.min(block.endFrame, frameEnd - 1);
        const colspan = block.colspan || 1;
        const bx = rect.x + block.colIndex * cellW;
        const bw = cellW * colspan;
        const trueStartY = rect.y + (block.startFrame - frameStart) * cellH;
        const trueEndY = rect.y + (block.endFrame - frameStart + 1) * cellH;
        const drawStartY = Math.max(trueStartY, rect.y);
        const drawEndY = Math.min(trueEndY, rect.y + rect.h);
        const midY = (drawStartY + drawEndY) / 2;
        const cx = bx + bw / 2;
        const hasStart = block.startFrame >= frameStart;
        const hasEnd = block.endFrame < frameEnd;
        // ブロックの主たるBBox = 開始フレームを含むBBox。継続側はラベル省略
        const isPrimary = hasStart;

        // BBox内クリップ (横方向はラベル逃がしの overflowAllowance 分だけ広げる)
        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x - overflowAllowance, rect.y, rect.w + overflowAllowance * 2, rect.h);
        ctx.clip();

        const vt = block.valueType;
        const pKind = (block.kind || '').split(' (')[0].trim();
        const tgtList = block.targetLayers || [];
        const isFill = pKind === 'BL K' || pKind === '黒コマ' || pKind === 'W K' || pKind === '白コマ';

        if (block.isInlineEdit) {
            // A: インライン (Rolling等) — 黒線 + 上端にkindラベル + セル毎入力値+option
            const lineX = bx + m(1);
            const valueX = lineX + m(2.5);
            ctx.strokeStyle = '#000';
            ctx.fillStyle = '#000';
            ctx.lineWidth = inlineLineW;
            ctx.beginPath();
            ctx.moveTo(lineX, drawStartY); ctx.lineTo(lineX, drawEndY);
            ctx.stroke();
            if (hasStart) {
                ctx.beginPath();
                ctx.moveTo(lineX - m(0.5), trueStartY); ctx.lineTo(lineX + m(2), trueStartY);
                ctx.stroke();
            }
            if (hasEnd) {
                ctx.beginPath();
                ctx.moveTo(lineX - m(0.5), trueEndY); ctx.lineTo(lineX + m(2), trueEndY);
                ctx.stroke();
            }
            // kind/targets は範囲開始の少し上に逃がす (横書き、補助情報として軽く)
            ctx.lineWidth = lineW;
            if (isPrimary) {
                ctx.save();
                ctx.fillStyle = '#000';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                // kind (上段)
                ctx.font = `bold ${Math.max(baseFontPx, m(2))}px ${fontFamily}`;
                const tgtY = trueStartY - m(0.5);
                ctx.fillText(pKind, valueX, tgtY - (tgtList.length ? tgtFontPx * 1.25 : 0));
                // targets (kind の下、小さめ)
                if (tgtList.length) {
                    ctx.font = `${tgtFontPx}px ${fontFamily}`;
                    ctx.fillText(tgtList.map(l => `[${l}]`).join(' '), valueX, tgtY);
                }
                ctx.restore();
            }
            // セル毎の入力値 + option mark
            const valueFontPx = Math.max(baseFontPx, m(2));
            ctx.save();
            ctx.font = `bold ${valueFontPx}px ${fontFamily}`;
            ctx.fillStyle = '#000';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            for (let f = sF; f <= eF; f++) {
                const key = `CAMERA-${block.colIndex}-${f}`;
                const data = cellData[key];
                if (!data || !data.value) continue;
                // raw SYMBOL値の防御
                // - SYMBOL_HYPHEN: インライン内では非表示 (継続マーカー扱い)
                // - SYMBOL_STOP/START: repeatマーカーなので非表示
                // - SYMBOL_TICK_1/_2 / SYMBOL_NULL_CELL: ●/○/× に正規化して表示
                let displayValue = data.value;
                if (displayValue === 'SYMBOL_HYPHEN') continue;
                if (displayValue === 'SYMBOL_STOP' || displayValue === 'SYMBOL_START') continue;
                if (displayValue === 'SYMBOL_TICK_1' || displayValue === 'SYMBOL_TICK') displayValue = '●';
                else if (displayValue === 'SYMBOL_TICK_2') displayValue = '○';
                else if (displayValue === 'SYMBOL_NULL_CELL' || displayValue === 'SYMBOL_NULL') displayValue = '×';
                const fy = rect.y + (f - frameStart) * cellH + cellH / 2;
                // option mark を先 (50%透過、KEYFRAME円 / REFERENCEFRAME三角)
                if (data.option && !['●','○','×','―'].includes(displayValue)) {
                    ctx.save();
                    ctx.globalAlpha = 0.5;
                    ctx.strokeStyle = '#000';
                    ctx.lineWidth = Math.max(1.0, scale * 0.25);
                    // 値テキストの幅に合わせた中心
                    const tw = ctx.measureText(String(displayValue)).width;
                    const ocx = valueX + tw / 2;
                    const r = Math.min(scale * 2.2, valueFontPx * 0.85, cellH * 0.42);
                    if (data.option === 'OPTION_KEYFRAME') {
                        ctx.beginPath();
                        ctx.arc(ocx, fy, r, 0, Math.PI * 2);
                        ctx.stroke();
                    } else if (data.option === 'OPTION_REFERENCEFRAME') {
                        ctx.beginPath();
                        ctx.moveTo(ocx, fy - r * 1.2);
                        ctx.lineTo(ocx + r, fy + r * 0.6);
                        ctx.lineTo(ocx - r, fy + r * 0.6);
                        ctx.closePath();
                        ctx.stroke();
                    }
                    ctx.restore();
                }
                ctx.fillText(displayValue, valueX, fy);
            }
            ctx.restore();
        } else if (pKind === 'IrisIN' || pKind === 'IrisOut') {
            // D: Iris (台形)
            const inset = Math.max(m(1.2), bw * 0.18);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = lineW;
            ctx.fillStyle = 'rgba(100,100,100,0.22)';
            ctx.beginPath();
            if (pKind === 'IrisIN') {
                ctx.moveTo(bx + inset, trueStartY);
                ctx.lineTo(bx + bw - inset, trueStartY);
                ctx.lineTo(bx + bw, trueEndY);
                ctx.lineTo(bx, trueEndY);
            } else {
                ctx.moveTo(bx, trueStartY);
                ctx.lineTo(bx + bw, trueStartY);
                ctx.lineTo(bx + bw - inset, trueEndY);
                ctx.lineTo(bx + inset, trueEndY);
            }
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            if (isPrimary) {
                ctx.save();
                ctx.font = `bold ${Math.max(baseFontPx, m(2.2))}px ${fontFamily}`;
                ctx.fillStyle = '#000';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(pKind, cx, midY);
                ctx.restore();
                if (tgtList.length) drawTargetsSmall(cx, midY + m(2), tgtList);
            }
        } else if (pKind === 'FI' || pKind === 'WI') {
            // B: 下向き三角 (FI/WI) — kind優先のため先に判定
            ctx.strokeStyle = '#000';
            ctx.lineWidth = lineW;
            ctx.fillStyle = pKind === 'FI' ? 'rgba(100,100,100,0.25)' : 'rgba(255,255,255,0.25)';
            ctx.beginPath();
            ctx.moveTo(bx + bw / 2, trueStartY);
            ctx.lineTo(bx + bw, trueEndY);
            ctx.lineTo(bx, trueEndY);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            if (isPrimary) {
                ctx.save();
                ctx.font = `bold ${Math.max(baseFontPx, m(2.5))}px ${fontFamily}`;
                ctx.fillStyle = '#000';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(pKind, cx, midY);
                ctx.restore();
                if (tgtList.length) drawTargetsSmall(cx, midY + m(2), tgtList);
            }
        } else if (pKind === 'FO' || pKind === 'WO') {
            // B': 上向き三角 (FO/WO)
            ctx.strokeStyle = '#000';
            ctx.lineWidth = lineW;
            ctx.fillStyle = pKind === 'FO' ? 'rgba(100,100,100,0.25)' : 'rgba(255,255,255,0.25)';
            ctx.beginPath();
            ctx.moveTo(bx, trueStartY);
            ctx.lineTo(bx + bw, trueStartY);
            ctx.lineTo(bx + bw / 2, trueEndY);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            if (isPrimary) {
                ctx.save();
                ctx.font = `bold ${Math.max(baseFontPx, m(2.5))}px ${fontFamily}`;
                ctx.fillStyle = '#000';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(pKind, cx, midY);
                ctx.restore();
                if (tgtList.length) drawTargetsSmall(cx, midY + m(2), tgtList);
            }
        } else if (isFill) {
            // C: BL K / W K / 黒コマ / 白コマ
            const isBlack = pKind === 'BL K' || pKind === '黒コマ';
            ctx.fillStyle = isBlack ? '#333' : '#ddd';
            ctx.fillRect(bx + m(0.4), drawStartY, bw - m(0.8), drawEndY - drawStartY);
            const txtColor = isBlack ? '#fff' : '#111';
            if (isPrimary) {
                ctx.save();
                ctx.font = `bold ${Math.max(baseFontPx, m(2.2))}px ${fontFamily}`;
                ctx.fillStyle = txtColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(pKind, cx, midY);
                ctx.restore();
                if (tgtList.length) drawTargetsSmall(cx, midY + m(2), tgtList, txtColor);
            }
        } else if (pKind.includes('CAM SHAKE') || pKind.includes('Handy') || pKind.includes('カメラぶれ') || pKind.includes('ハンディ')) {
            // E: SHAKE 系 (波線 + 縦書きラベル)
            const lineX = bx + bw / 2;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = lineW;
            // 上下クロス
            if (hasStart) {
                ctx.beginPath();
                ctx.moveTo(lineX - m(2), trueStartY); ctx.lineTo(lineX + m(2), trueStartY);
                ctx.stroke();
            }
            if (hasEnd) {
                ctx.beginPath();
                ctx.moveTo(lineX - m(2), trueEndY); ctx.lineTo(lineX + m(2), trueEndY);
                ctx.stroke();
            }
            // sin波線
            ctx.beginPath();
            const startWY = drawStartY;
            const endWY = drawEndY;
            const stepY = m(0.5);
            let first = true;
            for (let py = startWY; py <= endWY; py += stepY) {
                const phase = (py - trueStartY) * 0.3;
                const px = lineX + Math.sin(phase) * m(1);
                if (first) { ctx.moveTo(px, py); first = false; }
                else ctx.lineTo(px, py);
            }
            ctx.stroke();
            // kind 縦書き (主たるBBox のみ)
            if (isPrimary) {
                const kindFontPx = Math.max(baseFontPx, m(2.2));
                const kindCharH = kindFontPx * 1.15;
                const tgtCharH = tgtFontPx * 1.2;
                const tgtSegments = tgtList.map(l => `[${l}]`.split(''));
                const totalTgtH = tgtSegments.reduce((s, seg) => s + seg.length * tgtCharH + m(0.6), 0);
                const totalH = pKind.length * kindCharH + totalTgtH;
                const topY = chooseOpenLabelTop(midY, totalH, [], drawStartY, drawEndY);
                const kindCenterY = topY + (pKind.length * kindCharH) / 2;
                drawVerticalLabel(pKind, lineX + m(2.5), kindCenterY, kindFontPx);
                if (tgtList.length) {
                    ctx.save();
                    ctx.font = `${tgtFontPx}px ${fontFamily}`;
                    ctx.fillStyle = '#000';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    let curY = topY + pKind.length * kindCharH + tgtCharH / 2 + m(0.4);
                    tgtSegments.forEach(seg => {
                        seg.forEach(c => { ctx.fillText(c === 'ー' ? '丨' : c, lineX + m(2.5), curY); curY += tgtCharH; });
                        curY += m(0.6);
                    });
                    ctx.restore();
                }
            }
        } else if (vt === 'numericFr' || pKind === 'Strobo' || pKind === 'Strobo2' || pKind === 'ストロボ' || pKind === 'ストロボ2') {
            // F: Strobo (砂時計+菱形 セグメント連結)
            const frGap = block.numericFr || 4;
            const stepY = frGap * cellH;
            const isType2 = pKind === 'Strobo2' || pKind === 'ストロボ2';
            const lx = bx, rx = bx + bw, cxLocal = bx + bw / 2;
            const halfW = bw / 2;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = lineW;
            ctx.fillStyle = 'rgba(100,100,100,0.22)';
            const totalFrames = block.endFrame - block.startFrame + 1;
            const segments = Math.ceil(totalFrames / frGap);
            for (let seg = 0; seg < segments; seg++) {
                const segStartY = trueStartY + seg * stepY;
                const segEndY = Math.min(segStartY + stepY, trueEndY);
                if (segEndY <= drawStartY || segStartY >= drawEndY) continue;
                const segMidY = segStartY + (segEndY - segStartY) / 2;
                // 左半分
                ctx.beginPath();
                if (!isType2) {
                    // hourglass left
                    ctx.moveTo(lx, segStartY); ctx.lineTo(cxLocal, segStartY); ctx.lineTo(lx + halfW / 2, segMidY);
                    ctx.lineTo(cxLocal, segEndY); ctx.lineTo(lx, segEndY); ctx.lineTo(lx + halfW / 2, segMidY);
                } else {
                    // diamond left
                    ctx.moveTo(lx + halfW / 2, segStartY); ctx.lineTo(cxLocal, segMidY);
                    ctx.lineTo(lx + halfW / 2, segEndY); ctx.lineTo(lx, segMidY);
                }
                ctx.closePath(); ctx.fill(); ctx.stroke();
                // 右半分
                ctx.beginPath();
                if (isType2) {
                    // hourglass right
                    ctx.moveTo(cxLocal, segStartY); ctx.lineTo(rx, segStartY); ctx.lineTo(cxLocal + halfW / 2, segMidY);
                    ctx.lineTo(rx, segEndY); ctx.lineTo(cxLocal, segEndY); ctx.lineTo(cxLocal + halfW / 2, segMidY);
                } else {
                    // diamond right
                    ctx.moveTo(cxLocal + halfW / 2, segStartY); ctx.lineTo(rx, segMidY);
                    ctx.lineTo(cxLocal + halfW / 2, segEndY); ctx.lineTo(cxLocal, segMidY);
                }
                ctx.closePath(); ctx.fill(); ctx.stroke();
            }
            // 開始点の上に kind/targets を逃がす (インラインと同方針)
            if (hasStart) {
                ctx.save();
                ctx.fillStyle = '#000';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                const tgtY = trueStartY - m(0.5);
                // kind (上段)
                ctx.font = `bold ${Math.max(baseFontPx, m(2.2))}px ${fontFamily}`;
                ctx.fillText(pKind, cx, tgtY - (tgtList.length ? tgtFontPx * 1.25 : 0));
                // targets (kind の下、小さめ)
                if (tgtList.length) {
                    ctx.font = `${tgtFontPx}px ${fontFamily}`;
                    ctx.fillText(tgtList.map(l => `[${l}]`).join(' '), cx, tgtY);
                }
                ctx.restore();
            }
        } else if (vt === 'instructionText') {
            // H: 処理・効果系 (範囲線 + ライン横[右寄せ]に縦書き [layer]→kind 積み上げ)
            drawRangeLine(cx, drawStartY, drawEndY, hasStart, hasEnd);
            if (isPrimary) {
            const kindFontPx = Math.max(baseFontPx, m(2.1));
            // ラベル中心: ライン右側がBBoxからはみ出すなら左側に逃がす
            const labelX = pickLabelXSide(cx, m(2.5), kindFontPx + m(1));
            const kindCharH = kindFontPx * 1.15;
            const tgtCharH = tgtFontPx * 1.2;
            const pKindChars = pKind.split('');
            const tgtSegments = tgtList.map(l => `[${l}]`.split(''));
            const totalH = tgtSegments.reduce((s, seg) => s + seg.length * tgtCharH + m(0.6), 0)
                + pKindChars.length * kindCharH;
            const avoidRanges = [];
            if (block.waypoints && block.waypoints.length > 0) {
                block.waypoints.forEach(wp => {
                    if (wp.frame < sF || wp.frame > eF) return;
                    const wpY = rect.y + (wp.frame - frameStart) * cellH + cellH / 2;
                    avoidRanges.push({ top: wpY - m(2.5), bottom: wpY + m(2.5) });
                });
            }
            const topY = chooseOpenLabelTop(midY, totalH, avoidRanges, drawStartY, drawEndY);
            ctx.save();
            ctx.font = `${tgtFontPx}px ${fontFamily}`;
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let curY = topY + tgtCharH / 2;
            tgtSegments.forEach(seg => {
                seg.forEach(c => { ctx.fillText(c === 'ー' ? '丨' : c, labelX, curY); curY += tgtCharH; });
                curY += m(0.6);
            });
            ctx.restore();
            const kindCenterY = curY + (pKindChars.length * kindCharH) / 2 - kindCharH / 2;
            drawVerticalLabel(pKind, labelX, kindCenterY, kindFontPx);
            }
        } else if (vt === 'fromTo' || vt === 'multiLayerDirection') {
            // I: fromTo矢印型
            const lineX = bx + m(2.2);
            const labelX = lineX + m(3.6);
            ctx.strokeStyle = '#000';
            ctx.fillStyle = '#000';
            ctx.lineWidth = rangeLineW;
            if (hasStart) {
                ctx.beginPath();
                ctx.moveTo(lineX - m(1), trueStartY); ctx.lineTo(lineX + m(1), trueStartY);
                ctx.lineTo(lineX, trueStartY + m(1.5));
                ctx.closePath(); ctx.fill();
            }
            if (hasEnd) {
                ctx.beginPath();
                ctx.moveTo(lineX - m(1), trueEndY); ctx.lineTo(lineX + m(1), trueEndY);
                ctx.lineTo(lineX, trueEndY - m(1.5));
                ctx.closePath(); ctx.fill();
            }
            ctx.beginPath();
            ctx.moveTo(lineX, hasStart ? trueStartY + m(1.5) : drawStartY);
            ctx.lineTo(lineX, hasEnd ? trueEndY - m(1.5) : drawEndY);
            ctx.stroke();
            // waypoints
            if (block.waypoints && block.waypoints.length > 0) {
                ctx.lineWidth = Math.max(1, scale * 0.3);
                block.waypoints.forEach(wp => {
                    if (wp.frame < sF || wp.frame > eF) return;
                    const wpY = rect.y + (wp.frame - frameStart) * cellH + cellH / 2;
                    ctx.beginPath();
                    ctx.moveTo(lineX - m(1.5), wpY); ctx.lineTo(lineX + m(1.5), wpY);
                    ctx.stroke();
                    if (wp.label && isPrimary) {
                        ctx.save();
                        ctx.font = `${tgtFontPx}px ${fontFamily}`;
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = '#000';
                        ctx.fillText(wp.label, lineX + m(2), wpY);
                        ctx.restore();
                    }
                });
                ctx.lineWidth = rangeLineW;
            }
            // from text: 開始側のみ / to text: 終端側のみ
            ctx.save();
            ctx.font = `${Math.max(baseFontPx * 0.85, m(2))}px ${fontFamily}`;
            ctx.fillStyle = '#000';
            ctx.textAlign = 'left';
            if (block.fromText && isPrimary) {
                ctx.textBaseline = 'top';
                ctx.fillText(block.fromText, lineX + m(2), trueStartY + m(2));
            }
            if (block.toText && hasEnd) {
                ctx.textBaseline = 'bottom';
                ctx.fillText(block.toText, lineX + m(2), trueEndY - m(1));
            }
            ctx.restore();
            // フェアリング描画 ('in'は開始側、'out'は終端側に描く)
            if (block.hasFairing && block.waypoints && block.waypoints.length > 0) {
                const fMode = block.fairingMode;
                const wpYs = block.waypoints
                    .filter(wp => wp.frame >= sF && wp.frame <= eF)
                    .map(wp => rect.y + (wp.frame - frameStart) * cellH + cellH / 2)
                    .sort((a, b) => a - b);
                if (wpYs.length > 0) {
                    const drawFairingLabel = (yStart, yEnd) => {
                        const bracketX = bx + bw - m(0.5);
                        const bW = m(1);
                        ctx.save();
                        ctx.strokeStyle = '#000';
                        ctx.lineWidth = Math.max(0.6, scale * 0.15);
                        ctx.beginPath();
                        ctx.moveTo(bracketX - bW, yStart); ctx.lineTo(bracketX, yStart);
                        ctx.lineTo(bracketX, yEnd); ctx.lineTo(bracketX - bW, yEnd);
                        ctx.stroke();
                        ctx.font = `${m(1.5)}px ${fontFamily}`;
                        ctx.fillStyle = '#000';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        const fairChars = 'フェアリング'.split('');
                        const fairMidY = (yStart + yEnd) / 2;
                        const fCharH = m(2);
                        const fStartY = fairMidY - (fairChars.length - 1) * fCharH / 2;
                        fairChars.forEach((c, i) => ctx.fillText(c, bracketX - m(2), fStartY + i * fCharH));
                        ctx.restore();
                    };
                    if ((fMode === 'in' || fMode === 'both') && isPrimary) drawFairingLabel(trueStartY, wpYs[0]);
                    if ((fMode === 'out' || fMode === 'both') && hasEnd) drawFairingLabel(wpYs[wpYs.length - 1], trueEndY);
                }
            }
            // kind 縦書き (waypoint/from/to/フェアリングを避ける、主たるBBox のみ)
            if (isPrimary) {
            const kindFontPx = Math.max(baseFontPx * 1.1, m(2.5));
            const kindCharH = kindFontPx * 1.1;
            const tgtLineH = tgtFontPx * 1.25;
            const targetBlockH = tgtList.length ? tgtList.length * tgtLineH + m(0.5) : 0;
            const labelTotalH = targetBlockH + pKind.length * kindCharH;
            const avoidRanges = [];
            if (block.fromText && hasStart) avoidRanges.push({ top: trueStartY, bottom: trueStartY + m(5) });
            if (block.toText && hasEnd) avoidRanges.push({ top: trueEndY - m(5), bottom: trueEndY });
            if (block.waypoints && block.waypoints.length > 0) {
                block.waypoints.forEach(wp => {
                    if (wp.frame < sF || wp.frame > eF) return;
                    const wpY = rect.y + (wp.frame - frameStart) * cellH + cellH / 2;
                    avoidRanges.push({ top: wpY - m(3.4), bottom: wpY + m(3.4) });
                });
            }
            const labelTopY = chooseOpenLabelTop(midY, labelTotalH, avoidRanges, drawStartY, drawEndY);
            // targets を上、kind を下 (kindの中心はラベルブロック内のkind部分中央)
            if (tgtList.length) {
                drawTargetsSmall(labelX, labelTopY, tgtList);
            }
            const kindCenterY = labelTopY + targetBlockH + (pKind.length * kindCharH) / 2;
            drawVerticalLabel(pKind, labelX, kindCenterY, kindFontPx);
            }
        } else if (vt === 'fromToLayers') {
            // G: O.L / Wipe (砂時計)
            ctx.strokeStyle = '#000';
            ctx.lineWidth = lineW;
            ctx.fillStyle = 'rgba(100,100,100,0.18)';
            ctx.beginPath();
            ctx.moveTo(bx, trueStartY);
            ctx.lineTo(bx + bw, trueStartY);
            ctx.lineTo(bx + bw / 2, (trueStartY + trueEndY) / 2);
            ctx.lineTo(bx + bw, trueEndY);
            ctx.lineTo(bx, trueEndY);
            ctx.lineTo(bx + bw / 2, (trueStartY + trueEndY) / 2);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            // O.L/Wipe ラベルとfrom layersは開始側、to layersは終端側
            ctx.save();
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (isPrimary) {
                const olLabel = pKind === 'Wipe' ? 'Wipe' : 'O.L';
                ctx.font = `bold ${Math.max(baseFontPx * 1.1, m(2.5))}px ${fontFamily}`;
                ctx.fillText(olLabel, cx, midY);
                const fromL = (block.layersFrom || []).join(',');
                if (fromL) {
                    ctx.font = `${tgtFontPx}px ${fontFamily}`;
                    ctx.fillText(fromL, cx, trueStartY + m(3));
                }
            }
            if (hasEnd) {
                const toL = (block.layersTo || []).join(',');
                if (toL) {
                    ctx.font = `${tgtFontPx}px ${fontFamily}`;
                    ctx.fillText(toL, cx, trueEndY - m(2));
                }
            }
            ctx.restore();
        } else {
            // J: フォールバック (縦範囲線 + kind縦ラベル + targets小、ラベルは主たるBBox のみ)
            drawRangeLine(cx, drawStartY, drawEndY, hasStart, hasEnd);
            if (isPrimary) {
                const kindFontPx = Math.max(baseFontPx, m(2.2));
                // ラベル中心: ライン右側がBBoxからはみ出すなら左側に逃がす
                const labelX = pickLabelXSide(cx, m(3), kindFontPx + m(1));
                const kindInfo = drawVerticalLabel(pKind, labelX, midY, kindFontPx);
                if (tgtList.length) {
                    const tgtTopY = kindInfo.top - tgtFontPx * 1.25 * tgtList.length - m(0.5);
                    drawTargetsSmall(labelX, tgtTopY, tgtList);
                }
            }
        }

        ctx.restore();
    });
}

window.drawExternalTemplateTimelineBoxes = drawExternalTemplateTimelineBoxes;
window.drawExternalTemplateBooks = drawExternalTemplateBooks;
