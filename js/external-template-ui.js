// external-template-ui.js
// 外部テンプレート管理モーダルのUI配線

let extTplCurrentId = null;
let extTplDraft = null;

// ── モーダル開閉 ──────────────────────────────────────────
async function openExternalTemplateModal() {
    document.getElementById('external-template-modal').style.display = 'flex';
    await refreshExternalTemplateList();
    showExternalTemplateDetail(null);
}
function closeExternalTemplateModal() {
    document.getElementById('external-template-modal').style.display = 'none';
    extTplCurrentId = null;
    extTplDraft = null;
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
        const escapedName = (tpl.name || '(無名)').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
                if (!confirm('削除してよろしいですか？')) return;
                await window.externalTemplate.delete(id);
                if (extTplCurrentId === id) showExternalTemplateDetail(null);
                await refreshExternalTemplateList();
                if (typeof window.refreshTemplateSelectExternalOptions === 'function') await window.refreshTemplateSelectExternalOptions();
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
        return;
    }
    const tpl = await window.externalTemplate.get(id);
    if (!tpl) return;
    extTplDraft = JSON.parse(JSON.stringify(tpl));
    placeholder.style.display = 'none';
    form.style.display = 'flex';
    document.getElementById('ext-tpl-name-input').value = tpl.name || '';
    updateExternalTemplateImagePreview(tpl.image, tpl.imageWidth, tpl.imageHeight);
    document.querySelectorAll('.ext-tpl-list-item').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
}

function updateExternalTemplateImagePreview(dataUrl, w, h) {
    const img = document.getElementById('ext-tpl-image-preview');
    const info = document.getElementById('ext-tpl-image-info');
    if (dataUrl) {
        img.src = dataUrl;
        info.textContent = `${w} × ${h} px`;
    } else {
        img.removeAttribute('src');
        info.textContent = '画像未設定';
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
                name: '新規テンプレート',
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
            alert('新規追加に失敗しました:\n' + (err && err.message ? err.message : err));
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
            alert('インポートに失敗しました: ' + (err.message || err));
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
        } catch (err) {
            alert('画像読み込みに失敗しました: ' + (err.message || err));
        }
        e.target.value = '';
    });

    // 保存
    document.getElementById('ext-tpl-save-btn').addEventListener('click', async () => {
        if (!extTplDraft) return;
        try {
            extTplDraft.name = document.getElementById('ext-tpl-name-input').value.trim() || '無名テンプレート';
            extTplDraft.updatedAt = Date.now();
            await window.externalTemplate.save(extTplDraft);
            await refreshExternalTemplateList();
            if (typeof window.refreshTemplateSelectExternalOptions === 'function') await window.refreshTemplateSelectExternalOptions();
            if (typeof showToast === 'function') showToast('テンプレートを保存しました', 2000);
        } catch (err) {
            console.error('テンプレート保存エラー:', err);
            alert('保存に失敗しました:\n' + (err && err.message ? err.message : err));
        }
    });

    // BBoxエディタを開く
    document.getElementById('ext-tpl-bbox-editor-btn').addEventListener('click', async () => {
        if (!extTplCurrentId) { alert('テンプレートを選択してください'); return; }
        if (!extTplDraft || !extTplDraft.image) {
            alert('先に背景画像を設定してから「保存」してください');
            return;
        }
        if (typeof window.openBBoxEditor !== 'function') return;
        try {
            // 未保存の draft 内容を先に保存してから開く（画像反映のため）
            extTplDraft.name = document.getElementById('ext-tpl-name-input').value.trim() || '無名テンプレート';
            extTplDraft.updatedAt = Date.now();
            await window.externalTemplate.save(extTplDraft);
            await refreshExternalTemplateList();
            if (typeof window.refreshTemplateSelectExternalOptions === 'function') await window.refreshTemplateSelectExternalOptions();
            await window.openBBoxEditor(extTplCurrentId);
        } catch (err) {
            console.error('BBoxエディタを開けません:', err);
            alert('BBoxエディタを開けませんでした: ' + (err && err.message ? err.message : err));
        }
    });

    // 閉じる
    document.getElementById('ext-tpl-close-btn').addEventListener('click', closeExternalTemplateModal);
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
