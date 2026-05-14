// === BBoxエディタ ===
//
// 外部テンプレートの BBox 設定をGUI編集。
// データは window.externalTemplate と連携。

let bboxEditorTemplate = null;     // 編集中テンプレートの作業コピー
let bboxEditorSelectedTag = null;  // 選択中タグ名

function openBBoxEditor(templateId) {
    return (async () => {
        const tpl = await window.externalTemplate.get(templateId);
        if (!tpl) { alert('テンプレートが見つかりません'); return; }
        bboxEditorTemplate = JSON.parse(JSON.stringify(tpl));
        if (!bboxEditorTemplate.bboxes) bboxEditorTemplate.bboxes = {};
        // 初回（bboxes が空）の場合、基本タグをデフォルトON
        if (Object.keys(bboxEditorTemplate.bboxes).length === 0) {
            const defaults = ['title', 'episode', 'scene', 'cut', 'sheet', 'name', 'direction',
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
        bboxEditorSelectedTag = null;
        document.getElementById('bbox-editor-template-name').textContent = tpl.name || '無名';
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
    const catLabels = { meta: 'メタ情報', staff: '担当者', timeline: 'タイムライン', custom: 'カスタム', extra: '拡張', other: 'その他' };
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
    document.getElementById(id).addEventListener('input', (e) => {
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
        info.textContent = `画像: ${bboxEditorTemplate.imageWidth} × ${bboxEditorTemplate.imageHeight} px`;
        if (noImg) noImg.style.display = 'none';
    } else {
        info.textContent = '画像なし';
        if (noImg) noImg.style.display = 'block';
    }
}

// 編集中データへのアクセス (canvas モジュール向け公開)
window.bboxEditorGetTemplate = () => bboxEditorTemplate;
window.bboxEditorGetSelectedTag = () => bboxEditorSelectedTag;
window.bboxEditorSetSelectedTag = (tag) => selectBBoxTag(tag);
window.bboxEditorRenderTagList = () => renderBBoxEditorTagList();

// イベント配線
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

    // 保存
    document.getElementById('bbox-editor-save-btn').addEventListener('click', async () => {
        if (!bboxEditorTemplate) return;
        try {
            bboxEditorTemplate.updatedAt = Date.now();
            // ディープコピーを保存（参照経由の改変を避ける）
            const toSave = JSON.parse(JSON.stringify(bboxEditorTemplate));
            await window.externalTemplate.save(toSave);
            console.log('[BBox] 保存成功:', toSave.id, Object.keys(toSave.bboxes).length, 'tags');
            if (typeof showToast === 'function') showToast('BBox設定を保存しました', 2000);
            if (typeof window.refreshTemplateSelectExternalOptions === 'function') await window.refreshTemplateSelectExternalOptions();
            closeBBoxEditor();
        } catch (err) {
            console.error('BBox保存エラー:', err);
            alert('保存に失敗しました: ' + (err.message || err));
        }
    });

    document.getElementById('bbox-editor-cancel-btn').addEventListener('click', closeBBoxEditor);
});
