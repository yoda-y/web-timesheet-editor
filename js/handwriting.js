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

// タッチ/ペン判別・ピンチズーム用
let activeTouches = new Map(); // pointerId -> {x, y}
let pinchStartDist = null;
let pinchStartZoom = null;


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

function hasHandwritingPagesData(pages) {
    return Object.values(pages || {}).some(page =>
        (Array.isArray(page.strokes) && page.strokes.length > 0) ||
        (Array.isArray(page.images) && page.images.length > 0)
    );
}

function hasHandwritingInSheetsData(sheetsData) {
    return (sheetsData || []).some(sheet => hasHandwritingPagesData(sheet.handwritingPages || {}));
}

async function saveHandwritingBundleForFile(fileName, sheetsData, opts = {}) {
    if (!hasHandwritingInSheetsData(sheetsData)) return true;
    let directoryHandle = (typeof currentDirectoryHandle !== 'undefined') ? currentDirectoryHandle : null;
    if (!directoryHandle && window.showDirectoryPicker) {
        try {
            directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            if (typeof currentDirectoryHandle !== 'undefined') currentDirectoryHandle = directoryHandle;
        } catch (e) {
            if (e && e.name === 'AbortError') return false;
            throw e;
        }
    }
    if (!directoryHandle) return false;
    await exportHandwritingBundleToDirectory(directoryHandle, fileName, sheetsData, opts.dpi || HANDWRITING_BASE_DPI);
    return true;
}

async function promptImportHandwritingBundleForFile(fileName) {
    if (!window.showDirectoryPicker || typeof importHandwritingBundleFromDirectory !== 'function') return 0;
    const shouldLoad = confirm('このファイルには手書きデータがあります。同名フォルダから手書きPNG/INIを読み込みますか？');
    if (!shouldLoad) return 0;
    try {
        const directoryHandle = await window.showDirectoryPicker();
        const count = await importHandwritingBundleFromDirectory(directoryHandle, fileName);
        if (count > 0) {
            if (typeof currentDirectoryHandle !== 'undefined') currentDirectoryHandle = directoryHandle;
            showToast && showToast(`手書きPNG/INIを読み込みました (${count}件)`);
        } else {
            alert('同名フォルダ内に handwriting.ini または参照PNGが見つかりませんでした。');
        }
        return count;
    } catch (e) {
        if (e && e.name !== 'AbortError') console.warn('handwriting import failed', e);
        return 0;
    }
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
    // ペン使用時のブラウザ選択をクリア
    if (window.getSelection) window.getSelection().removeAllRanges();

    // タッチ入力を追跡（ピンチズーム用）
    if (e.pointerType === 'touch') {
        activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        // 2本指でピンチズーム開始
        if (activeTouches.size === 2) {
            const pts = [...activeTouches.values()];
            pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            pinchStartZoom = previewZoom;
            handwritingUiCanvas.setPointerCapture(e.pointerId);
            return;
        }
    }

    // ペン/タッチ判別: タッチはhand、ペン/マウスは現在のツール
    const tool = (e.pointerType === 'touch') ? 'hand' : getEffectivePreviewTool();
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

    if (tool === 'pen') {
        handwritingDrag = {
            type: 'pen',
            stroke: {
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                tool: 'pen',
                color: getHandwritingColor(),
                width: getDrawingSizePx('pen'),
                points: [pt]
            },
            start: pt,
            straight: e.shiftKey
        };
        e.preventDefault();
        return;
    }

    if (tool === 'eraser') {
        pushHandwritingHistory();
        handwritingDrag = {
            type: 'eraser',
            stroke: {
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                tool: 'eraser',
                width: getDrawingSizePx('eraser'),
                points: [pt]
            },
            start: pt
        };
        eraseStrokesAtPoint(pt, handwritingDrag.stroke.width);
        renderHandwritingLayer();
        drawStroke(handwritingCtx, handwritingDrag.stroke);
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

    // ピンチズーム処理
    if (e.pointerType === 'touch' && activeTouches.has(e.pointerId)) {
        activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (activeTouches.size === 2 && pinchStartDist !== null) {
            const pts = [...activeTouches.values()];
            const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            const centerX = (pts[0].x + pts[1].x) / 2;
            const centerY = (pts[0].y + pts[1].y) / 2;
            const rect = previewContainer.getBoundingClientRect();
            const cx = centerX - rect.left;
            const cy = centerY - rect.top;
            const oldZoom = previewZoom;
            const newZoom = Math.max(0.25, Math.min(5, pinchStartZoom * (dist / pinchStartDist)));
            previewPanX = cx - (cx - previewPanX) * (newZoom / oldZoom);
            previewPanY = cy - (cy - previewPanY) * (newZoom / oldZoom);
            previewZoom = newZoom;
            applyPreviewTransform();
            return;
        }
    }

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
    if (previewIsDragging) {
        const dx = e.clientX - previewDragStartX;
        const dy = e.clientY - previewDragStartY;
        previewPanX = previewPanStartX + dx;
        previewPanY = previewPanStartY + dy;
        applyPreviewTransform();
        return;
    }

    if (!handwritingDrag) return;
    const pt = previewClientToCanvasPoint(e);

    if (handwritingDrag.type === 'pen') {
        if (e.shiftKey) {
            handwritingDrag.straight = true;
            handwritingDrag.stroke.points = [handwritingDrag.start, pt];
        } else {
            handwritingDrag.stroke.points.push(pt);
        }
        renderHandwritingLayer();
        drawStroke(handwritingCtx, handwritingDrag.stroke);
        return;
    }

    if (handwritingDrag.type === 'eraser') {
        handwritingDrag.stroke.points.push(pt);
        eraseStrokesAtPoint(pt, handwritingDrag.stroke.width);
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

    // タッチ終了処理
    if (e.pointerType === 'touch') {
        activeTouches.delete(e.pointerId);
        if (activeTouches.size < 2) {
            pinchStartDist = null;
            pinchStartZoom = null;
        }
    }

    if (previewZoomDrag) {
        previewZoomDrag = null;
        refreshPreviewToolButtons();
        return;
    }
    if (previewIsDragging) {
        previewIsDragging = false;
        refreshPreviewToolButtons();
        return;
    }
    if (!handwritingDrag) return;

    const page = getHandwritingPage();
    if (handwritingDrag.type === 'pen') {
        if (handwritingDrag.stroke.points.length > 1) {
            pushHandwritingHistory();
            page.strokes.push(handwritingDrag.stroke);
            markHandwritingDirty();
        }
        handwritingDrag = null;
        renderHandwritingLayer();
        return;
    }
    if (handwritingDrag.type === 'eraser') {
        // 消しゴムは保存せず、触れたストロークを削除済み
        if (handwritingDrag.stroke.points.length > 1) {
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

function getImageBounds(imageData) {
    if (!imageData) return null;
    const rawX = imageData.x || 0;
    const rawY = imageData.y || 0;
    const rawW = imageData.w || handwritingCanvas?.width || Math.round(TEMPLATE.WIDTH_MM * HANDWRITING_BASE_DPI / 25.4);
    const rawH = imageData.h || handwritingCanvas?.height || Math.round(TEMPLATE.HEIGHT_MM * HANDWRITING_BASE_DPI / 25.4);
    return {
        x: Math.min(rawX, rawX + rawW),
        y: Math.min(rawY, rawY + rawH),
        w: Math.abs(rawW),
        h: Math.abs(rawH)
    };
}

function eraseStrokesAtPoint(pt, eraserWidth) {
    const page = getHandwritingPage();
    const radius = eraserWidth / 2;
    let changed = false;
    const newStrokes = [];
    for (const stroke of page.strokes) {
        if (stroke.tool === 'eraser') {
            newStrokes.push(stroke);
            continue;
        }
        const threshold = (radius + stroke.width / 2) ** 2;
        let segment = [];
        for (const p of stroke.points) {
            const dx = p.x - pt.x, dy = p.y - pt.y;
            if (dx * dx + dy * dy <= threshold) {
                if (segment.length >= 2) {
                    newStrokes.push({ ...stroke, id: `${stroke.id}-${newStrokes.length}`, points: segment });
                }
                segment = [];
                changed = true;
            } else {
                segment.push(p);
            }
        }
        if (segment.length >= 2) {
            newStrokes.push(segment === stroke.points ? stroke : { ...stroke, id: `${stroke.id}-${newStrokes.length}`, points: segment });
        } else if (segment.length > 0) {
            changed = true;
        }
    }
    if (changed) {
        page.strokes = newStrokes;
        markHandwritingDirty();
    }
}

function drawStroke(ctx, stroke) {
    if (!stroke.points || stroke.points.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke.width;
    if (stroke.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
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

    const entries = [];
    const sheetNo = (typeof currentSheetIndex !== 'undefined') ? currentSheetIndex + 1 : 1;
    for (const pageIndex of pageIndexes) {
        const canvas = await renderHandwritingPageToCanvas(pageIndex, dpi);
        const filename = expandHandwritingFilenameTemplate(pageIndex, 'png');
        await saveHandwritingPngBlob(canvas, filename, directoryHandle);
        entries.push({ sheet: sheetNo, page: pageIndex + 1, file: filename });
    }
    await saveHandwritingIni(directoryHandle, entries, dpi);
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
    if (!directoryHandle) return;
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
    const text = lines.join('\n');
    if (directoryHandle) {
        const fileHandle = await directoryHandle.getFileHandle('handwriting.ini', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(text);
        await writable.close();
        return;
    }
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'handwriting.ini';
    a.click();
    URL.revokeObjectURL(url);
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
            const fw = Math.round(TEMPLATE.WIDTH_MM * HANDWRITING_BASE_DPI / 25.4);
            const fh = Math.round(TEMPLATE.HEIGHT_MM * HANDWRITING_BASE_DPI / 25.4);
            let imgObjs;
            if (typeof window.splitImageToHandwritingObjects === 'function') {
                imgObjs = await window.splitImageToHandwritingObjects(dataUrl, {
                    baseX: 0, baseY: 0, fallbackW: fw, fallbackH: fh,
                    targetW: fw, targetH: fh,
                    idPrefix: `bundle-${imported}`
                });
            } else {
                imgObjs = [{ id: `bundle-${Date.now()}-${imported}`, dataUrl, x: 0, y: 0, w: fw, h: fh }];
            }
            targetSheet.handwritingPages[key] = { strokes: [], images: imgObjs };
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

// ファイル名からシート/ページ情報を抽出
// 例: "cut001_sheet2_p3.png" → { sheet: 1, page: 2 } (0-indexed)
// 例: "timesheet_s1_cut001_handwriting_p2.png" → { sheet: 0, page: 1 }
function parseHandwritingFilename(filename) {
    const result = { sheet: null, page: null };
    const name = filename.toLowerCase();

    // シート番号: sheet1, sheet2, s1, s2 など
    const sheetMatch = name.match(/sheet(\d+)|_s(\d+)_/i);
    if (sheetMatch) {
        const num = parseInt(sheetMatch[1] || sheetMatch[2], 10);
        if (!isNaN(num) && num > 0) result.sheet = num - 1; // 0-indexed
    }

    // ページ番号: p1, p2, page1, page2 など
    const pageMatch = name.match(/[_\-]p(\d+)|page(\d+)/i);
    if (pageMatch) {
        const num = parseInt(pageMatch[1] || pageMatch[2], 10);
        if (!isNaN(num) && num > 0) result.page = num - 1; // 0-indexed
    }

    return result;
}

async function importHandwritingPngFiles() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ini,image/png,image/jpeg';
    input.multiple = true;
    input.onchange = async () => {
        const files = Array.from(input.files || []);
        if (!files.length) return;

        const iniFile = files.find(file => /\.ini$/i.test(file.name));
        if (iniFile) {
            const imageFiles = new Map();
            files.forEach(file => {
                imageFiles.set(file.name.toLowerCase(), file);
                imageFiles.set(file.name.replace(/\\/g, '/').split('/').pop().toLowerCase(), file);
            });
            const entries = parseHandwritingIni(await iniFile.text());
            const touchedPages = new Set();
            let importedFromIni = 0;
            let iniDirectoryHandle = null;
            for (const entry of entries) {
                let pngFile = imageFiles.get(String(entry.file || '').toLowerCase()) ||
                    imageFiles.get(String(entry.file || '').replace(/\\/g, '/').split('/').pop().toLowerCase());
                if (!pngFile && window.showDirectoryPicker) {
                    try {
                        if (!iniDirectoryHandle) iniDirectoryHandle = await window.showDirectoryPicker();
                        const basename = String(entry.file || '').replace(/\\/g, '/').split('/').pop();
                        pngFile = await (await iniDirectoryHandle.getFileHandle(basename)).getFile();
                    } catch (e) {
                        pngFile = null;
                    }
                }
                if (!pngFile) continue;
                const dataUrl = await readFileAsDataUrl(pngFile);
                const sheetIndex = Math.max(0, (entry.sheet || 1) - 1);
                const pageIndex = Math.max(0, (entry.page || 1) - 1);
                const fwIni = Math.round(TEMPLATE.WIDTH_MM * HANDWRITING_BASE_DPI / 25.4);
                const fhIni = Math.round(TEMPLATE.HEIGHT_MM * HANDWRITING_BASE_DPI / 25.4);
                let iniImgObjs;
                if (typeof window.splitImageToHandwritingObjects === 'function') {
                    iniImgObjs = await window.splitImageToHandwritingObjects(dataUrl, {
                        baseX: 0, baseY: 0, fallbackW: fwIni, fallbackH: fhIni,
                        targetW: fwIni, targetH: fhIni,
                        idPrefix: `ini-${importedFromIni}`
                    });
                } else {
                    iniImgObjs = [{ id: `ini-${Date.now()}-${importedFromIni}`, dataUrl, x: 0, y: 0, w: fwIni, h: fhIni }];
                }
                if (typeof sheets !== 'undefined' && sheets[sheetIndex]) {
                    if (!sheets[sheetIndex].handwritingPages) sheets[sheetIndex].handwritingPages = {};
                    const key = getHandwritingPageKey(pageIndex);
                    const touchKey = `${sheetIndex}:${key}`;
                    if (!touchedPages.has(touchKey)) {
                        sheets[sheetIndex].handwritingPages[key] = { strokes: [], images: [] };
                        touchedPages.add(touchKey);
                    }
                    iniImgObjs.forEach(o => sheets[sheetIndex].handwritingPages[key].images.push(o));
                } else {
                    const page = getHandwritingPage(pageIndex);
                    if (!touchedPages.has(pageIndex)) {
                        page.strokes = [];
                        page.images = [];
                        touchedPages.add(pageIndex);
                    }
                    iniImgObjs.forEach(o => page.images.push(o));
                }
                importedFromIni++;
            }
            if (importedFromIni > 0) {
                if (typeof sheets !== 'undefined' && typeof currentSheetIndex !== 'undefined' && sheets[currentSheetIndex]) {
                    importHandwritingData(sheets[currentSheetIndex].handwritingPages || {});
                } else {
                    renderHandwritingLayer();
                    drawHandwritingUi();
                }
                markHandwritingDirty();
                showToast && showToast(`${importedFromIni}件の手書きPNGをINIから読み込みました`);
            } else {
                alert('INIに記載されたPNGが見つかりませんでした。handwriting.ini と参照PNGを一緒に選択してください。');
            }
            return;
        }

        let importedCount = 0;
        const importResults = [];

        for (const file of files) {
            const parsed = parseHandwritingFilename(file.name);
            const targetSheet = parsed.sheet ?? (typeof currentSheetIndex !== 'undefined' ? currentSheetIndex : 0);
            const targetPage = parsed.page ?? currentPage;

            const dataUrl = await readFileAsDataUrl(file);

            const fwP = Math.round(TEMPLATE.WIDTH_MM * HANDWRITING_BASE_DPI / 25.4);
            const fhP = Math.round(TEMPLATE.HEIGHT_MM * HANDWRITING_BASE_DPI / 25.4);
            let perFileObjs;
            if (typeof window.splitImageToHandwritingObjects === 'function') {
                perFileObjs = await window.splitImageToHandwritingObjects(dataUrl, {
                    baseX: 0, baseY: 0, fallbackW: fwP, fallbackH: fhP,
                    targetW: fwP, targetH: fhP,
                    idPrefix: `import-${importedCount}`
                });
            } else {
                perFileObjs = [{ id: `import-${Date.now()}-${importedCount}`, dataUrl, x: 0, y: 0, w: fwP, h: fhP }];
            }
            // シートデータに直接追加
            if (typeof sheets !== 'undefined' && sheets[targetSheet]) {
                if (!sheets[targetSheet].handwritingPages) sheets[targetSheet].handwritingPages = {};
                const key = getHandwritingPageKey(targetPage);
                if (!sheets[targetSheet].handwritingPages[key]) {
                    sheets[targetSheet].handwritingPages[key] = { strokes: [], images: [] };
                }
                perFileObjs.forEach(o => sheets[targetSheet].handwritingPages[key].images.push(o));
                importResults.push({ file: file.name, sheet: targetSheet + 1, page: targetPage + 1 });
                importedCount++;
            } else {
                // sheetsがない場合は現在のページに追加
                pushHandwritingHistory();
                const page = getHandwritingPage(targetPage);
                perFileObjs.forEach(o => page.images.push(o));
                importResults.push({ file: file.name, sheet: 1, page: targetPage + 1 });
                importedCount++;
            }
        }

        // 現在のシートの手書きデータを再読み込み
        if (typeof sheets !== 'undefined' && typeof currentSheetIndex !== 'undefined' && sheets[currentSheetIndex]) {
            importHandwritingData(sheets[currentSheetIndex].handwritingPages || {});
        } else {
            renderHandwritingLayer();
            drawHandwritingUi();
        }

        markHandwritingDirty();

        // 結果を通知
        if (importedCount > 0) {
            const autoAssigned = importResults.filter(r => r.sheet > 1 || r.page > 1).length;
            let msg = `${importedCount}件の画像を読み込みました`;
            if (autoAssigned > 0) msg += `（${autoAssigned}件を自動振り分け）`;
            showToast && showToast(msg);
        }
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
    const page = getHandwritingPage();
    const boxes = page.strokes
        .filter(stroke => selectedStrokeIds.has(stroke.id))
        .map(getStrokeBounds)
        .filter(Boolean);
    page.images
        .filter(imageData => selectedStrokeIds.has(imageData.id))
        .map(getImageBounds)
        .filter(Boolean)
        .forEach(box => boxes.push(box));
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
    const page = getHandwritingPage();
    page.strokes.forEach(stroke => {
        const box = getStrokeBounds(stroke);
        if (box && rectsIntersect(rect, box)) ids.add(stroke.id);
    });
    page.images.forEach(imageData => {
        const box = getImageBounds(imageData);
        if (box && rectsIntersect(rect, box)) ids.add(imageData.id);
    });
    return ids;
}

function selectStrokesInPolygon(poly) {
    const ids = new Set();
    const page = getHandwritingPage();
    page.strokes.forEach(stroke => {
        if (stroke.tool === 'eraser') return;
        if (stroke.points.some(pt => pointInPolygon(pt, poly))) ids.add(stroke.id);
    });
    page.images.forEach(imageData => {
        const box = getImageBounds(imageData);
        if (!box) return;
        const points = [
            { x: box.x, y: box.y },
            { x: box.x + box.w, y: box.y },
            { x: box.x, y: box.y + box.h },
            { x: box.x + box.w, y: box.y + box.h },
            { x: box.x + box.w / 2, y: box.y + box.h / 2 }
        ];
        if (points.some(pt => pointInPolygon(pt, poly))) ids.add(imageData.id);
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
    const page = getHandwritingPage();
    if (restore && transformSession) {
        page.strokes.forEach(stroke => {
            const original = transformSession.originals.get(stroke.id);
            if (original && original.type === 'stroke') stroke.points = original.points.map(p => ({ ...p }));
        });
        page.images.forEach(imageData => {
            const original = transformSession.originals.get(imageData.id);
            if (!original || original.type !== 'image') return;
            imageData.x = original.x;
            imageData.y = original.y;
            imageData.w = original.w;
            imageData.h = original.h;
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
    page.images = page.images.filter(imageData => !selectedStrokeIds.has(imageData.id));
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
    const page = getHandwritingPage();
    page.strokes.forEach(stroke => {
        if (selectedStrokeIds.has(stroke.id)) {
            originals.set(stroke.id, { type: 'stroke', points: stroke.points.map(p => ({ ...p })) });
        }
    });
    page.images.forEach(imageData => {
        if (selectedStrokeIds.has(imageData.id)) {
            originals.set(imageData.id, {
                type: 'image',
                x: imageData.x || 0,
                y: imageData.y || 0,
                w: imageData.w || 0,
                h: imageData.h || 0
            });
        }
    });
    return originals;
}

function applySelectedTransform(dx, dy, pt) {
    const page = getHandwritingPage();
    if (handwritingDrag.mode === 'move') {
        page.strokes.forEach(stroke => {
            if (!selectedStrokeIds.has(stroke.id)) return;
            const original = handwritingDrag.originals.get(stroke.id);
            if (!original || original.type !== 'stroke') return;
            stroke.points = original.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        });
        page.images.forEach(imageData => {
            if (!selectedStrokeIds.has(imageData.id)) return;
            const original = handwritingDrag.originals.get(imageData.id);
            if (!original || original.type !== 'image') return;
            imageData.x = original.x + dx;
            imageData.y = original.y + dy;
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

    page.strokes.forEach(stroke => {
        if (!selectedStrokeIds.has(stroke.id)) return;
        const original = handwritingDrag.originals.get(stroke.id);
        if (!original || original.type !== 'stroke') return;
        stroke.points = original.points.map(p => ({
            x: anchor.x + (p.x - anchor.x) * scaleX,
            y: anchor.y + (p.y - anchor.y) * scaleY
        }));
    });
    page.images.forEach(imageData => {
        if (!selectedStrokeIds.has(imageData.id)) return;
        const original = handwritingDrag.originals.get(imageData.id);
        if (!original || original.type !== 'image') return;
        imageData.x = anchor.x + (original.x - anchor.x) * scaleX;
        imageData.y = anchor.y + (original.y - anchor.y) * scaleY;
        imageData.w = original.w * scaleX;
        imageData.h = original.h * scaleY;
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
        // ページ送り: , (前) / . (次)
        if (e.key === ',' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault(); e.stopImmediatePropagation();
            if (typeof goToPrevPage === 'function') goToPrevPage();
            return;
        }
        if (e.key === '.' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault(); e.stopImmediatePropagation();
            if (typeof goToNextPage === 'function') goToNextPage();
            return;
        }
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

// === Undo/Redoフローティングボタン（タブレット用） ===
function initUndoRedoFloat() {
    const undoRedoFloat = document.getElementById('undo-redo-float');
    const undoBtn = document.getElementById('float-undo');
    const redoBtn = document.getElementById('float-redo');
    const dragHandle = undoRedoFloat ? undoRedoFloat.querySelector('.drag-handle') : null;
    if (!undoRedoFloat || !undoBtn || !redoBtn) return;

    // ボタンイベント
    function doUndo() { undoHandwriting(); }
    function doRedo() { redoHandwriting(); }
    undoBtn.addEventListener('click', doUndo);
    redoBtn.addEventListener('click', doRedo);
    undoBtn.addEventListener('touchend', (e) => { e.preventDefault(); doUndo(); });
    redoBtn.addEventListener('touchend', (e) => { e.preventDefault(); doRedo(); });

    // タッチでドラッグ
    if (dragHandle) {
        let dragOffsetX = 0, dragOffsetY = 0;
        dragHandle.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            const rect = undoRedoFloat.getBoundingClientRect();
            dragOffsetX = touch.clientX - rect.left;
            dragOffsetY = touch.clientY - rect.top;
            undoRedoFloat.style.right = 'auto';
            undoRedoFloat.style.bottom = 'auto';
            e.preventDefault();
        }, { passive: false });
        dragHandle.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            undoRedoFloat.style.left = (touch.clientX - dragOffsetX) + 'px';
            undoRedoFloat.style.top = (touch.clientY - dragOffsetY) + 'px';
            e.preventDefault();
        }, { passive: false });
    }

    // 初期表示
    setTimeout(() => {
        if (typeof isTabletMode === 'function' && isTabletMode() && typeof currentMode !== 'undefined' && currentMode === 'preview') {
            undoRedoFloat.style.display = 'flex';
        }
    }, 500);
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUndoRedoFloat);
} else {
    initUndoRedoFloat();
}

// === 2本指タップでUndo（タブレット用） ===
(function() {
    let lastTwoFingerTime = 0;
    document.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2 && typeof currentMode !== 'undefined' && currentMode === 'preview') {
            lastTwoFingerTime = Date.now();
        }
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
        if (e.touches.length === 0 && Date.now() - lastTwoFingerTime < 300) {
            // 2本指タップ検出
            if (typeof undoHandwriting === 'function' && typeof currentMode !== 'undefined' && currentMode === 'preview') {
                undoHandwriting();
            }
            lastTwoFingerTime = 0;
        }
    }, { passive: true });
})();
