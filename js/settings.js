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
        tailMargin: 18,             // 末尾マージン（コマ数）
        repAutoEnabled: true,       // Rep自動付与 ON/OFF
        repMinCycles: 2,            // Rep付与に必要な最小サイクル数（2 = 元パターン + リピート部分）
        paperAutoExpand: true,      // 標準A3: ACTION/CELL 列が初期超過時に用紙を横拡張 (圧縮回避)
        fontSize: {
            cell: 2.7,              // mm
            dialogue: 3.5,          // mm
            camera: 2.7,            // mm
            direction: 3.5,         // mm
            metaValue: 8.0          // mm
        }
    },
    colors: {
        // fontColorId 0-5 のパレット
        fontColors: ['#000000', '#e53935', '#43a047', '#1e88e5', '#8e24aa', '#fb8c00'],
        // CSS変数の上書き（auto = 既定値を使う）
        bookLine: 'auto',
        cellIcon: 'auto',
        selectBorder: 'auto',
        gridThick: 'auto',
        handwritingSelect: '#00a8ff',
        handwritingTransform: '#d81b60',
        // 改善8: ライトモード Editキャンバスの標準インク色 ('auto' = デフォルト)
        editLightMain: 'auto',
        // UIメインカラー (タブ/確定ボタン等のアクセント。'auto' = テーマ既定)
        uiAccent: 'auto',
        // 標準A3テンプレートの描画色 (背景 / 罫線・固定ラベル)。入力値の文字色は対象外
        templateBg: 'auto',
        templateLine: 'auto'
    },
    editor: {
        sharedMetaKeys: ['title', 'subTitle', 'scene', 'lengthSec', 'lengthFrame', 'creator']
    },
    appearance: {
        theme: 'system'             // 'system' | 'light' | 'dark'
    },
    shortcuts: {
        // [actionId]: { main, sub }
        'edit.undo':            { main: 'Ctrl+Z',       sub: '' },
        'edit.redo':            { main: 'Ctrl+Y',       sub: 'Ctrl+Shift+Z' },
        'edit.cut':             { main: 'Ctrl+X',       sub: '' },
        'edit.copy':            { main: 'Ctrl+C',       sub: '' },
        'edit.paste':           { main: 'Ctrl+V',       sub: '' },
        'edit.delete':          { main: 'Delete',       sub: 'Backspace' },
        'edit.assist.nextNumber': { main: 'F7',         sub: '' },
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
        'preview.tool.pen':     { main: 'B',            sub: '' },
        'preview.tool.eraser':  { main: 'E',            sub: '' },
        'preview.tool.rect':    { main: 'M',            sub: '' },
        'preview.tool.lasso':   { main: 'L',            sub: '' },
        'preview.tool.transform': { main: 'T',          sub: '' },
        'preview.tool.hand':    { main: 'H',            sub: '' },
        'preview.temporaryHand': { main: 'Space',        sub: '' },
        'preview.undo':          { main: 'Ctrl+Z',       sub: '' },
        'preview.redo':          { main: 'Ctrl+Shift+Z', sub: 'Ctrl+Y' },
        'preview.confirm':      { main: 'Enter',        sub: '' },
        'preview.cancel':       { main: 'Esc',          sub: '' },
        'preview.clearSelection': { main: 'Ctrl+D',     sub: '' },
        'preview.deleteSelection': { main: 'Delete',    sub: 'Backspace' },
    },
    preview: {
        sidebarPosition: 'right',  // 'left' | 'right'
        exportFilenameTemplate: '%title_%scene_%cut',
        saveFilenameTemplate: '%title_%scene_%cut',
        // P2-2: プロジェクトHTML/JSON 保存時のデフォルトファイル名テンプレート
        projectFilenameTemplate: '%title_%episode_%cut_ts',
        // P3-w: TDTS/XDTS 保存時の独自拡張警告を抑制するフラグ
        suppressProjectSaveWarning: false,
        imageExportFormat: 'png',
        imageExportDpi: 300,
        imageExportIncludeHandwriting: true,
        includePageZero: false,    // 書き出し時に0ページを含めるか
        sectionOrder: ['template', 'tools', 'import', 'export', 'zoom'],
        previewZoom: 1,
        sidebarCollapsed: false,
        collapsedSections: [],
        penSize: 'medium',         // 'large' | 'medium' | 'small'
        eraserSize: 'medium'       // 'large' | 'medium' | 'small'
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
    'edit.assist.nextNumber': '次の連番を入力',
    'edit.repeat': 'リピート展開',
    'edit.shake': 'ブレ展開',
    'edit.randomShake': 'ランダムブレ展開',
    'edit.convertActionToCell': 'すべての原画を動画に一括変換',
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
    'preview.tool.pen': '手書き: ペン',
    'preview.tool.eraser': '手書き: 消しゴム',
    'preview.tool.rect': '手書き: 矩形選択',
    'preview.tool.lasso': '手書き: 投げ縄選択',
    'preview.tool.transform': '手書き: 変形',
    'preview.tool.hand': '手書き: ハンド',
    'preview.temporaryHand': '手書き: 一時ハンド',
    'preview.undo': '手書き: 元に戻す',
    'preview.redo': '手書き: やり直し',
    'preview.confirm': '手書き: 確定',
    'preview.cancel': '手書き: キャンセル',
    'preview.clearSelection': '手書き: 選択解除',
    'preview.deleteSelection': '手書き: 選択削除',
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
    applyThemeSetting();

    // 線発生ギャップ → hidden input
    const gapInput = document.getElementById('gapSetting');
    if (gapInput) gapInput.value = settings.draw.lineGap;

    // CSS 変数の上書き
    const root = document.documentElement;
    const overrides = settings.colors;
    // 'auto' の場合: ライトモードではメインカラー (editLightMain) 基準の再計算色、
    // ダークモードでは従来のテーマ既定値 (CSS変数のまま)
    const applyColorVar = (key, varName) => {
        const v = overrides[key];
        if (v !== 'auto') { root.style.setProperty(varName, v); return; }
        const derived = (typeof getAutoRelatedColor === 'function') ? getAutoRelatedColor(key) : null;
        if (derived) root.style.setProperty(varName, derived);
        else root.style.removeProperty(varName);
    };
    applyColorVar('bookLine', '--book-line');
    applyColorVar('cellIcon', '--cell-icon-color');
    applyColorVar('selectBorder', '--select-border');
    applyColorVar('uiAccent', '--accent-color');
    if (overrides.gridThick !== 'auto') root.style.setProperty('--grid-thick', overrides.gridThick);
    else root.style.removeProperty('--grid-thick');

    if (typeof refreshDrawingSizeControls === 'function') refreshDrawingSizeControls();
    if (typeof refreshPreviewToolButtons === 'function') refreshPreviewToolButtons();
}

// システムテーマ変更時も auto 色 (ライト=メイン基準 / ダーク=既定) を再解決する
if (window.matchMedia) {
    try {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (typeof settings !== 'undefined' && settings.colors) applySettingsToDOM();
            if (typeof drawAll === 'function') drawAll();
        });
    } catch (e) { /* older browsers */ }
}

function applyThemeSetting() {
    const theme = settings?.appearance?.theme || 'system';
    if (theme === 'light' || theme === 'dark') {
        document.documentElement.dataset.theme = theme;
    } else {
        delete document.documentElement.dataset.theme;
    }
}

function setThemeMode(theme) {
    if (!['system', 'light', 'dark'].includes(theme)) return;
    if (!settings.appearance) settings.appearance = {};
    settings.appearance.theme = theme;
    saveSettings();
    if (typeof drawAll === 'function') drawAll();
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
    let key = e.key || e.code || '';
    if (!key) return parts.join('+');
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
