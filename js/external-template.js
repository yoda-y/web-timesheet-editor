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
    sheet:        { label: 'ページ番号',    category: 'meta' },
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
    sheet:       { x: 0.85, y: 0.020, w: 0.10, h: 0.030 },
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

// changeイベント: __new_external__ と ext: プレフィックスを処理
document.addEventListener('DOMContentLoaded', () => {
    const templateSelect = document.getElementById('template-select');
    if (!templateSelect) return;

    // 起動時に外部テンプレート一覧を読み込む
    refreshTemplateSelectExternalOptions();

    templateSelect.addEventListener('change', (e) => {
        const v = e.target.value;
        if (v === '__new_external__') {
            e.target.selectedIndex = 0;
            if (typeof openExternalTemplateModal === 'function') openExternalTemplateModal();
            return;
        }
        if (v.startsWith('ext:')) {
            if (typeof showToast === 'function') showToast('外部テンプレートの描画は次フェーズで実装されます', 3000);
            e.target.selectedIndex = 0;
            return;
        }
        // 既存の標準テンプレート処理はここでは何もしない（他の箇所で処理）
    });
});
