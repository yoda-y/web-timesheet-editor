// === メニューバー / モード切替 / ドロップダウンメニュー ===

let currentMode = 'edit'; // 'edit' | 'preview'
let openMenuName = null;
let activeFontColorId = 0; // クイックパレットで選択中の入力色
const DRAWING_SIZE_KEYS = ['large', 'medium', 'small'];

function getDrawingSize(tool) {
    const key = tool === 'eraser' ? 'eraserSize' : 'penSize';
    const size = settings.preview?.[key] || 'medium';
    return DRAWING_SIZE_KEYS.includes(size) ? size : 'medium';
}

function setDrawingSize(tool, size) {
    if (currentMode === 'edit' || !DRAWING_SIZE_KEYS.includes(size)) return;
    if (!settings.preview) settings.preview = {};
    const key = tool === 'eraser' ? 'eraserSize' : 'penSize';
    settings.preview[key] = size;
    saveSettings();
    refreshDrawingSizeControls();
}

function refreshDrawingSizeControls() {
    const controls = document.getElementById('drawing-size-controls');
    const disabled = currentMode === 'edit';
    if (controls) controls.classList.toggle('is-disabled', disabled);
    document.querySelectorAll('.tool-size-btn').forEach(btn => {
        const tool = btn.dataset.drawingSizeTool;
        const size = btn.dataset.drawingSize;
        btn.classList.toggle('active', size === getDrawingSize(tool));
        btn.disabled = disabled;
    });
}

document.querySelectorAll('.tool-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        setDrawingSize(btn.dataset.drawingSizeTool, btn.dataset.drawingSize);
    });
});

document.querySelectorAll('[data-action^="view.theme."]').forEach(row => {
    row.classList.remove('menu-disabled');
});

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
        if (typeof createNewBlankDocumentTab === 'function') {
            createNewBlankDocumentTab();
            return;
        }
        if (isDirty && !confirm(typeof t === 'function' ? t('confirm.newDirty') : '未保存の変更があります。破棄して新規作成しますか？')) return;
        else if (!isDirty && !confirm(typeof t === 'function' ? t('confirm.newClean') : '現在のシートを破棄して新規作成しますか？')) return;
        // 状態を初期化
        cellData = {};
        booksData = { "ACTION": {}, "SOUND": {}, "CELL": {}, "CAMERA": {} };
        customRepeats = [];
        dialogueBlocks = [];
        cameraBlocks = [];
        metaData = { title:"", subTitle:"", scene:"", cut:"", sharedCuts: [], lengthSec:"6", lengthFrame:"00", creator:"", sheetName:"sheet1", page:"1/1", memo:"", customFields: {} };
        undoStack = []; redoStack = [];
        selectionStart = null; selectionEnd = null; selectedMeta = null;
        selectedDialogueId = null; selectedCameraId = null;
        if (typeof resetHandwritingData === 'function') resetHandwritingData();
        currentFileHandle = null;
        currentFileFormat = null;
        currentDirectoryHandle = null;
        if (typeof setCurrentFileName === 'function') setCurrentFileName('', null);
        // セクション初期化
        sections = [
            { type:"ACTION", x:25, cols:7, cw:32, chars:["A","B","C","D","E","F","G"] },
            { type:"SOUND",  x:0, cols:2, cw:68, chars:["S1","S2"] },
            { type:"CELL",   x:0, cols:7, cw:58, chars:["a","b","c","d","e","f","g"] },
            { type:"CAMERA", x:0, cols:3, cw:58, chars:["CAM1","CAM2","CAM3"] }
        ];
        if (typeof closeSharedCutSwitcher === 'function') closeSharedCutSwitcher();
        if (typeof initSheets === 'function') initSheets();
        updateSectionPositions();
        drawAll();
        if (typeof clearLastSession === 'function') clearLastSession();
        if (typeof markClean === 'function') markClean();
    },
    'file.open': () => document.getElementById('fileInput').click(),
    'file.openFolder': () => {
        if (typeof openTimesheetFromFolder === 'function') openTimesheetFromFolder();
    },
    'file.save': () => {
        // P2-2c: 現在のフォーマットに応じて保存先を分岐
        // - tdts/xdts: 従来通り互換書き出しで上書き
        // - wtproj-html: project HTML として上書き (silent or picker)
        // - wtproj-json: project HTML に昇格保存
        // - null (新規/handoff/不明): project HTML として保存ピッカー
        if (currentFileFormat === 'tdts') window.exportTDTS({ saveAs: false });
        else if (currentFileFormat === 'xdts') window.exportXDTS({ saveAs: false });
        else if (window.projectHtml && typeof window.projectHtml.exportHTML === 'function') {
            window.projectHtml.exportHTML({ saveAs: false });
        } else {
            // フォールバック (project-html.js 未読込)
            window.exportTDTS({ saveAs: false });
        }
    },
    'file.saveAs': async () => {
        // P2-2d: 形式選択モーダルで保存形式を選択 → 対応するエクスポータを呼ぶ
        if (typeof window.openSaveFormatChooser === 'function') {
            const chosen = await window.openSaveFormatChooser({ defaultFormat: currentFileFormat });
            if (!chosen) return;
            switch (chosen) {
                case 'tdts':        return window.exportTDTS({ saveAs: true });
                case 'xdts':        return window.exportXDTS({ saveAs: true });
                case 'wtproj-html':
                    if (window.projectHtml && typeof window.projectHtml.exportHTML === 'function') {
                        return window.projectHtml.exportHTML({ saveAs: true });
                    }
                    break;
                case 'wtproj-json':
                    if (window.projectHtml && typeof window.projectHtml.exportJSON === 'function') {
                        return window.projectHtml.exportJSON();
                    }
                    break;
            }
            return;
        }
        // フォールバック (chooser 未読込): 従来の分岐
        if (currentFileFormat === 'tdts') window.exportTDTS({ saveAs: true });
        else if (currentFileFormat === 'xdts') window.exportXDTS({ saveAs: true });
        else if (window.projectHtml && typeof window.projectHtml.exportHTML === 'function') {
            window.projectHtml.exportHTML({ saveAs: true });
        } else {
            window.exportTDTS({ saveAs: true });
        }
    },
    'file.import.tdts': () => document.getElementById('fileInput').click(),
    'file.import.xdts': () => document.getElementById('fileInput').click(),
    'file.import.projectJson': () => { if (window.projectHtml && typeof window.projectHtml.importJSON === 'function') window.projectHtml.importJSON(); },
    'file.export.tdts': () => window.exportTDTS({ saveAs: true }),
    'file.export.xdts': () => window.exportXDTS({ saveAs: true }),
    'file.export.projectJson': () => { if (window.projectHtml && typeof window.projectHtml.exportJSON === 'function') window.projectHtml.exportJSON(); },
    'file.export.projectHtml': () => { if (window.projectHtml && typeof window.projectHtml.exportHTML === 'function') window.projectHtml.exportHTML(); },
    'file.export.png': () => exportTemplateImage('png'),
    'file.export.jpg': () => exportTemplateImage('jpg'),
    'file.export.psd': () => exportTemplateImage('psd'),
    'file.handwriting.import': () => { if (typeof importHandwritingPngFiles === 'function') importHandwritingPngFiles(); },
    'file.handwriting.export': () => { if (typeof exportHandwritingPngPages === 'function') exportHandwritingPngPages(); },
    'file.settings.export': () => exportSettingsJSON(),
    'file.settings.import': () => importSettingsJSON(),

    // 編集
    'edit.undo': () => window.undo(),
    'edit.redo': () => window.redo(),
    'edit.cut': () => { if (typeof copy === 'function') { copy(); deleteSelect(); } },
    'edit.copy': () => { if (typeof copy === 'function') copy(); },
    'edit.paste': () => { if (typeof paste === 'function') paste(); },
    'edit.delete': () => { if (typeof deleteSelect === 'function') deleteSelect(); },
    'edit.assist.nextNumber': () => window.inputNextSequentialValue && window.inputNextSequentialValue(),
    'edit.repeat': () => window.applyRepeat && window.applyRepeat(),
    'edit.shake': () => window.applyShakeRepeat && window.applyShakeRepeat(),
    'edit.randomShake': () => window.applyRandomShakeRepeat && window.applyRandomShakeRepeat(),
    'edit.convertActionToCell': () => window.convertAllActionToCell && window.convertAllActionToCell(),
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
        } else { alert(typeof t === 'function' ? t('alert.selectActionOrCell') : "ACTION か CELL の列を選択してください。"); }
    },
    'insert.layerRight': () => {
        if (selectionStart && (selectionStart.colType === "ACTION" || selectionStart.colType === "CELL")) {
            window.addCellByRef(selectionStart.colType, selectionStart.colIndex, 'right');
        } else { alert(typeof t === 'function' ? t('alert.selectActionOrCell') : "ACTION か CELL の列を選択してください。"); }
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
    'view.togglePanel': () => window.toggleCellLayoutPanelVisible(),
    'view.theme.light': () => setThemeMode('light'),
    'view.theme.dark': () => setThemeMode('dark'),
    'view.theme.system': () => setThemeMode('system'),

    // 設定
    'settings.main': () => openSettingsHub(),
    'settings.draw': () => openDrawSettings(),
    'settings.font': () => openFontSettings(),
    'settings.toggleHeadMargin': () => {
        settings.draw.headMarginEnabled = !settings.draw.headMarginEnabled;
        saveSettings();
        updateSettingsMenuMarks();
        if (typeof resizeCanvases === 'function') resizeCanvases();
        if (typeof drawAll === 'function') drawAll();
    },
    'settings.toggleTailMargin': () => {
        settings.draw.tailMargin = (settings.draw.tailMargin || 0) > 0 ? 0 : 18;
        saveSettings();
        updateSettingsMenuMarks();
        if (typeof resizeCanvases === 'function') resizeCanvases();
        if (typeof drawAll === 'function') drawAll();
    },
    'settings.color': () => openColorSettings(),
    'settings.shortcut': () => openShortcutSettings(),
    'settings.editor': () => openEditorSettings(),
    'settings.externalTemplate': () => openExternalTemplateModal(),
    'settings.sidebar': () => openSidebarSettings(),
    'settings.naming': () => openNamingSettings(),
    'help.shortcuts': () => openHelpShortcuts(),
    'help.manual': () => openHelpManual(),
    'help.about': () => {
        const v = document.getElementById('about-version');
        if (v && typeof APP_VERSION_LABEL !== 'undefined') v.textContent = APP_VERSION_LABEL;
        document.getElementById('help-about-modal').style.display = 'flex';
    },
    'settings.reset': () => {
        if (!confirm(typeof t === 'function' ? t('confirm.resetAllSettings') : '全ての設定をデフォルトに戻しますか？')) return;
        resetSettings();
        drawAll();
        alert(typeof t === 'function' ? t('alert.settingsReset') : '設定をリセットしました。');
    },

    // 言語切替
    'help.lang.ja': () => setLang('ja'),
    'help.lang.en': () => setLang('en'),

    // タブレットモード
    'settings.tabletMode': () => toggleTabletMode(),
};

// マージントグルのチェックマーク表示更新
function updateSettingsMenuMarks() {
    const head = document.getElementById('menu-toggle-head-margin');
    const tail = document.getElementById('menu-toggle-tail-margin');
    if (head) head.textContent = (settings.draw.headMarginEnabled ? '✓ ' : '   ') + (typeof t === 'function' ? t('draw.headMarginQuick') : '先頭マージン');
    if (tail) tail.textContent = ((settings.draw.tailMargin || 0) > 0 ? '✓ ' : '   ') + (typeof t === 'function' ? t('draw.tailMarginQuick') : '末尾マージン');
}

window.runMenuAction = function(actionId) {
    if (actionId && menuActions[actionId]) {
        menuActions[actionId]();
        return true;
    }
    return false;
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

window.convertAllActionToCell = function() {
    if (typeof saveInput === 'function') saveInput();
    const actionSec = sections.find(s => s.type === "ACTION");
    const cellSec = sections.find(s => s.type === "CELL");
    if (!actionSec || !cellSec) {
        alert(typeof t === 'function' ? t('alert.actionCellNotFound') : "ACTION/CELL欄が見つかりません。");
        return;
    }

    const colCount = Math.min(actionSec.cols || 0, cellSec.cols || 0);
    if (colCount <= 0) {
        alert(typeof t === 'function' ? t('alert.noConvertColumns') : "変換対象の列がありません。");
        return;
    }

    const totalFrames = ((parseInt(metaData.lengthSec, 10) || 0) * 24 + (parseInt(metaData.lengthFrame, 10) || 0)) || numFrames || 144;
    const hasCellData = Object.keys(cellData).some(key => {
        const parts = key.split('-');
        return parts[0] === "CELL" && parseInt(parts[1], 10) < colCount;
    });
    if (hasCellData && !confirm(typeof t === 'function' ? t('confirm.convertActionToCell') : "CELL欄の既存入力を上書きして、ACTION欄から動画番号を作成します。よろしいですか？")) {
        return;
    }

    pushHistory();
    for (const key of Object.keys(cellData)) {
        const parts = key.split('-');
        if (parts[0] === "CELL" && parseInt(parts[1], 10) < colCount) delete cellData[key];
    }

    const inbetweenMarks = new Set(["●", "○"]);
    const skipValues = new Set(["", "―", "×", "rep", "REP"]);
    const isSkippableConversionValue = (data) => {
        if (!data || !data.value) return true;
        return skipValues.has(String(data.value).trim());
    };
    const getManualRepeatData = (ci, f) => {
        if (!Array.isArray(customRepeats)) return null;
        const rep = customRepeats.find(r => r.colType === "ACTION" && r.colIndex === ci && f >= r.startF && f <= r.endF);
        if (!rep || !Array.isArray(rep.pattern) || rep.pattern.length === 0) return null;
        return (typeof getRepeatPatternData === 'function') ? getRepeatPatternData(rep, f) : (rep.pattern[(f - rep.startF) % rep.pattern.length] || null);
    };
    const getAutoRepeatData = (ci, f, colData, repeats) => {
        const rep = repeats.find(r => !r.isHold && r.colIndex === ci && f >= r.startF + r.chunkLen && f < r.endF);
        if (!rep || !rep.chunkLen) return null;
        const sourceFrame = rep.startF + ((f - rep.startF) % rep.chunkLen);
        return colData[sourceFrame] || null;
    };
    for (let ci = 0; ci < colCount; ci++) {
        const originalToDouga = {};
        let nextNumber = 1;
        const colData = [];
        for (let f = 0; f < totalFrames; f++) colData[f] = cellData[`ACTION-${ci}-${f}`] || null;
        const autoRepeats = (typeof checkRepeatColumns === 'function') ? checkRepeatColumns(colData, totalFrames, ci).map(r => ({ ...r, colIndex: ci })) : [];
        for (let f = 0; f < totalFrames; f++) {
            const direct = cellData[`ACTION-${ci}-${f}`] || null;
            const manualRepeat = getManualRepeatData(ci, f);
            const autoRepeat = getAutoRepeatData(ci, f, colData, autoRepeats);
            const src = isSkippableConversionValue(direct) ? (manualRepeat || autoRepeat || direct) : direct;
            if (!src || !src.value) continue;
            const value = String(src.value).trim();
            if (skipValues.has(value)) continue;

            let outValue = null;
            if (/^\d+$/.test(value)) {
                const originalKey = `${value}|${src.option || ''}`;
                if (!originalToDouga[originalKey]) originalToDouga[originalKey] = String(nextNumber++);
                outValue = originalToDouga[originalKey];
            } else if (inbetweenMarks.has(value)) {
                outValue = String(nextNumber++);
            }

            if (!outValue) continue;
            cellData[`CELL-${ci}-${f}`] = {
                value: outValue,
                option: src.option || null,
                text: null,
                fontColorId: src.fontColorId || 0
            };
        }
    }

    selectionStart = null;
    selectionEnd = null;
    if (typeof cellInput !== 'undefined') cellInput.style.display = 'none';
    drawAll();
    if (currentMode === 'preview' && typeof updateTemplatePreview === 'function') updateTemplatePreview();
};

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
    if (name === 'settings' && typeof updateSettingsMenuMarks === 'function') updateSettingsMenuMarks();
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
    refreshDrawingSizeControls();
    // ページインジケーター更新
    if (typeof updatePageIndicator === 'function') updatePageIndicator();
    // タブレットモードのパネル表示切替
    if (typeof isTabletMode === 'function' && isTabletMode()) {
        const numpad = document.getElementById('numpad-panel');
        const undoRedo = document.getElementById('undo-redo-float');
        if (numpad) numpad.style.display = (mode === 'edit') ? 'block' : 'none';
        if (undoRedo) undoRedo.style.display = (mode === 'preview') ? 'flex' : 'none';
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
    document.getElementById('drawRepAutoEnabled').checked = settings.draw.repAutoEnabled !== false;
    document.getElementById('drawRepMinCycles').value = settings.draw.repMinCycles || 2;
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
    settings.draw.repAutoEnabled = document.getElementById('drawRepAutoEnabled').checked;
    let mc = parseInt(document.getElementById('drawRepMinCycles').value, 10);
    if (isNaN(mc) || mc < 2) mc = 2; if (mc > 10) mc = 10;
    settings.draw.repMinCycles = mc;
    saveSettings();
    closeDrawSettings();
    drawAll();
});
document.getElementById('settings-draw-cancel').addEventListener('click', closeDrawSettings);
document.getElementById('settings-draw-reset').addEventListener('click', () => {
    if (!confirm(typeof t === 'function' ? t('confirm.resetDrawSettings') : '描画設定をデフォルトに戻しますか？')) return;
    settings.draw = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.draw));
    saveSettings();
    openDrawSettings(); // 再描画
});
document.getElementById('settings-draw-modal').addEventListener('click', (e) => {
    if (e.target.id === 'settings-draw-modal') closeDrawSettings();
});

// === 文字設定モーダル ===
function openFontSettings() {
    const fs = settings.draw.fontSize || {};
    document.getElementById('drawFontCellScale').value = fs.cell != null ? fs.cell : 2.7;
    document.getElementById('drawFontDialogueScale').value = fs.dialogue != null ? fs.dialogue : 3.5;
    document.getElementById('drawFontCameraScale').value = fs.camera != null ? fs.camera : 2.7;
    document.getElementById('drawFontDirectionScale').value = fs.direction != null ? fs.direction : 3.5;
    document.getElementById('drawFontMetaScale').value = fs.metaValue != null ? fs.metaValue : 8.0;
    document.getElementById('settings-font-modal').style.display = 'flex';
}
function closeFontSettings() {
    document.getElementById('settings-font-modal').style.display = 'none';
}
document.getElementById('settings-font-ok').addEventListener('click', () => {
    const parseFS = (id, def) => {
        let v = parseFloat(document.getElementById(id).value);
        if (isNaN(v)) v = def;
        return Math.max(1.0, Math.min(10.0, v));
    };
    if (!settings.draw.fontSize) settings.draw.fontSize = {};
    settings.draw.fontSize.cell = parseFS('drawFontCellScale', 2.7);
    settings.draw.fontSize.dialogue = parseFS('drawFontDialogueScale', 3.5);
    settings.draw.fontSize.camera = parseFS('drawFontCameraScale', 2.7);
    settings.draw.fontSize.direction = parseFS('drawFontDirectionScale', 3.5);
    settings.draw.fontSize.metaValue = parseFS('drawFontMetaScale', 8.0);
    saveSettings();
    closeFontSettings();
    if (typeof drawAll === 'function') drawAll();
});
document.getElementById('settings-font-cancel').addEventListener('click', closeFontSettings);
document.getElementById('settings-font-reset').addEventListener('click', () => {
    if (!confirm(typeof t === 'function' ? t('confirm.resetFontSettings') : '文字設定をデフォルトに戻しますか？')) return;
    settings.draw.fontSize = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.draw.fontSize));
    saveSettings();
    openFontSettings();
});
document.getElementById('settings-font-modal').addEventListener('click', (e) => {
    if (e.target.id === 'settings-font-modal') closeFontSettings();
});

function openSettingsHub() {
    document.getElementById('settings-hub-modal').style.display = 'flex';
    const headToggle = document.getElementById('hubHeadMarginToggle');
    const tailToggle = document.getElementById('hubTailMarginToggle');
    if (headToggle) {
        headToggle.checked = !!settings.draw.headMarginEnabled;
        headToggle.onchange = () => {
            settings.draw.headMarginEnabled = headToggle.checked;
            saveSettings();
            if (typeof drawAll === 'function') drawAll();
            if (typeof resizeCanvases === 'function') resizeCanvases();
        };
    }
    if (tailToggle) {
        tailToggle.checked = (settings.draw.tailMargin || 0) > 0;
        tailToggle.onchange = () => {
            settings.draw.tailMargin = tailToggle.checked ? 18 : 0;
            saveSettings();
            if (typeof resizeCanvases === 'function') resizeCanvases();
            if (typeof drawAll === 'function') drawAll();
        };
    }
}
function closeSettingsHub() {
    document.getElementById('settings-hub-modal').style.display = 'none';
}
document.querySelectorAll('#settings-hub-modal [data-settings-open]').forEach(btn => {
    btn.addEventListener('click', () => {
        const actionId = btn.dataset.settingsOpen;
        closeSettingsHub();
        if (actionId && menuActions[actionId]) menuActions[actionId]();
    });
});
document.getElementById('settings-hub-close').addEventListener('click', closeSettingsHub);
document.getElementById('settings-hub-modal').addEventListener('click', (e) => {
    if (e.target.id === 'settings-hub-modal') closeSettingsHub();
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
// 色設定キー ↔ input id の対応 (順序が初期化順: 派生元 → 派生先)
const COLOR_SETTING_ORDER = [
    'uiAccent', 'editLightMain', 'templateBg', 'templateLine',
    'bookLine', 'cellIcon', 'selectBorder', 'handwritingSelect', 'handwritingTransform'
];
const COLOR_SETTING_IDS = {
    uiAccent: 'colorUiAccent',
    editLightMain: 'colorEditLightMain',
    templateBg: 'colorTemplateBg',
    templateLine: 'colorTemplateLine',
    bookLine: 'colorBookLine',
    cellIcon: 'colorCellIcon',
    selectBorder: 'colorSelectBorder',
    handwritingSelect: 'colorHandwritingSelect',
    handwritingTransform: 'colorHandwritingTransform'
};

// 「自動」時に表示する色を計算する。
// UIメインカラー (uiAccent) がモーダル内でカスタムなら、その値を基準に
// Edit描画色 / 標準テンプレ色 / 選択枠色を派生表示する。
// bookLine/cellIcon はライトモード時 Edit描画色 (picker現在値) から派生。
function computeColorAutoDisplay(target) {
    const themeAccent = (typeof isLightThemeActive === 'function' && isLightThemeActive()) ? '#1a73e8' : '#4285f4';
    if (target === 'uiAccent') return themeAccent;
    if (target === 'handwritingSelect') return DEFAULT_SETTINGS.colors.handwritingSelect;
    if (target === 'handwritingTransform') return DEFAULT_SETTINGS.colors.handwritingTransform;

    const accentEl = document.getElementById('colorUiAccent');
    const accentIsCustom = accentEl && accentEl.dataset.isAuto !== '1';
    const accentVal = accentEl ? accentEl.value : null;

    if (target === 'editLightMain') {
        if (accentIsCustom && typeof getAutoRelatedColor === 'function') {
            const d = getAutoRelatedColor('editLightMain', accentVal);
            if (d) return d;
        }
        return (typeof EDIT_LIGHT_MAIN_DEFAULT !== 'undefined') ? EDIT_LIGHT_MAIN_DEFAULT : '#2f5f3a';
    }
    if (target === 'templateLine' || target === 'templateBg' || target === 'selectBorder') {
        if (accentIsCustom && typeof getAutoRelatedColor === 'function') {
            const d = getAutoRelatedColor(target, accentVal);
            if (d) return d;
        }
        if (target === 'templateLine') return '#7cb342';
        if (target === 'templateBg') return '#ffffff';
        return themeAccent; // selectBorder のテーマ既定
    }
    // bookLine / cellIcon: Edit描画色 (picker現在値) から派生 (ライトモードのみ)
    const mainEl = document.getElementById('colorEditLightMain');
    const derived = (typeof getAutoRelatedColor === 'function')
        ? getAutoRelatedColor(target, mainEl ? mainEl.value : null) : null;
    if (derived) return derived;
    const varMap = { bookLine: '--book-line', cellIcon: '--cell-icon-color' };
    return getStyle(varMap[target]) || '#666666';
}

// 自動状態の項目の表示値を更新 (メインカラー変更時の再計算反映)
// 派生元 (uiAccent → editLightMain → その他) の順に計算
function refreshColorAutoDisplays() {
    COLOR_SETTING_ORDER.forEach(key => {
        if (key === 'uiAccent') return; // 派生元自体は更新しない
        const el = document.getElementById(COLOR_SETTING_IDS[key]);
        if (el && el.dataset.isAuto === '1') el.value = computeColorAutoDisplay(key);
    });
}

function openColorSettings() {
    buildFontColorPalette();
    // 派生元 → 派生先の順で初期化 (auto表示計算が前の picker を参照するため)
    COLOR_SETTING_ORDER.forEach(key => {
        const el = document.getElementById(COLOR_SETTING_IDS[key]);
        if (!el) return;
        const stored = settings.colors[key];
        el.dataset.isAuto = (stored === 'auto' || !stored) ? '1' : '0';
        el.value = (el.dataset.isAuto === '1') ? computeColorAutoDisplay(key) : stored;
    });
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
    // 単色項目: dataset.isAuto による三状態管理。
    // 触っていない項目は開いた時の状態 (custom色はcustomのまま) を維持する
    for (const key in COLOR_SETTING_IDS) {
        const el = document.getElementById(COLOR_SETTING_IDS[key]);
        if (!el) continue;
        settings.colors[key] = (el.dataset.isAuto === '1') ? 'auto' : el.value;
    }
    saveSettings();
    closeColorSettings();
    drawAll();
    if (typeof drawHandwritingUi === 'function') drawHandwritingUi();
    // 標準テンプレ色の反映 (Preview表示中なら再描画)
    if (typeof currentMode !== 'undefined' && currentMode === 'preview'
        && typeof updateTemplatePreview === 'function') updateTemplatePreview();
});
document.querySelectorAll('#settings-color-modal input[type=color]').forEach(el => {
    el.addEventListener('input', () => {
        el.dataset.isAuto = '0';
        // 派生元 (UIメインカラー / Edit描画色) の変更時は自動状態の関連色表示を再計算
        if (el.id === 'colorUiAccent' || el.id === 'colorEditLightMain') refreshColorAutoDisplays();
    });
});
document.querySelectorAll('.color-auto-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // 設定は書き換えず (確定はOK時)、自動状態 + 再計算した表示値にする
        const el = document.getElementById(COLOR_SETTING_IDS[btn.dataset.target]);
        if (el) {
            el.dataset.isAuto = '1';
            el.value = computeColorAutoDisplay(btn.dataset.target);
            // 派生元を自動に戻した場合も関連色の自動表示を再計算
            if (btn.dataset.target === 'uiAccent' || btn.dataset.target === 'editLightMain') refreshColorAutoDisplays();
        }
    });
});
document.getElementById('settings-color-cancel').addEventListener('click', closeColorSettings);
document.getElementById('settings-color-reset').addEventListener('click', () => {
    if (!confirm(typeof t === 'function' ? t('confirm.resetColorSettings') : '色設定をデフォルトに戻しますか？')) return;
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
    document.getElementById('editorHeadMarginEnabled').checked = !!settings.draw.headMarginEnabled;
    document.getElementById('editorHeadMargin').value = settings.draw.headMargin || 0;
    document.getElementById('editorTailMargin').value = settings.draw.tailMargin != null ? settings.draw.tailMargin : 18;
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
    settings.draw.headMarginEnabled = document.getElementById('editorHeadMarginEnabled').checked;
    let hm = parseInt(document.getElementById('editorHeadMargin').value, 10);
    if (isNaN(hm) || hm < 0) hm = 0; if (hm > 120) hm = 120;
    settings.draw.headMargin = hm;
    let tm = parseInt(document.getElementById('editorTailMargin').value, 10);
    if (isNaN(tm) || tm < 0) tm = 0; if (tm > 120) tm = 120;
    settings.draw.tailMargin = tm;
    saveSettings();
    if (typeof resizeCanvases === 'function') resizeCanvases();
    if (typeof drawAll === 'function') drawAll();
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

const SHORTCUT_SETTING_GROUPS = [
    { title: 'ファイル', titleKey: 'file', ids: ['file.new', 'file.open', 'file.save', 'file.saveAs'] },
    { title: '編集', titleKey: 'edit', ids: ['edit.undo', 'edit.redo', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.delete', 'edit.assist.nextNumber', 'edit.repeat'] },
    { title: '挿入', titleKey: 'insert', ids: ['insert.frame', 'insert.frameDelete', 'insert.frameAll', 'insert.frameAllDelete'] },
    { title: '記号入力', titleKey: 'symbol', ids: ['symbol.tick1', 'symbol.tick2', 'symbol.null', 'symbol.keyframe', 'symbol.refframe'] },
    { title: '文字色', titleKey: 'color', ids: ['edit.color.0', 'edit.color.1', 'edit.color.2', 'edit.color.3', 'edit.color.4', 'edit.color.5'] },
    { title: '表示', titleKey: 'view', ids: ['view.zoomIn', 'view.zoomOut', 'view.zoom100', 'view.fit'] },
    { title: '手書きツール', titleKey: 'previewTools', ids: ['preview.tool.pen', 'preview.tool.eraser', 'preview.tool.rect', 'preview.tool.lasso', 'preview.tool.transform', 'preview.tool.hand', 'preview.temporaryHand'] },
    { title: '手書き履歴', titleKey: 'previewHistory', ids: ['preview.undo', 'preview.redo'] },
    { title: '手書き選択/変形', titleKey: 'previewSelection', ids: ['preview.confirm', 'preview.cancel', 'preview.clearSelection', 'preview.deleteSelection'] },
    { title: 'ヘルプ', titleKey: 'help', ids: ['help.shortcuts'] }
];
let collapsedShortcutGroups = {};

function buildShortcutTable() {
    const tbody = document.getElementById('shortcut-tbody');
    tbody.innerHTML = '';
    const grouped = new Set();
    SHORTCUT_SETTING_GROUPS.forEach(group => {
        const ids = group.ids.filter(aid => settings.shortcuts[aid]);
        if (ids.length === 0) return;
        ids.forEach(aid => grouped.add(aid));
        appendShortcutGroup(tbody, group, ids);
    });
    const others = Object.keys(settings.shortcuts).filter(aid => !grouped.has(aid));
    if (others.length) appendShortcutGroup(tbody, { title: 'その他', titleKey: 'other' }, others);
    bindShortcutKeyInputs(tbody);
    refreshConflictWarning();
}

function appendShortcutGroup(tbody, group, ids) {
    const groupKey = group.titleKey || group.title;
    const collapsed = !!collapsedShortcutGroups[groupKey];
    const groupTitle = (typeof t === 'function') ? t('group.' + groupKey) : group.title;
    const header = document.createElement('tr');
    header.style.cssText = 'cursor:pointer; background:var(--highlight); border-bottom:1px solid var(--border-color);';
    header.innerHTML = `<td colspan="3" style="padding:8px 6px; font-weight:bold; color:var(--accent-color);">${collapsed ? '▶' : '▼'} ${groupTitle}</td>`;
    header.addEventListener('click', () => {
        collapsedShortcutGroups[groupKey] = !collapsedShortcutGroups[groupKey];
        buildShortcutTable();
    });
    tbody.appendChild(header);
    ids.forEach(aid => {
        if (collapsed) return;
        const row = document.createElement('tr');
        row.dataset.groupKey = groupKey;
        row.style.cssText = 'border-bottom:1px solid rgba(128,128,128,0.2);';
        const label = (typeof tAction === 'function') ? tAction(aid) : (ACTION_LABELS[aid] || aid);
        const sc = settings.shortcuts[aid];
        row.innerHTML = `
            <td style="padding:6px 4px;">${label}<br><span style="font-size:10px;color:var(--grid-medium);">${aid}</span></td>
            <td style="padding:4px 4px;"><input type="text" class="sc-key" data-aid="${aid}" data-slot="main" value="${sc.main || ''}" placeholder="${typeof t === 'function' ? t('shortcut.pressKey') : '押下で記録'}" readonly style="width:120px; padding:4px 6px; background:var(--highlight); color:var(--text-color); border:1px solid var(--grid-thick); border-radius:3px; font-size:11px; cursor:pointer; font-family:monospace;"></td>
            <td style="padding:4px 4px;"><input type="text" class="sc-key" data-aid="${aid}" data-slot="sub" value="${sc.sub || ''}" placeholder="${typeof t === 'function' ? t('shortcut.pressKey') : '押下で記録'}" readonly style="width:120px; padding:4px 6px; background:var(--highlight); color:var(--text-color); border:1px solid var(--grid-thick); border-radius:3px; font-size:11px; cursor:pointer; font-family:monospace;"></td>
        `;
        tbody.appendChild(row);
    });
}

function bindShortcutKeyInputs(tbody) {
    tbody.querySelectorAll('.sc-key').forEach(input => {
        input.addEventListener('click', () => {
            input.value = typeof t === 'function' ? t('shortcut.recording') : '...キー押下';
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
                const msg = typeof t === 'function'
                    ? t('confirm.reservedShortcut').replace('{combo}', combo)
                    : `「${combo}」 はブラウザの予約キーのため、一部環境で機能しない可能性があります。\nそれでも割り当てますか？`;
                if (!confirm(msg)) {
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
}

function readShortcutTableInto(target) {
    document.querySelectorAll('#shortcut-tbody .sc-key').forEach(input => {
        const aid = input.dataset.aid; const slot = input.dataset.slot;
        if (!target[aid]) target[aid] = { main: '', sub: '' };
        target[aid][slot] = input.value || '';
    });
}

function hasRealShortcutConflict(actionIds) {
    const previewCount = actionIds.filter(aid => aid.startsWith('preview.')).length;
    const nonPreviewCount = actionIds.length - previewCount;
    return previewCount > 1 || nonPreviewCount > 1;
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
    const conflicts = Object.entries(map).filter(([k, v]) => v.length > 1 && hasRealShortcutConflict(v));
    const warn = document.getElementById('shortcut-conflicts');
    if (conflicts.length > 0) {
        warn.style.display = 'block';
        warn.innerText = (typeof t === 'function' ? t('shortcut.conflictWarning') : '[警告] キーが重複しています:') + '\n' + conflicts.map(([k, v]) => `  ${k} → ${v.map(a => ACTION_LABELS[a] || a).join(' / ')}`).join('\n');
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
    btn.innerText = typeof t === 'function' ? t('btn.applied') : '適用しました';
    setTimeout(() => { btn.innerText = orig; }, 1200);
});
document.getElementById('settings-shortcut-cancel').addEventListener('click', closeShortcutSettings);
document.getElementById('shortcut-reset').addEventListener('click', () => {
    if (!confirm(typeof t === 'function' ? t('confirm.resetShortcuts') : 'ショートカットをデフォルトに戻しますか？')) return;
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
                alert(typeof t === 'function' ? t('alert.shortcutsImported') : 'ショートカットを読み込みました（OKで反映）。');
            } catch (err) { alert((typeof t === 'function' ? t('alert.jsonParseError') : 'JSON解析エラー: ') + err.message); }
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
    { title: '編集', titleKey: 'edit', ids: ['edit.undo', 'edit.redo', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.delete', 'edit.assist.nextNumber', 'edit.repeat'] },
    { title: '挿入', titleKey: 'insert', ids: ['insert.frame', 'insert.frameDelete', 'insert.frameAll', 'insert.frameAllDelete'] },
    { title: '記号入力', titleKey: 'symbol', ids: ['symbol.tick1', 'symbol.tick2', 'symbol.null', 'symbol.keyframe', 'symbol.refframe'] },
    { title: '文字色', titleKey: 'color', ids: ['edit.color.0', 'edit.color.1', 'edit.color.2', 'edit.color.3', 'edit.color.4', 'edit.color.5'] },
    { title: '手書きツール', titleKey: 'previewTools', ids: ['preview.tool.pen', 'preview.tool.eraser', 'preview.tool.rect', 'preview.tool.lasso', 'preview.tool.transform', 'preview.tool.hand', 'preview.temporaryHand'] },
    { title: '手書き履歴', titleKey: 'previewHistory', ids: ['preview.undo', 'preview.redo'] },
    { title: '手書き選択/変形', titleKey: 'previewSelection', ids: ['preview.confirm', 'preview.cancel', 'preview.clearSelection', 'preview.deleteSelection'] },
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
        tr.innerHTML = `<td colspan="3" style="padding:8px 4px 4px; font-weight:bold; color:var(--accent-color); border-bottom:1px solid var(--border-color);">${groupTitle}</td>`;
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
<h4 style="margin:0 0 8px; color:var(--accent-color);">基本操作</h4>
<ul>
  <li>セルをクリックして編集。<b>Tab</b>で次のフィールドへ移動、<b>Enter</b>でモーダル確定</li>
  <li><b>↑↓←→</b>でセル移動、<b>Shift+矢印</b>で範囲選択</li>
  <li><b>F2</b>=●（中割記号）、<b>F3</b>=○（逆シート記号）、<b>F4</b>=×（空セル）</li>
  <li><b>F5</b>=キーフレーム〇 トグル、<b>F6</b>=リファレンスフレーム▽ トグル</li>
  <li>右クリックでコンテキストメニュー（コマ挿入・リピート展開等）</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--accent-color);">モード</h4>
<ul>
  <li><b>Edit</b>: タイムシート入力（現在のメイン画面）</li>
  <li><b>Preview</b>: 用紙テンプレートへの流し込み、手書き、画像/PSD書き出し</li>
  <li><b>Template</b>: 外部テンプレートと座標定義（今後実装予定）</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--accent-color);">Previewモード</h4>
<ul>
  <li>右サイドバーから用紙テンプレート、描画ツール、読み込み、書き出し、表示倍率を操作できます</li>
  <li>手書きツールは <b>B</b>=ペン、<b>E</b>=消しゴム、<b>M</b>=矩形選択、<b>L</b>=投げ縄、<b>Ctrl+T</b>=変形、<b>H</b>=ハンド</li>
  <li>ペン入力中は <b>Shift</b> で直線、選択中は <b>Enter</b> で確定、<b>Ctrl+D</b> で選択解除、<b>Delete/Backspace</b> で削除</li>
  <li><b>Space</b> 押下中は一時ハンド、<b>Ctrl+Space+ドラッグ</b> でズームできます</li>
  <li>TDTS保存時、対応ブラウザではTDTSと同じ場所に手書きPNG/INIを自動保存します</li>
  <li>画像書き出しではページ、形式、DPI、ファイル名、保存場所をダイアログで調整できます。PSDはページごとのグループで出力します</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--accent-color);">ファイル形式</h4>
<ul>
  <li><b>TDTS</b> (.tdts): 東映デジタルタイムシート形式。ACTION/SOUND/CELL/CAMERA + BOOK + 文字色対応</li>
  <li><b>XDTS</b> (.xdts): 標準交換形式。CELL/SOUND/CAMERA のみ対応（ACTION/CELL は統合）</li>
  <li>インポート時はフィールド単位で取込項目を選択可能</li>
  <li>上書き保存 (<b>Ctrl+S</b>) はダイアログなしで保存、別名保存 (<b>Ctrl+Shift+S</b>) は毎回ダイアログ</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--accent-color);">入力色（リテイク赤など）</h4>
<ul>
  <li>メニューバー右上のクイックパレットで入力色を選択</li>
  <li>選択後に新規入力したセルにその色が適用される</li>
  <li>既存セルへ後付けで色変更したい場合は範囲選択 → 編集 → 文字色を変更</li>
  <li>パレットの色そのものは 設定 → 色設定 で変更可能</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--accent-color);">コマ挿入・削除</h4>
<ul>
  <li>選択範囲のフレーム数だけ <b>挿入</b> または <b>削除</b> される</li>
  <li><b>選択列</b>: その列のみシフト（ブロックは追従）</li>
  <li><b>全レイヤ</b>: 全列＋ブロック＋カット尺もシフト（カッティング作業用）</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--accent-color);">自動保存</h4>
<ul>
  <li>編集後3秒アイドルで自動的に localStorage に保存</li>
  <li>ブラウザ閉じる時に未保存変更があれば警告</li>
  <li>次回起動時に「前回セッション復元」確認ダイアログ表示</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--accent-color);">既知の制約</h4>
<ul>
  <li><b>Ctrl+R</b> や <b>Ctrl+Shift+R</b> はブラウザの予約キーで、JSで阻止できない場合があります</li>
  <li>XDTS はBOOK・文字色・カメラ詳細(ストロボ間隔・waypoints等)を保持できません</li>
  <li>FirefoxやiPad Safariなどは File System Access API 非対応/制限ありのため、上書き保存や手書き自動保存がダウンロード保存になる場合があります</li>
</ul>
`;

const HELP_MANUAL_HTML_EN = `
<h4 style="margin:0 0 8px; color:var(--accent-color);">Basic Operation</h4>
<ul>
  <li>Click a cell to edit. <b>Tab</b> moves to next field, <b>Enter</b> confirms a modal</li>
  <li>Use <b>↑↓←→</b> to move, <b>Shift+arrows</b> to extend selection</li>
  <li><b>F2</b>=● (in-between mark), <b>F3</b>=○ (reverse-sheet mark), <b>F4</b>=× (null cell)</li>
  <li><b>F5</b>=Toggle keyframe ○, <b>F6</b>=Toggle reference frame ▽</li>
  <li>Right-click for context menu (insert frame, apply repeat, etc.)</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--accent-color);">Modes</h4>
<ul>
  <li><b>Edit</b>: Timesheet input (current main view)</li>
  <li><b>Preview</b>: Imprint data on paper templates, draw freehand, and export images/PSD</li>
  <li><b>Template</b>: External templates and coordinate definition (planned)</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--accent-color);">Preview Mode</h4>
<ul>
  <li>Use the sidebar for paper templates, drawing tools, imports, exports, and zoom controls</li>
  <li>Tools: <b>B</b>=pen, <b>E</b>=eraser, <b>M</b>=rect select, <b>L</b>=lasso, <b>Ctrl+T</b>=transform, <b>H</b>=hand</li>
  <li>Hold <b>Shift</b> while drawing with the pen for a straight line. Selection: <b>Enter</b>=confirm, <b>Ctrl+D</b>=clear, <b>Delete/Backspace</b>=delete</li>
  <li>Hold <b>Space</b> for temporary hand, and <b>Ctrl+Space+drag</b> to zoom</li>
  <li>When saving TDTS, supported browsers also save handwriting PNG/INI next to the TDTS file</li>
  <li>Image export lets you choose pages, format, DPI, filename, and destination. PSD exports pages as groups</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--accent-color);">File Formats</h4>
<ul>
  <li><b>TDTS</b> (.tdts): Toei Digital Time Sheet. ACTION/SOUND/CELL/CAMERA + BOOK + font colors</li>
  <li><b>XDTS</b> (.xdts): Exchange standard. CELL/SOUND/CAMERA only (ACTION/CELL merged)</li>
  <li>You can pick which fields to import on the dialog</li>
  <li>Save (<b>Ctrl+S</b>) writes silently. Save As (<b>Ctrl+Shift+S</b>) always shows the dialog</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--accent-color);">Input Color (e.g. retake red)</h4>
<ul>
  <li>Pick the input color from the quick palette in the top-right of the menu bar</li>
  <li>Newly typed cells will use that color</li>
  <li>To change colors of existing cells: select range → Edit → Change Text Color</li>
  <li>Palette colors themselves are configurable in Settings → Color Settings</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--accent-color);">Insert / Delete Frames</h4>
<ul>
  <li>The selection length determines how many frames are inserted/deleted</li>
  <li><b>Selected cols</b>: Shifts only that column (blocks follow)</li>
  <li><b>All layers</b>: Shifts all columns + blocks + cut length (for cutting workflow)</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--accent-color);">Auto-save</h4>
<ul>
  <li>Saves to localStorage 3 seconds after edits become idle</li>
  <li>Browser shows a warning if you close with unsaved changes</li>
  <li>Next launch offers a "Restore previous session" prompt</li>
</ul>

<h4 style="margin:14px 0 8px; color:var(--accent-color);">Known Limitations</h4>
<ul>
  <li><b>Ctrl+R</b> and <b>Ctrl+Shift+R</b> are reserved by browsers and may not be intercepted</li>
  <li>XDTS cannot retain BOOK / font color / camera details (strobo intervals, waypoints, etc.)</li>
  <li>Firefox and iPad Safari lack or restrict File System Access API; overwrite save and handwriting auto-save may fall back to downloads</li>
</ul>
`;

function getHelpManualHtmlJA() {
    return `
<style>
  .manual-section { padding:10px 0 12px; border-bottom:1px solid var(--border-color); }
  .manual-section:first-child { padding-top:0; }
  .manual-section h4 { margin:0 0 8px; color:var(--accent-color); font-size:14px; }
  .manual-section ul { margin:0; padding-left:18px; line-height:1.7; }
  .manual-section li { margin:2px 0; }
</style>

<div class="manual-section">
  <h4>まず見るところ</h4>
  <ul>
    <li><b>Edit</b> はタイムシート入力、<b>Preview</b> は用紙プレビュー・手書き・書き出しです。</li>
    <li>メニューバー下のドキュメントタブで、複数のTDTS/XDTSを切り替えます。ドラッグで並び替え、中クリックまたは × で閉じます。</li>
    <li>画面右上には現在のファイル名、未保存状態、ページ送り、兼用CUT切替が表示されます。</li>
  </ul>
</div>

<div class="manual-section">
  <h4>Edit 基本操作</h4>
  <ul>
    <li>セルをクリックして編集します。<b>Tab</b> や <b>矢印キー</b> で移動、<b>Shift+矢印</b> で範囲選択できます。</li>
    <li>入力済みセルを開くと文字列が選択されるため、そのまま打ち直せます。</li>
    <li>範囲選択を長押ししてからドラッグすると、選択範囲を移動できます。移動先は空セルも含めて上書きします。</li>
    <li><b>F7</b> は同じ列の直前入力から次の番号を入れる連番入力です。キーはショートカット設定で変更できます。</li>
  </ul>
</div>

<div class="manual-section">
  <h4>記号・入力補助</h4>
  <ul>
    <li><b>F2</b>=○、<b>F3</b>=●、<b>F4</b>=×、<b>F5</b>=原画囲い、<b>F6</b>=参考囲いです。</li>
    <li>右クリック、または編集メニューから <b>Rep</b>、<b>ブレ</b>、<b>ランダムブレ</b> を適用できます。</li>
    <li>Repや囲いはPreviewにも反映されます。CELLのRepは次入力またはENDまでの範囲として扱います。</li>
    <li><b>すべての原画を動画に一括変換</b> はACTIONをCELLへ補助的に転記します。完璧な変換ではなく、作業補助用です。</li>
  </ul>
</div>

<div class="manual-section">
  <h4>兼用CUT / VERSION</h4>
  <ul>
    <li>兼用CUTはCUT欄またはPreview上部のCUTセレクトから切り替えます。</li>
    <li>CUTごとにVERSIONを持てます。SHEET/VERSION欄からシート名変更、追加、コピー、削除を行います。</li>
    <li>兼用CUTの追加・編集・削除はCUT切替UIの右クリックメニューから行います。削除時は確認が入ります。</li>
    <li>新規兼用CUTはヘッダー情報とBOOKを維持し、Directionとタイムラインは空で作成されます。</li>
  </ul>
</div>

<div class="manual-section">
  <h4>カメラ / セリフ</h4>
  <ul>
    <li>SOUND列をドラッグしてセリフブロック、CAMERA列をドラッグしてカメラ/撮影指示ブロックを作成します。</li>
    <li>カメラkindはカテゴリで絞り込みできます。開いた直後は「すべて」が選択されます。</li>
    <li>最近使ったkindは履歴に出ます。不要な履歴は右クリックで削除できます。</li>
    <li>CAMERA/SOUNDブロックの範囲とセル上の線は、保存・編集時に内部で正規化されます。</li>
  </ul>
</div>

<div class="manual-section">
  <h4>Preview / 手書き</h4>
  <ul>
    <li>サイドバーから用紙テンプレート、描画ツール、読み込み、書き出し、表示倍率を操作します。</li>
    <li><b>B</b>=ペン、<b>E</b>=消しゴム、<b>M</b>=矩形選択、<b>L</b>=投げ縄、<b>Ctrl+T</b>=変形、<b>H</b>=ハンドです。</li>
    <li>ペン入力中は <b>Shift</b> で直線、選択中は <b>Enter</b> で確定、<b>Ctrl+D</b> で選択解除、<b>Delete/Backspace</b> で削除します。</li>
    <li><b>Space</b> 押下中は一時ハンド、<b>Ctrl+Space+ドラッグ</b> でズームできます。</li>
    <li>手書きデータはTDTS/XDTSには含めず、PNG/INI互換保存を正とします。TDTS保存時、対応ブラウザでは同じ場所へ自動保存します。</li>
  </ul>
</div>

<div class="manual-section">
  <h4>保存 / 読み込み / 書き出し</h4>
  <ul>
    <li><b>Ctrl+S</b> は上書き保存です。保存済みファイルがある場合は元ファイル名のまま保存します。</li>
    <li><b>Ctrl+Shift+S</b> や新規保存では、命名規則設定のTDTS/XDTS保存名が候補になります。</li>
    <li>フォルダからTDTSを開くと、同名フォルダ内の手書きPNG/INIも自動読み込みできます。</li>
    <li>画像書き出しはページ、形式、DPI、ファイル名、保存場所をダイアログで調整できます。PSDはページごとのグループで出力します。</li>
    <li>画像書き出し名とTDTS/XDTS保存名は <b>設定 → 命名規則設定</b> から変更できます。</li>
  </ul>
</div>

<div class="manual-section">
  <h4>設定</h4>
  <ul>
    <li><b>エディタ</b>: 兼用CUTの共有項目などを設定します。</li>
    <li><b>描画</b>: 線発生ギャップ、頭/尻マージン、Rep表示などを設定します。</li>
    <li><b>色</b>: 入力色、選択色、手書き選択/変形ガイド色を設定します。</li>
    <li><b>ショートカット</b>: Photoshop寄せのキー割り当てを編集できます。グループごとに折りたためます。</li>
    <li><b>サイドバー</b>: Previewサイドバーの左右配置とセクション順を設定します。</li>
  </ul>
</div>

<div class="manual-section">
  <h4>既知の制限</h4>
  <ul>
    <li><b>Ctrl+R</b> や <b>Ctrl+Shift+R</b> はブラウザの予約キーで、JSで阻止できない場合があります。</li>
    <li>XDTSはBOOK、文字色、ACTION/CELLの完全な区別、カメラ詳細情報の一部を保持できません。</li>
    <li>FirefoxやiPad SafariなどはFile System Access API非対応/制限ありのため、上書き保存や手書き自動保存がダウンロード保存になる場合があります。</li>
  </ul>
</div>
`;
}

function getHelpManualHtmlEN() {
    return `
<style>
  .manual-section { padding:10px 0 12px; border-bottom:1px solid var(--border-color); }
  .manual-section:first-child { padding-top:0; }
  .manual-section h4 { margin:0 0 8px; color:var(--accent-color); font-size:14px; }
  .manual-section ul { margin:0; padding-left:18px; line-height:1.7; }
  .manual-section li { margin:2px 0; }
</style>

<div class="manual-section">
  <h4>Start Here</h4>
  <ul>
    <li><b>Edit</b> is for timesheet input. <b>Preview</b> is for paper preview, handwriting, and export.</li>
    <li>Use document tabs under the menu bar to switch between multiple TDTS/XDTS files. Drag to reorder, middle-click or × to close.</li>
    <li>The top-right area shows current filename, dirty state, page navigation, and shared-cut switching.</li>
  </ul>
</div>

<div class="manual-section">
  <h4>Edit Basics</h4>
  <ul>
    <li>Click a cell to edit. Use <b>Tab</b> or <b>arrow keys</b> to move, and <b>Shift+arrows</b> to extend selection.</li>
    <li>Opening an existing cell selects its text, so you can type over it immediately.</li>
    <li>Long-press a selected range, then drag to move it. The destination is overwritten, including blank cells.</li>
    <li><b>F7</b> inserts the next sequential number based on the previous input in the same column.</li>
  </ul>
</div>

<div class="manual-section">
  <h4>Marks And Assist</h4>
  <ul>
    <li><b>F2</b>=in-between mark, <b>F3</b>=reverse-sheet mark, <b>F4</b>=null cell, <b>F5</b>=keyframe circle, <b>F6</b>=reference circle.</li>
    <li>Use right-click or the Edit menu to apply <b>Rep</b>, <b>Shake</b>, or <b>Random Shake</b>.</li>
    <li>Rep and option circles are reflected in Preview. CELL Rep repeats to the next input or END.</li>
    <li><b>Convert all ACTION to CELL</b> is a helper feature, not a perfect conversion for every exception.</li>
  </ul>
</div>

<div class="manual-section">
  <h4>Shared Cuts / VERSION</h4>
  <ul>
    <li>Switch shared cuts from the CUT field or the Preview cut selector.</li>
    <li>Each cut can have its own VERSION sheets. Use the SHEET/VERSION field to rename, add, copy, or delete versions.</li>
    <li>Add, rename, or delete shared cuts from the shared-cut UI context menu. Delete asks for confirmation.</li>
    <li>New shared cuts keep header info and BOOK, while Direction and timeline data start empty.</li>
  </ul>
</div>

<div class="manual-section">
  <h4>Preview / Handwriting</h4>
  <ul>
    <li>Use the sidebar for paper template, drawing tools, imports, exports, and zoom controls.</li>
    <li><b>B</b>=pen, <b>E</b>=eraser, <b>M</b>=rect select, <b>L</b>=lasso, <b>Ctrl+T</b>=transform, <b>H</b>=hand.</li>
    <li>Hold <b>Shift</b> with the pen for straight lines. Selection: <b>Enter</b>=confirm, <b>Ctrl+D</b>=clear, <b>Delete/Backspace</b>=delete.</li>
    <li>Handwriting is stored outside TDTS/XDTS as compatible PNG/INI. Supported browsers auto-save it next to TDTS.</li>
  </ul>
</div>

<div class="manual-section">
  <h4>Save / Load / Export</h4>
  <ul>
    <li><b>Ctrl+S</b> overwrites the current file. If a source file exists, its original filename is kept.</li>
    <li><b>Ctrl+Shift+S</b> and new saves use the TDTS/XDTS filename rule as the suggested name.</li>
    <li>Opening TDTS from a folder can also load handwriting PNG/INI from the same-name folder.</li>
    <li>Image export lets you choose pages, format, DPI, filename, and destination. PSD exports pages as groups.</li>
    <li>Image-export and TDTS/XDTS filename rules are configured in <b>Settings → Naming Rules</b>.</li>
  </ul>
</div>

<div class="manual-section">
  <h4>Known Limitations</h4>
  <ul>
    <li><b>Ctrl+R</b> and <b>Ctrl+Shift+R</b> are reserved by browsers and may not be intercepted.</li>
    <li>XDTS cannot retain BOOK, font colors, perfect ACTION/CELL separation, or some camera details.</li>
    <li>Firefox and iPad Safari lack or restrict File System Access API; overwrite save and handwriting auto-save may fall back to downloads.</li>
  </ul>
</div>
`;
}

function openHelpManual() {
    const html = (currentLang === 'en') ? getHelpManualHtmlEN() : getHelpManualHtmlJA();
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

// === サイドバー設定モーダル ===
let draggedOrderItem = null;

function openSidebarSettings() {
    const modal = document.getElementById('settings-sidebar-modal');
    document.getElementById('sidebarPosition').value = settings.preview?.sidebarPosition || 'right';

    // セクション順序を復元
    const defaultOrder = ['template', 'tools', 'import', 'export', 'zoom'];
    const order = [...new Set([...(settings.preview?.sectionOrder || []), ...defaultOrder])];
    const list = document.getElementById('sidebar-section-order');
    const items = Array.from(list.querySelectorAll('.sidebar-order-item'));
    order.forEach(sec => {
        const item = items.find(i => i.dataset.section === sec);
        if (item) list.appendChild(item);
    });

    // ドラッグイベント設定
    initSidebarOrderDrag();
    modal.style.display = 'flex';
}

function closeSidebarSettings() {
    document.getElementById('settings-sidebar-modal').style.display = 'none';
}

function initSidebarOrderDrag() {
    const list = document.getElementById('sidebar-section-order');
    const items = list.querySelectorAll('.sidebar-order-item');

    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedOrderItem = item;
            item.classList.add('dragging');
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            draggedOrderItem = null;
        });
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!draggedOrderItem || draggedOrderItem === item) return;
            const rect = item.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
                list.insertBefore(draggedOrderItem, item);
            } else {
                list.insertBefore(draggedOrderItem, item.nextSibling);
            }
        });
    });
}

function applySidebarOrder() {
    const order = Array.from(document.querySelectorAll('#sidebar-section-order .sidebar-order-item'))
        .map(item => item.dataset.section);

    // サイドバー内のセクションを並び替え
    const sidebar = document.getElementById('preview-sidebar');
    if (!sidebar) return;

    const spacer = sidebar.querySelector('.sidebar-spacer');
    order.forEach(sec => {
        const section = sidebar.querySelector(`.sidebar-section[data-section="${sec}"]`);
        if (section && spacer) {
            sidebar.insertBefore(section, spacer);
        }
    });
}

document.getElementById('settings-sidebar-ok').addEventListener('click', () => {
    if (!settings.preview) settings.preview = {};
    settings.preview.sidebarPosition = document.getElementById('sidebarPosition').value;
    settings.preview.sectionOrder = Array.from(document.querySelectorAll('#sidebar-section-order .sidebar-order-item'))
        .map(item => item.dataset.section);

    saveSettings();
    applySidebarOrder();

    // サイドバー位置更新
    if (typeof showSidebar === 'function' && currentMode === 'preview') {
        showSidebar();
    }

    closeSidebarSettings();
});

document.getElementById('settings-sidebar-cancel').addEventListener('click', closeSidebarSettings);
document.getElementById('settings-sidebar-modal').addEventListener('click', (e) => {
    if (e.target.id === 'settings-sidebar-modal') closeSidebarSettings();
});

function openNamingSettings() {
    if (!settings.preview) settings.preview = {};
    document.getElementById('namingImageExportFilename').value = settings.preview.exportFilenameTemplate || '%title_%scene_%cut';
    document.getElementById('namingTimesheetSaveFilename').value = settings.preview.saveFilenameTemplate || '%title_%scene_%cut';
    document.getElementById('settings-naming-modal').style.display = 'flex';
}

function closeNamingSettings() {
    document.getElementById('settings-naming-modal').style.display = 'none';
}

document.getElementById('settings-naming-ok').addEventListener('click', () => {
    if (!settings.preview) settings.preview = {};
    settings.preview.exportFilenameTemplate = document.getElementById('namingImageExportFilename').value.trim() || '%title_%scene_%cut';
    settings.preview.saveFilenameTemplate = document.getElementById('namingTimesheetSaveFilename').value.trim() || '%title_%scene_%cut';
    saveSettings();
    closeNamingSettings();
});

document.getElementById('settings-naming-cancel').addEventListener('click', closeNamingSettings);
document.getElementById('settings-naming-modal').addEventListener('click', (e) => {
    if (e.target.id === 'settings-naming-modal') closeNamingSettings();
});

// 更新履歴（version.js に埋め込まれた APP_CHANGELOG を表示）
const changelogBtn = document.getElementById('about-changelog-btn');
if (changelogBtn) {
    changelogBtn.addEventListener('click', () => {
        const modal = document.getElementById('changelog-modal');
        const content = document.getElementById('changelog-content');
        if (modal && content) {
            content.textContent = (typeof APP_CHANGELOG !== 'undefined')
                ? APP_CHANGELOG
                : (typeof t === 'function' ? t('about.noChangelog') : 'CHANGELOG情報がありません。');
            modal.style.display = 'flex';
        }
    });
}
const changelogClose = document.getElementById('changelog-close');
if (changelogClose) {
    changelogClose.addEventListener('click', () => {
        document.getElementById('changelog-modal').style.display = 'none';
    });
}
