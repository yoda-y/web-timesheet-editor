// === Preview 手書きレイヤー ===
// 編集時は150dpiのページ別透明キャンバスに描画する。

const HANDWRITING_TOOLS = ['hand', 'pen', 'eraser', 'select-rect', 'select-lasso', 'transform'];
const HANDWRITING_SIZE_PX = {
    pen: { small: 1, medium: 2, large: 4 },
    eraser: { small: 9, medium: 16, large: 26 }
};
const PREVIEW_TOOL_SHORTCUT_ACTIONS = {
    pen: 'preview.tool.pen',
    eraser: 'preview.tool.eraser',
    'select-rect': 'preview.tool.rect',
    'select-lasso': 'preview.tool.lasso',
    transform: 'preview.tool.transform',
    hand: 'preview.tool.hand'
};
const HANDWRITING_BASE_DPI = 150;

let handwritingCanvas = null;
let handwritingCtx = null;
let handwritingUiCanvas = null;
let handwritingUiCtx = null;
let activePreviewTool = 'hand';
let isSpaceHandActive = false;
let handwritingPages = {};
let handwritingDrag = null;
let selectedStrokeIds = new Set();
let transformSession = null;
let handwritingActionPopover = null;
let lastPrimaryPreviewTool = 'pen';
let transformReturnTool = 'pen';
let previewZoomDrag = null;
let handwritingUndoStack = [];
let handwritingRedoStack = [];
let handwritingImageCache = new Map();

function getHandwritingPageKey(pageIndex = currentPage) {
    return `page-${pageIndex}`;
}

function getHandwritingPage(pageIndex = currentPage) {
    const key = getHandwritingPageKey(pageIndex);
    if (!handwritingPages[key]) handwritingPages[key] = { strokes: [], images: [] };
    if (!Array.isArray(handwritingPages[key].strokes)) handwritingPages[key].strokes = [];
    if (!Array.isArray(handwritingPages[key].images)) handwritingPages[key].images = [];
    return handwritingPages[key];
}

function exportHandwritingData() {
    return JSON.parse(JSON.stringify(handwritingPages || {}));
}

function importHandwritingData(data) {
    handwritingPages = data ? JSON.parse(JSON.stringify(data)) : {};
    handwritingImageCache = new Map();
    Object.keys(handwritingPages).forEach(key => {
        if (!Array.isArray(handwritingPages[key].strokes)) handwritingPages[key].strokes = [];
        if (!Array.isArray(handwritingPages[key].images)) handwritingPages[key].images = [];
    });
    selectedStrokeIds.clear();
    handwritingDrag = null;
    transformSession = null;
    if (handwritingCanvas && handwritingUiCanvas) {
        renderHandwritingLayer();
        drawHandwritingUi();
    }
}

function resetHandwritingData() {
    handwritingPages = {};
    handwritingImageCache = new Map();
    handwritingUndoStack = [];
    handwritingRedoStack = [];
    selectedStrokeIds.clear();
    handwritingDrag = null;
    transformSession = null;
    if (handwritingCanvas && handwritingCtx) {
        handwritingCtx.clearRect(0, 0, handwritingCanvas.width, handwritingCanvas.height);
    }
    if (handwritingUiCanvas && handwritingUiCtx) {
        handwritingUiCtx.clearRect(0, 0, handwritingUiCanvas.width, handwritingUiCanvas.height);
    }
    if (handwritingActionPopover) {
        handwritingActionPopover.style.display = 'none';
        handwritingActionPopover.innerHTML = '';
    }
}

function markHandwritingDirty() {
    if (typeof markDirty === 'function') markDirty();
}

function snapshotHandwritingState() {
    return JSON.stringify(handwritingPages || {});
}

function restoreHandwritingState(raw) {
    importHandwritingData(JSON.parse(raw || '{}'));
    markHandwritingDirty();
}

function pushHandwritingHistory() {
    handwritingUndoStack.push(snapshotHandwritingState());
    handwritingRedoStack = [];
    if (handwritingUndoStack.length > 100) handwritingUndoStack.shift();
}

function undoHandwriting() {
    if (handwritingUndoStack.length === 0) return;
    handwritingRedoStack.push(snapshotHandwritingState());
    restoreHandwritingState(handwritingUndoStack.pop());
}

function redoHandwriting() {
    if (handwritingRedoStack.length === 0) return;
    handwritingUndoStack.push(snapshotHandwritingState());
    restoreHandwritingState(handwritingRedoStack.pop());
}

function ensureHandwritingLayer(width, height) {
    const stage = document.getElementById('preview-stage');
    if (!stage) return;

    handwritingCanvas = document.getElementById('handwriting-canvas');
    if (!handwritingCanvas) {
        handwritingCanvas = document.createElement('canvas');
        handwritingCanvas.id = 'handwriting-canvas';
        stage.appendChild(handwritingCanvas);
    }
    handwritingCtx = handwritingCanvas.getContext('2d');

    handwritingUiCanvas = document.getElementById('handwriting-ui-canvas');
    if (!handwritingUiCanvas) {
        handwritingUiCanvas = document.createElement('canvas');
        handwritingUiCanvas.id = 'handwriting-ui-canvas';
        stage.appendChild(handwritingUiCanvas);
        bindHandwritingCanvasEvents();
    }
    handwritingUiCtx = handwritingUiCanvas.getContext('2d');

    handwritingActionPopover = document.getElementById('handwriting-action-popover');
    if (!handwritingActionPopover) {
        handwritingActionPopover = document.createElement('div');
        handwritingActionPopover.id = 'handwriting-action-popover';
        handwritingActionPopover.className = 'handwriting-action-popover';
        stage.appendChild(handwritingActionPopover);
    }

    [handwritingCanvas, handwritingUiCanvas].forEach(canvas => {
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
    });

    renderHandwritingLayer();
    drawHandwritingUi();
    refreshPreviewToolButtons();
}

function bindHandwritingCanvasEvents() {
    handwritingUiCanvas.addEventListener('pointerdown', handleHandwritingPointerDown);
    handwritingUiCanvas.addEventListener('pointermove', handleHandwritingPointerMove);
    handwritingUiCanvas.addEventListener('pointerup', handleHandwritingPointerUp);
    handwritingUiCanvas.addEventListener('pointercancel', handleHandwritingPointerUp);
    handwritingUiCanvas.addEventListener('pointerleave', handleHandwritingPointerUp);
}

function initPreviewToolButtons() {
    document.querySelectorAll('.sidebar-tool').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('disabled')) return;
            setPreviewTool(btn.dataset.tool || 'hand');
        });
    });
    refreshPreviewToolButtons();
}

function setPreviewTool(tool) {
    if (!HANDWRITING_TOOLS.includes(tool)) return;
    if (tool !== 'transform' && selectedStrokeIds.size > 0) {
        clearHandwritingSelection();
    }
    if (tool === 'pen' || tool === 'eraser' || tool === 'hand') {
        lastPrimaryPreviewTool = tool;
    }
    activePreviewTool = tool;
    if (tool === 'transform' && selectedStrokeIds.size > 0 && !transformSession) {
        beginTransformSelection();
    }
    refreshPreviewToolButtons();
    drawHandwritingUi();
}

function getEffectivePreviewTool() {
    return isSpaceHandActive ? 'hand' : activePreviewTool;
}

function refreshPreviewToolButtons() {
    document.querySelectorAll('.sidebar-tool').forEach(btn => {
        const tool = btn.dataset.tool || 'hand';
        btn.classList.toggle('active', tool === activePreviewTool);
        const actionId = PREVIEW_TOOL_SHORTCUT_ACTIONS[tool];
        if (actionId) btn.title = getShortcutLabel(actionId, btn.title || '');
    });
    if (!handwritingUiCanvas) return;
    const tool = getEffectivePreviewTool();
    handwritingUiCanvas.style.cursor = tool === 'hand' ? 'grab' :
        tool === 'pen' ? 'crosshair' :
        tool === 'eraser' ? 'cell' :
        tool === 'transform' ? 'move' : 'crosshair';
}

function getDrawingSizePx(tool) {
    const size = typeof getDrawingSize === 'function' ? getDrawingSize(tool) : 'medium';
    return HANDWRITING_SIZE_PX[tool]?.[size] || HANDWRITING_SIZE_PX.pen.medium;
}

function getHandwritingColor() {
    if (typeof getFontColorById === 'function') return getFontColorById(activeFontColorId || 0);
    return '#000000';
}

function getHandwritingUiColor(kind) {
    const defaults = kind === 'transform' ? '#d81b60' : '#00a8ff';
    const key = kind === 'transform' ? 'handwritingTransform' : 'handwritingSelect';
    const value = settings?.colors?.[key];
    return value && value !== 'auto' ? value : defaults;
}

function previewClientToCanvasPoint(e) {
    const stage = document.getElementById('preview-stage');
    if (!stage) return { x: 0, y: 0 };
    const rect = stage.getBoundingClientRect();
    const baseScale = stage ? parseFloat(stage.dataset.baseScale || '1') : 1;
    const scale = previewZoom * baseScale;
    return {
        x: (e.clientX - rect.left) / scale,
        y: (e.clientY - rect.top) / scale
    };
}

function handleHandwritingPointerDown(e) {
    if (currentMode !== 'preview' || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const tool = getEffectivePreviewTool();
    const pt = previewClientToCanvasPoint(e);
    handwritingUiCanvas.setPointerCapture(e.pointerId);

    if (tool === 'hand') {
        if (isSpaceHandActive && e.ctrlKey) {
            previewZoomDrag = {
                startY: e.clientY,
                startZoom: previewZoom,
                anchorX: e.clientX,
                anchorY: e.clientY
            };
            handwritingUiCanvas.style.cursor = 'zoom-in';
            e.preventDefault();
            return;
        }
        previewIsDragging = true;
        previewDragStartX = e.clientX;
        previewDragStartY = e.clientY;
        previewPanStartX = previewPanX;
        previewPanStartY = previewPanY;
        handwritingUiCanvas.style.cursor = 'grabbing';
        e.preventDefault();
        return;
    }

    if (tool === 'pen' || tool === 'eraser') {
        handwritingDrag = {
            type: tool,
            stroke: {
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                tool,
                color: getHandwritingColor(),
                width: getDrawingSizePx(tool),
                points: [pt]
            },
            start: pt,
            straight: tool === 'pen' && e.shiftKey
        };
        e.preventDefault();
        return;
    }

    if (tool === 'select-rect') {
        handwritingDrag = { type: 'select-rect', start: pt, end: pt };
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) selectedStrokeIds.clear();
        endTransformSession(false);
        drawHandwritingUi();
        e.preventDefault();
        return;
    }

    if (tool === 'select-lasso') {
        handwritingDrag = { type: 'select-lasso', points: [pt] };
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) selectedStrokeIds.clear();
        endTransformSession(false);
        drawHandwritingUi();
        e.preventDefault();
        return;
    }

    if (tool === 'transform') {
        const box = getSelectedStrokesBounds();
        const handle = box ? hitTransformHandle(pt, box) : null;
        if (box && (handle || pointInRect(pt, box))) {
            handwritingDrag = {
                type: 'transform',
                mode: handle ? `scale-${handle}` : 'move',
                start: pt,
                originalBounds: { ...box },
                originals: cloneSelectedStrokes()
            };
        }
        e.preventDefault();
    }
}

function handleHandwritingPointerMove(e) {
    e.preventDefault();
    e.stopPropagation();
    if (previewZoomDrag) {
        const rect = previewContainer.getBoundingClientRect();
        const mouseX = previewZoomDrag.anchorX - rect.left;
        const mouseY = previewZoomDrag.anchorY - rect.top;
        const oldZoom = previewZoom;
        const dy = previewZoomDrag.startY - e.clientY;
        const newZoom = Math.max(0.25, Math.min(5, previewZoomDrag.startZoom * Math.pow(1.01, dy)));
        previewPanX = mouseX - (mouseX - previewPanX) * (newZoom / oldZoom);
        previewPanY = mouseY - (mouseY - previewPanY) * (newZoom / oldZoom);
        previewZoom = newZoom;
        applyPreviewTransform();
        return;
    }
    if (previewIsDragging && getEffectivePreviewTool() === 'hand') {
        const dx = e.clientX - previewDragStartX;
        const dy = e.clientY - previewDragStartY;
        previewPanX = previewPanStartX + dx;
        previewPanY = previewPanStartY + dy;
        applyPreviewTransform();
        return;
    }

    if (!handwritingDrag) return;
    const pt = previewClientToCanvasPoint(e);

    if (handwritingDrag.type === 'pen' || handwritingDrag.type === 'eraser') {
        if (handwritingDrag.type === 'pen' && e.shiftKey) {
            handwritingDrag.straight = true;
            handwritingDrag.stroke.points = [handwritingDrag.start, pt];
        } else {
            handwritingDrag.stroke.points.push(pt);
        }
        renderHandwritingLayer();
        drawStroke(handwritingCtx, handwritingDrag.stroke);
        return;
    }

    if (handwritingDrag.type === 'select-rect') {
        handwritingDrag.end = pt;
        drawHandwritingUi();
        return;
    }

    if (handwritingDrag.type === 'select-lasso') {
        handwritingDrag.points.push(pt);
        drawHandwritingUi();
        return;
    }

    if (handwritingDrag.type === 'transform') {
        const dx = pt.x - handwritingDrag.start.x;
        const dy = pt.y - handwritingDrag.start.y;
        applySelectedTransform(dx, dy, pt);
        renderHandwritingLayer();
        drawHandwritingUi();
    }
}

function handleHandwritingPointerUp(e) {
    e.stopPropagation();
    if (previewZoomDrag) {
        previewZoomDrag = null;
        refreshPreviewToolButtons();
        return;
    }
    if (previewIsDragging && getEffectivePreviewTool() === 'hand') {
        previewIsDragging = false;
        refreshPreviewToolButtons();
        return;
    }
    if (!handwritingDrag) return;

    const page = getHandwritingPage();
    if (handwritingDrag.type === 'pen' || handwritingDrag.type === 'eraser') {
        if (handwritingDrag.stroke.points.length > 1) {
            pushHandwritingHistory();
            page.strokes.push(handwritingDrag.stroke);
            markHandwritingDirty();
        }
        handwritingDrag = null;
        renderHandwritingLayer();
        return;
    }

    if (handwritingDrag.type === 'select-rect') {
        applySelection(selectStrokesInRect(normalizeRect(handwritingDrag.start, handwritingDrag.end)), e);
    } else if (handwritingDrag.type === 'select-lasso') {
        applySelection(selectStrokesInPolygon(handwritingDrag.points), e);
    }

    handwritingDrag = null;
    drawHandwritingUi();
}

function renderHandwritingLayer() {
    if (!handwritingCtx || !handwritingCanvas) return;
    handwritingCtx.clearRect(0, 0, handwritingCanvas.width, handwritingCanvas.height);
    getHandwritingPage().images.forEach(img => drawHandwritingImage(handwritingCtx, img));
    getHandwritingPage().strokes.forEach(stroke => drawStroke(handwritingCtx, stroke));
}

function drawHandwritingImage(ctx, imageData) {
    if (!imageData?.dataUrl) return;
    const cached = handwritingImageCache.get(imageData.dataUrl);
    if (cached && cached.complete) {
        drawHandwritingImageElement(ctx, cached, imageData);
        return;
    }
    const img = new Image();
    img.onload = () => {
        handwritingImageCache.set(imageData.dataUrl, img);
        renderHandwritingLayer();
    };
    img.src = imageData.dataUrl;
    handwritingImageCache.set(imageData.dataUrl, img);
}

function drawHandwritingImageElement(ctx, img, imageData) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(img, imageData.x || 0, imageData.y || 0, imageData.w || handwritingCanvas.width, imageData.h || handwritingCanvas.height);
    ctx.restore();
}

function drawStroke(ctx, stroke) {
    if (!stroke.points || stroke.points.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke.width;
    if (stroke.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color || '#000000';
    }
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
}

function hasHandwritingOnPage(pageIndex) {
    const page = handwritingPages[getHandwritingPageKey(pageIndex)];
    return !!(page && ((Array.isArray(page.strokes) && page.strokes.length > 0) || (Array.isArray(page.images) && page.images.length > 0)));
}

function getHandwritingPageIndexes() {
    const totalPages = (typeof getTotalPages === 'function') ? getTotalPages() : 1;
    const indexes = new Set();
    for (let i = 0; i < totalPages; i++) {
        if (hasHandwritingOnPage(i)) indexes.add(i);
    }
    Object.keys(handwritingPages || {}).forEach(key => {
        const match = key.match(/^page-(\d+)$/);
        if (match && hasHandwritingOnPage(parseInt(match[1], 10))) indexes.add(parseInt(match[1], 10));
    });
    return [...indexes].sort((a, b) => a - b);
}

async function loadImageForCanvas(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

async function renderHandwritingPageToCanvas(pageIndex, dpi = HANDWRITING_BASE_DPI, sourcePages = handwritingPages) {
    const scale = dpi / HANDWRITING_BASE_DPI;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(TEMPLATE.WIDTH_MM * dpi / 25.4);
    canvas.height = Math.round(TEMPLATE.HEIGHT_MM * dpi / 25.4);
    const ctx = canvas.getContext('2d');
    const page = sourcePages?.[getHandwritingPageKey(pageIndex)];
    if (!page) return canvas;
    for (const imageData of (page.images || [])) {
        try {
            const img = await loadImageForCanvas(imageData.dataUrl);
            ctx.drawImage(img, (imageData.x || 0) * scale, (imageData.y || 0) * scale, (imageData.w || canvas.width / scale) * scale, (imageData.h || canvas.height / scale) * scale);
        } catch (e) {}
    }
    (page.strokes || []).forEach(stroke => {
        const scaledStroke = {
            ...stroke,
            width: stroke.width * scale,
            points: (stroke.points || []).map(pt => ({ x: pt.x * scale, y: pt.y * scale }))
        };
        drawStroke(ctx, scaledStroke);
    });
    return canvas;
}

function expandHandwritingFilenameTemplate(pageIndex, ext = 'png') {
    const template = settings?.preview?.exportFilenameTemplate || '%title_%scene_%cut';
    const pageLabel = (typeof getSheetLabel === 'function') ? getSheetLabel(pageIndex) : String(pageIndex + 1);
    const baseName = template
        .replace(/%title/g, metaData.title || 'timesheet')
        .replace(/%episode/g, metaData.subTitle || '')
        .replace(/%scene/g, metaData.scene || '')
        .replace(/%cut/g, metaData.cut || '001');
    const safePage = pageLabel.replace(/[\\/:*?"<>|]/g, '-');
    return `${baseName}_handwriting_p${safePage}.${ext}`.replace(/[\\/:*?"<>|]/g, '_');
}

function canvasToBlob(canvas, mimeType = 'image/png') {
    return new Promise(resolve => canvas.toBlob(resolve, mimeType));
}

async function saveHandwritingPngBlob(canvas, filename, directoryHandle) {
    const blob = await canvasToBlob(canvas, 'image/png');
    if (!blob) return;
    if (directoryHandle) {
        const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
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

async function exportHandwritingPngPages(dpi = HANDWRITING_BASE_DPI) {
    const pageIndexes = getHandwritingPageIndexes();
    if (pageIndexes.length === 0) {
        alert('手書きデータがありません。');
        return;
    }

    let directoryHandle = null;
    if (window.showDirectoryPicker && pageIndexes.length > 1) {
        try {
            directoryHandle = await window.showDirectoryPicker();
        } catch (e) {
            if (e && e.name === 'AbortError') return;
        }
    }

    for (const pageIndex of pageIndexes) {
        const canvas = await renderHandwritingPageToCanvas(pageIndex, dpi);
        await saveHandwritingPngBlob(canvas, expandHandwritingFilenameTemplate(pageIndex, 'png'), directoryHandle);
    }
}

function getHandwritingPageIndexesFromData(sourcePages) {
    const indexes = new Set();
    Object.keys(sourcePages || {}).forEach(key => {
        const match = key.match(/^page-(\d+)$/);
        if (!match) return;
        const page = sourcePages[key];
        if ((page.strokes && page.strokes.length) || (page.images && page.images.length)) indexes.add(parseInt(match[1], 10));
    });
    return [...indexes].sort((a, b) => a - b);
}

async function exportHandwritingBundleToDirectory(directoryHandle, folderName, sheetsData, dpi = HANDWRITING_BASE_DPI) {
    if (!directoryHandle || !window.showDirectoryPicker) return;
    const safeFolderName = sanitizeFilePart(folderName.replace(/\.tdts$/i, '')) || 'timesheet';
    const handwritingDir = await directoryHandle.getDirectoryHandle(safeFolderName, { create: true });
    const entries = [];
    for (let si = 0; si < sheetsData.length; si++) {
        const sheet = sheetsData[si];
        const pages = sheet.handwritingPages || {};
        const pageIndexes = getHandwritingPageIndexesFromData(pages);
        for (const pageIndex of pageIndexes) {
            const canvas = await renderHandwritingPageToCanvas(pageIndex, dpi, pages);
            const filename = `${safeFolderName}_sheet${si + 1}_p${pageIndex + 1}.png`;
            await saveHandwritingPngBlob(canvas, filename, handwritingDir);
            entries.push({ sheet: si + 1, page: pageIndex + 1, file: filename });
        }
    }
    await saveHandwritingIni(handwritingDir, entries, dpi);
}

async function saveHandwritingIni(directoryHandle, entries, dpi) {
    const lines = [
        '[XDTSViewer]',
        'type=handwriting',
        `dpi=${dpi}`,
        `count=${entries.length}`
    ];
    entries.forEach((entry, index) => {
        const n = index + 1;
        lines.push(`file${n}=${entry.file}`);
        lines.push(`sheet${n}=${entry.sheet}`);
        lines.push(`page${n}=${entry.page}`);
    });
    const fileHandle = await directoryHandle.getFileHandle('handwriting.ini', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(lines.join('\n'));
    await writable.close();
}

async function importHandwritingBundleFromDirectory(directoryHandle, folderName) {
    if (!directoryHandle) return 0;
    const safeFolderName = sanitizeFilePart(folderName.replace(/\.(tdts|xdts)$/i, '')) || 'timesheet';
    let handwritingDir;
    try {
        handwritingDir = await directoryHandle.getDirectoryHandle(safeFolderName);
    } catch (e) {
        return 0;
    }

    let iniFile;
    try {
        iniFile = await (await handwritingDir.getFileHandle('handwriting.ini')).getFile();
    } catch (e) {
        return 0;
    }

    const entries = parseHandwritingIni(await iniFile.text());
    if (entries.length === 0) return 0;

    let imported = 0;
    for (const entry of entries) {
        try {
            const file = await (await handwritingDir.getFileHandle(entry.file)).getFile();
            const dataUrl = await readFileAsDataUrl(file);
            const sheetIndex = Math.max(0, entry.sheet - 1);
            const pageIndex = Math.max(0, entry.page - 1);
            const targetSheet = (typeof sheets !== 'undefined') ? sheets[sheetIndex] : null;
            if (!targetSheet) continue;
            if (!targetSheet.handwritingPages) targetSheet.handwritingPages = {};
            const key = getHandwritingPageKey(pageIndex);
            targetSheet.handwritingPages[key] = {
                strokes: [],
                images: [{
                    id: `bundle-${Date.now()}-${imported}`,
                    dataUrl,
                    x: 0,
                    y: 0,
                    w: Math.round(TEMPLATE.WIDTH_MM * HANDWRITING_BASE_DPI / 25.4),
                    h: Math.round(TEMPLATE.HEIGHT_MM * HANDWRITING_BASE_DPI / 25.4)
                }]
            };
            imported++;
        } catch (e) {}
    }

    if (imported > 0 && typeof currentSheetIndex !== 'undefined' && typeof sheets !== 'undefined' && sheets[currentSheetIndex]) {
        importHandwritingData(sheets[currentSheetIndex].handwritingPages || {});
    }
    return imported;
}

function parseHandwritingIni(text) {
    const values = {};
    String(text || '').split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#') || trimmed.startsWith('[')) return;
        const eq = trimmed.indexOf('=');
        if (eq === -1) return;
        values[trimmed.slice(0, eq).trim().toLowerCase()] = trimmed.slice(eq + 1).trim();
    });
    const count = parseInt(values.count || '0', 10);
    const entries = [];
    const max = count > 0 ? count : Object.keys(values).filter(k => /^file\d+$/.test(k)).length;
    for (let i = 1; i <= max; i++) {
        const file = values[`file${i}`];
        if (!file) continue;
        entries.push({
            file,
            sheet: parseInt(values[`sheet${i}`] || '1', 10) || 1,
            page: parseInt(values[`page${i}`] || '1', 10) || 1
        });
    }
    return entries;
}

function sanitizeFilePart(value) {
    return String(value || '').replace(/[\\/:*?"<>|]/g, '_').trim();
}

async function importHandwritingPngFiles() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png';
    input.multiple = true;
    input.onchange = async () => {
        const files = Array.from(input.files || []);
        if (!files.length) return;
        pushHandwritingHistory();
        for (let i = 0; i < files.length; i++) {
            const dataUrl = await readFileAsDataUrl(files[i]);
            const page = getHandwritingPage(currentPage + i);
            page.images.push({
                id: `${Date.now()}-${i}`,
                dataUrl,
                x: 0,
                y: 0,
                w: handwritingCanvas?.width || Math.round(TEMPLATE.WIDTH_MM * HANDWRITING_BASE_DPI / 25.4),
                h: handwritingCanvas?.height || Math.round(TEMPLATE.HEIGHT_MM * HANDWRITING_BASE_DPI / 25.4)
            });
        }
        renderHandwritingLayer();
        drawHandwritingUi();
        markHandwritingDirty();
    };
    input.click();
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function drawHandwritingUi() {
    if (!handwritingUiCtx || !handwritingUiCanvas) return;
    handwritingUiCtx.clearRect(0, 0, handwritingUiCanvas.width, handwritingUiCanvas.height);
    handwritingUiCtx.save();
    const uiKind = (activePreviewTool === 'transform' || !!transformSession) ? 'transform' : 'select';
    const uiColor = getHandwritingUiColor(uiKind);
    handwritingUiCtx.strokeStyle = uiColor;
    handwritingUiCtx.fillStyle = uiColor;
    handwritingUiCtx.lineWidth = 2;
    handwritingUiCtx.setLineDash([8, 5]);

    if (handwritingDrag?.type === 'select-rect') {
        const r = normalizeRect(handwritingDrag.start, handwritingDrag.end);
        handwritingUiCtx.strokeRect(r.x, r.y, r.w, r.h);
    } else if (handwritingDrag?.type === 'select-lasso') {
        drawPolygonPath(handwritingUiCtx, handwritingDrag.points, false);
        handwritingUiCtx.stroke();
    }

    const box = getSelectedStrokesBounds();
    if (box) {
        handwritingUiCtx.setLineDash([6, 4]);
        handwritingUiCtx.strokeRect(box.x, box.y, box.w, box.h);
        handwritingUiCtx.setLineDash([]);
        drawHandle(handwritingUiCtx, box.x, box.y);
        drawHandle(handwritingUiCtx, box.x + box.w, box.y);
        drawHandle(handwritingUiCtx, box.x, box.y + box.h);
        drawHandle(handwritingUiCtx, box.x + box.w, box.y + box.h);
    }
    handwritingUiCtx.restore();
    updateHandwritingActionPopover();
}

function drawHandle(ctx, x, y) {
    ctx.fillRect(x - 4, y - 4, 8, 8);
}

function hitTransformHandle(pt, box) {
    const handles = {
        nw: { x: box.x, y: box.y },
        ne: { x: box.x + box.w, y: box.y },
        sw: { x: box.x, y: box.y + box.h },
        se: { x: box.x + box.w, y: box.y + box.h }
    };
    return Object.entries(handles).find(([, h]) => Math.abs(pt.x - h.x) <= 10 && Math.abs(pt.y - h.y) <= 10)?.[0] || null;
}

function normalizeRect(a, b) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

function pointInRect(pt, rect) {
    return pt.x >= rect.x && pt.x <= rect.x + rect.w && pt.y >= rect.y && pt.y <= rect.y + rect.h;
}

function getStrokeBounds(stroke) {
    if (!stroke.points?.length || stroke.tool === 'eraser') return null;
    const xs = stroke.points.map(p => p.x);
    const ys = stroke.points.map(p => p.y);
    const pad = stroke.width / 2;
    return {
        x: Math.min(...xs) - pad,
        y: Math.min(...ys) - pad,
        w: Math.max(...xs) - Math.min(...xs) + pad * 2,
        h: Math.max(...ys) - Math.min(...ys) + pad * 2
    };
}

function getSelectedStrokesBounds() {
    const boxes = getHandwritingPage().strokes
        .filter(stroke => selectedStrokeIds.has(stroke.id))
        .map(getStrokeBounds)
        .filter(Boolean);
    if (!boxes.length) return null;
    const x1 = Math.min(...boxes.map(b => b.x));
    const y1 = Math.min(...boxes.map(b => b.y));
    const x2 = Math.max(...boxes.map(b => b.x + b.w));
    const y2 = Math.max(...boxes.map(b => b.y + b.h));
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function rectsIntersect(a, b) {
    return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

function selectStrokesInRect(rect) {
    const ids = new Set();
    getHandwritingPage().strokes.forEach(stroke => {
        const box = getStrokeBounds(stroke);
        if (box && rectsIntersect(rect, box)) ids.add(stroke.id);
    });
    return ids;
}

function selectStrokesInPolygon(poly) {
    const ids = new Set();
    getHandwritingPage().strokes.forEach(stroke => {
        if (stroke.tool === 'eraser') return;
        if (stroke.points.some(pt => pointInPolygon(pt, poly))) ids.add(stroke.id);
    });
    return ids;
}

function applySelection(ids, event) {
    endTransformSession(false);
    if (event.shiftKey) {
        ids.forEach(id => selectedStrokeIds.add(id));
        return;
    }
    if (event.ctrlKey || event.metaKey) {
        ids.forEach(id => selectedStrokeIds.delete(id));
        return;
    }
    selectedStrokeIds = ids;
}

function beginTransformSelection() {
    if (selectedStrokeIds.size === 0) return;
    pushHandwritingHistory();
    transformReturnTool = lastPrimaryPreviewTool || 'pen';
    activePreviewTool = 'transform';
    transformSession = { originals: cloneSelectedStrokes() };
    refreshPreviewToolButtons();
    drawHandwritingUi();
}

function confirmTransformSelection() {
    endTransformSession(false);
    activePreviewTool = transformReturnTool || lastPrimaryPreviewTool || 'pen';
    refreshPreviewToolButtons();
    drawHandwritingUi();
    markHandwritingDirty();
}

function cancelTransformSelection() {
    endTransformSession(true);
    activePreviewTool = transformReturnTool || lastPrimaryPreviewTool || 'pen';
    refreshPreviewToolButtons();
    renderHandwritingLayer();
    drawHandwritingUi();
}

function endTransformSession(restore) {
    if (restore && transformSession) {
        getHandwritingPage().strokes.forEach(stroke => {
            const original = transformSession.originals.get(stroke.id);
            if (original) stroke.points = original.map(p => ({ ...p }));
        });
    }
    transformSession = null;
}

function clearHandwritingSelection() {
    endTransformSession(false);
    selectedStrokeIds.clear();
    handwritingDrag = null;
    drawHandwritingUi();
}

function deleteSelectedStrokes() {
    if (selectedStrokeIds.size === 0) return;
    pushHandwritingHistory();
    endTransformSession(false);
    const page = getHandwritingPage();
    page.strokes = page.strokes.filter(stroke => !selectedStrokeIds.has(stroke.id));
    selectedStrokeIds.clear();
    handwritingDrag = null;
    renderHandwritingLayer();
    drawHandwritingUi();
    markHandwritingDirty();
}

function updateHandwritingActionPopover() {
    if (!handwritingActionPopover) return;
    const box = getSelectedStrokesBounds();
    if (!box) {
        handwritingActionPopover.style.display = 'none';
        handwritingActionPopover.innerHTML = '';
        return;
    }

    const isTransforming = activePreviewTool === 'transform' || !!transformSession;
    handwritingActionPopover.style.display = 'flex';
    handwritingActionPopover.style.left = `${box.x + box.w / 2}px`;
    handwritingActionPopover.style.top = `${box.y + box.h + 14}px`;
    handwritingActionPopover.innerHTML = '';

    if (isTransforming) {
        handwritingActionPopover.appendChild(createPopoverButton('確定', confirmTransformSelection, getShortcutLabel('preview.confirm', 'Enter')));
        handwritingActionPopover.appendChild(createPopoverButton('キャンセル', cancelTransformSelection, getShortcutLabel('preview.cancel', 'Esc')));
    } else {
        handwritingActionPopover.appendChild(createPopoverButton('変形', beginTransformSelection, getShortcutLabel('preview.confirm', 'Enter')));
        handwritingActionPopover.appendChild(createPopoverButton('削除', deleteSelectedStrokes, getShortcutLabel('preview.deleteSelection', 'Del')));
        handwritingActionPopover.appendChild(createPopoverButton('選択解除', clearHandwritingSelection, getShortcutLabel('preview.clearSelection', 'Ctrl+D')));
    }
}

function getShortcutLabel(actionId, fallback) {
    const sc = settings?.shortcuts?.[actionId];
    return sc?.main || sc?.sub || fallback;
}

function createPopoverButton(label, onClick, shortcut) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = shortcut ? `${label} ${shortcut}` : label;
    btn.addEventListener('pointerdown', e => e.stopPropagation());
    btn.addEventListener('click', e => {
        e.stopPropagation();
        onClick();
    });
    return btn;
}

function pointInPolygon(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
            (pt.x < (xj - xi) * (pt.y - yi) / ((yj - yi) || 1) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function drawPolygonPath(ctx, points, closePath) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    if (closePath) ctx.closePath();
}

function cloneSelectedStrokes() {
    const originals = new Map();
    getHandwritingPage().strokes.forEach(stroke => {
        if (selectedStrokeIds.has(stroke.id)) {
            originals.set(stroke.id, stroke.points.map(p => ({ ...p })));
        }
    });
    return originals;
}

function applySelectedTransform(dx, dy, pt) {
    if (handwritingDrag.mode === 'move') {
        getHandwritingPage().strokes.forEach(stroke => {
            if (!selectedStrokeIds.has(stroke.id)) return;
            const original = handwritingDrag.originals.get(stroke.id);
            if (!original) return;
            stroke.points = original.map(p => ({ x: p.x + dx, y: p.y + dy }));
        });
        return;
    }

    const originalBounds = handwritingDrag.originalBounds;
    const handle = handwritingDrag.mode.replace('scale-', '');
    const anchor = {
        x: handle.includes('w') ? originalBounds.x + originalBounds.w : originalBounds.x,
        y: handle.includes('n') ? originalBounds.y + originalBounds.h : originalBounds.y
    };
    const originalCorner = {
        x: handle.includes('w') ? originalBounds.x : originalBounds.x + originalBounds.w,
        y: handle.includes('n') ? originalBounds.y : originalBounds.y + originalBounds.h
    };
    const originalVector = {
        x: originalCorner.x - anchor.x,
        y: originalCorner.y - anchor.y
    };
    const currentVector = {
        x: pt.x - anchor.x,
        y: pt.y - anchor.y
    };
    const scaleX = Math.abs(originalVector.x) < 1 ? 1 : currentVector.x / originalVector.x;
    const scaleY = Math.abs(originalVector.y) < 1 ? 1 : currentVector.y / originalVector.y;

    getHandwritingPage().strokes.forEach(stroke => {
        if (!selectedStrokeIds.has(stroke.id)) return;
        const original = handwritingDrag.originals.get(stroke.id);
        if (!original) return;
        stroke.points = original.map(p => ({
            x: anchor.x + (p.x - anchor.x) * scaleX,
            y: anchor.y + (p.y - anchor.y) * scaleY
        }));
    });
}

function handleHandwritingKeyDown(e) {
    if (isTypingTarget(e.target)) return;
    if (currentMode === 'preview' && typeof matchShortcut === 'function') {
        if (matchShortcut(e, 'preview.undo')) { e.preventDefault(); e.stopImmediatePropagation(); undoHandwriting(); return; }
        if (matchShortcut(e, 'preview.redo')) { e.preventDefault(); e.stopImmediatePropagation(); redoHandwriting(); return; }
        if (matchShortcut(e, 'preview.tool.pen')) { e.preventDefault(); e.stopImmediatePropagation(); setPreviewTool('pen'); return; }
        if (matchShortcut(e, 'preview.tool.eraser')) { e.preventDefault(); e.stopImmediatePropagation(); setPreviewTool('eraser'); return; }
        if (matchShortcut(e, 'preview.tool.rect')) { e.preventDefault(); e.stopImmediatePropagation(); setPreviewTool('select-rect'); return; }
        if (matchShortcut(e, 'preview.tool.lasso')) { e.preventDefault(); e.stopImmediatePropagation(); setPreviewTool('select-lasso'); return; }
        if (matchShortcut(e, 'preview.tool.transform')) { e.preventDefault(); e.stopImmediatePropagation(); setPreviewTool('transform'); return; }
        if (matchShortcut(e, 'preview.tool.hand')) { e.preventDefault(); e.stopImmediatePropagation(); setPreviewTool('hand'); return; }
    }
    if (currentMode === 'preview' && selectedStrokeIds.size > 0 && ((typeof matchShortcut === 'function' && matchShortcut(e, 'preview.confirm')) || e.key === 'Enter')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (transformSession || activePreviewTool === 'transform') confirmTransformSelection();
        else beginTransformSelection();
        return;
    }
    if (currentMode === 'preview' && selectedStrokeIds.size > 0 && ((typeof matchShortcut === 'function' && matchShortcut(e, 'preview.deleteSelection')) || e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        deleteSelectedStrokes();
        return;
    }
    if (currentMode === 'preview' && (transformSession || activePreviewTool === 'transform') && ((typeof matchShortcut === 'function' && matchShortcut(e, 'preview.cancel')) || e.key === 'Escape')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        cancelTransformSelection();
        return;
    }
    if (currentMode === 'preview' && ((typeof matchShortcut === 'function' && matchShortcut(e, 'preview.clearSelection')) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd'))) {
        e.preventDefault();
        e.stopImmediatePropagation();
        clearHandwritingSelection();
        return;
    }
    if (currentMode === 'preview' && !isSpaceHandActive && ((typeof matchShortcut === 'function' && matchShortcut(e, 'preview.temporaryHand')) || e.code === 'Space')) {
        isSpaceHandActive = true;
        refreshPreviewToolButtons();
        e.preventDefault();
        e.stopImmediatePropagation();
    }
}

document.addEventListener('keydown', handleHandwritingKeyDown, true);

function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName ? target.tagName.toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

document.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || (typeof matchShortcut === 'function' && matchShortcut(e, 'preview.temporaryHand'))) {
        isSpaceHandActive = false;
        refreshPreviewToolButtons();
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPreviewToolButtons);
} else {
    initPreviewToolButtons();
}
