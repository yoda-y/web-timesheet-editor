// === タブレットモード ===
function isTabletMode() {
    return localStorage.getItem('tabletMode') === 'true';
}

function setTabletMode(enabled) {
    localStorage.setItem('tabletMode', enabled ? 'true' : 'false');
    document.body.classList.toggle('tablet-mode', enabled);
    updateTabletModeMenu();
    // モード別パネル表示更新
    const numpad = document.getElementById('numpad-panel');
    const undoRedo = document.getElementById('undo-redo-float');
    if (numpad) numpad.style.display = (enabled && currentMode === 'edit') ? 'block' : 'none';
    if (undoRedo) undoRedo.style.display = (enabled && currentMode === 'preview') ? 'flex' : 'none';
}

function toggleTabletMode() {
    setTabletMode(!isTabletMode());
}

function updateTabletModeMenu() {
    const menuItem = document.getElementById('menu-tablet-mode');
    if (menuItem) {
        const label = (typeof t === 'function') ? t('settings.tabletMode') : 'タブレットモード';
        menuItem.textContent = isTabletMode() ? '✓ ' + label : label;
    }
}

// 起動時にタブレットモード復元
if (isTabletMode()) {
    document.body.classList.add('tablet-mode');
}

// === エントリポイント ===
if (typeof loadLang === 'function') loadLang();
loadSettings();
if (typeof refreshQuickPalette === 'function') refreshQuickPalette();
updateSectionPositions();
if (typeof initSheets === 'function') initSheets();
window.onload = () => {
    if (typeof applyI18n === 'function') applyI18n();
    drawAll();
    if (typeof updateModeStatus === 'function') updateModeStatus();
    if (typeof updatePageIndicator === 'function') updatePageIndicator();
    if (typeof initDocumentTabs === 'function') initDocumentTabs();
    if (typeof maybeOfferSessionRestore === 'function') maybeOfferSessionRestore();
    updateTabletModeMenu();
};

// === Service Worker登録（PWA/オフライン対応） ===
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW registered:', reg.scope))
            .catch(err => console.warn('SW registration failed:', err));
    });
}
