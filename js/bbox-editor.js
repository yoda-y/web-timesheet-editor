// === BBoxエディタ ===
//
// 外部テンプレートの BBox 設定をGUI編集。
// データは window.externalTemplate と連携。

let bboxEditorTemplate = null;     // 編集中テンプレートの作業コピー
let bboxEditorSelectedTag = null;  // 選択中タグ名

// ── Undo履歴 ──
let bboxEditorHistory = [];
const BBOX_HISTORY_MAX = 50;

function pushBBoxHistory() {
    if (!bboxEditorTemplate) return;
    bboxEditorHistory.push(JSON.stringify(bboxEditorTemplate.bboxes));
    if (bboxEditorHistory.length > BBOX_HISTORY_MAX) bboxEditorHistory.shift();
}
function undoBBox() {
    if (!bboxEditorTemplate || bboxEditorHistory.length === 0) return;
    const prev = bboxEditorHistory.pop();
    bboxEditorTemplate.bboxes = JSON.parse(prev);
    renderBBoxEditorTagList();
    renderBBoxEditorPropsForm();
    if (typeof window.bboxEditorRenderCanvas === 'function') window.bboxEditorRenderCanvas();
}
window.bboxEditorPushHistory = pushBBoxHistory;
window.bboxEditorUndo = undoBBox;

const _bi18n = (key, fallback) => (typeof t === 'function' ? t(key) : null) || fallback;

function openBBoxEditor(templateId) {
    return (async () => {
        const tpl = await window.externalTemplate.get(templateId);
        if (!tpl) { alert(_bi18n('bbox.alert.notFound', 'テンプレートが見つかりません')); return; }
        bboxEditorTemplate = JSON.parse(JSON.stringify(tpl));
        if (!bboxEditorTemplate.bboxes) bboxEditorTemplate.bboxes = {};
        // 廃止タグのクリーンアップ（sheet → currentPage/totalPages へ分割済み）
        if (bboxEditorTemplate.bboxes.sheet) {
            delete bboxEditorTemplate.bboxes.sheet;
        }
        // 初回（bboxes が空）の場合、基本タグをデフォルトON
        if (Object.keys(bboxEditorTemplate.bboxes).length === 0) {
            const defaults = ['title', 'episode', 'scene', 'cut', 'currentPage', 'totalPages', 'name', 'direction',
                              'lengthSec', 'lengthFrame',
                              'action1', 'action2', 'sound1', 'sound2', 'cell1', 'cell2', 'camera1', 'camera2'];
            defaults.forEach(tag => {
                if (window.externalTemplate.tags[tag]) {
                    const b = window.externalTemplate.defaultBBox(tag);
                    b.enabled = true;
                    bboxEditorTemplate.bboxes[tag] = b;
                }
            });
        }
        bboxEditorHistory = [];
        bboxEditorSelectedTag = null;
        document.getElementById('bbox-editor-template-name').textContent = tpl.name || _bi18n('bbox.template.untitled', '無名');
        renderBBoxEditorTagList();
        renderBBoxEditorPropsForm();
        updateBBoxEditorImageInfo();
        document.getElementById('bbox-editor-modal').style.display = 'flex';
        // モーダル表示後にレイアウト確定→再描画（複数回呼ぶことで画像読込完了後にも反映）
        requestAnimationFrame(() => {
            if (typeof window.bboxEditorRenderCanvas === 'function') window.bboxEditorRenderCanvas();
        });
    })();
}
window.openBBoxEditor = openBBoxEditor;

function closeBBoxEditor() {
    document.getElementById('bbox-editor-modal').style.display = 'none';
    bboxEditorTemplate = null;
    bboxEditorSelectedTag = null;
}

function renderBBoxEditorTagList() {
    const listEl = document.getElementById('bbox-editor-tag-list');
    const tags = window.externalTemplate.tags;
    // カテゴリ別にグループ化
    const cats = {};
    for (const key in tags) {
        const t = tags[key];
        const cat = t.category || 'other';
        if (!cats[cat]) cats[cat] = [];
        cats[cat].push({ key, ...t });
    }
    const catLabels = {
        meta:     _bi18n('bbox.cat.meta',     'メタ情報'),
        staff:    _bi18n('bbox.cat.staff',    '担当者'),
        timeline: _bi18n('bbox.cat.timeline', 'タイムライン'),
        custom:   _bi18n('bbox.cat.custom',   'カスタム'),
        extra:    _bi18n('bbox.cat.extra',    '拡張'),
        other:    _bi18n('bbox.cat.other',    'その他'),
    };
    let html = '';
    Object.keys(catLabels).forEach(cat => {
        if (!cats[cat]) return;
        html += `<div class="bbox-editor-tag-category">`;
        html += `<div class="bbox-editor-tag-category-label">${catLabels[cat]}</div>`;
        cats[cat].forEach(t => {
            const bbox = bboxEditorTemplate.bboxes[t.key];
            const enabled = !!(bbox && bbox.enabled);
            const isSelected = (bboxEditorSelectedTag === t.key);
            html += `<div class="bbox-editor-tag-item ${isSelected ? 'selected' : ''}" data-tag="${t.key}">
                <input type="checkbox" data-tag-toggle="${t.key}" ${enabled ? 'checked' : ''}>
                <span>${t.label}</span>
                <span class="tag-key">${t.key}</span>
            </div>`;
        });
        html += `</div>`;
    });
    listEl.innerHTML = html;
    // チェックボックス: ON/OFF
    listEl.querySelectorAll('input[data-tag-toggle]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const tagKey = cb.dataset.tagToggle;
            e.stopPropagation();
            pushBBoxHistory();
            toggleBBoxEnabled(tagKey, cb.checked);
        });
    });
    // クリックで選択
    listEl.querySelectorAll('.bbox-editor-tag-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.tagName === 'INPUT') return;
            selectBBoxTag(el.dataset.tag);
        });
    });
}

function toggleBBoxEnabled(tagKey, enabled) {
    if (!bboxEditorTemplate.bboxes[tagKey]) {
        bboxEditorTemplate.bboxes[tagKey] = window.externalTemplate.defaultBBox(tagKey);
    }
    bboxEditorTemplate.bboxes[tagKey].enabled = enabled;
    if (enabled) selectBBoxTag(tagKey);
    else if (bboxEditorSelectedTag === tagKey) {
        bboxEditorSelectedTag = null;
        renderBBoxEditorPropsForm();
    }
    if (typeof window.bboxEditorRenderCanvas === 'function') window.bboxEditorRenderCanvas();
}

function selectBBoxTag(tagKey) {
    // null/未定義 or 対象BBoxが存在しない場合は選択解除
    if (!tagKey || !bboxEditorTemplate || !bboxEditorTemplate.bboxes[tagKey]) {
        clearBBoxSelection();
        return;
    }
    bboxEditorSelectedTag = tagKey;
    document.querySelectorAll('.bbox-editor-tag-item').forEach(el => {
        el.classList.toggle('selected', el.dataset.tag === tagKey);
    });
    renderBBoxEditorPropsForm();
    if (typeof window.bboxEditorRenderCanvas === 'function') window.bboxEditorRenderCanvas();
}
window.selectBBoxTag = selectBBoxTag;

function clearBBoxSelection() {
    bboxEditorSelectedTag = null;
    document.querySelectorAll('.bbox-editor-tag-item').forEach(el => el.classList.remove('selected'));
    renderBBoxEditorPropsForm();
    if (typeof window.bboxEditorRenderCanvas === 'function') window.bboxEditorRenderCanvas();
}
window.clearBBoxSelection = clearBBoxSelection;

function renderBBoxEditorPropsForm() {
    const empty = document.getElementById('bbox-editor-props-empty');
    const form = document.getElementById('bbox-editor-props-form');
    if (!bboxEditorSelectedTag || !bboxEditorTemplate.bboxes[bboxEditorSelectedTag]) {
        empty.style.display = 'block';
        form.style.display = 'none';
        return;
    }
    const bbox = bboxEditorTemplate.bboxes[bboxEditorSelectedTag];
    const tagDef = window.externalTemplate.tags[bboxEditorSelectedTag] || {};
    empty.style.display = 'none';
    form.style.display = 'block';
    document.getElementById('bbox-prop-tag-label').textContent = `${tagDef.label || '?'} (${bboxEditorSelectedTag})`;
    document.getElementById('bbox-prop-x').value = bbox.x.toFixed(3);
    document.getElementById('bbox-prop-y').value = bbox.y.toFixed(3);
    document.getElementById('bbox-prop-w').value = bbox.w.toFixed(3);
    document.getElementById('bbox-prop-h').value = bbox.h.toFixed(3);
    const fontSizeInput = document.getElementById('bbox-prop-fontsize');
    if (fontSizeInput) {
        fontSizeInput.value = (typeof bbox.fontSize === 'number' && bbox.fontSize > 0) ? bbox.fontSize : '';
    }
    // 接頭辞
    const prefRow = document.getElementById('bbox-prop-prefix-row');
    if (tagDef.prefixable) {
        prefRow.style.display = '';
        document.getElementById('bbox-prop-prefix').value = bbox.prefix || '';
    } else prefRow.style.display = 'none';
    // ラベル/タイプ
    const lblRow = document.getElementById('bbox-prop-label-row');
    const typeRow = document.getElementById('bbox-prop-type-row');
    if (tagDef.customizable) {
        lblRow.style.display = '';
        typeRow.style.display = '';
        document.getElementById('bbox-prop-label').value = bbox.label || '';
        document.getElementById('bbox-prop-type').value = bbox.type || 'text';
    } else { lblRow.style.display = 'none'; typeRow.style.display = 'none'; }
    // タイムライン
    const framesRow = document.getElementById('bbox-prop-frames-row');
    const colsRow = document.getElementById('bbox-prop-columns-row');
    if (tagDef.timeline) {
        framesRow.style.display = '';
        colsRow.style.display = '';
        document.getElementById('bbox-prop-frames').value = bbox.frames || 72;
        document.getElementById('bbox-prop-columns').value = bbox.columns || 5;
    } else { framesRow.style.display = 'none'; colsRow.style.display = 'none'; }
    // ロック
    document.getElementById('bbox-prop-locked').checked = !!bbox.locked;
}
window.renderBBoxEditorPropsForm = renderBBoxEditorPropsForm;

// タイムラインペア定義
const TIMELINE_PAIRS = {
    'action1': 'action2', 'action2': 'action1',
    'sound1':  'sound2',  'sound2':  'sound1',
    'cell1':   'cell2',   'cell2':   'cell1',
    'camera1': 'camera2', 'camera2': 'camera1'
};

// プロパティ変更時の反映
function bindBBoxPropInput(id, key, parser) {
    const el = document.getElementById(id);
    el.addEventListener('focus', () => pushBBoxHistory());
    el.addEventListener('input', (e) => {
        if (!bboxEditorSelectedTag) return;
        const bbox = bboxEditorTemplate.bboxes[bboxEditorSelectedTag];
        let v = parser ? parser(e.target.value) : e.target.value;
        if (typeof v === 'number' && isNaN(v)) return;
        bbox[key] = v;
        // frames/columns はペアタグにも同値を反映
        if ((key === 'frames' || key === 'columns') && TIMELINE_PAIRS[bboxEditorSelectedTag]) {
            const pair = TIMELINE_PAIRS[bboxEditorSelectedTag];
            if (bboxEditorTemplate.bboxes[pair]) {
                bboxEditorTemplate.bboxes[pair][key] = v;
            }
        }
        if (typeof window.bboxEditorRenderCanvas === 'function') window.bboxEditorRenderCanvas();
    });
}

function updateBBoxEditorImageInfo() {
    const info = document.getElementById('bbox-editor-image-info');
    const noImg = document.getElementById('bbox-editor-no-image');
    if (bboxEditorTemplate.image) {
        const tpl = _bi18n('bbox.alert.imageInfo', '画像: {w} × {h} px');
        info.textContent = tpl.replace('{w}', bboxEditorTemplate.imageWidth).replace('{h}', bboxEditorTemplate.imageHeight);
        if (noImg) noImg.style.display = 'none';
    } else {
        info.textContent = _bi18n('bbox.alert.noImageInfo', '画像なし');
        if (noImg) noImg.style.display = 'block';
    }
}

// 編集中データへのアクセス (canvas モジュール向け公開)
window.bboxEditorGetTemplate = () => bboxEditorTemplate;
window.bboxEditorGetSelectedTag = () => bboxEditorSelectedTag;
window.bboxEditorSetSelectedTag = (tag) => selectBBoxTag(tag);
window.bboxEditorRenderTagList = () => renderBBoxEditorTagList();

// Ctrl+Z: BBoxエディタが開いている時のUndo（window-captureで最上流に登録）
// handwriting.js などの document-capture より先に処理させるため window レベル
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        const modal = document.getElementById('bbox-editor-modal');
        if (!modal) return;
        const display = modal.style.display;
        if (display === 'none' || display === '') return;
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
        const target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
            target.blur();
        }
        undoBBox();
    }
}, true);

// その他のイベント配線
document.addEventListener('DOMContentLoaded', () => {
    // プロパティ入力
    bindBBoxPropInput('bbox-prop-x', 'x', parseFloat);
    bindBBoxPropInput('bbox-prop-y', 'y', parseFloat);
    bindBBoxPropInput('bbox-prop-w', 'w', parseFloat);
    bindBBoxPropInput('bbox-prop-h', 'h', parseFloat);
    bindBBoxPropInput('bbox-prop-prefix', 'prefix');
    bindBBoxPropInput('bbox-prop-label', 'label');
    bindBBoxPropInput('bbox-prop-type', 'type');
    bindBBoxPropInput('bbox-prop-frames', 'frames', v => parseInt(v, 10));
    bindBBoxPropInput('bbox-prop-columns', 'columns', v => parseInt(v, 10));

    // fontSize は特殊扱い: 空文字なら undefined にする
    document.getElementById('bbox-prop-fontsize').addEventListener('focus', () => {
        if (typeof pushBBoxHistory === 'function') pushBBoxHistory();
    });
    document.getElementById('bbox-prop-fontsize').addEventListener('input', (e) => {
        if (!bboxEditorSelectedTag) return;
        const bbox = bboxEditorTemplate.bboxes[bboxEditorSelectedTag];
        if (!bbox) return;
        const raw = e.target.value.trim();
        if (raw === '') {
            delete bbox.fontSize;
        } else {
            let v = parseFloat(raw);
            if (isNaN(v)) return;
            if (v < 1.0) v = 1.0;
            if (v > 20.0) v = 20.0;
            bbox.fontSize = v;
        }
        if (typeof window.bboxEditorRenderCanvas === 'function') window.bboxEditorRenderCanvas();
    });

    // 保存
    document.getElementById('bbox-editor-save-btn').addEventListener('click', async () => {
        if (!bboxEditorTemplate) return;
        try {
            bboxEditorTemplate.updatedAt = Date.now();
            // ディープコピーを保存（参照経由の改変を避ける）
            const toSave = JSON.parse(JSON.stringify(bboxEditorTemplate));
            await window.externalTemplate.save(toSave);
            console.log('[BBox] 保存成功:', toSave.id, Object.keys(toSave.bboxes).length, 'tags');
            if (typeof showToast === 'function') showToast(_bi18n('bbox.alert.savedToast', 'BBox設定を保存しました'), 2000);
            if (typeof window.refreshTemplateSelectExternalOptions === 'function') await window.refreshTemplateSelectExternalOptions();
            // 親モーダルが開いていれば draft を再読込
            const extModal = document.getElementById('external-template-modal');
            if (extModal && extModal.style.display !== 'none' && typeof window.refreshExternalTemplateDraftAfterSave === 'function') {
                await window.refreshExternalTemplateDraftAfterSave(bboxEditorTemplate.id);
            }
            closeBBoxEditor();
        } catch (err) {
            console.error('BBox保存エラー:', err);
            alert(_bi18n('bbox.alert.saveFailed', '保存に失敗しました: ') + (err.message || err));
        }
    });

    document.getElementById('bbox-editor-cancel-btn').addEventListener('click', closeBBoxEditor);

    // ロックチェックボックス
    document.getElementById('bbox-prop-locked').addEventListener('change', (e) => {
        if (!bboxEditorSelectedTag || !bboxEditorTemplate) return;
        pushBBoxHistory();
        bboxEditorTemplate.bboxes[bboxEditorSelectedTag].locked = e.target.checked;
        if (typeof window.bboxEditorRenderCanvas === 'function') window.bboxEditorRenderCanvas();
    });

});
