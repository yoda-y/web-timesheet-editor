// external-template-ui.js
// 外部テンプレート管理モーダルのUI配線

let extTplCurrentId = null;
let extTplDraft = null;
// 未保存変更フラグ (名前変更/画像変更で true、保存・選択切替・閉じるで false)
let extTplDirty = false;

const _ei18n = (key, fallback) => (typeof t === 'function' ? t(key) : null) || fallback;

function setExtTplDirty(d) {
    extTplDirty = !!d;
    const badge = document.getElementById('ext-tpl-dirty-badge');
    if (badge) badge.style.display = extTplDirty ? 'inline-block' : 'none';
}

// 未保存変更がある場合に破棄確認。true = 続行してよい
function confirmExtTplDiscardIfDirty() {
    if (!extTplDirty) return true;
    return confirm(_ei18n('extTpl.confirmDiscard',
        '保存していない変更があります。閉じると変更は破棄されます。閉じますか？'));
}

// ── モーダル開閉 ──────────────────────────────────────────
async function openExternalTemplateModal() {
    document.getElementById('external-template-modal').style.display = 'flex';
    setExtTplDirty(false);
    await refreshExternalTemplateList();
    showExternalTemplateDetail(null);
}
function closeExternalTemplateModal(force) {
    if (!force && !confirmExtTplDiscardIfDirty()) return;
    document.getElementById('external-template-modal').style.display = 'none';
    extTplCurrentId = null;
    extTplDraft = null;
    setExtTplDirty(false);
}
window.openExternalTemplateModal = openExternalTemplateModal;

// ── 一覧描画 ──────────────────────────────────────────────
async function refreshExternalTemplateList() {
    const listEl = document.getElementById('ext-tpl-list');
    const items = await window.externalTemplate.list();
    const i18n = (key, fallback) => (typeof t === 'function' ? t(key) : null) || fallback;
    if (!items.length) {
        const emptyText = i18n('extTpl.empty', 'テンプレートがまだありません');
        listEl.innerHTML = `<div class="ext-tpl-empty">${emptyText}</div>`;
        return;
    }
    const lblDup = i18n('extTpl.duplicate', '複製');
    const lblExp = i18n('extTpl.export', '書出');
    const lblDel = i18n('extTpl.delete', '削除');
    listEl.innerHTML = items.map(tpl => {
        const escapedName = (tpl.name || _ei18n('extTpl.unnamed', '(無名)')).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<div class="ext-tpl-list-item" data-id="${tpl.id}">
            <span class="name">${escapedName}</span>
            <span class="row-btns">
                <button data-action="duplicate" data-id="${tpl.id}">${lblDup}</button>
                <button data-action="export" data-id="${tpl.id}">${lblExp}</button>
                <button data-action="delete" data-id="${tpl.id}">${lblDel}</button>
            </span>
        </div>`;
    }).join('');

    listEl.querySelectorAll('.ext-tpl-list-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            if (el.dataset.id === extTplCurrentId) return;
            // 未保存変更があるまま別テンプレへ切り替えると破棄されるため確認
            if (!confirmExtTplDiscardIfDirty()) return;
            showExternalTemplateDetail(el.dataset.id);
        });
    });
    listEl.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            if (action === 'duplicate') {
                await window.externalTemplate.duplicate(id);
                await refreshExternalTemplateList();
                if (typeof window.refreshTemplateSelectExternalOptions === 'function') await window.refreshTemplateSelectExternalOptions();
            } else if (action === 'delete') {
                if (!confirm(_ei18n('extTpl.confirmDelete', '削除してよろしいですか？'))) return;
                // 削除対象が現在 Preview に適用中のテンプレなら、削除後に標準A3へ戻す
                const applied = (typeof window.getCurrentExternalTemplate === 'function')
                    ? window.getCurrentExternalTemplate() : null;
                const wasApplied = !!(applied && applied.id === id);
                await window.externalTemplate.delete(id);
                if (extTplCurrentId === id) showExternalTemplateDetail(null);
                await refreshExternalTemplateList();
                if (typeof window.refreshTemplateSelectExternalOptions === 'function') await window.refreshTemplateSelectExternalOptions();
                if (wasApplied && typeof window.resetToStandardTemplate === 'function') {
                    await window.resetToStandardTemplate();
                }
            } else if (action === 'export') {
                const tpl = await window.externalTemplate.get(id);
                const blob = window.externalTemplate.exportJSON(tpl);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = (tpl.name || 'template') + '.json';
                a.click();
                URL.revokeObjectURL(url);
            }
        });
    });

    if (extTplCurrentId) {
        const sel = listEl.querySelector(`.ext-tpl-list-item[data-id="${extTplCurrentId}"]`);
        if (sel) sel.classList.add('selected');
    }
}

// ── 詳細表示/編集 ──────────────────────────────────────────
async function showExternalTemplateDetail(id) {
    const placeholder = document.getElementById('ext-tpl-detail');
    const form = document.getElementById('ext-tpl-edit-form');
    extTplCurrentId = id;
    if (!id) {
        placeholder.style.display = 'block';
        form.style.display = 'none';
        extTplDraft = null;
        document.querySelectorAll('.ext-tpl-list-item.selected').forEach(el => el.classList.remove('selected'));
        setExtTplDirty(false);
        return;
    }
    const tpl = await window.externalTemplate.get(id);
    if (!tpl) return;
    extTplDraft = JSON.parse(JSON.stringify(tpl));
    placeholder.style.display = 'none';
    form.style.display = 'flex';
    document.getElementById('ext-tpl-name-input').value = tpl.name || '';
    updateExternalTemplateImagePreview(tpl.image, tpl.imageWidth, tpl.imageHeight);
    const overflowSel = document.getElementById('ext-tpl-overflow-mode');
    if (overflowSel) overflowSel.value = tpl.columnOverflowMode || 'none';
    loadExtTplColumnHeaderForm(tpl);
    document.querySelectorAll('.ext-tpl-list-item').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
    // 保存済み内容を読み込んだ直後はクリーン状態
    setExtTplDirty(false);
}

// ── カラムヘッダー設定 (テンプレ共通) ────────────────────────
const EXT_TPL_CH_INPUTS = [
    { id: 'ext-tpl-ch-show',      key: 'show',      kind: 'checkbox' },
    { id: 'ext-tpl-ch-bg',        key: 'bgEnabled', kind: 'checkbox' },
    { id: 'ext-tpl-ch-bgcolor',   key: 'bgColor',   kind: 'color' },
    { id: 'ext-tpl-ch-textcolor', key: 'textColor', kind: 'color' },
    { id: 'ext-tpl-ch-vertical',  key: 'vertical',  kind: 'checkbox' },
    { id: 'ext-tpl-ch-offx',      key: 'offsetX',   kind: 'number' },
    { id: 'ext-tpl-ch-offy',      key: 'offsetY',   kind: 'number' },
    { id: 'ext-tpl-ch-fontsize',  key: 'fontSize',  kind: 'number-nullable' }
];

function ensureDraftColumnHeader() {
    if (!extTplDraft) return null;
    if (!extTplDraft.columnHeader) {
        const defaults = (window.externalTemplate && window.externalTemplate.columnHeaderDefaults) || {};
        extTplDraft.columnHeader = Object.assign({}, defaults);
    }
    return extTplDraft.columnHeader;
}

function loadExtTplColumnHeaderForm(tpl) {
    const cfg = (window.externalTemplate && typeof window.externalTemplate.resolveColumnHeader === 'function')
        ? window.externalTemplate.resolveColumnHeader(tpl, null) : null;
    if (!cfg) return;
    EXT_TPL_CH_INPUTS.forEach(def => {
        const el = document.getElementById(def.id);
        if (!el) return;
        if (def.kind === 'checkbox') el.checked = !!cfg[def.key];
        else if (def.kind === 'number-nullable') el.value = (typeof cfg[def.key] === 'number') ? cfg[def.key] : '';
        else el.value = cfg[def.key] != null ? cfg[def.key] : (def.kind === 'number' ? 0 : '#000000');
    });
}

function updateExternalTemplateImagePreview(dataUrl, w, h) {
    const img = document.getElementById('ext-tpl-image-preview');
    const info = document.getElementById('ext-tpl-image-info');
    if (dataUrl) {
        img.src = dataUrl;
        info.textContent = `${w} × ${h} px`;
    } else {
        img.removeAttribute('src');
        info.textContent = _ei18n('extTpl.imageNotSet', '画像未設定');
    }
}

// ── 画像アップロード + 自動リサイズ ────────────────────────
async function pickExternalTemplateImage(file) {
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
    const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = dataUrl;
    });
    const maxLong = 4000;
    let w = img.naturalWidth, h = img.naturalHeight;
    const longSide = Math.max(w, h);
    if (longSide > maxLong) {
        const scale = maxLong / longSide;
        w = Math.round(w * scale);
        h = Math.round(h * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const isJpeg = file.type === 'image/jpeg';
    const outDataUrl = canvas.toDataURL(isJpeg ? 'image/jpeg' : 'image/png', 0.85);
    return { dataUrl: outDataUrl, width: w, height: h };
}

// ── イベント配線 ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // 新規追加
    document.getElementById('ext-tpl-new-btn').addEventListener('click', async () => {
        try {
            const newTpl = {
                id: window.externalTemplate.generateId(),
                name: _ei18n('extTpl.newTemplateName', '新規テンプレート'),
                image: null,
                imageWidth: 0,
                imageHeight: 0,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                bboxes: {}
            };
            await window.externalTemplate.save(newTpl);
            await refreshExternalTemplateList();
            if (typeof window.refreshTemplateSelectExternalOptions === 'function') await window.refreshTemplateSelectExternalOptions();
            await showExternalTemplateDetail(newTpl.id);
        } catch (err) {
            console.error('外部テンプレート新規追加エラー:', err);
            alert(_ei18n('extTpl.alert.newFailed', '新規追加に失敗しました:\n') + (err && err.message ? err.message : err));
        }
    });

    // インポート
    document.getElementById('ext-tpl-import-btn').addEventListener('click', () => {
        document.getElementById('ext-tpl-import-file').click();
    });
    document.getElementById('ext-tpl-import-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const tpl = await window.externalTemplate.importJSON(text);
            await refreshExternalTemplateList();
            if (typeof window.refreshTemplateSelectExternalOptions === 'function') await window.refreshTemplateSelectExternalOptions();
            await showExternalTemplateDetail(tpl.id);
        } catch (err) {
            alert(_ei18n('extTpl.alert.importFailed', 'インポートに失敗しました: ') + (err.message || err));
        }
        e.target.value = '';
    });

    // 画像選択
    document.getElementById('ext-tpl-image-btn').addEventListener('click', () => {
        document.getElementById('ext-tpl-image-file').click();
    });
    document.getElementById('ext-tpl-image-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file || !extTplDraft) return;
        try {
            const result = await pickExternalTemplateImage(file);
            extTplDraft.image = result.dataUrl;
            extTplDraft.imageWidth = result.width;
            extTplDraft.imageHeight = result.height;
            updateExternalTemplateImagePreview(result.dataUrl, result.width, result.height);
            setExtTplDirty(true);
        } catch (err) {
            alert(_ei18n('extTpl.alert.imageLoadFailed', '画像読み込みに失敗しました: ') + (err.message || err));
        }
        e.target.value = '';
    });

    // 保存
    document.getElementById('ext-tpl-save-btn').addEventListener('click', async () => {
        if (!extTplDraft) return;
        try {
            extTplDraft.name = document.getElementById('ext-tpl-name-input').value.trim() || _ei18n('extTpl.untitled', '無名テンプレート');
            extTplDraft.updatedAt = Date.now();
            await window.externalTemplate.save(extTplDraft);
            await refreshExternalTemplateList();
            if (typeof window.refreshTemplateSelectExternalOptions === 'function') await window.refreshTemplateSelectExternalOptions();
            // 保存したテンプレが適用中なら、メモリ状態 (画像含む) を再読込して即反映
            if (typeof window.syncAppliedExternalTemplateAfterSave === 'function') {
                await window.syncAppliedExternalTemplateAfterSave(extTplDraft.id);
            }
            setExtTplDirty(false);
            if (typeof showToast === 'function') showToast(_ei18n('extTpl.toast.saved', 'テンプレートを保存しました'), 2000);
        } catch (err) {
            console.error('テンプレート保存エラー:', err);
            alert(_ei18n('bbox.alert.saveFailed', '保存に失敗しました: ') + (err && err.message ? err.message : err));
        }
    });

    // BBoxエディタを開く
    document.getElementById('ext-tpl-bbox-editor-btn').addEventListener('click', async () => {
        if (!extTplCurrentId) { alert(_ei18n('extTpl.alert.selectTemplate', 'テンプレートを選択してください')); return; }
        if (!extTplDraft || !extTplDraft.image) {
            alert(_ei18n('extTpl.alert.imageRequired', '先に背景画像を設定してから「保存」してください'));
            return;
        }
        if (typeof window.openBBoxEditor !== 'function') return;
        try {
            // 未保存の draft 内容を先に保存してから開く（画像反映のため）
            extTplDraft.name = document.getElementById('ext-tpl-name-input').value.trim() || _ei18n('extTpl.untitled', '無名テンプレート');
            extTplDraft.updatedAt = Date.now();
            await window.externalTemplate.save(extTplDraft);
            await refreshExternalTemplateList();
            if (typeof window.refreshTemplateSelectExternalOptions === 'function') await window.refreshTemplateSelectExternalOptions();
            // 適用中テンプレなら BBox エディタを開く前にメモリ状態も同期
            if (typeof window.syncAppliedExternalTemplateAfterSave === 'function') {
                await window.syncAppliedExternalTemplateAfterSave(extTplCurrentId);
            }
            // draft は保存済みになったのでクリーン状態へ
            setExtTplDirty(false);
            await window.openBBoxEditor(extTplCurrentId);
        } catch (err) {
            console.error('BBoxエディタを開けません:', err);
            alert(_ei18n('extTpl.alert.openFailed', 'BBoxエディタを開けませんでした: ') + (err && err.message ? err.message : err));
        }
    });

    // テンプレート名の編集で未保存状態にする
    document.getElementById('ext-tpl-name-input').addEventListener('input', () => {
        if (extTplDraft) setExtTplDirty(true);
    });

    // 列超過モード (Phase B)
    const overflowSel = document.getElementById('ext-tpl-overflow-mode');
    if (overflowSel) {
        overflowSel.addEventListener('change', () => {
            if (!extTplDraft) return;
            extTplDraft.columnOverflowMode = overflowSel.value;
            setExtTplDirty(true);
        });
    }

    // カラムヘッダー設定 (テンプレ共通) の配線
    EXT_TPL_CH_INPUTS.forEach(def => {
        const el = document.getElementById(def.id);
        if (!el) return;
        const evt = (def.kind === 'checkbox') ? 'change' : 'input';
        el.addEventListener(evt, () => {
            const ch = ensureDraftColumnHeader();
            if (!ch) return;
            if (def.kind === 'checkbox') ch[def.key] = el.checked;
            else if (def.kind === 'number') {
                const v = parseFloat(el.value);
                ch[def.key] = isNaN(v) ? 0 : v;
            } else if (def.kind === 'number-nullable') {
                const v = parseFloat(el.value);
                ch[def.key] = isNaN(v) ? null : v;
            } else {
                ch[def.key] = el.value;
            }
            setExtTplDirty(true);
        });
    });

    // 閉じる (click イベントが force 引数に渡らないようラップ)
    document.getElementById('ext-tpl-close-btn').addEventListener('click', () => closeExternalTemplateModal());
});

// BBoxエディタ保存後に呼ばれる: draft と一覧を再読込
window.refreshExternalTemplateDraftAfterSave = async function(templateId) {
    if (extTplCurrentId === templateId) {
        const tpl = await window.externalTemplate.get(templateId);
        if (tpl) {
            extTplDraft = JSON.parse(JSON.stringify(tpl));
            await refreshExternalTemplateList();
        }
    }
};
