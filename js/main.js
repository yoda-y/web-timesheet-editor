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
};

// === Service Worker登録（PWA/オフライン対応） ===
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW registered:', reg.scope))
            .catch(err => console.warn('SW registration failed:', err));
    });
}
