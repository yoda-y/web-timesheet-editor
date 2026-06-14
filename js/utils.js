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

// UIメインカラー (アクセント)。'auto' はテーマ既定 (CSS --accent-color と同値)
function getUiAccentColor() {
    const v = (typeof settings !== 'undefined' && settings.colors && settings.colors.uiAccent) || 'auto';
    if (v !== 'auto' && v) return v;
    return isLightThemeActive() ? '#1a73e8' : '#4285f4';
}

// UIメインカラーがカスタム指定かどうか (auto派生の基準にするか判定)
function isUiAccentCustom() {
    const v = (typeof settings !== 'undefined' && settings.colors && settings.colors.uiAccent) || 'auto';
    return v !== 'auto' && !!v;
}

function getEditLightMainColor() {
    const v = (typeof settings !== 'undefined' && settings.colors && settings.colors.editLightMain) || 'auto';
    if (v !== 'auto' && v) return v;
    // auto: UIメインカラーがカスタムならそこから派生 (同系の濃いインク色)、既定なら従来の緑
    if (typeof isUiAccentCustom === 'function' && isUiAccentCustom()) {
        const hsl = hexToHsl(getUiAccentColor());
        if (hsl) return hslToHex(hsl[0], Math.min(45, hsl[1]), 30);
    }
    return EDIT_LIGHT_MAIN_DEFAULT;
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

// #rrggbb → [h(0-360), s(0-100), l(0-100)]
function hexToHsl(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l * 100];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s * 100, l * 100];
}

// h(0-360), s(0-100), l(0-100) → #rrggbb
function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const mm = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const toHex = (v) => Math.round((v + mm) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// 色設定の「自動」: メインカラーを基準に関連色を再計算する。
// 戻り値 null = テーマ既定値 (CSS変数 / TEMPLATE既定) を使う。
// - bookLine / cellIcon: ライトモードのみ Editライト描画色 (editLightMain) から派生
// - selectBorder / editLightMain / templateLine / templateBg:
//   UIメインカラー (uiAccent) がカスタム指定のときのみ派生。auto なら既定
// mainHex 省略時は現在の設定値を使用 (モーダルのプレビュー用に上書き可)
function getAutoRelatedColor(key, mainHex) {
    // Editライト描画色ベースの関連色 (紙面系、ライトモード限定)
    if (key === 'bookLine' || key === 'cellIcon') {
        if (typeof isLightThemeActive === 'function' && !isLightThemeActive()) return null;
        const hsl = hexToHsl(mainHex || getEditLightMainColor());
        if (!hsl) return null;
        const [h, s, l] = hsl;
        if (key === 'bookLine') return hslToHex(h + 180, Math.min(80, s + 20), Math.max(40, Math.min(62, l + 12)));
        return hslToHex(h, Math.min(75, s + 5), Math.max(30, Math.min(55, l - 5)));
    }
    // UIメインカラーベースの派生 (uiAccent がカスタムのときのみ)
    if (!mainHex && !isUiAccentCustom()) return null;
    const hsl = hexToHsl(mainHex || getUiAccentColor());
    if (!hsl) return null;
    const [h, s, l] = hsl;
    switch (key) {
        // キャンバス選択枠: アクセントそのまま
        case 'selectBorder':  return hslToHex(h, s, l);
        // Editライト描画色: 同系の濃いインク色
        case 'editLightMain': return hslToHex(h, Math.min(45, s), 30);
        // 標準テンプレ罫線・固定ラベル: 同系の中明度 (#7cb342 相当の濃さ)
        case 'templateLine':  return hslToHex(h, Math.min(55, Math.max(30, s)), 48);
        // 標準テンプレ背景: ごく淡い同系色 (紙のトーン)
        case 'templateBg':    return hslToHex(h, Math.min(30, s), 97);
        default: return null;
    }
}

// Excel 列名風の連番ラベル。index は 0-based。
//   0 -> A, 25 -> Z, 26 -> AA, 27 -> AB ...  lower=true で小文字 (a..z, aa..)
function toColumnLetters(index, lower) {
    let n = Math.max(0, Math.floor(index));
    let s = '';
    const base = lower ? 97 : 65;
    do {
        s = String.fromCharCode(base + (n % 26)) + s;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return s;
}

// 列の自動採番で Z/z を超えた際に生じる壊れた名前 ([ \ ] ^ _ ` 等の単一ASCII) を判定。
// これらはユーザー意図ではない自動生成のため Excel列名へ置換してよい。
function isBrokenAutoColumnName(name) {
    if (typeof name !== 'string' || name.length !== 1) return false;
    const c = name.charCodeAt(0);
    return (c >= 91 && c <= 96) || (c >= 123 && c <= 126);  // Z<…<a / z<…<~
}

// 列表示名の解決: 壊れた自動名や空なら Excel列名で補完。意図ある名前は維持。
function resolveColumnDisplayName(name, index, lower) {
    if (name && !isBrokenAutoColumnName(name)) return String(name);
    return toColumnLetters(index, lower);
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
    // 印刷ヘッダー (template.js drawHeader) と同じ比率に統一。
    // 末尾は sheetName 欄 (= TDTS/XDTS の table.name = アプリのシート名)。
    // 旧 "VERSION" ラベルは誤称のため "SHEET NAME" に変更。
    // 旧 "SHEET" 欄 (id:"page" の "1/1") は未出力の残骸のため削除
    //   (印刷/Preview の SHEET=ページ番号は getSheetLabel で自動算出)。
    // metaData.sheetName / metaData.page のデータ構造は保持 (保存/読込互換維持)。
    const wTitle = availableWidth * 0.28;
    const wEp = availableWidth * 0.10;
    const wSc = availableWidth * 0.10;
    const wCut = availableWidth * 0.10;
    const wTime = availableWidth * 0.13;
    const wName = availableWidth * 0.19;
    const wSheet = availableWidth - (wTitle + wEp + wSc + wCut + wTime + wName);
    let cx = 25;
    metaFields = [
        { id: "title", x: cx, y: 15, w: wTitle, h: 40, label: "TITLE" },
        { id: "subTitle", x: (cx += wTitle) - 1, y: 15, w: wEp + 1, h: 40, label: "EPISODE" },
        { id: "scene", x: (cx += wEp) - 1, y: 15, w: wSc + 1, h: 40, label: "SCENE" },
        { id: "cut", x: (cx += wSc) - 1, y: 15, w: wCut + 1, h: 40, label: "CUT" },
        { id: "lengthSec", x: (cx += wCut) - 1, y: 15, w: (wTime * 0.5) + 1, h: 40, label: "TIME(秒)" },
        { id: "lengthFrame", x: (cx += (wTime * 0.5)) - 1, y: 15, w: (wTime * 0.5) + 1, h: 40, label: "+(コマ)" },
        { id: "creator", x: (cx += (wTime * 0.5)) - 1, y: 15, w: wName + 1, h: 40, label: "NAME" },
        { id: "sheetName", x: (cx += wName) - 1, y: 15, w: wSheet + 1, h: 40, label: "SHEET NAME" }
    ];
}
