// === 純粋ヘルパー関数 ===

function getStyle(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// 現在の実効テーマがライトかどうか (data-theme 優先、無ければ system=matchMedia)
function isLightThemeActive() {
    const dt = document.documentElement.dataset.theme;
    if (dt === 'light') return true;
    if (dt === 'dark') return false;
    // system: prefers-color-scheme
    return !(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

// 改善8: ライトモード Editキャンバスの標準インク色 ('auto' 時のデフォルト)
const EDIT_LIGHT_MAIN_DEFAULT = '#2f5f3a';

// #rrggbb → rgba(r,g,b,alpha)
function hexToRgba(hex, alpha) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim());
    if (!m) return hex;
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getEditLightMainColor() {
    const v = (typeof settings !== 'undefined' && settings.colors && settings.colors.editLightMain) || 'auto';
    return (v === 'auto' || !v) ? EDIT_LIGHT_MAIN_DEFAULT : v;
}

// Editキャンバス用インク色取得。
// role: 'text' | 'border' | 'thick' | 'medium' | 'thin'
// ライトモード時のみ editLightMain ベース。ダーク/system-dark は従来CSS変数。
function getEditInk(role) {
    if (!isLightThemeActive()) {
        switch (role) {
            case 'text':   return getStyle('--text-color');
            case 'border': return getStyle('--border-color');
            case 'thick':  return getStyle('--grid-thick');
            case 'medium': return getStyle('--grid-medium');
            case 'thin':   return getStyle('--grid-thin');
            default:       return getStyle('--text-color');
        }
    }
    const main = getEditLightMainColor();
    switch (role) {
        case 'text':
        case 'border':
        case 'thick':  return main;
        case 'medium': return hexToRgba(main, 0.55);
        case 'thin':   return hexToRgba(main, 0.28);
        default:       return main;
    }
}

// セルデータキー "TYPE-COL-FRAME" を分解（FRAMEが負数でも正しく動作）
function parseCellKey(k) {
    const a = k.indexOf('-');
    const b = k.indexOf('-', a + 1);
    if (a < 0 || b < 0) return null;
    return [k.substring(0, a), k.substring(a + 1, b), k.substring(b + 1)];
}

// フレーム index → Y座標（先頭マージン込み）
function frameY(f) {
    return (f + getHeadMargin()) * rowHeight;
}
// Y座標 → フレーム index（先頭マージン分を引く）
function yToFrame(y) {
    return Math.floor(y / rowHeight) - getHeadMargin();
}
function getHeadMargin() {
    if (typeof settings === 'undefined' || !settings.draw) return 0;
    if (!settings.draw.headMarginEnabled) return 0;
    return settings.draw.headMargin || 0;
}

function getCameraValueType(kindKey) {
    for (let vt in VALUE_TYPE_MAP) { if (VALUE_TYPE_MAP[vt].includes(kindKey)) return vt; }
    return "none";
}

function getSpeakerColor(speakerName) {
    let uniqueSpeakers = [...new Set(dialogueBlocks.map(b => b.speakerName).filter(n => n))];
    let index = uniqueSpeakers.indexOf(speakerName);
    if (index === -1) index = uniqueSpeakers.length;
    return speakerColors[index % speakerColors.length];
}

function findNearestLine(x) {
    let bestDist = Infinity, bestMatch = null;
    sections.forEach(s => {
        for (let i = 0; i <= s.cols; i++) {
            let lineX = s.x + i * s.cw;
            if (Math.abs(lineX - x) < bestDist) { bestDist = Math.abs(lineX - x); bestMatch = { type: s.type, idx: i, x: lineX }; }
        }
    });
    return bestDist < 40 ? bestMatch : null;
}

function getLogicalColIndex(type, idx) {
    let l = 0;
    for (const s of sections) { if (s.type === type) return l + idx; l += s.cols; }
    return 0;
}

function getCellByLogical(l, f) {
    let c = 0;
    // マージン部分も含めて移動可能（-headMargin..numFrames-headMargin-1）
    const hm = (typeof getHeadMargin === 'function') ? getHeadMargin() : 0;
    const minF = -hm;
    const maxF = numFrames - hm - 1;
    for (const s of sections) {
        if (l >= c && l < c + s.cols) {
            const idx = l - c;
            return { frame: Math.max(minF, Math.min(maxF, f)), colType: s.type, colIndex: idx, x: s.x + idx * s.cw, w: s.cw };
        }
        c += s.cols;
    }
    return null;
}

function updateSectionPositions() {
    let currentX = 25;
    sections.forEach(sec => { sec.x = currentX; currentX += sec.cols * sec.cw; });
    endX = currentX;
    baseWidth = Math.max(window.innerWidth, endX + 50);
    document.getElementById('meta-wrapper').style.width = baseWidth + 'px';
    const availableWidth = baseWidth - 50;
    const wTitle = availableWidth * 0.25;
    const wEp = availableWidth * 0.08;
    const wSc = availableWidth * 0.08;
    const wCut = availableWidth * 0.08;
    const wTime = availableWidth * 0.12;
    const wName = availableWidth * 0.18;
    const wDate = availableWidth * 0.12;
    const wPage = availableWidth - (wTitle + wEp + wSc + wCut + wTime + wName + wDate);
    let cx = 25;
    metaFields = [
        { id: "title", x: cx, y: 15, w: wTitle, h: 40, label: "TITLE" },
        { id: "subTitle", x: (cx += wTitle) - 1, y: 15, w: wEp + 1, h: 40, label: "EPISODE" },
        { id: "scene", x: (cx += wEp) - 1, y: 15, w: wSc + 1, h: 40, label: "SCENE" },
        { id: "cut", x: (cx += wSc) - 1, y: 15, w: wCut + 1, h: 40, label: "CUT" },
        { id: "lengthSec", x: (cx += wCut) - 1, y: 15, w: (wTime * 0.5) + 1, h: 40, label: "TIME(秒)" },
        { id: "lengthFrame", x: (cx += (wTime * 0.5)) - 1, y: 15, w: (wTime * 0.5) + 1, h: 40, label: "+(コマ)" },
        { id: "creator", x: (cx += (wTime * 0.5)) - 1, y: 15, w: wName + 1, h: 40, label: "NAME" },
        { id: "sheetName", x: (cx += wName) - 1, y: 15, w: wDate + 1, h: 40, label: "VERSION" },
        { id: "page", x: (cx += wDate) - 1, y: 15, w: wPage + 1, h: 40, label: "SHEET" }
    ];
}
