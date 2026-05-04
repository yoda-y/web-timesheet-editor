// === メニューバー / モード切替 / ドロップダウンメニュー ===

let currentMode = 'edit'; // 'edit' | 'preview' | 'template'
let openMenuName = null;
let activeFontColorId = 0; // クイックパレットで選択中の入力色

// クイックパレットの色を settings から取得して反映
function refreshQuickPalette() {
    document.querySelectorAll('.qp-swatch').forEach(s => {
        const idx = parseInt(s.dataset.fc, 10);
        s.style.background = settings.colors.fontColors[idx] || '#000000';
        s.classList.toggle('active', idx === activeFontColorId);
    });
}
document.querySelectorAll('.qp-swatch').forEach(s => {
    s.addEventListener('click', () => {
        activeFontColorId = parseInt(s.dataset.fc, 10);
        refreshQuickPalette();
    });
});

// アクション → 関数 のマッピング
const menuActions = {
    // ファイル
    'file.new': () => {
        if (isDirty && !confirm('未保存の変更があります。破棄して新規作成しますか？')) return;
        else if (!isDirty && !confirm('現在のシートを破棄して新規作成しますか？')) return;
        // 状態を初期化
        cellData = {};
        booksData = { "ACTION": {}, "SOUND": {}, "CELL": {}, "CAMERA": {} };
        customRepeats = [];
        dialogueBlocks = [];
        cameraBlocks = [];
        metaData = { title:"", subTitle:"", scene:"", cut:"", lengthSec:"6", lengthFrame:"00", creator:"", sheetName:"sheet1", page:"1/1", memo:"" };
        undoStack = []; redoStack = [];
        selectionStart = null; selectionEnd = null; selectedMeta = null;
        selectedDialogueId = null; selectedCameraId = null;
        // セクション初期化
        sections = [
            { type:"ACTION", x:25, cols:7, cw:32, chars:["A","B","C","D","E","F","G"] },
            { type:"SOUND",  x:0, cols:2, cw:68, chars:["S1","S2"] },
            { type:"CELL",   x:0, cols:7, cw:58, chars:["a","b","c","d","e","f","g"] },
            { type:"CAMERA", x:0, cols:3, cw:58, chars:["CAM1","CAM2","CAM3"] }
        ];
        updateSectionPositions();
        drawAll();
        if (typeof clearLastSession === 'function') clearLastSession();
        if (typeof markClean === 'function') markClean();
    },
    'file.open': () => document.getElementById('fileInput').click(),
    'file.save': () => {
        // 上書き保存: 現在のフォーマットに応じて分岐。未保存なら TDTS で保存
        if (currentFileFormat === 'xdts') window.exportXDTS({ saveAs: false });
        else window.exportTDTS({ saveAs: false });
    },
    'file.saveAs': () => window.exportTDTS({ saveAs: true }),
    'file.import.tdts': () => document.getElementById('fileInput').click(),
    'file.import.xdts': () => document.getElementById('fileInput').click(),
    'file.export.tdts': () => window.exportTDTS({ saveAs: true }),
    'file.export.xdts': () => window.exportXDTS({ saveAs: true }),
    'file.settings.export': () => exportSettingsJSON(),
    'file.settings.import': () => importSettingsJSON(),

    // 編集
    'edit.undo': () => window.undo(),
    'edit.redo': () => window.redo(),
    'edit.cut': () => { if (typeof copy === 'function') { copy(); deleteSelect(); } },
    'edit.copy': () => { if (typeof copy === 'function') copy(); },
    'edit.paste': () => { if (typeof paste === 'function') paste(); },
    'edit.delete': () => { if (typeof deleteSelect === 'function') deleteSelect(); },
    'edit.repeat': () => window.applyRepeat && window.applyRepeat(),
    'edit.color.0': () => applyFontColor(0),
    'edit.color.1': () => applyFontColor(1),
    'edit.color.2': () => applyFontColor(2),
    'edit.color.3': () => applyFontColor(3),
    'edit.color.4': () => applyFontColor(4),
    'edit.color.5': () => applyFontColor(5),

    // 挿入 - コマ
    'insert.frame': () => window.insertFramesInSelectedCols(),
    'insert.frameDelete': () => window.deleteFramesInSelectedCols(),
    'insert.frameAll': () => window.insertFramesAllLayers(),
    'insert.frameAllDelete': () => window.deleteFramesAllLayers(),

    // 挿入 - レイヤー / ブロック
    'insert.layerLeft': () => {
        if (selectionStart && (selectionStart.colType === "ACTION" || selectionStart.colType === "CELL")) {
            window.addCellByRef(selectionStart.colType, selectionStart.colIndex, 'left');
        } else { alert("ACTION か CELL の列を選択してください。"); }
    },
    'insert.layerRight': () => {
        if (selectionStart && (selectionStart.colType === "ACTION" || selectionStart.colType === "CELL")) {
            window.addCellByRef(selectionStart.colType, selectionStart.colIndex, 'right');
        } else { alert("ACTION か CELL の列を選択してください。"); }
    },
    'insert.book': () => window.addNewBook(),
    'insert.camera': () => {
        if (!selectionStart || selectionStart.colType !== "CAMERA") { alert("CAMERA列で範囲を選択してから実行してください。"); return; }
        window.openCameraModal();
    },
    'insert.dialogue': () => {
        if (!selectionStart || selectionStart.colType !== "SOUND") { alert("SOUND列で範囲を選択してから実行してください。"); return; }
        window.openDialogueModal();
    },

    // 表示
    'view.zoomIn': () => zoomIn(),
    'view.zoomOut': () => zoomOut(),
    'view.zoom100': () => zoom100(),
    'view.fit': () => zoomFit(),
    'view.toggleDirection': () => { isMemoExpanded = !isMemoExpanded; drawAll(); },
    'view.togglePanel': () => window.togglePanel(),

    // 設定
    'settings.draw': () => openDrawSettings(),
    'settings.color': () => openColorSettings(),
    'settings.shortcut': () => openShortcutSettings(),
    'settings.editor': () => openEditorSettings(),
    'help.shortcuts': () => openHelpShortcuts(),
    'help.manual': () => openHelpManual(),
    'help.about': () => { document.getElementById('help-about-modal').style.display = 'flex'; },
    'settings.reset': () => {
        if (!confirm('全ての設定をデフォルトに戻しますか？')) return;
        resetSettings();
        drawAll();
        alert('設定をリセットしました。');
    },

    // 言語切替
    'help.lang.ja': () => setLang('ja'),
    'help.lang.en': () => setLang('en'),
};

// 文字色適用（fontColorId）
function applyFontColor(colorId) {
    if (!selectionStart || !selectionEnd) return;
    pushHistory();
    const sL = getLogicalColIndex(selectionStart.colType, selectionStart.colIndex);
    const eL = getLogicalColIndex(selectionEnd.colType, selectionEnd.colIndex);
    const minL = Math.min(sL, eL), maxL = Math.max(sL, eL);
    const minF = Math.min(selectionStart.frame, selectionEnd.frame);
    const maxF = Math.max(selectionStart.frame, selectionEnd.frame);
    for (let l = minL; l <= maxL; l++) {
        for (let f = minF; f <= maxF; f++) {
            const c = getCellByLogical(l, f);
            const k = `${c.colType}-${c.colIndex}-${f}`;
            if (cellData[k]) { cellData[k].fontColorId = colorId; }
        }
    }
    drawAll();
}

// === メニュー開閉 ===
function closeAllMenus() {
    document.querySelectorAll('.menu-dropdown.open').forEach(d => {
        // version-dropdown は別ロジックで管理されるため対象外
        if (d.id === 'version-dropdown') return;
        d.classList.remove('open');
    });
    document.querySelectorAll('#menubar .menu-item.open').forEach(i => i.classList.remove('open'));
    openMenuName = null;
}

function openMenu(name) {
    closeAllMenus();
    const trigger = document.querySelector(`#menubar .menu-item[data-menu="${name}"]`);
    const dropdown = document.getElementById(`menu-${name}`);
    if (!trigger || !dropdown) return;
    const rect = trigger.getBoundingClientRect();
    dropdown.style.left = rect.left + 'px';
    dropdown.style.top = rect.bottom + 'px';
    dropdown.classList.add('open');
    trigger.classList.add('open');
    openMenuName = name;
}

document.querySelectorAll('#menubar .menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = item.dataset.menu;
        if (openMenuName === name) closeAllMenus();
        else openMenu(name);
    });
    item.addEventListener('mouseenter', () => {
        if (openMenuName && openMenuName !== item.dataset.menu) openMenu(item.dataset.menu);
    });
});

document.querySelectorAll('.menu-row').forEach(row => {
    row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (row.classList.contains('menu-disabled')) return;
        if (row.classList.contains('menu-submenu')) return;
        const action = row.dataset.action;
        if (action && menuActions[action]) {
            closeAllMenus();
            menuActions[action]();
        } else if (action) {
            console.warn('Unhandled menu action:', action);
            closeAllMenus();
        }
    });
});

// メニュー外クリックで閉じる
document.addEventListener('click', (e) => {
    if (!e.target.closest('#menubar') && !e.target.closest('.menu-dropdown')) closeAllMenus();
});

// Esc で閉じる
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openMenuName) closeAllMenus();
});

// === モード切替 ===
function setMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.mode === mode);
    });
    // モード限定メニューの表示制御
    document.querySelectorAll('#menubar .menu-item.mode-only').forEach(item => {
        const allowed = (item.dataset.showModes || '').split(',');
        item.classList.toggle('hidden', !allowed.includes(mode));
    });
    // Preview モード切替
    if (mode === 'preview') {
        if (typeof enablePreviewMode === 'function') enablePreviewMode();
    } else {
        if (typeof disablePreviewMode === 'function') disablePreviewMode();
    }
    // Template モードはまだ準備中
    if (mode === 'template') {
        alert('Template 設定モードは Phase K で実装予定です。');
        setMode('edit');
        return;
    }
}

document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => setMode(tab.dataset.mode));
});

// 初期表示でモード限定項目を反映
setTimeout(() => setMode('edit'), 0);

// === 描画設定モーダル ===
function openDrawSettings() {
    const modal = document.getElementById('settings-draw-modal');
    document.getElementById('gapSettingInput').value = settings.draw.lineGap;
    document.getElementById('drawTomeEnabled').checked = !!settings.draw.tomeEnabled;
    document.getElementById('drawRepeatColor').value = rgbaToHex(settings.draw.repeatDashColor) || '#4285f4';
    document.getElementById('drawHeadMarginEnabled').checked = !!settings.draw.headMarginEnabled;
    document.getElementById('drawHeadMargin').value = settings.draw.headMargin || 0;
    document.getElementById('drawTailMargin').value = settings.draw.tailMargin != null ? settings.draw.tailMargin : 18;
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('gapSettingInput').focus(), 10);
}
function closeDrawSettings() {
    document.getElementById('settings-draw-modal').style.display = 'none';
}
function rgbaToHex(rgba) {
    if (!rgba) return null;
    if (rgba.startsWith('#')) return rgba.length === 7 ? rgba : null;
    const m = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return null;
    const r = parseInt(m[1]).toString(16).padStart(2, '0');
    const g = parseInt(m[2]).toString(16).padStart(2, '0');
    const b = parseInt(m[3]).toString(16).padStart(2, '0');
    return '#' + r + g + b;
}
function hexToRgba(hex, alpha) {
    if (!hex || !hex.startsWith('#')) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
document.getElementById('settings-draw-ok').addEventListener('click', () => {
    let v = parseInt(document.getElementById('gapSettingInput').value, 10);
    if (isNaN(v) || v < 1) v = 1;
    if (v > 24) v = 24;
    settings.draw.lineGap = v;
    settings.draw.tomeEnabled = document.getElementById('drawTomeEnabled').checked;
    const hex = document.getElementById('drawRepeatColor').value;
    settings.draw.repeatDashColor = hexToRgba(hex, 0.8);
    settings.draw.headMarginEnabled = document.getElementById('drawHeadMarginEnabled').checked;
    let hm = parseInt(document.getElementById('drawHeadMargin').value, 10);
    if (isNaN(hm) || hm < 0) hm = 0; if (hm > 120) hm = 120;
    let tm = parseInt(document.getElementById('drawTailMargin').value, 10);
    if (isNaN(tm) || tm < 0) tm = 0; if (tm > 120) tm = 120;
    settings.draw.headMargin = hm;
    settings.draw.tailMargin = tm;
    saveSettings();
    closeDrawSettings();
    drawAll();
});
document.getElementById('settings-draw-cancel').addEventListener('click', closeDrawSettings);
document.getElementById('settings-draw-reset').addEventListener('click', () => {
    if (!confirm('描画設定をデフォルトに戻しますか？')) return;
    settings.draw = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.draw));
    saveSettings();
    openDrawSettings(); // 再描画
});
document.getElementById('settings-draw-modal').addEventListener('click', (e) => {
    if (e.target.id === 'settings-draw-modal') closeDrawSettings();
});

// === 色設定モーダル ===
function buildFontColorPalette() {
    const wrap = document.getElementById('font-color-palette');
    wrap.innerHTML = '';
    settings.colors.fontColors.forEach((col, idx) => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:4px;';
        const cp = document.createElement('input');
        cp.type = 'color';
        cp.value = col;
        cp.dataset.fontIdx = idx;
        cp.style.cssText = 'width:42px; height:32px; padding:0; border:1px solid var(--border-color); cursor:pointer;';
        const label = document.createElement('span');
        label.style.cssText = 'font-size:10px; color:var(--grid-medium);';
        label.innerText = `ID ${idx}`;
        item.appendChild(cp); item.appendChild(label);
        wrap.appendChild(item);
    });
}
function openColorSettings() {
    buildFontColorPalette();
    const setColorIfHex = (id, val) => {
        const el = document.getElementById(id);
        if (val === 'auto') el.value = el.dataset.autoDefault || '#666666';
        else el.value = val;
    };
    // 自動値の参考値（CSSから読む）
    document.getElementById('colorBookLine').dataset.autoDefault = getStyle('--book-line') || '#4dd0e1';
    document.getElementById('colorCellIcon').dataset.autoDefault = getStyle('--cell-icon-color') || '#fff59d';
    document.getElementById('colorSelectBorder').dataset.autoDefault = getStyle('--select-border') || '#4285f4';
    setColorIfHex('colorBookLine', settings.colors.bookLine);
    setColorIfHex('colorCellIcon', settings.colors.cellIcon);
    setColorIfHex('colorSelectBorder', settings.colors.selectBorder);
    document.getElementById('settings-color-modal').style.display = 'flex';
}
function closeColorSettings() {
    document.getElementById('settings-color-modal').style.display = 'none';
}
document.getElementById('settings-color-ok').addEventListener('click', () => {
    // パレット
    document.querySelectorAll('#font-color-palette input[type=color]').forEach(cp => {
        const idx = parseInt(cp.dataset.fontIdx, 10);
        settings.colors.fontColors[idx] = cp.value;
    });
    refreshQuickPalette();
    // 単色項目（auto判定: 値が dataset.autoDefault と一致したら auto に戻す）
    const map = { colorBookLine: 'bookLine', colorCellIcon: 'cellIcon', colorSelectBorder: 'selectBorder' };
    for (const id in map) {
        const el = document.getElementById(id);
        const v = el.value;
        const isAuto = el.dataset.userChanged !== '1';
        settings.colors[map[id]] = isAuto ? 'auto' : v;
        delete el.dataset.userChanged;
    }
    saveSettings();
    closeColorSettings();
    drawAll();
});
document.querySelectorAll('#settings-color-modal input[type=color]').forEach(el => {
    el.addEventListener('input', () => { el.dataset.userChanged = '1'; });
});
document.querySelectorAll('.color-auto-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.target;
        const idMap = { bookLine: 'colorBookLine', cellIcon: 'colorCellIcon', selectBorder: 'colorSelectBorder' };
        const el = document.getElementById(idMap[target]);
        if (el) {
            settings.colors[target] = 'auto';
            el.value = el.dataset.autoDefault || '#666666';
            delete el.dataset.userChanged;
        }
    });
});
document.getElementById('settings-color-cancel').addEventListener('click', closeColorSettings);
document.getElementById('settings-color-reset').addEventListener('click', () => {
    if (!confirm('色設定をデフォルトに戻しますか？')) return;
    settings.colors = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.colors));
    saveSettings();
    openColorSettings();
});
document.getElementById('settings-color-modal').addEventListener('click', (e) => {
    if (e.target.id === 'settings-color-modal') closeColorSettings();
});

// === エディタ環境設定モーダル ===
function openEditorSettings() {
    const shared = (settings.editor && settings.editor.sharedMetaKeys) || [];
    document.querySelectorAll('#editor-shared-meta-checks input[data-meta-key]').forEach(cb => {
        cb.checked = shared.includes(cb.dataset.metaKey);
    });
    document.getElementById('settings-editor-modal').style.display = 'flex';
}
function closeEditorSettings() {
    document.getElementById('settings-editor-modal').style.display = 'none';
}
document.getElementById('settings-editor-ok').addEventListener('click', () => {
    const newShared = [];
    document.querySelectorAll('#editor-shared-meta-checks input[data-meta-key]').forEach(cb => {
        if (cb.checked) newShared.push(cb.dataset.metaKey);
    });
    if (!settings.editor) settings.editor = {};
    settings.editor.sharedMetaKeys = newShared;
    saveSettings();
    closeEditorSettings();
});
document.getElementById('settings-editor-cancel').addEventListener('click', closeEditorSettings);
document.getElementById('settings-editor-modal').addEventListener('click', (e) => {
    if (e.target.id === 'settings-editor-modal') closeEditorSettings();
});

// === ショートカット設定モーダル ===
// ブラウザ予約キー（preventDefault が効かない）
const RESERVED_BROWSER_KEYS = [
    'Ctrl+R', 'Ctrl+Shift+R',         // リロード
    'Ctrl+T', 'Ctrl+Shift+T',         // タブ
    'Ctrl+W', 'Ctrl+Shift+W',         // タブを閉じる
    'Ctrl+N', 'Ctrl+Shift+N',         // 新規ウィンドウ
    'Ctrl+Tab', 'Ctrl+Shift+Tab',     // タブ切替
    'Ctrl+Shift+I', 'F12',            // DevTools (※ Ctrl+Shift+I は使われている - リスクあり)
    'Ctrl+L',                         // アドレスバー
    'Ctrl+P',                         // 印刷
    'Ctrl+Plus', 'Ctrl+-', 'Ctrl+0',  // ブラウザズーム
    'F5', 'Ctrl+F5',                  // リロード
    'Alt+F4'                          // ウィンドウ閉じる
];
function isReservedKey(combo) {
    return RESERVED_BROWSER_KEYS.includes(combo);
}

function buildShortcutTable() {
    const tbody = document.getElementById('shortcut-tbody');
    tbody.innerHTML = '';
    for (const aid in settings.shortcuts) {
        const row = document.createElement('tr');
        row.style.cssText = 'border-bottom:1px solid rgba(128,128,128,0.2);';
        const label = (typeof tAction === 'function') ? tAction(aid) : (ACTION_LABELS[aid] || aid);
        const sc = settings.shortcuts[aid];
        row.innerHTML = `
            <td style="padding:6px 4px;">${label}<br><span style="font-size:10px;color:var(--grid-medium);">${aid}</span></td>
            <td style="padding:4px 4px;"><input type="text" class="sc-key" data-aid="${aid}" data-slot="main" value="${sc.main || ''}" placeholder="押下で記録" readonly style="width:120px; padding:4px 6px; background:var(--highlight); color:var(--text-color); border:1px solid var(--grid-thick); border-radius:3px; font-size:11px; cursor:pointer; font-family:monospace;"></td>
            <td style="padding:4px 4px;"><input type="text" class="sc-key" data-aid="${aid}" data-slot="sub" value="${sc.sub || ''}" placeholder="押下で記録" readonly style="width:120px; padding:4px 6px; background:var(--highlight); color:var(--text-color); border:1px solid var(--grid-thick); border-radius:3px; font-size:11px; cursor:pointer; font-family:monospace;"></td>
        `;
        tbody.appendChild(row);
    }
    // キー入力UI: クリックで記録モード、次の押下で代入
    tbody.querySelectorAll('.sc-key').forEach(input => {
        input.addEventListener('click', () => {
            input.value = '...キー押下';
            input.style.background = 'rgba(66, 133, 244, 0.3)';
            input._recording = true;
        });
        input.addEventListener('keydown', (e) => {
            if (!input._recording) return;
            e.preventDefault(); e.stopPropagation();
            // Esc は解除
            if (e.key === 'Escape') {
                input.value = settings.shortcuts[input.dataset.aid][input.dataset.slot] || '';
                input.style.background = '';
                input._recording = false;
                return;
            }
            // Backspace でクリア
            if (e.key === 'Backspace' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                input.value = '';
                input.style.background = '';
                input._recording = false;
                return;
            }
            // 修飾キー単独は無視
            if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
            const combo = eventToCombo(e);
            // ブラウザ予約キー警告
            if (isReservedKey(combo)) {
                if (!confirm(`「${combo}」 はブラウザの予約キーのため、一部環境で機能しない可能性があります。\nそれでも割り当てますか？`)) {
                    input.style.background = '';
                    input._recording = false;
                    return;
                }
            }
            input.value = combo;
            input.style.background = '';
            input._recording = false;
            refreshConflictWarning();
        });
        input.addEventListener('blur', () => {
            if (input._recording) {
                input.value = settings.shortcuts[input.dataset.aid][input.dataset.slot] || '';
                input.style.background = '';
                input._recording = false;
            }
        });
    });
    refreshConflictWarning();
}

function readShortcutTableInto(target) {
    document.querySelectorAll('#shortcut-tbody .sc-key').forEach(input => {
        const aid = input.dataset.aid; const slot = input.dataset.slot;
        if (!target[aid]) target[aid] = { main: '', sub: '' };
        target[aid][slot] = input.value || '';
    });
}

function refreshConflictWarning() {
    // 現在の入力欄の値で競合検査
    const tmp = JSON.parse(JSON.stringify(settings.shortcuts));
    readShortcutTableInto(tmp);
    const map = {};
    for (const aid in tmp) {
        for (const slot of ['main', 'sub']) {
            const c = tmp[aid][slot];
            if (!c) continue;
            (map[c] = map[c] || []).push(aid);
        }
    }
    const conflicts = Object.entries(map).filter(([k, v]) => v.length > 1);
    const warn = document.getElementById('shortcut-conflicts');
    if (conflicts.length > 0) {
        warn.style.display = 'block';
        warn.innerText = '[警告] キーが重複しています:\n' + conflicts.map(([k, v]) => `  ${k} → ${v.map(a => ACTION_LABELS[a] || a).join(' / ')}`).join('\n');
    } else {
        warn.style.display = 'none';
    }
}

document.addEventListener('input', (e) => {
    if (e.target.classList && e.target.classList.contains('sc-key')) refreshConflictWarning();
});

function openShortcutSettings(highlightAid) {
    buildShortcutTable();
    document.getElementById('settings-shortcut-modal').style.display = 'flex';
    if (highlightAid) {
        // 該当行を見つけてハイライト + スクロール + メイン入力にフォーカス
        setTimeout(() => {
            const inputs = document.querySelectorAll(`#shortcut-tbody .sc-key[data-aid="${highlightAid}"][data-slot="main"]`);
            if (inputs.length > 0) {
                const row = inputs[0].closest('tr');
                if (row) {
                    row.style.background = 'rgba(66, 133, 244, 0.25)';
                    row.style.transition = 'background 0.4s';
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // フェードアウト（記憶のため少し残す）
                    setTimeout(() => { row.style.background = ''; }, 2500);
                    inputs[0].focus();
                }
            }
        }, 50);
    }
}
function closeShortcutSettings() {
    document.getElementById('settings-shortcut-modal').style.display = 'none';
}

document.getElementById('settings-shortcut-ok').addEventListener('click', () => {
    readShortcutTableInto(settings.shortcuts);
    saveSettings();
    closeShortcutSettings();
});
document.getElementById('settings-shortcut-apply').addEventListener('click', () => {
    readShortcutTableInto(settings.shortcuts);
    saveSettings();
    refreshConflictWarning();
    // 軽い視覚フィードバック
    const btn = document.getElementById('settings-shortcut-apply');
    const orig = btn.innerText;
    btn.innerText = '適用しました';
    setTimeout(() => { btn.innerText = orig; }, 1200);
});
document.getElementById('settings-shortcut-cancel').addEventListener('click', closeShortcutSettings);
document.getElementById('shortcut-reset').addEventListener('click', () => {
    if (!confirm('ショートカットをデフォルトに戻しますか？')) return;
    settings.shortcuts = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.shortcuts));
    buildShortcutTable();
});
document.getElementById('shortcut-export').addEventListener('click', () => {
    const fileContent = JSON.stringify(settings.shortcuts, null, 2);
    const blob = new Blob([fileContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'web_timesheet_editer_shortcuts.json'; a.click();
    URL.revokeObjectURL(url);
});
document.getElementById('shortcut-import').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const parsed = JSON.parse(evt.target.result);
                // バリデーション最低限: 各キーが {main, sub} 形式か
                for (const aid in parsed) {
                    if (typeof parsed[aid] !== 'object') throw new Error('形式不正');
                }
                settings.shortcuts = Object.assign({}, DEFAULT_SETTINGS.shortcuts, parsed);
                buildShortcutTable();
                alert('ショートカットを読み込みました（OKで反映）。');
            } catch (err) { alert('JSON解析エラー: ' + err.message); }
        };
        reader.readAsText(file);
    };
    input.click();
});
document.getElementById('settings-shortcut-modal').addEventListener('click', (e) => {
    if (e.target.id === 'settings-shortcut-modal') closeShortcutSettings();
});

// === ヘルプ: ショートカット一覧（参照専用） ===
// アクションをカテゴリ別に並べる（titleKey は i18n キー）
const HELP_SHORTCUT_GROUPS = [
    { title: 'ファイル', titleKey: 'file', ids: ['file.new', 'file.open', 'file.save', 'file.saveAs'] },
    { title: '編集', titleKey: 'edit', ids: ['edit.undo', 'edit.redo', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.delete', 'edit.repeat'] },
    { title: '挿入', titleKey: 'insert', ids: ['insert.frame', 'insert.frameDelete', 'insert.frameAll', 'insert.frameAllDelete'] },
    { title: '記号入力', titleKey: 'symbol', ids: ['symbol.tick1', 'symbol.tick2', 'symbol.null', 'symbol.keyframe', 'symbol.refframe'] },
    { title: '文字色', titleKey: 'color', ids: ['edit.color.0', 'edit.color.1', 'edit.color.2', 'edit.color.3', 'edit.color.4', 'edit.color.5'] },
    { title: 'ヘルプ', titleKey: 'help', ids: ['help.shortcuts'] }
];

function openHelpShortcuts() {
    buildHelpShortcutTable('');
    document.getElementById('help-shortcuts-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('help-shortcut-search').focus(), 50);
}
function closeHelpShortcuts() {
    document.getElementById('help-shortcuts-modal').style.display = 'none';
}
// ヘルプ→設定 連携用: 一覧で選択中のアクション
let helpSelectedActionId = null;

function buildHelpShortcutTable(filterText) {
    const tbody = document.getElementById('help-shortcut-tbody');
    tbody.innerHTML = '';
    const filt = filterText.toLowerCase().trim();
    HELP_SHORTCUT_GROUPS.forEach(group => {
        const matchedIds = group.ids.filter(aid => {
            const label = (typeof tAction === 'function' ? tAction(aid) : (ACTION_LABELS[aid] || aid)).toLowerCase();
            return !filt || label.includes(filt) || aid.toLowerCase().includes(filt);
        });
        if (matchedIds.length === 0) return;
        const groupTitle = (typeof t === 'function') ? t('group.' + group.titleKey) : group.title;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="3" style="padding:8px 4px 4px; font-weight:bold; color:var(--select-border); border-bottom:1px solid var(--border-color);">${groupTitle}</td>`;
        tbody.appendChild(tr);
        matchedIds.forEach(aid => {
            const sc = settings.shortcuts[aid] || { main: '', sub: '' };
            const row = document.createElement('tr');
            row.dataset.aid = aid;
            row.style.cssText = 'border-bottom:1px solid rgba(128,128,128,0.15); cursor:pointer;';
            if (aid === helpSelectedActionId) row.style.background = 'var(--select-bg)';
            const label = (typeof tAction === 'function') ? tAction(aid) : (ACTION_LABELS[aid] || aid);
            row.innerHTML = `
                <td style="padding:6px 4px;">${label}</td>
                <td style="padding:6px 4px; font-family:monospace; color:var(--grid-thick);">${sc.main || '<span style="color:var(--grid-medium);">―</span>'}</td>
                <td style="padding:6px 4px; font-family:monospace; color:var(--grid-thick);">${sc.sub || '<span style="color:var(--grid-medium);">―</span>'}</td>
            `;
            row.addEventListener('click', () => {
                helpSelectedActionId = aid;
                buildHelpShortcutTable(filt);
            });
            row.addEventListener('dblclick', () => {
                helpSelectedActionId = aid;
                closeHelpShortcuts();
                openShortcutSettings(aid);
            });
            tbody.appendChild(row);
        });
    });
}
document.getElementById('help-shortcut-search').addEventListener('input', (e) => {
    buildHelpShortcutTable(e.target.value);
});
document.getElementById('help-shortcut-close').addEventListener('click', closeHelpShortcuts);
document.getElementById('help-shortcut-open-config').addEventListener('click', () => {
    closeHelpShortcuts();
    openShortcutSettings(helpSelectedActionId);
});
document.getElementById('help-shortcuts-modal').addEventListener('click', (e) => {
    if (e.target.id === 'help-shortcuts-modal') closeHelpShortcuts();
});

// F1 でショートカット一覧を開く（matchShortcut に登録済み）

// === ヘルプ: 簡易マニュアル ===
const HELP_MANUAL_HTML_JA = `
<h4 style="margin:0 0 8px; color:var(--select-border);">基本操作</h4>
<ul>
  <li>セルをクリックして編集。<b>Tab</b>で次のフィールドへ移動、<b>Enter</b>でモーダル確定</li>
  <li><b>↑↓←→</b>でセル移動、<b>Shift+矢印</b>で範囲選択</li>
  <li><b>F2</b>=●（中割記号）、<b>F3</b>=○（逆シート記号）、<b>F4</b>=×（空セル）</li>
  <li><b>F5</b>=キーフレーム〇 トグル、<b>F6</b>=リファレンスフレーム▽ トグル</li>
  <li>右クリックでコンテキストメニュー（コマ挿入・リピート展開等）</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--select-border);">モード</h4>
<ul>
  <li><b>Edit</b>: タイムシート入力（現在のメイン画面）</li>
  <li><b>Preview</b>: テンプレート画像へのデータ流し込み・手書き（Phase J で実装予定）</li>
  <li><b>Template</b>: プレビュー用ベース画像と座標定義（Phase K で実装予定）</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--select-border);">ファイル形式</h4>
<ul>
  <li><b>TDTS</b> (.tdts): 東映デジタルタイムシート形式。ACTION/SOUND/CELL/CAMERA + BOOK + 文字色対応</li>
  <li><b>XDTS</b> (.xdts): 標準交換形式。CELL/SOUND/CAMERA のみ対応（ACTION/CELL は統合）</li>
  <li>インポート時はフィールド単位で取込項目を選択可能</li>
  <li>上書き保存 (<b>Ctrl+S</b>) はダイアログなしで保存、別名保存 (<b>Ctrl+Shift+S</b>) は毎回ダイアログ</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--select-border);">入力色（リテイク赤など）</h4>
<ul>
  <li>メニューバー右上のクイックパレットで入力色を選択</li>
  <li>選択後に新規入力したセルにその色が適用される</li>
  <li>既存セルへ後付けで色変更したい場合は範囲選択 → 編集 → 文字色を変更</li>
  <li>パレットの色そのものは 設定 → 色設定 で変更可能</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--select-border);">コマ挿入・削除</h4>
<ul>
  <li>選択範囲のフレーム数だけ <b>挿入</b> または <b>削除</b> される</li>
  <li><b>選択列</b>: その列のみシフト（ブロックは追従）</li>
  <li><b>全レイヤ</b>: 全列＋ブロック＋カット尺もシフト（カッティング作業用）</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--select-border);">自動保存</h4>
<ul>
  <li>編集後3秒アイドルで自動的に localStorage に保存</li>
  <li>ブラウザ閉じる時に未保存変更があれば警告</li>
  <li>次回起動時に「前回セッション復元」確認ダイアログ表示</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--select-border);">既知の制約</h4>
<ul>
  <li><b>Ctrl+R</b> や <b>Ctrl+Shift+R</b> はブラウザの予約キーで、JSで阻止できない場合があります</li>
  <li>XDTS はBOOK・文字色・カメラ詳細(ストロボ間隔・waypoints等)を保持できません</li>
  <li>Firefox等は File System Access API 非対応で、上書き保存もダイアログが出ます</li>
</ul>
`;

const HELP_MANUAL_HTML_EN = `
<h4 style="margin:0 0 8px; color:var(--select-border);">Basic Operation</h4>
<ul>
  <li>Click a cell to edit. <b>Tab</b> moves to next field, <b>Enter</b> confirms a modal</li>
  <li>Use <b>↑↓←→</b> to move, <b>Shift+arrows</b> to extend selection</li>
  <li><b>F2</b>=● (in-between mark), <b>F3</b>=○ (reverse-sheet mark), <b>F4</b>=× (null cell)</li>
  <li><b>F5</b>=Toggle keyframe ○, <b>F6</b>=Toggle reference frame ▽</li>
  <li>Right-click for context menu (insert frame, apply repeat, etc.)</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--select-border);">Modes</h4>
<ul>
  <li><b>Edit</b>: Timesheet input (current main view)</li>
  <li><b>Preview</b>: Imprint data on template image and draw freehand (planned in Phase J)</li>
  <li><b>Template</b>: Define base image and coords for preview (planned in Phase K)</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--select-border);">File Formats</h4>
<ul>
  <li><b>TDTS</b> (.tdts): Toei Digital Time Sheet. ACTION/SOUND/CELL/CAMERA + BOOK + font colors</li>
  <li><b>XDTS</b> (.xdts): Exchange standard. CELL/SOUND/CAMERA only (ACTION/CELL merged)</li>
  <li>You can pick which fields to import on the dialog</li>
  <li>Save (<b>Ctrl+S</b>) writes silently. Save As (<b>Ctrl+Shift+S</b>) always shows the dialog</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--select-border);">Input Color (e.g. retake red)</h4>
<ul>
  <li>Pick the input color from the quick palette in the top-right of the menu bar</li>
  <li>Newly typed cells will use that color</li>
  <li>To change colors of existing cells: select range → Edit → Change Text Color</li>
  <li>Palette colors themselves are configurable in Settings → Color Settings</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--select-border);">Insert / Delete Frames</h4>
<ul>
  <li>The selection length determines how many frames are inserted/deleted</li>
  <li><b>Selected cols</b>: Shifts only that column (blocks follow)</li>
  <li><b>All layers</b>: Shifts all columns + blocks + cut length (for cutting workflow)</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--select-border);">Auto-save</h4>
<ul>
  <li>Saves to localStorage 3 seconds after edits become idle</li>
  <li>Browser shows a warning if you close with unsaved changes</li>
  <li>Next launch offers a "Restore previous session" prompt</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--select-border);">Known Limitations</h4>
<ul>
  <li><b>Ctrl+R</b> and <b>Ctrl+Shift+R</b> are reserved by browsers and may not be intercepted</li>
  <li>XDTS cannot retain BOOK / font color / camera details (strobo intervals, waypoints, etc.)</li>
  <li>Firefox lacks File System Access API; Save will always show the dialog</li>
</ul>
`;

function openHelpManual() {
    const html = (currentLang === 'en') ? HELP_MANUAL_HTML_EN : HELP_MANUAL_HTML_JA;
    document.getElementById('help-manual-content').innerHTML = html;
    document.getElementById('help-manual-modal').style.display = 'flex';
}
document.getElementById('help-manual-close').addEventListener('click', () => {
    document.getElementById('help-manual-modal').style.display = 'none';
});
document.getElementById('help-manual-modal').addEventListener('click', (e) => {
    if (e.target.id === 'help-manual-modal') document.getElementById('help-manual-modal').style.display = 'none';
});

// === バージョン情報 ===
document.getElementById('help-about-close').addEventListener('click', () => {
    document.getElementById('help-about-modal').style.display = 'none';
});
document.getElementById('help-about-modal').addEventListener('click', (e) => {
    if (e.target.id === 'help-about-modal') document.getElementById('help-about-modal').style.display = 'none';
});
