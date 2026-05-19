/**
 * external-template.js
 * 外部テンプレート機能 データ層
 * IndexedDB (webTimesheetEditor / externalTemplates) の CRUD + JSON入出力
 */

// ─── タグ一覧定数 ────────────────────────────────────────────────────────────

const EXTERNAL_TEMPLATE_TAGS = {
    title:        { label: 'タイトル',      category: 'meta' },
    episode:      { label: '話数',          category: 'meta',      prefixable: true },
    scene:        { label: 'シーン',        category: 'meta',      prefixable: true },
    cut:          { label: 'カット',        category: 'meta',      prefixable: true },
    currentPage:  { label: '現在ページ番号', category: 'meta' },
    totalPages:   { label: '総ページ数',     category: 'meta' },
    date:         { label: '日付',          category: 'meta' },
    studio:       { label: 'スタジオ',      category: 'meta' },
    memo:         { label: '備考',          category: 'meta' },
    direction:    { label: '演出指示',      category: 'meta' },
    lengthFrame:  { label: '尺(フレーム)', category: 'meta' },
    lengthSec:    { label: '尺(秒)',        category: 'meta' },
    name:         { label: '作画者',        category: 'staff' },
    director:     { label: '演出',          category: 'staff' },
    supervisor:   { label: '作監',          category: 'staff' },
    inbetween:    { label: '動画',          category: 'staff' },
    action1:      { label: 'アクション1',  category: 'timeline',  timeline: true },
    action2:      { label: 'アクション2',  category: 'timeline',  timeline: true },
    cell1:        { label: 'セル1',         category: 'timeline',  timeline: true },
    cell2:        { label: 'セル2',         category: 'timeline',  timeline: true },
    sound1:       { label: 'セリフ1',       category: 'timeline',  timeline: true },
    sound2:       { label: 'セリフ2',       category: 'timeline',  timeline: true },
    camera1:      { label: 'カメラ1',       category: 'timeline',  timeline: true },
    camera2:      { label: 'カメラ2',       category: 'timeline',  timeline: true },
    custom1:      { label: 'カスタム1',    category: 'custom',    customizable: true },
    custom2:      { label: 'カスタム2',    category: 'custom',    customizable: true },
    custom3:      { label: 'カスタム3',    category: 'custom',    customizable: true },
    custom4:      { label: 'カスタム4',    category: 'custom',    customizable: true },
    logo:         { label: 'ロゴ',          category: 'extra' }
};

// ─── UUID生成 ────────────────────────────────────────────────────────────────

function generateTemplateId() {
    const hex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    return 'tpl_' + hex;
}

// ─── デフォルトBBox生成ヘルパー ──────────────────────────────────────────────

// A3標準想定の正規化座標デフォルト位置
const DEFAULT_BBOX_POSITIONS = {
    // メタ (画像上部)
    title:       { x: 0.04, y: 0.020, w: 0.20, h: 0.030 },
    episode:     { x: 0.25, y: 0.020, w: 0.08, h: 0.030 },
    scene:       { x: 0.34, y: 0.020, w: 0.08, h: 0.030 },
    cut:         { x: 0.43, y: 0.020, w: 0.08, h: 0.030 },
    lengthSec:   { x: 0.52, y: 0.020, w: 0.05, h: 0.030 },
    lengthFrame: { x: 0.58, y: 0.020, w: 0.05, h: 0.030 },
    name:        { x: 0.64, y: 0.020, w: 0.18, h: 0.030 },
    currentPage: { x: 0.80, y: 0.020, w: 0.05, h: 0.030 },
    totalPages:  { x: 0.86, y: 0.020, w: 0.05, h: 0.030 },
    date:        { x: 0.83, y: 0.055, w: 0.13, h: 0.020 },
    studio:      { x: 0.04, y: 0.055, w: 0.18, h: 0.020 },
    // direction/memo (上部広め)
    direction:   { x: 0.04, y: 0.080, w: 0.55, h: 0.060 },
    memo:        { x: 0.60, y: 0.080, w: 0.36, h: 0.060 },
    // 担当者 (画像下部)
    director:    { x: 0.30, y: 0.960, w: 0.18, h: 0.025 },
    supervisor:  { x: 0.49, y: 0.960, w: 0.18, h: 0.025 },
    inbetween:   { x: 0.68, y: 0.960, w: 0.18, h: 0.025 },
    // タイムライン (中央エリア。左から ACTION, SOUND, CELL, CAMERA を1ずつ並べる)
    action1:     { x: 0.04, y: 0.16, w: 0.20, h: 0.78, frames: 72, columns: 7 },
    sound1:      { x: 0.25, y: 0.16, w: 0.08, h: 0.78, frames: 72, columns: 2 },
    cell1:       { x: 0.34, y: 0.16, w: 0.20, h: 0.78, frames: 72, columns: 7 },
    camera1:     { x: 0.55, y: 0.16, w: 0.07, h: 0.78, frames: 72, columns: 2 },
    // 2セット（右半分。6秒シートで使われる想定）
    action2:     { x: 0.63, y: 0.16, w: 0.20, h: 0.78, frames: 72, columns: 7 },
    sound2:      { x: 0.84, y: 0.16, w: 0.04, h: 0.78, frames: 72, columns: 2 },
    cell2:       { x: 0.89, y: 0.16, w: 0.10, h: 0.78, frames: 72, columns: 7 },
    camera2:     { x: 0.99, y: 0.16, w: 0.01, h: 0.78, frames: 72, columns: 2 },
    // カスタム (中央)
    custom1:     { x: 0.35, y: 0.08, w: 0.10, h: 0.03 },
    custom2:     { x: 0.45, y: 0.08, w: 0.10, h: 0.03 },
    custom3:     { x: 0.35, y: 0.12, w: 0.10, h: 0.03 },
    custom4:     { x: 0.45, y: 0.12, w: 0.10, h: 0.03 },
    // ロゴ (右上)
    logo:        { x: 0.83, y: 0.030, w: 0.12, h: 0.040 }
};

function createDefaultBBox(tagName) {
    const pos = DEFAULT_BBOX_POSITIONS[tagName] || { x: 0.1, y: 0.1, w: 0.2, h: 0.05 };
    const tagDef = EXTERNAL_TEMPLATE_TAGS[tagName] || {};
    const bbox = {
        enabled: false,
        locked: false,
        x: pos.x, y: pos.y, w: pos.w, h: pos.h
    };
    if (tagDef.prefixable) bbox.prefix = '';
    if (tagDef.customizable) { bbox.label = ''; bbox.type = 'text'; }
    if (tagDef.timeline) {
        bbox.frames  = pos.frames  || 72;
        bbox.columns = pos.columns || 5;
    }
    return bbox;
}

// ─── IndexedDB ───────────────────────────────────────────────────────────────

// io-common.js が同名DB('webTimesheetEditor')を別ストアで使うため、
// 衝突回避のため独立DBに分離
const DB_NAME = 'webTimesheetEditorTemplates';
const DB_VERSION = 1;
const STORE_NAME = 'externalTemplates';

function openExternalTemplateDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror   = (e) => reject(e.target.error);
    });
}

async function saveExternalTemplate(template) {
    const db = await openExternalTemplateDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(template);
        req.onsuccess = () => resolve();
        req.onerror   = (e) => reject(e.target.error);
        tx.oncomplete = () => db.close();
    });
}

async function getExternalTemplate(id) {
    const db = await openExternalTemplateDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);
        req.onsuccess = (e) => resolve(e.target.result ?? null);
        req.onerror   = (e) => reject(e.target.error);
        tx.oncomplete = () => db.close();
    });
}

async function listExternalTemplates() {
    const db = await openExternalTemplateDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = (e) => {
            const list = e.target.result;
            list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            resolve(list);
        };
        req.onerror = (e) => reject(e.target.error);
        tx.oncomplete = () => db.close();
    });
}

async function deleteExternalTemplate(id) {
    const db = await openExternalTemplateDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror   = (e) => reject(e.target.error);
        tx.oncomplete = () => db.close();
    });
}

async function duplicateExternalTemplate(id) {
    const src = await getExternalTemplate(id);
    if (!src) throw new Error(`テンプレートが見つかりません: ${id}`);
    const now = Date.now();
    const copy = {
        ...src,
        id: generateTemplateId(),
        name: src.name + ' のコピー',
        createdAt: now,
        updatedAt: now,
        bboxes: JSON.parse(JSON.stringify(src.bboxes || {}))
    };
    await saveExternalTemplate(copy);
    return copy;
}

// ─── JSON エクスポート / インポート ──────────────────────────────────────────

function exportExternalTemplateAsJSON(template) {
    const json = JSON.stringify(template, null, 2);
    return new Blob([json], { type: 'application/json' });
}

async function importExternalTemplateFromJSON(jsonText) {
    let data;
    try {
        data = JSON.parse(jsonText);
    } catch {
        throw new Error('JSONの解析に失敗しました');
    }
    if (!data || typeof data !== 'object') throw new Error('不正なテンプレートデータです');
    if (!data.name) throw new Error('name フィールドが必要です');

    const now = Date.now();
    const template = {
        ...data,
        id: generateTemplateId(),
        createdAt: now,
        updatedAt: now,
        bboxes: data.bboxes || {}
    };
    await saveExternalTemplate(template);
    return template;
}

// ─── 現在使用中の外部テンプレート State ──────────────────────────────────────

let currentExternalTemplate = null;
let currentExternalTemplateImage = null;

function getCurrentExternalTemplate() {
    return currentExternalTemplate;
}
function getCurrentExternalTemplateImage() {
    return currentExternalTemplateImage;
}
async function setCurrentExternalTemplate(id) {
    if (!id) {
        currentExternalTemplate = null;
        currentExternalTemplateImage = null;
        if (typeof refreshCustomFieldsSidebar === 'function') refreshCustomFieldsSidebar();
        return;
    }
    const tpl = await window.externalTemplate.get(id);
    if (!tpl) {
        currentExternalTemplate = null;
        currentExternalTemplateImage = null;
        if (typeof refreshCustomFieldsSidebar === 'function') refreshCustomFieldsSidebar();
        return;
    }
    currentExternalTemplate = tpl;
    if (tpl.image) {
        currentExternalTemplateImage = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = tpl.image;
        });
    } else {
        currentExternalTemplateImage = null;
    }
    if (typeof refreshCustomFieldsSidebar === 'function') refreshCustomFieldsSidebar();
}
window.getCurrentExternalTemplate = getCurrentExternalTemplate;
window.getCurrentExternalTemplateImage = getCurrentExternalTemplateImage;
window.setCurrentExternalTemplate = setCurrentExternalTemplate;

// ─── Phase 3d: カスタムフィールド サイドバー更新 ──────────────────────────────

function refreshCustomFieldsSidebar() {
    // テンプレ状態表示も同期 (テンプレ切替/ロード時に呼ばれる)
    if (typeof updateSidebarTemplateStatus === 'function') updateSidebarTemplateStatus();
    const section = document.getElementById('sidebar-custom-fields');
    const content = document.getElementById('sidebar-custom-fields-content');
    if (!section || !content) return;

    const tpl = currentExternalTemplate;
    if (!tpl || !tpl.bboxes) {
        section.style.display = 'none';
        content.innerHTML = '';
        return;
    }

    // enabled の custom1-4 を抽出
    const customs = [];
    ['custom1', 'custom2', 'custom3', 'custom4'].forEach(key => {
        const b = tpl.bboxes[key];
        if (b && b.enabled) {
            customs.push({ key, label: b.label || key, type: b.type || 'text' });
        }
    });

    if (customs.length === 0) {
        section.style.display = 'none';
        content.innerHTML = '';
        return;
    }

    section.style.display = '';
    if (typeof metaData !== 'undefined' && !metaData.customFields) metaData.customFields = {};

    content.innerHTML = customs.map(c => {
        const escLabel = String(c.label).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const val = (typeof metaData !== 'undefined' && metaData.customFields) ? (metaData.customFields[c.key] || '') : '';
        const escValue = String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const inputHtml = c.type === 'multiline'
            ? `<textarea data-custom-key="${c.key}" rows="3" style="width:100%; box-sizing:border-box; font-size:11px; padding:2px;">${escValue}</textarea>`
            : `<input type="text" data-custom-key="${c.key}" value="${escValue}" style="width:100%; box-sizing:border-box; font-size:11px; padding:2px;">`;
        return `<div class="custom-field-row" style="margin-bottom:8px;">
            <label style="display:block; font-size:11px; margin-bottom:2px;">${escLabel}</label>
            ${inputHtml}
        </div>`;
    }).join('');

    // 入力イベント（テキスト）
    content.querySelectorAll('[data-custom-key]').forEach(el => {
        el.addEventListener('input', () => {
            const key = el.dataset.customKey;
            if (typeof metaData !== 'undefined') {
                if (!metaData.customFields) metaData.customFields = {};
                metaData.customFields[key] = el.value;
            }
            if (typeof markDirty === 'function') markDirty();
            // プレビュー再描画はデバウンス
            scheduleCustomPreviewRefresh();
        });
    });

}


// デバウンス用タイマー
let _customPreviewTimer = null;
function scheduleCustomPreviewRefresh() {
    if (_customPreviewTimer) clearTimeout(_customPreviewTimer);
    _customPreviewTimer = setTimeout(() => {
        _customPreviewTimer = null;
        if (typeof updateTemplatePreview === 'function') updateTemplatePreview();
    }, 250);
}

window.refreshCustomFieldsSidebar = refreshCustomFieldsSidebar;

// ─── グローバル公開 ──────────────────────────────────────────────────────────

window.externalTemplate = {
    tags:        EXTERNAL_TEMPLATE_TAGS,
    generateId:  generateTemplateId,
    defaultBBox: createDefaultBBox,
    save:        saveExternalTemplate,
    get:         getExternalTemplate,
    list:        listExternalTemplates,
    delete:      deleteExternalTemplate,
    duplicate:   duplicateExternalTemplate,
    exportJSON:  exportExternalTemplateAsJSON,
    importJSON:  importExternalTemplateFromJSON
};

// ─── テンプレートセレクトボックス統合 ────────────────────────────────────────

async function refreshTemplateSelectExternalOptions() {
    const group = document.getElementById('template-select-external-group');
    if (!group) return;
    if (!window.externalTemplate || typeof window.externalTemplate.list !== 'function') {
        group.innerHTML = '';
        return;
    }
    try {
        const items = await window.externalTemplate.list();
        group.innerHTML = items.map(t => {
            const esc = (t.name || '無名').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<option value="ext:${t.id}">${esc}</option>`;
        }).join('');
    } catch (err) {
        console.error('外部テンプレート一覧取得失敗:', err);
        group.innerHTML = '';
    }
}
window.refreshTemplateSelectExternalOptions = refreshTemplateSelectExternalOptions;

// サイドバー: 現在テンプレ状態表示・追加/設定/BBox編集 ボタンの状態同期
function updateSidebarTemplateStatus() {
    const statusEl = document.getElementById('sidebar-template-status');
    const statusName = document.getElementById('sidebar-template-status-name');
    const settingsBtn = document.getElementById('sidebar-template-settings-btn');
    const bboxBtn = document.getElementById('sidebar-template-bbox-btn');
    const tpl = currentExternalTemplate;
    const i18n = (key, fallback) => (typeof t === 'function' ? t(key) : null) || fallback;
    if (tpl) {
        if (statusEl) statusEl.dataset.state = 'external';
        if (statusName) statusName.textContent = `${i18n('sidebar.template.external', '外部テンプレ')}: ${tpl.name || i18n('extTpl.unnamed', '(無名)')}`;
        if (settingsBtn) settingsBtn.classList.remove('disabled');
        if (bboxBtn) bboxBtn.style.display = '';
    } else {
        if (statusEl) statusEl.dataset.state = 'standard';
        if (statusName) statusName.textContent = i18n('sidebar.template.standard', '標準A3');
        if (settingsBtn) settingsBtn.classList.add('disabled');
        if (bboxBtn) bboxBtn.style.display = 'none';
    }
}
window.updateSidebarTemplateStatus = updateSidebarTemplateStatus;

// changeイベント: __new_external__ と ext: プレフィックスを処理
document.addEventListener('DOMContentLoaded', () => {
    const templateSelect = document.getElementById('template-select');
    if (!templateSelect) return;

    // 起動時に外部テンプレート一覧を読み込む
    refreshTemplateSelectExternalOptions().then(() => updateSidebarTemplateStatus());

    templateSelect.addEventListener('change', async (e) => {
        const v = e.target.value;
        if (v === '__new_external__') {
            e.target.selectedIndex = 0;
            if (typeof openExternalTemplateModal === 'function') openExternalTemplateModal();
            return;
        }
        if (v.startsWith('ext:')) {
            const id = v.substring(4);
            await setCurrentExternalTemplate(id);
            updateSidebarTemplateStatus();
            if (typeof updateTemplatePreview === 'function') updateTemplatePreview();
            return;
        }
        // 標準テンプレート選択時は外部テンプレートを解除
        await setCurrentExternalTemplate(null);
        updateSidebarTemplateStatus();
        if (typeof updateTemplatePreview === 'function') updateTemplatePreview();
        // 既存の標準テンプレート処理はここでは何もしない（他の箇所で処理）
    });

    // 追加ボタン: 常に有効、外部テンプレ管理モーダルを開く
    const addBtn = document.getElementById('sidebar-template-add-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            if (typeof openExternalTemplateModal === 'function') openExternalTemplateModal();
        });
    }
    // 設定ボタン: 外部テンプレ選択時のみ有効、管理モーダルを開く
    const settingsBtn = document.getElementById('sidebar-template-settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            if (settingsBtn.classList.contains('disabled')) return;
            if (typeof openExternalTemplateModal === 'function') openExternalTemplateModal();
        });
    }
    // BBox編集ボタン: 外部テンプレ選択時のみ表示、現在テンプレで直接エディタを開く
    const bboxBtn = document.getElementById('sidebar-template-bbox-btn');
    if (bboxBtn) {
        bboxBtn.addEventListener('click', () => {
            const tpl = currentExternalTemplate;
            if (!tpl) return;
            if (typeof openBBoxEditor === 'function') openBBoxEditor(tpl.id);
        });
    }
});

// ─── ページング計算（外部テンプレート用） ───────────────────────────────────

// 1ページあたりフレーム数: enabled な timeline BBox の frames を合算
// 1側 = action1/cell1/sound1/camera1 のうち最大frames
// 2側 = action2/cell2/sound2/camera2 のうち最大frames（enabled時のみ）
function getExternalTemplateSheetCapacity() {
    const tpl = currentExternalTemplate;
    if (!tpl || !tpl.bboxes) return 0;
    const getMaxFrames = (suffix) => {
        let max = 0;
        ['action', 'cell', 'sound', 'camera'].forEach(t => {
            const key = t + suffix;
            const b = tpl.bboxes[key];
            if (b && b.enabled && typeof b.frames === 'number' && b.frames > 0) {
                if (b.frames > max) max = b.frames;
            }
        });
        return max;
    };
    return getMaxFrames('1') + getMaxFrames('2');
}
window.getExternalTemplateSheetCapacity = getExternalTemplateSheetCapacity;

function getExternalTemplateTotalPages() {
    if (!currentExternalTemplate) return 0;
    const capacity = getExternalTemplateSheetCapacity();
    if (capacity <= 0) return 1;
    if (typeof targetFrames === 'undefined' || !targetFrames || targetFrames <= 0) return 1;
    const normalPages = Math.max(1, Math.ceil(targetFrames / capacity));
    // headMargin有効時は 0ページ目を追加
    const hasZero = (typeof hasPage0 === 'function') && hasPage0();
    return hasZero ? normalPages + 1 : normalPages;
}
window.getExternalTemplateTotalPages = getExternalTemplateTotalPages;

function getExternalTemplatePageStartFrame(pageIndex) {
    const capacity = getExternalTemplateSheetCapacity();
    if (capacity <= 0) return 0;
    const hasZero = (typeof hasPage0 === 'function') && hasPage0();
    if (hasZero) {
        if (pageIndex === 0) {
            // 0ページ: -headMargin から開始
            const headMargin = (typeof getHeadMarginForPage === 'function') ? getHeadMarginForPage() : 0;
            return -headMargin;
        }
        // 通常ページ: 1ページ目以降は 0, capacity, 2*capacity, ...
        return (pageIndex - 1) * capacity;
    }
    return pageIndex * capacity;
}
window.getExternalTemplatePageStartFrame = getExternalTemplatePageStartFrame;
