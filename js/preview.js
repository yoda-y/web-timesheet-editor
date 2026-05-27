// === プレビューモード（テンプレートプレビュー） ===
// Phase J-1: テンプレートベースのタイムシートプレビュー

let previewContainer = null;
let previewStage = null;
let previewImage = null;
let previewZoom = 1.0;
let previewPanX = 0;
let previewPanY = 0;
let previewIsDragging = false;
let previewDragStartX = 0;
let previewDragStartY = 0;
let previewPanStartX = 0;
let previewPanStartY = 0;
let previewViewSaveTimer = null;

// プレビューショートカット設定（settings.preview で上書き可能）
function getPreviewShortcuts() {
    const defaults = {
        zoom: 'wheel',        // マウスホイールでズーム
        pan: 'leftClick'      // 左クリック+ドラッグでパン
        // penMode: { zoom: 'ctrl+wheel', pan: 'space+leftClick' } // ペン入力時用（未実装）
    };
    if (typeof settings !== 'undefined' && settings.preview) {
        return { ...defaults, ...settings.preview };
    }
    return defaults;
}

let sidebarCollapsed = false;

function getSavedPreviewZoom() {
    const saved = settings?.preview?.previewZoom;
    return (typeof saved === 'number' && saved >= 0.25 && saved <= 5) ? saved : 1.0;
}

function persistPreviewViewSettings() {
    if (typeof settings === 'undefined' || !settings.preview) return;
    settings.preview.previewZoom = previewZoom;
    settings.preview.sidebarCollapsed = sidebarCollapsed;
    if (typeof saveSettings === 'function') saveSettings();
}

function schedulePreviewViewSave() {
    clearTimeout(previewViewSaveTimer);
    previewViewSaveTimer = setTimeout(persistPreviewViewSettings, 250);
}

function applySidebarSectionState() {
    const collapsed = new Set(settings?.preview?.collapsedSections || []);
    document.querySelectorAll('#preview-sidebar .sidebar-section[data-section]').forEach(section => {
        const name = section.dataset.section;
        const content = section.querySelector('.sidebar-content');
        const toggle = section.querySelector('.sidebar-toggle');
        if (!content) return;
        content.classList.toggle('collapsed', collapsed.has(name));
        if (toggle) toggle.textContent = content.classList.contains('collapsed') ? '▶' : '▼';
    });
}

// サイドバー位置取得（設定から）
function getSidebarPosition() {
    if (typeof settings !== 'undefined' && settings.preview && settings.preview.sidebarPosition) {
        return settings.preview.sidebarPosition;
    }
    return 'right';
}

// サイドバー表示
function showSidebar() {
    const sidebar = document.getElementById('preview-sidebar');
    const expandBtn = document.getElementById('sidebar-expand-btn');
    const position = getSidebarPosition();

    if (sidebar) {
        sidebarCollapsed = !!settings?.preview?.sidebarCollapsed;
        sidebar.style.display = 'flex';
        sidebar.classList.remove('left', 'right');
        sidebar.classList.add(position);
        applySidebarSectionState();

        if (sidebarCollapsed) {
            sidebar.style.display = 'none';
            expandBtn.style.display = 'flex';
            expandBtn.classList.remove('left', 'right');
            expandBtn.classList.add(position);
        } else {
            expandBtn.style.display = 'none';
        }
    }

    // プレビューコンテナのマージン調整
    updatePreviewContainerMargin();
}

// サイドバー非表示
function hideSidebar() {
    const sidebar = document.getElementById('preview-sidebar');
    const expandBtn = document.getElementById('sidebar-expand-btn');

    if (sidebar) sidebar.style.display = 'none';
    if (expandBtn) expandBtn.style.display = 'none';

    // プレビューコンテナのマージンリセット
    if (previewContainer) {
        previewContainer.style.marginLeft = '0';
        previewContainer.style.marginRight = '0';
    }
}

// サイドバー折りたたみトグル
function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    if (typeof settings !== 'undefined' && settings.preview) {
        settings.preview.sidebarCollapsed = sidebarCollapsed;
        if (typeof saveSettings === 'function') saveSettings();
    }
    showSidebar();
}

// プレビューコンテナのマージン調整
function updatePreviewContainerMargin() {
    if (!previewContainer) return;
    const position = getSidebarPosition();
    const sidebarWidth = sidebarCollapsed ? 0 : 180;

    if (position === 'left') {
        previewContainer.style.marginLeft = sidebarWidth + 'px';
        previewContainer.style.marginRight = '0';
    } else {
        previewContainer.style.marginLeft = '0';
        previewContainer.style.marginRight = sidebarWidth + 'px';
    }
}

// プレビューモード有効化
function enablePreviewMode() {
    previewContainer = document.getElementById('preview-container');
    if (!previewContainer) return;

    // ズーム/パンリセット
    previewZoom = getSavedPreviewZoom();
    previewPanX = 0;
    previewPanY = 0;

    // 表示切替
    previewContainer.style.display = 'flex';
    document.getElementById('main-wrapper').style.display = 'none';

    // サイドバー表示
    showSidebar();

    // プレビュー生成
    updateTemplatePreview();

    // イベントリスナー追加（重複防止）
    previewContainer.removeEventListener('wheel', handlePreviewWheel);
    previewContainer.removeEventListener('mousedown', handlePreviewMouseDown);
    previewContainer.removeEventListener('mousemove', handlePreviewMouseMove);
    previewContainer.removeEventListener('mouseup', handlePreviewMouseUp);
    previewContainer.removeEventListener('mouseleave', handlePreviewMouseUp);
    previewContainer.addEventListener('wheel', handlePreviewWheel, { passive: false });
    previewContainer.addEventListener('mousedown', handlePreviewMouseDown);
    previewContainer.addEventListener('mousemove', handlePreviewMouseMove);
    previewContainer.addEventListener('mouseup', handlePreviewMouseUp);
    previewContainer.addEventListener('mouseleave', handlePreviewMouseUp);
}

// プレビューモード無効化
function disablePreviewMode() {
    if (previewContainer) {
        previewContainer.style.display = 'none';
        previewContainer.removeEventListener('wheel', handlePreviewWheel);
        previewContainer.removeEventListener('mousedown', handlePreviewMouseDown);
        previewContainer.removeEventListener('mousemove', handlePreviewMouseMove);
        previewContainer.removeEventListener('mouseup', handlePreviewMouseUp);
        previewContainer.removeEventListener('mouseleave', handlePreviewMouseUp);
    }
    hideSidebar();
    document.getElementById('main-wrapper').style.display = 'flex';
}

// サイドバーから書き出し
function exportFromSidebar() {
    const format = document.getElementById('export-format').value;
    const dpi = parseInt(document.getElementById('export-dpi').value, 10);
    if (typeof openImageExportDialog === 'function') {
        openImageExportDialog(format, dpi);
    } else {
        exportTemplateImage(format, dpi);
    }
}

function exportHandwritingFromSidebar() {
    const dpi = parseInt(document.getElementById('export-dpi').value, 10) || 150;
    if (typeof exportHandwritingPngPages === 'function') exportHandwritingPngPages(dpi);
}

function importFileFromSidebar() {
    const input = document.getElementById('fileInput');
    if (!input) return;
    input.accept = '.tdts,.xdts,.json,.html,.htm';
    input.click();
}

function importFolderFromSidebar() {
    if (typeof openTimesheetFromFolder === 'function') openTimesheetFromFolder();
}

function importXdtsFromSidebar() {
    const input = document.getElementById('fileInput');
    if (!input) return;
    input.accept = '.xdts';
    input.click();
}

function importHandwritingFromSidebar() {
    if (typeof importHandwritingPngFiles === 'function') importHandwritingPngFiles();
}

function exportTDTSSidebar() {
    if (typeof window.exportTDTS === 'function') window.exportTDTS({ saveAs: false, directoryWorkflow: true });
}

// P4: サイドバーから Project HTML 保存。Ctrl+S と同じ挙動 (handle あれば silent、無ければピッカー)
function saveProjectHtmlSidebar() {
    if (window.projectHtml && typeof window.projectHtml.exportHTML === 'function') {
        window.projectHtml.exportHTML({ saveAs: false });
    }
}

// サイドバーセクション折りたたみ
function toggleSidebarSection(sectionName) {
    const section = document.querySelector(`.sidebar-section[data-section="${sectionName}"]`);
    if (!section) return;

    const content = section.querySelector('.sidebar-content');
    const toggle = section.querySelector('.sidebar-toggle');

    if (content) {
        content.classList.toggle('collapsed');
        if (toggle) {
            toggle.textContent = content.classList.contains('collapsed') ? '▶' : '▼';
        }
        if (typeof settings !== 'undefined' && settings.preview) {
            const collapsed = new Set(settings.preview.collapsedSections || []);
            if (content.classList.contains('collapsed')) collapsed.add(sectionName);
            else collapsed.delete(sectionName);
            settings.preview.collapsedSections = [...collapsed];
            if (typeof saveSettings === 'function') saveSettings();
        }
    }
}

// マウスホイールでズーム（カーソル位置を起点）
function handlePreviewWheel(e) {
    e.preventDefault();
    const rect = previewContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.25, Math.min(5, previewZoom * delta));

    // カーソル位置を起点にズーム
    previewPanX = mouseX - (mouseX - previewPanX) * (newZoom / previewZoom);
    previewPanY = mouseY - (mouseY - previewPanY) * (newZoom / previewZoom);

    previewZoom = newZoom;
    applyPreviewTransform();
    schedulePreviewViewSave();
}

// マウスダウン（パン開始）
function handlePreviewMouseDown(e) {
    if (e.button === 0 && handlePreviewSharedCutHit(e)) return;
    if (e.target && e.target.id === 'handwriting-ui-canvas') return;
    if (e.button === 0) { // 左クリック
        previewIsDragging = true;
        previewDragStartX = e.clientX;
        previewDragStartY = e.clientY;
        previewPanStartX = previewPanX;
        previewPanStartY = previewPanY;
        previewContainer.style.cursor = 'grabbing';
        e.preventDefault();
    }
}

function handlePreviewSharedCutHit(e) {
    if (typeof hasSharedCuts !== 'function' || !hasSharedCuts()) return false;
    if (!previewImage || !TEMPLATE) return false;
    const rect = previewImage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const x = (e.clientX - rect.left) * (previewImage.naturalWidth || previewImage.width) / rect.width;
    const y = (e.clientY - rect.top) * (previewImage.naturalHeight || previewImage.height) / rect.height;
    const dpi = 150;
    const px = (mm) => mm / 25.4 * dpi;
    const headerX = px(TEMPLATE.MARGIN_LEFT);
    const headerY = px(TEMPLATE.MARGIN_TOP);
    const totalW = px(TEMPLATE.WIDTH_MM - TEMPLATE.MARGIN_LEFT - TEMPLATE.MARGIN_RIGHT);
    const headerH = px(TEMPLATE.HEADER_HEIGHT);
    const cutX = headerX + totalW * (0.28 + 0.10 + 0.10);
    const cutW = totalW * 0.10;
    if (x >= cutX && x <= cutX + cutW && y >= headerY && y <= headerY + headerH + px(12)) {
        const cuts = (typeof getSharedCutList === 'function') ? getSharedCutList() : [];
        const currentCut = String(metaData.cut || '');
        const otherCuts = cuts.filter(cut => String(cut) !== currentCut);
        const listX = cutX + cutW - px(4);
        if (x >= listX - px(6) && x <= listX + px(6) && otherCuts.length) {
            const lineH = px(3.8);
            const totalH = lineH * otherCuts.length;
            let lineY = headerY + px(4.2) + lineH * 0.78;
            for (const cut of otherCuts) {
                if (y >= lineY - lineH * 0.75 && y <= lineY + lineH * 0.35) {
                    switchToSharedCut(cut);
                    return true;
                }
                lineY += lineH;
            }
        }
        if (typeof showSharedCutSwitcher === 'function') {
            showSharedCutSwitcher(e.clientX, e.clientY);
        }
        e.preventDefault();
        e.stopPropagation();
        return true;
    }
    return false;
}

// マウス移動（パン中 & マウス位置追跡）
function handlePreviewMouseMove(e) {
    updatePreviewMousePosition(e);
    if (!previewIsDragging) return;
    const dx = e.clientX - previewDragStartX;
    const dy = e.clientY - previewDragStartY;
    previewPanX = previewPanStartX + dx;
    previewPanY = previewPanStartY + dy;
    applyPreviewTransform();
}

// マウスアップ（パン終了）
function handlePreviewMouseUp(e) {
    previewIsDragging = false;
    previewContainer.style.cursor = 'grab';
}

// トランスフォーム適用
function applyPreviewTransform() {
    if (!previewImage) {
        previewImage = document.getElementById('preview-image');
        if (!previewImage) return;
    }
    if (!previewStage) previewStage = document.getElementById('preview-stage');
    const baseScale = previewStage ? parseFloat(previewStage.dataset.baseScale || '1') : 1;
    const target = previewStage || previewImage;
    target.style.transformOrigin = '0 0';
    target.style.transform = `translate(${previewPanX}px, ${previewPanY}px) scale(${previewZoom * baseScale})`;
    previewImage.style.maxWidth = 'none';
    previewImage.style.maxHeight = 'none';

    // ズーム率表示更新
    const zoomDisplay = document.getElementById('preview-zoom-display');
    if (zoomDisplay) zoomDisplay.textContent = Math.round(previewZoom * 100) + '%';
}

// プレビューズームリセット
function resetPreviewZoom() {
    previewZoom = 1.0;
    previewPanX = 0;
    previewPanY = 0;
    schedulePreviewViewSave();
    updateTemplatePreview();
}

// マウス位置追跡（ショートカットズーム用）
let lastPreviewMouseX = 0;
let lastPreviewMouseY = 0;

// プレビューズームイン/アウト（マウス位置を起点）
function previewZoomIn() {
    const newZoom = Math.min(5, previewZoom * 1.2);
    adjustZoomAroundMouse(newZoom);
}
function previewZoomOut() {
    const newZoom = Math.max(0.25, previewZoom / 1.2);
    adjustZoomAroundMouse(newZoom);
}
function adjustZoomAroundMouse(newZoom) {
    if (!previewContainer) return;
    const rect = previewContainer.getBoundingClientRect();
    // マウス位置が有効ならマウス起点、なければ画面中央
    let pivotX = lastPreviewMouseX || rect.width / 2;
    let pivotY = lastPreviewMouseY || rect.height / 2;
    previewPanX = pivotX - (pivotX - previewPanX) * (newZoom / previewZoom);
    previewPanY = pivotY - (pivotY - previewPanY) * (newZoom / previewZoom);
    previewZoom = newZoom;
    applyPreviewTransform();
    schedulePreviewViewSave();
}
function updatePreviewMousePosition(e) {
    if (!previewContainer) return;
    const rect = previewContainer.getBoundingClientRect();
    lastPreviewMouseX = e.clientX - rect.left;
    lastPreviewMouseY = e.clientY - rect.top;
}

// テンプレートプレビュー更新（固定高解像度）
function updateTemplatePreview() {
    // previewContainerを再取得
    previewContainer = document.getElementById('preview-container');
    if (!previewContainer) return;
    if (typeof renderTemplate !== 'function') return;

    // 高解像度で描画（150dpi固定）
    const renderDpi = 150;
    const baseDpi = TEMPLATE.DPI_PREVIEW || 72;
    const canvas = renderTemplate(renderDpi, currentPage);
    if (!canvas) return;

    // 表示スケール（baseDpiでの見た目を維持）
    const baseScale = baseDpi / renderDpi;

    previewStage = document.getElementById('preview-stage');
    previewImage = document.getElementById('preview-image');

    if (!previewStage) {
        previewStage = document.createElement('div');
        previewStage.id = 'preview-stage';
        previewContainer.innerHTML = '';
        previewContainer.appendChild(previewStage);
    }

    if (!previewImage) {
        previewImage = document.createElement('img');
        previewImage.id = 'preview-image';
        previewImage.style.cssText = 'cursor:grab;';
        previewStage.appendChild(previewImage);
    }

    previewImage.src = canvas.toDataURL('image/png');
    previewStage.dataset.baseScale = baseScale;
    previewStage.style.width = canvas.width + 'px';
    previewStage.style.height = canvas.height + 'px';
    previewImage.width = canvas.width;
    previewImage.height = canvas.height;

    // ベーススケールを考慮してトランスフォーム適用
    previewStage.style.transformOrigin = '0 0';
    previewStage.style.transform = `translate(${previewPanX}px, ${previewPanY}px) scale(${previewZoom * baseScale})`;
    previewImage.style.maxWidth = 'none';
    previewImage.style.maxHeight = 'none';

    if (typeof ensureHandwritingLayer === 'function') {
        ensureHandwritingLayer(canvas.width, canvas.height);
    }

    // ズーム率表示更新
    const zoomDisplay = document.getElementById('preview-zoom-display');
    if (zoomDisplay) zoomDisplay.textContent = Math.round(previewZoom * 100) + '%';
}

// プレビュー更新（モード切替時やデータ変更時に呼ばれる）
function refreshPreview() {
    if (currentMode === 'preview') {
        updateTemplatePreview();
    }
}
