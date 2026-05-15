// === BBoxエディタ Canvas描画 & マウス操作 ===

// Space キー押下状態（パン操作用）
let bboxEditorSpacePressed = false;
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        const modal = document.getElementById('bbox-editor-modal');
        if (modal && modal.style.display !== 'none') {
            const t = e.target;
            const isTyping = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
            if (!isTyping) {
                e.preventDefault();
                bboxEditorSpacePressed = true;
                const canvas = document.getElementById('bbox-editor-canvas');
                if (canvas && !bboxEditorState.isPanning) canvas.style.cursor = 'grab';
            }
        }
    }
});
document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
        bboxEditorSpacePressed = false;
        const canvas = document.getElementById('bbox-editor-canvas');
        if (canvas && !bboxEditorState.isPanning) canvas.style.cursor = 'crosshair';
    }
});

const HANDLE_SIZE = 8;
const HANDLE_HIT = 6; // ヒット判定半径 px

const bboxEditorState = {
    imgScale: 1,
    dragMode: null,       // null | 'move' | 'resize'
    resizeHandle: null,   // 'nw','ne','sw','se','n','e','s','w'
    dragStart: { x: 0, y: 0 },
    dragOrigBBox: null,
    zoom: 1.0,            // 表示倍率
    isPanning: false,
    panStart: { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 },
    zoomDrag: null        // { startY, startZoom, anchorClientX, anchorClientY, anchorContentX, anchorContentY }
};

// 画像キャッシュ: dataUrl -> HTMLImageElement
const _imgCache = {};

function getOrLoadImage(dataUrl) {
    if (_imgCache[dataUrl]) return _imgCache[dataUrl];
    const img = new Image();
    img.onload = () => { window.bboxEditorRenderCanvas(); };
    img.src = dataUrl;
    _imgCache[dataUrl] = img;
    return img;
}

// BBox を canvas px 座標に変換 { bx, by, bw, bh }
function normToCanvas(bbox, cw, ch) {
    return {
        bx: bbox.x * cw,
        by: bbox.y * ch,
        bw: bbox.w * cw,
        bh: bbox.h * ch
    };
}

// ハンドル位置 (cx, cy) を返す
function getHandlePositions(bx, by, bw, bh) {
    return {
        nw: [bx,        by       ],
        ne: [bx + bw,   by       ],
        sw: [bx,        by + bh  ],
        se: [bx + bw,   by + bh  ],
        n:  [bx + bw/2, by       ],
        s:  [bx + bw/2, by + bh  ],
        w:  [bx,        by + bh/2],
        e:  [bx + bw,   by + bh/2]
    };
}

function drawAllBBoxes(ctx, cw, ch) {
    const tpl = window.bboxEditorGetTemplate();
    if (!tpl || !tpl.bboxes) return;
    const selectedTag = window.bboxEditorGetSelectedTag();
    const tags = (window.externalTemplate && window.externalTemplate.tags) || {};

    for (const tagKey in tpl.bboxes) {
        const bbox = tpl.bboxes[tagKey];
        if (!bbox || !bbox.enabled) continue;
        const { bx, by, bw, bh } = normToCanvas(bbox, cw, ch);
        const isSelected = (tagKey === selectedTag);

        // 塗り
        ctx.fillStyle = isSelected ? 'rgba(255,140,0,0.15)' : 'rgba(30,120,255,0.12)';
        ctx.fillRect(bx, by, bw, bh);

        // 枠（locked は破線グレー）
        if (bbox.locked) {
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = isSelected ? '#aaa' : '#888';
        } else {
            ctx.setLineDash([]);
            ctx.strokeStyle = isSelected ? '#ff8c00' : '#1e78ff';
        }
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.setLineDash([]);

        // ラベル
        const label = (tags[tagKey] && tags[tagKey].label) || tagKey;
        ctx.font = '11px sans-serif';
        ctx.fillStyle = bbox.locked ? (isSelected ? '#aaa' : '#888') : (isSelected ? '#ff8c00' : '#1e78ff');
        ctx.fillText(label, bx + 2, by - 3 < 10 ? by + 11 : by - 3);

        // 選択中のみハンドル描画
        if (isSelected) {
            const handles = getHandlePositions(bx, by, bw, bh);
            for (const pos of Object.values(handles)) {
                const hx = pos[0] - HANDLE_SIZE / 2;
                const hy = pos[1] - HANDLE_SIZE / 2;
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#ff8c00';
                ctx.lineWidth = 1.5;
                ctx.fillRect(hx, hy, HANDLE_SIZE, HANDLE_SIZE);
                ctx.strokeRect(hx, hy, HANDLE_SIZE, HANDLE_SIZE);
            }
        }
    }
}

// canvas px 座標から BBox を探す
function findBBoxAt(px, py) {
    const canvas = document.getElementById('bbox-editor-canvas');
    const cw = canvas.width, ch = canvas.height;
    const tpl = window.bboxEditorGetTemplate();
    if (!tpl || !tpl.bboxes) return null;
    // 選択中を優先してチェック
    const selectedTag = window.bboxEditorGetSelectedTag();
    const keys = Object.keys(tpl.bboxes);
    const ordered = selectedTag
        ? [selectedTag, ...keys.filter(k => k !== selectedTag)]
        : keys;
    for (const tagKey of ordered) {
        const bbox = tpl.bboxes[tagKey];
        if (!bbox || !bbox.enabled) continue;
        const { bx, by, bw, bh } = normToCanvas(bbox, cw, ch);
        if (px >= bx && px <= bx + bw && py >= by && py <= by + bh) return tagKey;
    }
    return null;
}

// 選択中BBoxのハンドルを探す
function findHandleAt(px, py, selectedTag) {
    if (!selectedTag) return null;
    const canvas = document.getElementById('bbox-editor-canvas');
    const cw = canvas.width, ch = canvas.height;
    const tpl = window.bboxEditorGetTemplate();
    if (!tpl || !tpl.bboxes || !tpl.bboxes[selectedTag]) return null;
    const bbox = tpl.bboxes[selectedTag];
    if (!bbox.enabled) return null;
    const { bx, by, bw, bh } = normToCanvas(bbox, cw, ch);
    const handles = getHandlePositions(bx, by, bw, bh);
    for (const [name, pos] of Object.entries(handles)) {
        if (Math.abs(px - pos[0]) <= HANDLE_HIT && Math.abs(py - pos[1]) <= HANDLE_HIT) return name;
    }
    return null;
}

// カーソルスタイル
const HANDLE_CURSORS = {
    nw: 'nw-resize', ne: 'ne-resize', sw: 'sw-resize', se: 'se-resize',
    n:  'n-resize',  s:  's-resize',  w:  'w-resize',  e:  'e-resize'
};

function getCanvasPosFromEvent(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function clampMin(v, mn) { return Math.max(mn, v); }

// ========================
// window.bboxEditorRenderCanvas
// ========================
window.bboxEditorRenderCanvas = function() {
    const tpl = window.bboxEditorGetTemplate();
    const canvas = document.getElementById('bbox-editor-canvas');
    const noImg  = document.getElementById('bbox-editor-no-image');
    if (!canvas) return;

    if (!tpl || !tpl.image) {
        canvas.style.display = 'none';
        if (noImg) noImg.style.display = 'block';
        return;
    }
    if (noImg) noImg.style.display = 'none';
    canvas.style.display = 'block';

    const img = getOrLoadImage(tpl.image);
    if (!img.complete) return; // onload で再呼び出し

    const container = document.getElementById('bbox-editor-canvas-container');
    const maxW = (container ? container.clientWidth  : 600) - 20;
    const maxH = (container ? container.clientHeight : 500) - 20;
    const imgW = tpl.imageWidth  || img.naturalWidth  || 800;
    const imgH = tpl.imageHeight || img.naturalHeight || 600;
    const scale = Math.min(maxW / imgW, maxH / imgH, 1) * bboxEditorState.zoom;
    canvas.width  = Math.round(imgW * scale);
    canvas.height = Math.round(imgH * scale);
    bboxEditorState.imgScale = scale;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // メタ/staff BBox プレビュー描画（drawAllBBoxes の前に薄く重ねる）
    const previewToggle = document.getElementById('bbox-preview-toggle');
    const previewEnabled = previewToggle ? previewToggle.checked : true;
    if (previewEnabled && typeof window.drawExternalTemplateMetaBoxes === 'function') {
        ctx.save();
        ctx.globalAlpha = 0.4;
        const bboxToCanvas = (b) => ({
            x: b.x * canvas.width,
            y: b.y * canvas.height,
            w: b.w * canvas.width,
            h: b.h * canvas.height
        });
        // BBoxエディタの canvas 幅を画像の実寸幅(mm)で割ってmm→px係数を算出
        // imageWidth が px 単位で格納されている場合は A3縦(210mm)相当と仮定
        const approxScale = canvas.width / 210;
        window.drawExternalTemplateMetaBoxes(ctx, tpl, bboxToCanvas, approxScale);
        ctx.restore();
    }

    drawAllBBoxes(ctx, canvas.width, canvas.height);
};

// ========================
// マウスイベント
// ========================
function setupBBoxCanvasEvents() {
    const canvas = document.getElementById('bbox-editor-canvas');
    if (!canvas) return;

    // Ctrl+ホイール: ズーム（マウス位置中心）
    canvas.addEventListener('wheel', (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        const container = document.getElementById('bbox-editor-canvas-container');
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const oldZoom = bboxEditorState.zoom;
        const newZoom = Math.max(0.2, Math.min(5.0, oldZoom * delta));
        if (newZoom === oldZoom) return;

        // マウスのcontainer内座標
        const containerRect = container ? container.getBoundingClientRect() : canvas.getBoundingClientRect();
        const mouseX = e.clientX - containerRect.left + (container ? container.scrollLeft : 0);
        const mouseY = e.clientY - containerRect.top  + (container ? container.scrollTop  : 0);

        bboxEditorState.zoom = newZoom;
        window.bboxEditorRenderCanvas();

        // ズーム後のスクロール位置補正（マウス位置を中心に維持）
        if (container) {
            const ratio = newZoom / oldZoom;
            container.scrollLeft = mouseX * ratio - (e.clientX - containerRect.left);
            container.scrollTop  = mouseY * ratio - (e.clientY - containerRect.top);
        }
    }, { passive: false });

    canvas.addEventListener('mousedown', function(e) {
        const container = document.getElementById('bbox-editor-canvas-container');

        // Space+Ctrl+ドラッグ: ズーム
        if (bboxEditorSpacePressed && e.ctrlKey) {
            const containerRect = container ? container.getBoundingClientRect() : canvas.getBoundingClientRect();
            bboxEditorState.zoomDrag = {
                startY: e.clientY,
                startZoom: bboxEditorState.zoom,
                anchorClientX: e.clientX,
                anchorClientY: e.clientY,
                anchorContentX: e.clientX - containerRect.left + (container ? container.scrollLeft : 0),
                anchorContentY: e.clientY - containerRect.top  + (container ? container.scrollTop  : 0)
            };
            canvas.style.cursor = 'zoom-in';
            e.preventDefault();
            return;
        }

        // Space+ドラッグ: パン
        if (bboxEditorSpacePressed) {
            bboxEditorState.isPanning = true;
            bboxEditorState.panStart = {
                x: e.clientX, y: e.clientY,
                scrollLeft: container ? container.scrollLeft : 0,
                scrollTop:  container ? container.scrollTop  : 0
            };
            canvas.style.cursor = 'grabbing';
            e.preventDefault();
            return;
        }

        // 中ボタン: パン
        if (e.button === 1) {
            bboxEditorState.isPanning = true;
            bboxEditorState.panStart = {
                x: e.clientX, y: e.clientY,
                scrollLeft: container ? container.scrollLeft : 0,
                scrollTop:  container ? container.scrollTop  : 0
            };
            canvas.style.cursor = 'grabbing';
            e.preventDefault();
            return;
        }

        const { x, y } = getCanvasPosFromEvent(e, canvas);
        const selectedTag = window.bboxEditorGetSelectedTag();

        // ハンドルヒットテスト（選択中BBoxのみ）
        const handle = findHandleAt(x, y, selectedTag);
        if (handle) {
            const tpl = window.bboxEditorGetTemplate();
            const selBBox = tpl && tpl.bboxes && tpl.bboxes[selectedTag];
            if (selBBox && selBBox.locked) {
                // locked: リサイズ不可
                e.preventDefault();
                return;
            }
            if (typeof window.bboxEditorPushHistory === 'function') window.bboxEditorPushHistory();
            bboxEditorState.dragMode = 'resize';
            bboxEditorState.resizeHandle = handle;
            bboxEditorState.dragStart = { x, y };
            bboxEditorState.dragOrigBBox = { ...tpl.bboxes[selectedTag] };
            e.preventDefault();
            return;
        }

        // BBoxヒットテスト
        const hit = findBBoxAt(x, y);
        if (hit) {
            const tpl = window.bboxEditorGetTemplate();
            const hitBBox = tpl && tpl.bboxes && tpl.bboxes[hit];
            window.bboxEditorSetSelectedTag(hit);
            window.bboxEditorRenderTagList();
            if (hitBBox && hitBBox.locked) {
                // locked: 選択のみ・移動不可
                window.bboxEditorRenderCanvas();
                e.preventDefault();
                return;
            }
            if (typeof window.bboxEditorPushHistory === 'function') window.bboxEditorPushHistory();
            bboxEditorState.dragMode = 'move';
            bboxEditorState.dragStart = { x, y };
            bboxEditorState.dragOrigBBox = { ...tpl.bboxes[hit] };
            window.bboxEditorRenderCanvas();
            e.preventDefault();
            return;
        }

        // 選択解除
        window.bboxEditorSetSelectedTag(null);
        window.bboxEditorRenderTagList();
        window.bboxEditorRenderCanvas();
    });

    canvas.addEventListener('mousemove', function(e) {
        // ズームドラッグ中
        if (bboxEditorState.zoomDrag) {
            const zd = bboxEditorState.zoomDrag;
            const container = document.getElementById('bbox-editor-canvas-container');
            const oldZoom = bboxEditorState.zoom;
            const dy = zd.startY - e.clientY;
            const newZoom = Math.max(0.2, Math.min(5.0, zd.startZoom * Math.pow(1.01, dy)));
            if (Math.abs(newZoom - oldZoom) > 1e-6) {
                bboxEditorState.zoom = newZoom;
                window.bboxEditorRenderCanvas();
                // anchor 位置を画面で固定
                if (container) {
                    const ratio = newZoom / oldZoom;
                    const containerRect = container.getBoundingClientRect();
                    container.scrollLeft = zd.anchorContentX * ratio - (zd.anchorClientX - containerRect.left);
                    container.scrollTop  = zd.anchorContentY * ratio - (zd.anchorClientY - containerRect.top);
                }
            }
            return;
        }

        // パン中
        if (bboxEditorState.isPanning) {
            const container = document.getElementById('bbox-editor-canvas-container');
            if (container) {
                container.scrollLeft = bboxEditorState.panStart.scrollLeft - (e.clientX - bboxEditorState.panStart.x);
                container.scrollTop  = bboxEditorState.panStart.scrollTop  - (e.clientY - bboxEditorState.panStart.y);
            }
            return;
        }

        const { x, y } = getCanvasPosFromEvent(e, canvas);
        const tpl = window.bboxEditorGetTemplate();
        const cw = canvas.width, ch = canvas.height;

        if (bboxEditorState.dragMode && tpl) {
            const selectedTag = window.bboxEditorGetSelectedTag();
            const dx = (x - bboxEditorState.dragStart.x) / cw;
            const dy = (y - bboxEditorState.dragStart.y) / ch;
            const orig = bboxEditorState.dragOrigBBox;

            if (bboxEditorState.dragMode === 'move' && selectedTag && orig) {
                const bbox = tpl.bboxes[selectedTag];
                let nx = clamp01(orig.x + dx);
                let ny = clamp01(orig.y + dy);
                // 右/下端がはみ出さないようにclamp
                nx = Math.min(nx, 1 - orig.w);
                ny = Math.min(ny, 1 - orig.h);
                bbox.x = nx;
                bbox.y = ny;
                window.bboxEditorRenderCanvas();

            } else if (bboxEditorState.dragMode === 'resize' && selectedTag && orig) {
                const bbox = tpl.bboxes[selectedTag];
                const MIN = 0.01;
                let { x: ox, y: oy, w: ow, h: oh } = orig;
                const h = bboxEditorState.resizeHandle;

                let nx = ox, ny = oy, nw = ow, nh = oh;
                if (h === 'nw') { nx = ox + dx; nw = ow - dx; ny = oy + dy; nh = oh - dy; }
                else if (h === 'ne') { nw = ow + dx; ny = oy + dy; nh = oh - dy; }
                else if (h === 'sw') { nx = ox + dx; nw = ow - dx; nh = oh + dy; }
                else if (h === 'se') { nw = ow + dx; nh = oh + dy; }
                else if (h === 'n')  { ny = oy + dy; nh = oh - dy; }
                else if (h === 's')  { nh = oh + dy; }
                else if (h === 'w')  { nx = ox + dx; nw = ow - dx; }
                else if (h === 'e')  { nw = ow + dx; }

                // 最小サイズ clamp
                if (nw < MIN) { if (h.includes('w')) nx = ox + ow - MIN; nw = MIN; }
                if (nh < MIN) { if (h.includes('n')) ny = oy + oh - MIN; nh = MIN; }
                // 座標 clamp
                nx = clamp01(nx); ny = clamp01(ny);
                nw = Math.min(nw, 1 - nx);
                nh = Math.min(nh, 1 - ny);

                bbox.x = nx; bbox.y = ny; bbox.w = nw; bbox.h = nh;
                window.bboxEditorRenderCanvas();
            }
        } else {
            // ホバー時カーソル変更
            const selectedTag = window.bboxEditorGetSelectedTag();
            const handle = findHandleAt(x, y, selectedTag);
            if (handle) {
                canvas.style.cursor = HANDLE_CURSORS[handle];
            } else if (findBBoxAt(x, y)) {
                canvas.style.cursor = 'move';
            } else {
                canvas.style.cursor = 'crosshair';
            }
        }
    });

    canvas.addEventListener('mouseup', function() {
        if (bboxEditorState.zoomDrag) {
            bboxEditorState.zoomDrag = null;
            canvas.style.cursor = bboxEditorSpacePressed ? 'grab' : 'crosshair';
            return;
        }
        if (bboxEditorState.isPanning) {
            bboxEditorState.isPanning = false;
            canvas.style.cursor = bboxEditorSpacePressed ? 'grab' : 'crosshair';
            return;
        }
        if (bboxEditorState.dragMode) {
            bboxEditorState.dragMode = null;
            bboxEditorState.resizeHandle = null;
            bboxEditorState.dragOrigBBox = null;
            if (typeof window.renderBBoxEditorPropsForm === 'function') {
                window.renderBBoxEditorPropsForm();
            }
        }
    });

    // キャンバス外でマウスアップした場合の保険
    window.addEventListener('mouseup', function() {
        if (bboxEditorState.zoomDrag) {
            bboxEditorState.zoomDrag = null;
            canvas.style.cursor = bboxEditorSpacePressed ? 'grab' : 'crosshair';
        }
        if (bboxEditorState.isPanning) {
            bboxEditorState.isPanning = false;
            canvas.style.cursor = bboxEditorSpacePressed ? 'grab' : 'crosshair';
        }
        if (bboxEditorState.dragMode) {
            bboxEditorState.dragMode = null;
            bboxEditorState.resizeHandle = null;
            bboxEditorState.dragOrigBBox = null;
            if (typeof window.renderBBoxEditorPropsForm === 'function') {
                window.renderBBoxEditorPropsForm();
            }
        }
    });
}

// ウィンドウリサイズ時に再描画
window.addEventListener('resize', function() {
    if (typeof window.bboxEditorRenderCanvas === 'function') {
        window.bboxEditorRenderCanvas();
    }
});

// DOM 準備完了後にイベントを設定
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setupBBoxCanvasEvents();
        const previewToggle = document.getElementById('bbox-preview-toggle');
        if (previewToggle) {
            previewToggle.addEventListener('change', () => {
                if (typeof window.bboxEditorRenderCanvas === 'function') window.bboxEditorRenderCanvas();
            });
        }
    });
} else {
    setupBBoxCanvasEvents();
    const previewToggle = document.getElementById('bbox-preview-toggle');
    if (previewToggle) {
        previewToggle.addEventListener('change', () => {
            if (typeof window.bboxEditorRenderCanvas === 'function') window.bboxEditorRenderCanvas();
        });
    }
}
