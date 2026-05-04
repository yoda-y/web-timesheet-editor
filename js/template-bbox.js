// === バウンディングボックス管理（テンプレート印字座標定義） ===
// 仕様書準拠: Template設定モード

// テンプレート定義構造
const DEFAULT_TEMPLATE_CONFIG = {
    name: 'デフォルト (144コマ/6秒)',
    baseImage: null,  // Base64 or null for built-in

    // 印字項目ON/OFF
    printOptions: {
        title: true,
        episode: true,
        scene: true,
        cut: true,
        time: true,
        name: true,
        direction: true,
        page: true,
        action: true,
        sound: true,
        cell: true,
        camera: true,
        book: true  // BOOKはACTION連動
    },

    // 単一枠バウンディングボックス (mm単位)
    singleBoxes: {
        title:     { x: 10, y: 8, w: 77, h: 12, enabled: true },
        episode:   { x: 87, y: 8, w: 28, h: 12, enabled: true },
        scene:     { x: 115, y: 8, w: 28, h: 12, enabled: true },
        cut:       { x: 143, y: 8, w: 28, h: 12, enabled: true },
        time:      { x: 171, y: 8, w: 36, h: 12, enabled: true },
        name:      { x: 207, y: 8, w: 52, h: 12, enabled: true },
        page:      { x: 259, y: 8, w: 28, h: 12, enabled: true },
        direction: { x: 10, y: 25, w: 277, h: 30, enabled: true }
    },

    // グリッド枠バウンディングボックス (mm単位)
    gridBoxes: {
        // ACTION: 列数とコマ数を持つグリッド
        action: {
            left:  { x: 10, y: 115, w: 50, h: 288, enabled: true },
            right: { x: 148, y: 115, w: 50, h: 288, enabled: true },
            cols: 7,      // 列数（レイヤー数）
            rows: 72      // 行数（コマ数）
        },
        sound: {
            left:  { x: 60, y: 115, w: 18, h: 288, enabled: true },
            right: { x: 198, y: 115, w: 18, h: 288, enabled: true },
            cols: 2,
            rows: 72
        },
        cell: {
            left:  { x: 78, y: 115, w: 50, h: 288, enabled: true },
            right: { x: 216, y: 115, w: 50, h: 288, enabled: true },
            cols: 7,
            rows: 72
        },
        camera: {
            left:  { x: 128, y: 115, w: 20, h: 288, enabled: true },
            right: { x: 266, y: 115, w: 20, h: 288, enabled: true },
            cols: 3,
            rows: 72
        }
        // BOOKは別枠不要（ACTION連動で自動配置）
    },

    // BOOK用オフセット（ACTION列の上部からのオフセット）
    bookOffset: { y: -8, h: 6 },

    // タイムライン設定
    framesPerColumn: 72,  // 1列あたりのコマ数
    columnsPerPage: 2     // 1ページあたりの列数（左右）
};

// 現在のテンプレート設定
let currentTemplateConfig = JSON.parse(JSON.stringify(DEFAULT_TEMPLATE_CONFIG));

// 保存済みテンプレート一覧
let savedTemplates = [];

// バウンディングボックス編集モード
let bboxEditMode = false;
let selectedBbox = null;
let bboxDragMode = null;
let bboxDragStart = { x: 0, y: 0 };
let bboxOriginal = null;

// ===== バウンディングボックス編集UI =====

function enableBboxEditMode() {
    bboxEditMode = true;
    document.getElementById('bbox-toggle')?.classList.add('active');
    renderBboxOverlay();
}

function disableBboxEditMode() {
    bboxEditMode = false;
    selectedBbox = null;
    document.getElementById('bbox-toggle')?.classList.remove('active');
    const overlay = document.getElementById('bbox-overlay');
    if (overlay) overlay.remove();
}

function toggleBboxEditMode() {
    if (bboxEditMode) {
        disableBboxEditMode();
    } else {
        enableBboxEditMode();
    }
}

// バウンディングボックスオーバーレイ描画
function renderBboxOverlay() {
    if (!bboxEditMode) return;

    const container = document.getElementById('preview-container');
    if (!container) return;

    let overlay = document.getElementById('bbox-overlay');
    if (!overlay) {
        overlay = document.createElement('canvas');
        overlay.id = 'bbox-overlay';
        overlay.style.cssText = 'position:absolute; top:0; left:0; pointer-events:auto; cursor:crosshair; z-index:100;';
        container.style.position = 'relative';
        container.appendChild(overlay);
    }

    const previewImg = document.getElementById('preview-image');
    if (!previewImg) return;

    const rect = previewImg.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    overlay.width = previewImg.naturalWidth || rect.width;
    overlay.height = previewImg.naturalHeight || rect.height;
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.left = (rect.left - containerRect.left + container.scrollLeft) + 'px';
    overlay.style.top = (rect.top - containerRect.top + container.scrollTop) + 'px';

    const ctx = overlay.getContext('2d');
    const scale = overlay.width / TEMPLATE.WIDTH_MM;

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // 全バウンディングボックスを描画
    drawAllBboxes(ctx, scale);

    // イベントリスナー設定
    overlay.onmousedown = (e) => handleBboxMouseDown(e, overlay, scale);
    overlay.onmousemove = (e) => handleBboxMouseMove(e, overlay, scale);
    overlay.onmouseup = (e) => handleBboxMouseUp(e);
    overlay.onmouseleave = (e) => handleBboxMouseUp(e);
}

// 全バウンディングボックス描画
function drawAllBboxes(ctx, scale) {
    const cfg = currentTemplateConfig;

    // 単一枠
    for (const key in cfg.singleBoxes) {
        const bbox = cfg.singleBoxes[key];
        if (!bbox.enabled) continue;
        const isSelected = selectedBbox?.path === `single.${key}`;
        drawBbox(ctx, bbox, key.toUpperCase(), scale, isSelected, '#ff0000');
    }

    // グリッド枠
    for (const key in cfg.gridBoxes) {
        const grid = cfg.gridBoxes[key];
        ['left', 'right'].forEach(side => {
            if (!grid[side]?.enabled) return;
            const bbox = grid[side];
            const isSelected = selectedBbox?.path === `grid.${key}.${side}`;
            drawBbox(ctx, bbox, `${key.toUpperCase()} (${side})`, scale, isSelected, '#0066ff');

            // グリッド線を描画
            if (isSelected) {
                drawGridLines(ctx, bbox, grid.cols, grid.rows, scale);
            }
        });
    }

    // BOOK位置プレビュー（ACTION連動）
    if (cfg.printOptions.book && cfg.gridBoxes.action) {
        const actionLeft = cfg.gridBoxes.action.left;
        if (actionLeft?.enabled) {
            const bookY = actionLeft.y + cfg.bookOffset.y;
            const bookH = cfg.bookOffset.h;
            ctx.strokeStyle = 'rgba(0, 200, 0, 0.5)';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(
                actionLeft.x * scale,
                bookY * scale,
                actionLeft.w * scale,
                bookH * scale
            );
            ctx.setLineDash([]);

            ctx.fillStyle = 'rgba(0, 200, 0, 0.3)';
            ctx.font = `${10 * scale / 3}px sans-serif`;
            ctx.fillText('BOOK (ACTION連動)', actionLeft.x * scale + 2, bookY * scale + 10);
        }
    }
}

// 単一バウンディングボックス描画
function drawBbox(ctx, bbox, label, scale, isSelected, color) {
    const x = bbox.x * scale;
    const y = bbox.y * scale;
    const w = bbox.w * scale;
    const h = bbox.h * scale;

    // 半透明背景
    ctx.fillStyle = isSelected ? `${color}40` : `${color}20`;
    ctx.fillRect(x, y, w, h);

    // 枠線
    ctx.strokeStyle = isSelected ? color : `${color}99`;
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.strokeRect(x, y, w, h);

    // ラベル
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.max(8, 10 * scale / 3)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x + 2, y + 2);

    // リサイズハンドル
    if (isSelected) {
        const hs = 6;
        ctx.fillStyle = color;
        [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([hx, hy]) => {
            ctx.fillRect(hx - hs/2, hy - hs/2, hs, hs);
        });
    }
}

// グリッド線描画
function drawGridLines(ctx, bbox, cols, rows, scale) {
    const x = bbox.x * scale;
    const y = bbox.y * scale;
    const w = bbox.w * scale;
    const h = bbox.h * scale;
    const colW = w / cols;
    const rowH = h / rows;

    ctx.strokeStyle = 'rgba(0, 100, 255, 0.3)';
    ctx.lineWidth = 0.5;

    // 縦線
    for (let i = 1; i < cols; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * colW, y);
        ctx.lineTo(x + i * colW, y + h);
        ctx.stroke();
    }

    // 横線（6コマごとに表示）
    for (let i = 6; i < rows; i += 6) {
        ctx.beginPath();
        ctx.moveTo(x, y + i * rowH);
        ctx.lineTo(x + w, y + i * rowH);
        ctx.stroke();
    }
}

// ===== マウスイベント =====

function findBboxAtPoint(mmX, mmY) {
    const cfg = currentTemplateConfig;

    // 単一枠
    for (const key in cfg.singleBoxes) {
        const bbox = cfg.singleBoxes[key];
        if (!bbox.enabled) continue;
        if (mmX >= bbox.x && mmX <= bbox.x + bbox.w &&
            mmY >= bbox.y && mmY <= bbox.y + bbox.h) {
            return { path: `single.${key}`, bbox };
        }
    }

    // グリッド枠
    for (const key in cfg.gridBoxes) {
        const grid = cfg.gridBoxes[key];
        for (const side of ['left', 'right']) {
            if (!grid[side]?.enabled) continue;
            const bbox = grid[side];
            if (mmX >= bbox.x && mmX <= bbox.x + bbox.w &&
                mmY >= bbox.y && mmY <= bbox.y + bbox.h) {
                return { path: `grid.${key}.${side}`, bbox, grid };
            }
        }
    }

    return null;
}

function getBboxByPath(path) {
    const parts = path.split('.');
    const cfg = currentTemplateConfig;

    if (parts[0] === 'single') {
        return cfg.singleBoxes[parts[1]];
    } else if (parts[0] === 'grid') {
        return cfg.gridBoxes[parts[1]][parts[2]];
    }
    return null;
}

function findResizeHandle(mmX, mmY, bbox, scale) {
    const hs = 8 / scale;
    const corners = [
        { x: bbox.x, y: bbox.y, id: 'nw' },
        { x: bbox.x + bbox.w, y: bbox.y, id: 'ne' },
        { x: bbox.x, y: bbox.y + bbox.h, id: 'sw' },
        { x: bbox.x + bbox.w, y: bbox.y + bbox.h, id: 'se' }
    ];

    for (const c of corners) {
        if (Math.abs(mmX - c.x) < hs && Math.abs(mmY - c.y) < hs) {
            return c.id;
        }
    }
    return null;
}

function handleBboxMouseDown(e, overlay, scale) {
    const rect = overlay.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (overlay.width / rect.width);
    const y = (e.clientY - rect.top) * (overlay.height / rect.height);
    const mmX = x / scale;
    const mmY = y / scale;

    // リサイズハンドル
    if (selectedBbox) {
        const handle = findResizeHandle(mmX, mmY, selectedBbox.bbox, scale);
        if (handle) {
            bboxDragMode = 'resize-' + handle;
            bboxDragStart = { x: mmX, y: mmY };
            bboxOriginal = { ...selectedBbox.bbox };
            return;
        }
    }

    // 選択
    const found = findBboxAtPoint(mmX, mmY);
    if (found) {
        selectedBbox = found;
        bboxDragMode = 'move';
        bboxDragStart = { x: mmX, y: mmY };
        bboxOriginal = { ...found.bbox };
    } else {
        selectedBbox = null;
    }

    renderBboxOverlay();
}

function handleBboxMouseMove(e, overlay, scale) {
    const rect = overlay.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (overlay.width / rect.width);
    const y = (e.clientY - rect.top) * (overlay.height / rect.height);
    const mmX = x / scale;
    const mmY = y / scale;

    // カーソル変更
    if (!bboxDragMode) {
        if (selectedBbox) {
            const handle = findResizeHandle(mmX, mmY, selectedBbox.bbox, scale);
            if (handle === 'nw' || handle === 'se') overlay.style.cursor = 'nwse-resize';
            else if (handle === 'ne' || handle === 'sw') overlay.style.cursor = 'nesw-resize';
            else if (findBboxAtPoint(mmX, mmY)) overlay.style.cursor = 'move';
            else overlay.style.cursor = 'crosshair';
        } else {
            overlay.style.cursor = findBboxAtPoint(mmX, mmY) ? 'move' : 'crosshair';
        }
        return;
    }

    if (!selectedBbox) return;

    const dx = mmX - bboxDragStart.x;
    const dy = mmY - bboxDragStart.y;

    if (bboxDragMode === 'move') {
        selectedBbox.bbox.x = Math.max(0, bboxOriginal.x + dx);
        selectedBbox.bbox.y = Math.max(0, bboxOriginal.y + dy);
    } else if (bboxDragMode.startsWith('resize-')) {
        const corner = bboxDragMode.replace('resize-', '');
        const minSize = 5;

        if (corner.includes('w')) {
            const newX = Math.max(0, bboxOriginal.x + dx);
            const newW = bboxOriginal.w - (newX - bboxOriginal.x);
            if (newW >= minSize) {
                selectedBbox.bbox.x = newX;
                selectedBbox.bbox.w = newW;
            }
        }
        if (corner.includes('e')) {
            selectedBbox.bbox.w = Math.max(minSize, bboxOriginal.w + dx);
        }
        if (corner.includes('n')) {
            const newY = Math.max(0, bboxOriginal.y + dy);
            const newH = bboxOriginal.h - (newY - bboxOriginal.y);
            if (newH >= minSize) {
                selectedBbox.bbox.y = newY;
                selectedBbox.bbox.h = newH;
            }
        }
        if (corner.includes('s')) {
            selectedBbox.bbox.h = Math.max(minSize, bboxOriginal.h + dy);
        }
    }

    renderBboxOverlay();
}

function handleBboxMouseUp(e) {
    bboxDragMode = null;
    bboxOriginal = null;
}

// ===== テンプレート保存・読込 =====

function saveTemplateConfig(name) {
    const config = JSON.parse(JSON.stringify(currentTemplateConfig));
    config.name = name || config.name;

    const existing = savedTemplates.findIndex(t => t.name === config.name);
    if (existing >= 0) {
        savedTemplates[existing] = config;
    } else {
        savedTemplates.push(config);
    }

    localStorage.setItem('timesheet-templates', JSON.stringify(savedTemplates));
    localStorage.setItem('timesheet-current-template', JSON.stringify(config));
}

function loadTemplateConfig(name) {
    const found = savedTemplates.find(t => t.name === name);
    if (found) {
        currentTemplateConfig = JSON.parse(JSON.stringify(found));
        localStorage.setItem('timesheet-current-template', JSON.stringify(currentTemplateConfig));
        return true;
    }
    return false;
}

function loadSavedTemplates() {
    try {
        const saved = localStorage.getItem('timesheet-templates');
        if (saved) savedTemplates = JSON.parse(saved);

        const current = localStorage.getItem('timesheet-current-template');
        if (current) currentTemplateConfig = JSON.parse(current);
    } catch (e) {
        console.warn('Failed to load templates:', e);
    }
}

function resetTemplateConfig() {
    currentTemplateConfig = JSON.parse(JSON.stringify(DEFAULT_TEMPLATE_CONFIG));
    renderBboxOverlay();
}

// ===== データ流し込み座標取得 =====

// 単一枠の座標取得
function getSingleBoxCoords(key) {
    const bbox = currentTemplateConfig.singleBoxes[key];
    if (!bbox?.enabled) return null;
    return { x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h };
}

// グリッド枠の座標取得（列・行インデックス指定）
function getGridCellCoords(type, side, colIndex, rowIndex) {
    const grid = currentTemplateConfig.gridBoxes[type];
    if (!grid?.[side]?.enabled) return null;

    const bbox = grid[side];
    const colW = bbox.w / grid.cols;
    const rowH = bbox.h / grid.rows;

    return {
        x: bbox.x + colIndex * colW,
        y: bbox.y + rowIndex * rowH,
        w: colW,
        h: rowH
    };
}

// BOOK座標取得（ACTION列連動）
function getBookCoords(colIndex, bookIndex, side = 'left') {
    const actionGrid = currentTemplateConfig.gridBoxes.action;
    if (!actionGrid?.[side]?.enabled) return null;

    const actionBbox = actionGrid[side];
    const colW = actionBbox.w / actionGrid.cols;
    const cfg = currentTemplateConfig;

    return {
        x: actionBbox.x + colIndex * colW,
        y: actionBbox.y + cfg.bookOffset.y - bookIndex * (cfg.bookOffset.h + 2),
        w: colW,
        h: cfg.bookOffset.h
    };
}

// Direction描画範囲取得（BOOK回避）
function getDirectionMaxWidth() {
    const dirBox = currentTemplateConfig.singleBoxes.direction;
    if (!dirBox?.enabled) return 0;

    // BOOKが有効な場合、一番左のBOOK位置を考慮
    if (currentTemplateConfig.printOptions.book) {
        const actionGrid = currentTemplateConfig.gridBoxes.action;
        if (actionGrid?.left?.enabled) {
            const leftmostBookX = actionGrid.left.x;
            return Math.max(0, leftmostBookX - dirBox.x - 5);
        }
    }

    return dirBox.w;
}

// ===== 初期化 =====

function initTemplateSystem() {
    loadSavedTemplates();
}

// グローバル公開
window.toggleBboxEditMode = toggleBboxEditMode;
window.enableBboxEditMode = enableBboxEditMode;
window.disableBboxEditMode = disableBboxEditMode;
window.renderBboxOverlay = renderBboxOverlay;
window.resetBboxes = resetTemplateConfig;
window.saveBboxes = () => saveTemplateConfig();
window.currentTemplateConfig = currentTemplateConfig;
window.getSingleBoxCoords = getSingleBoxCoords;
window.getGridCellCoords = getGridCellCoords;
window.getBookCoords = getBookCoords;
window.getDirectionMaxWidth = getDirectionMaxWidth;
