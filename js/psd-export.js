// === PSD exporter ===
// 8bit RGB PSD, RLE compressed, page groups with four layers:
// background / template / data / memo(handwriting).

async function buildTemplatePsdBlob(pageIndex, dpi, includeHandwriting = true) {
    return buildTemplateMultiPagePsdBlob([pageIndex], dpi, includeHandwriting);
}

async function buildTemplateMultiPagePsdBlob(pageIndexes, dpi, includeHandwriting = true, onProgress) {
    const pages = [];
    for (let i = 0; i < pageIndexes.length; i++) {
        const pageIndex = pageIndexes[i];
        if (onProgress) onProgress(`PSDページ ${i + 1}/${pageIndexes.length} を生成中...`, Math.round(i / pageIndexes.length * 70));
        pages.push(await buildPsdPageLayers(pageIndex, dpi, includeHandwriting));
    }
    const first = pages[0];
    const layers = [];
    [...pages].reverse().forEach((page, revIndex) => {
        const i = pages.length - 1 - revIndex;
        const hidden = i > 0;
        const label = `page ${getPsdPageLabel(page.pageIndex)}`;
        layers.push(createPsdGroupEnd(page.width, page.height, hidden));
        layers.push({ name: 'background', imageData: page.background, hidden });
        layers.push({ name: 'template', imageData: page.template, hidden });
        layers.push({ name: 'data', imageData: page.data, hidden });
        layers.push({ name: 'memo', imageData: page.memo, hidden });
        layers.push(createPsdGroupStart(label, page.width, page.height, hidden));
    });
    if (onProgress) onProgress('PSDレイヤーを圧縮中...', 75);
    return writePsdBlob(first.width, first.height, layers, first.composite, dpi);
}

async function buildPsdPageLayers(pageIndex, dpi, includeHandwriting) {
    const isExternal = (typeof getCurrentExternalTemplate === 'function')
        && !!getCurrentExternalTemplate()
        && (typeof getCurrentExternalTemplateImage === 'function')
        && !!getCurrentExternalTemplateImage();

    // template 層: 外部テンプレは画像のみ、標準A3 は従来通り空メタの再render
    const blank = isExternal && typeof renderExternalTemplateImageOnly === 'function'
        ? renderExternalTemplateImageOnly(dpi, pageIndex)
        : renderBlankTemplateForPsd(dpi, pageIndex);
    const full = renderTemplate(dpi, pageIndex);
    const handwriting = includeHandwriting && typeof renderHandwritingPageToCanvas === 'function'
        ? await renderHandwritingPageToCanvas(pageIndex, dpi)
        : createTransparentPsdCanvas(full.width, full.height);
    const composite = typeof renderImageExportPageCanvas === 'function'
        ? await renderImageExportPageCanvas(pageIndex, dpi, includeHandwriting)
        : full;
    // data 層: 外部テンプレ専用パスかどうかで分岐
    const dataCanvas = isExternal && typeof renderExternalTemplateDataOnly === 'function'
        ? renderExternalTemplateDataOnly(dpi, pageIndex)
        : renderDataOnlyForPsd(dpi, pageIndex);
    // template層:
    //   - 標準A3: 白を透明化 (グリッド線のみ視認)
    //   - 外部テンプレ: 画像を完全不透明 (白を透明化すると画像が破壊される可能性)
    const templateImageData = isExternal
        ? makeOpaqueRgbPsdImageData(blank)
        : makeWhiteTransparentPsdImageData(blank);
    // data層: 外部テンプレは白→透明、標準A3は従来通り (renderDataOnlyForPsd は透明背景)
    const dataImageData = isExternal
        ? makeWhiteTransparentPsdImageData(dataCanvas)
        : dataCanvas.getContext('2d').getImageData(0, 0, full.width, full.height);
    return {
        pageIndex,
        width: full.width,
        height: full.height,
        background: createSolidPsdImageData(full.width, full.height, 255, 255, 255, 255),
        template: templateImageData,
        data: dataImageData,
        memo: handwriting.getContext('2d').getImageData(0, 0, handwriting.width, handwriting.height),
        composite
    };
}

function getPsdPageLabel(pageIndex) {
    if (typeof getSheetLabel === 'function') return getSheetLabel(pageIndex);
    return String(pageIndex + 1);
}

function createPsdGroupStart(name, width, height, hidden) {
    return {
        name,
        imageData: createSolidPsdImageData(width, height, 0, 0, 0, 0),
        sectionType: 1,
        hidden
    };
}

function createPsdGroupEnd(width, height, hidden) {
    return {
        name: '</Layer group>',
        imageData: createSolidPsdImageData(width, height, 0, 0, 0, 0),
        sectionType: 3,
        hidden
    };
}

function renderBlankTemplateForPsd(dpi, pageIndex) {
    const keep = {
        metaData: JSON.parse(JSON.stringify(metaData)),
        cellData,
        booksData,
        customRepeats,
        dialogueBlocks,
        cameraBlocks
    };
    try {
        metaData = { ...metaData, title: '', subTitle: '', scene: '', cut: '', lengthSec: '', lengthFrame: '', creator: '', memo: '' };
        cellData = {};
        booksData = { ACTION: {}, SOUND: {}, CELL: {}, CAMERA: {} };
        customRepeats = [];
        dialogueBlocks = [];
        cameraBlocks = [];
        const canvas = renderTemplate(dpi, pageIndex);
        clearHeaderValuesForPsdTemplate(canvas, dpi);
        return canvas;
    } finally {
        metaData = keep.metaData;
        cellData = keep.cellData;
        booksData = keep.booksData;
        customRepeats = keep.customRepeats;
        dialogueBlocks = keep.dialogueBlocks;
        cameraBlocks = keep.cameraBlocks;
    }
}

function createTransparentPsdCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

function clearHeaderValuesForPsdTemplate(canvas, dpi) {
    const ctx = canvas.getContext('2d');
    const scale = dpi / 25.4;
    const m = (mm) => mm * scale;
    const x = m(TEMPLATE.MARGIN_LEFT);
    const y = m(TEMPLATE.MARGIN_TOP);
    const h = m(TEMPLATE.HEADER_HEIGHT);
    const totalW = m(TEMPLATE.WIDTH_MM - TEMPLATE.MARGIN_LEFT - TEMPLATE.MARGIN_RIGHT);
    const ratios = [0.28, 0.10, 0.10, 0.10, 0.13, 0.19, 0.10];
    let cx = x;
    ctx.save();
    ctx.fillStyle = TEMPLATE.BG_COLOR;
    ratios.forEach((ratio, index) => {
        const fw = totalW * ratio;
        if (index === 4 || index === 6) {
            ctx.fillRect(cx + m(0.2), y + h * 0.42, fw - m(0.4), h * 0.52);
        }
        cx += fw;
    });
    ctx.restore();
}

function createSolidPsdImageData(width, height, r, g, b, a) {
    const imageData = new ImageData(width, height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = a;
    }
    return imageData;
}

function makeWhiteTransparentPsdImageData(canvas) {
    const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        data[i + 3] = (data[i] > 248 && data[i + 1] > 248 && data[i + 2] > 248) ? 0 : 255;
    }
    return imageData;
}

// 完全不透明レイヤー: alpha を全て 255 に。透明RGB(0,0,0,0) はそのままだと
// PSD読込で問題が出ることがあるので、alpha=0 のピクセルは白(255,255,255)に
function makeOpaqueRgbPsdImageData(canvas) {
    const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 255) {
            // 半透明部分は白とブレンド (背景白前提)
            const a = data[i + 3] / 255;
            data[i]     = Math.round(data[i]     * a + 255 * (1 - a));
            data[i + 1] = Math.round(data[i + 1] * a + 255 * (1 - a));
            data[i + 2] = Math.round(data[i + 2] * a + 255 * (1 - a));
            data[i + 3] = 255;
        }
    }
    return imageData;
}

function makeDifferencePsdImageData(fullCanvas, blankCanvas) {
    const full = fullCanvas.getContext('2d').getImageData(0, 0, fullCanvas.width, fullCanvas.height);
    const blank = blankCanvas.getContext('2d').getImageData(0, 0, blankCanvas.width, blankCanvas.height);
    const fd = full.data;
    const bd = blank.data;
    for (let i = 0; i < fd.length; i += 4) {
        const diff = Math.max(Math.abs(fd[i] - bd[i]), Math.abs(fd[i + 1] - bd[i + 1]), Math.abs(fd[i + 2] - bd[i + 2]));
        fd[i + 3] = diff > 28 ? 255 : 0;
    }
    return full;
}

function renderDataOnlyForPsd(dpi, pageIndex) {
    const canvas = createTemplateCanvas(dpi);
    const ctx = canvas.getContext('2d');
    const scale = dpi / 25.4;
    const m = (mm) => mm * scale;
    const isPage0 = (typeof hasPage0 === 'function') && hasPage0() && pageIndex === 0;
    const isFirstNormalPage = isPage0 ? false : (pageIndex === 0 || (hasPage0() && pageIndex === 1));

    drawHeaderDataOnlyForPsd(ctx, scale, pageIndex);

    const contentW = m(TEMPLATE.WIDTH_MM - TEMPLATE.MARGIN_LEFT - TEMPLATE.MARGIN_RIGHT);
    const bodyW = (contentW - m(TEMPLATE.BODY_H_MARGIN)) / 2;
    const timelineH = m(TEMPLATE.FRAMES_PER_COL * TEMPLATE.ROW_HEIGHT + TEMPLATE.COL_HEADER_HEIGHT);
    const bodyY = m(TEMPLATE.HEIGHT_MM - TEMPLATE.MARGIN_BOTTOM) - timelineH;
    const directionY = m(TEMPLATE.MARGIN_TOP + TEMPLATE.HEADER_HEIGHT + 5);
    const directionH = bodyY - directionY - m(5);

    if (isFirstNormalPage) drawDirectionDataOnlyForPsd(ctx, scale, directionY, directionH, bodyW, pageIndex);
    if (!isPage0) {
        const body1X = m(TEMPLATE.MARGIN_LEFT);
        drawTimelineDataOnlyForPsd(ctx, scale, body1X, bodyY, bodyW, 0, pageIndex);
        const body2X = body1X + bodyW + m(TEMPLATE.BODY_H_MARGIN);
        drawTimelineDataOnlyForPsd(ctx, scale, body2X, bodyY, bodyW, 72, pageIndex);
        if (isFirstNormalPage) drawBooksOnTemplate(ctx, scale, bodyY, bodyW);
    }
    return canvas;
}

function drawHeaderDataOnlyForPsd(ctx, scale, pageIndex) {
    const m = (mm) => mm * scale;
    const x = m(TEMPLATE.MARGIN_LEFT);
    const y = m(TEMPLATE.MARGIN_TOP);
    const h = m(TEMPLATE.HEADER_HEIGHT);
    const totalW = m(TEMPLATE.WIDTH_MM - TEMPLATE.MARGIN_LEFT - TEMPLATE.MARGIN_RIGHT);
    const fields = [
        { key: 'title', ratio: 0.28 },
        { key: 'subTitle', ratio: 0.10 },
        { key: 'scene', ratio: 0.10 },
        { key: 'cut', ratio: 0.10 },
        { key: 'time', ratio: 0.13 },
        { key: 'creator', ratio: 0.19 },
        { key: 'sheet', ratio: 0.10 }
    ];
    let cx = x;
    const baseValueSize = m(4.5);
    ctx.fillStyle = TEMPLATE.TEXT_COLOR;
    ctx.textBaseline = 'bottom';
    fields.forEach(f => {
        const fw = totalW * f.ratio;
        if (f.key === 'time') {
            const sec = metaData.lengthSec || '0';
            const fr = metaData.lengthFrame || '00';
            const valueSize = fitTextSize(ctx, sec + '+' + fr, fw - m(2), h - m(3), baseValueSize);
            ctx.font = `bold ${valueSize}px sans-serif`;
            ctx.textAlign = 'right';
            ctx.fillText(sec, cx + fw / 2 - m(3.5), y + h - m(1));
            ctx.textAlign = 'left';
            ctx.fillText(fr, cx + fw / 2 + m(3.5), y + h - m(1));
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
            ctx.fillStyle = TEMPLATE.TEXT_COLOR;
        } else {
            const val = f.key === 'sheet'
                ? (typeof getSheetLabel === 'function' ? getSheetLabel(pageIndex) : '1/1')
                : (metaData[f.key] || '');
            const valueSize = fitTextSize(ctx, val, fw - m(2), h - m(3), baseValueSize);
            ctx.font = `bold ${valueSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(val, cx + fw / 2, y + h - m(1));
        }
        cx += fw;
    });
}

function drawDirectionDataOnlyForPsd(ctx, scale, startY, areaH, bodyW, pageIndex) {
    if (typeof metaData === 'undefined' || !metaData.memo) return;
    const temp = createTransparentPsdCanvas(ctx.canvas.width, ctx.canvas.height);
    const tempCtx = temp.getContext('2d');
    drawDirectionArea(tempCtx, scale, startY, areaH, bodyW, pageIndex);
    stripTemplatePixelsForPsdData(tempCtx, temp.width, temp.height);
    ctx.drawImage(temp, 0, 0);
}

function stripTemplatePixelsForPsdData(ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const templateRgb = hexToRgb(TEMPLATE.TEMPLATE_COLOR);
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        const templateDist = Math.max(
            Math.abs(data[i] - templateRgb.r),
            Math.abs(data[i + 1] - templateRgb.g),
            Math.abs(data[i + 2] - templateRgb.b)
        );
        const isTemplateGreen = templateDist < 65 && data[i + 1] > data[i] && data[i + 1] > data[i + 2];
        const isVeryLight = data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245;
        if (isTemplateGreen || isVeryLight) data[i + 3] = 0;
    }
    ctx.putImageData(imageData, 0, 0);
}

function hexToRgb(hex) {
    const v = String(hex || '#000000').replace('#', '');
    return {
        r: parseInt(v.slice(0, 2), 16) || 0,
        g: parseInt(v.slice(2, 4), 16) || 0,
        b: parseInt(v.slice(4, 6), 16) || 0
    };
}

function drawTimelineDataOnlyForPsd(ctx, scale, startX, startY, bodyW, startFrame, pageIndex) {
    const m = (mm) => mm * scale;
    const rowH = m(TEMPLATE.ROW_HEIGHT);
    const colHeaderH = m(TEMPLATE.COL_HEADER_HEIGHT);
    const gridY = startY + colHeaderH;
    const cols = getActualColCounts();
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
    const pageStartFrame = (typeof getPageStartFrame === 'function') ? getPageStartFrame(pageIndex) : pageIndex * TEMPLATE.FRAMES_PER_PAGE;
    const absoluteStart = startFrame + pageStartFrame;
    let x = startX;

    drawCellDataInBlock(ctx, x, gridY, actionColW, cols.ACTION, rowH, 'ACTION', startFrame, pageIndex, scale);
    drawBarLines(ctx, x, gridY, actionColW, cols.ACTION, rowH, 'ACTION', absoluteStart, scale);
    drawRepeatMarksTemplate(ctx, x, gridY, actionColW, cols.ACTION, rowH, absoluteStart, scale);
    x += actionColW * cols.ACTION + frameNumW;

    drawDialogueBlocksTemplate(ctx, x, gridY, soundColW, cols.SOUND, rowH, absoluteStart, scale);
    x += soundColW * cols.SOUND;

    drawCellDataInBlock(ctx, x, gridY, cellColW, cols.CELL, rowH, 'CELL', startFrame, pageIndex, scale);
    drawBarLines(ctx, x, gridY, cellColW, cols.CELL, rowH, 'CELL', absoluteStart, scale);
    x += cellColW * cols.CELL;

    drawCameraBlocksTemplate(ctx, x, gridY, cameraColW, cols.CAMERA, rowH, absoluteStart, scale);
    drawCutLengthOverlay(ctx, startX, gridY, bodyW, rowH, absoluteStart, scale);
}

function writePsdBlob(width, height, layers, compositeCanvas, dpi) {
    const records = [];
    const channelChunks = [];

    layers.forEach(layer => {
        const channels = imageDataToPsdChannels(layer.imageData);
        const encodedChannels = channels.map(ch => encodePsdRleChannel(ch, width, height));
        records.push(createPsdLayerRecord(layer, width, height, encodedChannels.map(ch => ch.length)));
        channelChunks.push(...encodedChannels);
    });

    const recordsBlob = concatUint8(records);
    const channelLength = channelChunks.reduce((sum, c) => sum + c.length, 0);
    const layerInfoBodyLength = 2 + recordsBlob.length + channelLength;
    const layerInfoPad = layerInfoBodyLength % 2;
    const layerInfoLength = layerInfoBodyLength + layerInfoPad;
    const layerMaskLength = 4 + layerInfoLength + 4;

    const chunks = [];
    chunks.push(createPsdHeader(width, height));
    chunks.push(u32be(0));
    // Image Resources セクション (ResolutionInfo を含む)
    const imageResources = buildPsdImageResources(dpi || 300);
    chunks.push(u32be(imageResources.length));
    if (imageResources.length > 0) chunks.push(imageResources);
    chunks.push(u32be(layerMaskLength));
    chunks.push(u32be(layerInfoLength));
    chunks.push(i16be(layers.length));
    chunks.push(recordsBlob);
    chunks.push(...channelChunks);
    if (layerInfoPad) chunks.push(new Uint8Array([0]));
    chunks.push(u32be(0));

    const compositeData = compositeCanvas.getContext('2d').getImageData(0, 0, width, height).data;
    const compositeChannels = [
        extractPsdPlane(compositeData, width * height, 0),
        extractPsdPlane(compositeData, width * height, 1),
        extractPsdPlane(compositeData, width * height, 2)
    ];
    chunks.push(encodePsdRleComposite(compositeChannels, width, height));
    return new Blob(chunks, { type: 'image/vnd.adobe.photoshop' });
}

// PSD Image Resources セクション構築 (ResolutionInfo 1005 を含む)
function buildPsdImageResources(dpi) {
    const resBlocks = [];
    resBlocks.push(buildResolutionInfoBlock(dpi));
    return concatUint8(resBlocks);
}

// ResolutionInfo (resource id 1005) ブロック
// 構造:
//   '8BIM' (4) + uint16 id (1005) + Pascal name (空: 1+1=2 で偶数padding) + uint32 size + data(16) + pad
function buildResolutionInfoBlock(dpi) {
    const fixed1616 = (dpi << 16) >>> 0; // 16.16 fixed-point
    // 16-byte ResolutionInfo data
    const data = new Uint8Array(16);
    const dv = new DataView(data.buffer);
    dv.setUint32(0, fixed1616, false);  // hRes
    dv.setInt16(4, 1, false);            // hResUnit: 1 = pixels/inch
    dv.setInt16(6, 1, false);            // widthUnit: 1 = inches
    dv.setUint32(8, fixed1616, false);  // vRes
    dv.setInt16(12, 1, false);           // vResUnit
    dv.setInt16(14, 1, false);           // heightUnit
    // Image Resource Block ヘッダ
    // signature(4) + id(2) + pascal-name(2) + size(4) + data + (pad to even)
    const block = new Uint8Array(4 + 2 + 2 + 4 + 16);
    writeAscii(block, 0, '8BIM');
    const bv = new DataView(block.buffer);
    bv.setUint16(4, 1005, false);  // resource id = ResolutionInfo
    // Pascal name: 空文字。長さ1バイト(0) + パディング1バイト = 2バイト
    block[6] = 0;
    block[7] = 0;
    bv.setUint32(8, 16, false);    // data size
    block.set(data, 12);
    return block;
}

function createPsdHeader(width, height) {
    const b = new Uint8Array(26);
    const v = new DataView(b.buffer);
    writeAscii(b, 0, '8BPS');
    v.setUint16(4, 1, false);
    v.setUint16(12, 3, false);
    v.setUint32(14, height, false);
    v.setUint32(18, width, false);
    v.setUint16(22, 8, false);
    v.setUint16(24, 3, false);
    return b;
}

function createPsdLayerRecord(layer, width, height, channelLengths) {
    const layerName = createPsdPascalName(layer.name);
    const taggedBlocks = layer.sectionType ? [createSectionDividerBlock(layer.sectionType)] : [];
    const taggedLen = taggedBlocks.reduce((sum, b) => sum + b.length, 0);
    const extraLen = 4 + 4 + layerName.length + taggedLen;
    const len = 16 + 2 + channelLengths.length * 6 + 4 + 4 + 1 + 1 + 1 + 1 + 4 + extraLen;
    const b = new Uint8Array(len);
    const v = new DataView(b.buffer);
    let o = 0;
    v.setInt32(o, 0, false); o += 4;
    v.setInt32(o, 0, false); o += 4;
    v.setInt32(o, height, false); o += 4;
    v.setInt32(o, width, false); o += 4;
    v.setUint16(o, channelLengths.length, false); o += 2;
    const ids = [-1, 0, 1, 2];
    channelLengths.forEach((chLen, i) => {
        v.setInt16(o, ids[i], false); o += 2;
        v.setUint32(o, chLen, false); o += 4;
    });
    writeAscii(b, o, '8BIM'); o += 4;
    writeAscii(b, o, 'norm'); o += 4;
    b[o++] = 255;
    b[o++] = 0;
    b[o++] = layer.hidden ? 2 : 0;
    b[o++] = 0;
    v.setUint32(o, extraLen, false); o += 4;
    v.setUint32(o, 0, false); o += 4;
    v.setUint32(o, 0, false); o += 4;
    b.set(layerName, o); o += layerName.length;
    taggedBlocks.forEach(block => {
        b.set(block, o);
        o += block.length;
    });
    return b;
}

function createSectionDividerBlock(sectionType) {
    const b = new Uint8Array(16);
    const v = new DataView(b.buffer);
    writeAscii(b, 0, '8BIM');
    writeAscii(b, 4, 'lsct');
    v.setUint32(8, 4, false);
    v.setUint32(12, sectionType, false);
    return b;
}

function imageDataToPsdChannels(imageData) {
    const data = imageData.data;
    const pixelCount = imageData.width * imageData.height;
    return [
        extractPsdPlane(data, pixelCount, 3),
        extractPsdPlane(data, pixelCount, 0),
        extractPsdPlane(data, pixelCount, 1),
        extractPsdPlane(data, pixelCount, 2)
    ];
}

function extractPsdPlane(rgba, pixelCount, offset) {
    const plane = new Uint8Array(pixelCount);
    for (let i = 0, p = offset; i < pixelCount; i++, p += 4) plane[i] = rgba[p];
    return plane;
}

function encodePsdRleComposite(channels, width, height) {
    const encoded = channels.map(ch => encodePsdRleRows(ch, width, height));
    return concatUint8([u16be(1), concatUint8(encoded.map(e => e.counts)), concatUint8(encoded.map(e => e.data))]);
}

function encodePsdRleChannel(channel, width, height) {
    const encoded = encodePsdRleRows(channel, width, height);
    return concatUint8([u16be(1), encoded.counts, encoded.data]);
}

function encodePsdRleRows(channel, width, height) {
    const counts = new Uint8Array(height * 2);
    const countView = new DataView(counts.buffer);
    const rows = [];
    for (let y = 0; y < height; y++) {
        const row = channel.subarray(y * width, (y + 1) * width);
        const encoded = packBits(row);
        countView.setUint16(y * 2, encoded.length, false);
        rows.push(encoded);
    }
    return { counts, data: concatUint8(rows) };
}

function packBits(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
        let run = 1;
        while (i + run < src.length && run < 128 && src[i] === src[i + run]) run++;
        if (run >= 3) {
            out.push(257 - run, src[i]);
            i += run;
            continue;
        }
        const start = i;
        // 初回 run 加算でリテラル長が128を超えないようクランプ
        const initLen = Math.min(run, 128);
        i += initLen;
        while (i < src.length) {
            run = 1;
            while (i + run < src.length && run < 128 && src[i] === src[i + run]) run++;
            // 重要: i += run しても (i - start) が 128 を超えないようにする
            // 旧コードは run が大きい時にリテラル長が 128 を超え、PackBits規格違反だった
            if (run >= 3) break;
            if ((i - start) + run > 128) break;
            i += run;
        }
        const len = i - start;
        out.push(len - 1);
        for (let j = start; j < i; j++) out.push(src[j]);
    }
    return new Uint8Array(out);
}

function createPsdPascalName(name) {
    const raw = asciiBytes(name.slice(0, 255));
    const total = 1 + raw.length;
    const padded = Math.ceil(total / 4) * 4;
    const b = new Uint8Array(padded);
    b[0] = raw.length;
    b.set(raw, 1);
    return b;
}

function asciiBytes(s) {
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0x7f;
    return b;
}

function writeAscii(target, offset, s) {
    for (let i = 0; i < s.length; i++) target[offset + i] = s.charCodeAt(i);
}

function u16be(n) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, n, false);
    return b;
}

function i16be(n) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setInt16(0, n, false);
    return b;
}

function u32be(n) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, false);
    return b;
}

function concatUint8(parts) {
    const total = parts.reduce((sum, p) => sum + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    parts.forEach(p => {
        out.set(p, o);
        o += p.length;
    });
    return out;
}
