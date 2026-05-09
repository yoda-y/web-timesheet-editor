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
