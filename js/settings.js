// === ユーザー設定（描画/色/ショートカット）の状態管理 ===
//
// 設定は localStorage キー 'webTSEditor.settings' に JSON で永続化。
// 起動時に loadSettings() で復元し、各モジュールが settings.* を参照する。

const SETTINGS_KEY = 'webTSEditor.settings';

const DEFAULT_SETTINGS = {
    draw: {
        lineGap: 3,                 // 線発生ギャップ（コマ）
        tomeEnabled: true,          // 止メ表示 ON/OFF
        repeatDashColor: 'rgba(66, 133, 244, 0.8)', // リピート点線色
        cutOutsideOpacity: 0.5,     // カット尺外（暗くする）の濃さ
        headMarginEnabled: false,   // 先頭マージン ON/OFF
        headMargin: 0,              // 先頭マージン（コマ数）
        tailMargin: 18              // 末尾マージン（コマ数）
    },
    colors: {
        // fontColorId 0-5 のパレット
        fontColors: ['#000000', '#e53935', '#43a047', '#1e88e5', '#8e24aa', '#fb8c00'],
        // CSS変数の上書き（auto = 既定値を使う）
        bookLine: 'auto',
        cellIcon: 'auto',
        selectBorder: 'auto',
        gridThick: 'auto'
    },
    editor: {
        sharedMetaKeys: ['title', 'subTitle', 'scene', 'cut', 'lengthSec', 'lengthFrame', 'creator']
    },
    shortcuts: {
        // [actionId]: { main, sub }
        'edit.undo':            { main: 'Ctrl+Z',       sub: '' },
        'edit.redo':            { main: 'Ctrl+Y',       sub: 'Ctrl+Shift+Z' },
        'edit.cut':             { main: 'Ctrl+X',       sub: '' },
        'edit.copy':            { main: 'Ctrl+C',       sub: '' },
        'edit.paste':           { main: 'Ctrl+V',       sub: '' },
        'edit.delete':          { main: 'Delete',       sub: 'Backspace' },
        'edit.repeat':          { main: 'Ctrl+R',       sub: '' },
        'insert.frame':         { main: 'Ctrl+I',       sub: '' },
        'insert.frameDelete':   { main: 'Ctrl+D',       sub: '' },
        'insert.frameAll':      { main: 'Ctrl+Shift+I', sub: '' },
        'insert.frameAllDelete':{ main: 'Ctrl+Shift+D', sub: '' },
        'symbol.tick1':         { main: 'F2',           sub: '' },  // ●
        'symbol.tick2':         { main: 'F3',           sub: '' },  // ○
        'symbol.null':          { main: 'F4',           sub: '' },  // ×
        'symbol.keyframe':      { main: 'F5',           sub: '' },
        'symbol.refframe':      { main: 'F6',           sub: '' },
        'help.shortcuts':       { main: 'F1',           sub: '' },
        'file.save':            { main: 'Ctrl+S',       sub: '' },
        'file.saveAs':          { main: 'Ctrl+Shift+S', sub: '' },
        'file.new':             { main: '',             sub: '' },
        'file.open':            { main: 'Ctrl+O',       sub: '' },
        'view.zoomIn':          { main: 'Ctrl++',       sub: 'Ctrl+;' },
        'view.zoomOut':         { main: 'Ctrl+-',       sub: '' },
        'view.zoom100':         { main: 'Ctrl+0',       sub: '' },
        'view.fit':             { main: 'Ctrl+9',       sub: '' },
        'edit.color.0':         { main: '',             sub: '' },
        'edit.color.1':         { main: '',             sub: '' },
        'edit.color.2':         { main: '',             sub: '' },
        'edit.color.3':         { main: '',             sub: '' },
        'edit.color.4':         { main: '',             sub: '' },
        'edit.color.5':         { main: '',             sub: '' },
    }
};

// アクションラベル（ショートカット設定UI用）
const ACTION_LABELS = {
    'edit.undo': '元に戻す',
    'edit.redo': 'やり直し',
    'edit.cut': '切り取り',
    'edit.copy': 'コピー',
    'edit.paste': '貼り付け',
    'edit.delete': '削除',
    'edit.repeat': 'リピート展開',
    'insert.frame': 'コマ挿入（選択列）',
    'insert.frameDelete': 'コマ削除（選択列）',
    'insert.frameAll': '全レイヤにコマ挿入',
    'insert.frameAllDelete': '全レイヤからコマ削除',
    'symbol.tick1': '● を入力',
    'symbol.tick2': '○ を入力',
    'symbol.null': '× を入力',
    'symbol.keyframe': 'キーフレームトグル',
    'symbol.refframe': 'リファレンスフレームトグル',
    'help.shortcuts': 'ショートカット一覧',
    'file.save': '上書き保存',
    'file.saveAs': '別名保存',
    'file.new': '新規作成',
    'file.open': '開く',
    'view.zoomIn': 'ズームイン',
    'view.zoomOut': 'ズームアウト',
    'view.zoom100': 'ズーム 100%',
    'view.fit': 'ウィンドウにフィット',
    'edit.color.0': '文字色 0 (黒)',
    'edit.color.1': '文字色 1 (赤)',
    'edit.color.2': '文字色 2 (緑)',
    'edit.color.3': '文字色 3 (青)',
    'edit.color.4': '文字色 4 (紫)',
    'edit.color.5': '文字色 5 (橙)',
};

let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

function _deepMerge(defaults, override) {
    const result = JSON.parse(JSON.stringify(defaults));
    if (!override || typeof override !== 'object') return result;
    for (const k in override) {
        if (typeof defaults[k] === 'object' && !Array.isArray(defaults[k]) && defaults[k] !== null) {
            result[k] = _deepMerge(defaults[k] || {}, override[k]);
        } else {
            result[k] = override[k];
        }
    }
    return result;
}

function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) settings = _deepMerge(DEFAULT_SETTINGS, JSON.parse(raw));
    } catch (e) { console.warn('settings load failed', e); }
    applySettingsToDOM();
}

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) { console.warn('settings save failed', e); }
    applySettingsToDOM();
}

function resetSettings() {
    settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    saveSettings();
}

// 設定をDOM（CSS変数・hidden input）に反映
function applySettingsToDOM() {
    // 線発生ギャップ → hidden input
    const gapInput = document.getElementById('gapSetting');
    if (gapInput) gapInput.value = settings.draw.lineGap;

    // CSS 変数の上書き
    const root = document.documentElement;
    const overrides = settings.colors;
    if (overrides.bookLine !== 'auto') root.style.setProperty('--book-line', overrides.bookLine);
    else root.style.removeProperty('--book-line');
    if (overrides.cellIcon !== 'auto') root.style.setProperty('--cell-icon-color', overrides.cellIcon);
    else root.style.removeProperty('--cell-icon-color');
    if (overrides.selectBorder !== 'auto') root.style.setProperty('--select-border', overrides.selectBorder);
    else root.style.removeProperty('--select-border');
    if (overrides.gridThick !== 'auto') root.style.setProperty('--grid-thick', overrides.gridThick);
    else root.style.removeProperty('--grid-thick');
}

// fontColorId から実色を取得
function getFontColorById(id) {
    const idx = parseInt(id, 10) || 0;
    return settings.colors.fontColors[idx] || settings.colors.fontColors[0];
}

// 設定エクスポート/インポート（JSON）
async function exportSettingsJSON() {
    const fileContent = JSON.stringify(settings, null, 2);
    if (window.showSaveFilePicker) {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: 'web_timesheet_editer_settings.json',
                types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
            });
            const writable = await handle.createWritable();
            await writable.write(fileContent); await writable.close();
        } catch (err) { if (err.name !== 'AbortError') alert("設定の書き出しに失敗しました。"); }
    } else {
        const blob = new Blob([fileContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'web_timesheet_editer_settings.json'; a.click();
        URL.revokeObjectURL(url);
    }
}

function importSettingsJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const parsed = JSON.parse(evt.target.result);
                settings = _deepMerge(DEFAULT_SETTINGS, parsed);
                saveSettings();
                if (typeof drawAll === 'function') drawAll();
                alert("設定を読み込みました。");
            } catch (err) { alert("JSON解析エラー: " + err.message); }
        };
        reader.readAsText(file);
    };
    input.click();
}

// === キーコンビネーションのマッチング ===
function eventToCombo(e) {
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    let key = e.key;
    if (key === ' ') key = 'Space';
    else if (key === 'Escape') key = 'Esc';
    else if (key.length === 1) key = key.toUpperCase();
    if (!['Control', 'Meta', 'Shift', 'Alt'].includes(key)) parts.push(key);
    return parts.join('+');
}

function matchShortcut(e, actionId) {
    const s = settings.shortcuts[actionId];
    if (!s) return false;
    const combo = eventToCombo(e);
    return (s.main && combo === s.main) || (s.sub && combo === s.sub);
}

// 競合検知: 同じコンボが複数アクションに割り当てられているか
function findShortcutConflicts() {
    const map = {};
    const conflicts = [];
    for (const aid in settings.shortcuts) {
        const { main, sub } = settings.shortcuts[aid];
        for (const combo of [main, sub]) {
            if (!combo) continue;
            if (!map[combo]) map[combo] = [];
            map[combo].push(aid);
        }
    }
    for (const combo in map) {
        if (map[combo].length > 1) conflicts.push({ combo, actions: map[combo] });
    }
    return conflicts;
}
