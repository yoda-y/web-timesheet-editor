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

// ─── BBoxサイズ同期グループ ──────────────────────────────────────────────────
// 同グループ内のタグはサイズ系プロパティ (w/h/fontSize/frames/columns) を同期できる。
// x/y/enabled/locked/type/prefix/label は同期しない (場所と個性は個別)。
// custom1〜4 は用途が独立しがちなため既定では入れない。追加タグは配列に1行足すだけ。
const BBOX_SYNC_GROUPS = [
    ['action1', 'action2'],
    ['cell1', 'cell2'],
    ['sound1', 'sound2'],
    ['camera1', 'camera2'],
    ['currentPage', 'totalPages'],
    ['lengthSec', 'lengthFrame']
];

const BBOX_SYNC_KEYS = ['w', 'h', 'fontSize', 'frames', 'columns'];

// tag → 同グループの他メンバー配列 (グループ無しなら [])
function getBBoxSyncPeers(tagKey) {
    for (const group of BBOX_SYNC_GROUPS) {
        if (group.includes(tagKey)) return group.filter(t => t !== tagKey);
    }
    return [];
}

// bbox.syncSize は undefined = ON (デフォルトON、旧テンプレ互換)
function isBBoxSyncEnabled(bbox) {
    return !bbox || bbox.syncSize !== false;
}

// 変更元タグのサイズ系プロパティを同グループの peer へ伝播する。
// - 変更元 / 伝播先の両方が syncSize ON のときのみ伝播
// - fontSize は「未設定 (undefined=自動)」も同期する (delete で揃える)
// - 存在しない peer bbox は作らない (開いただけで bboxes を変更しないため)
// force=true で syncSize 状態を無視して伝播 (「同種BBoxにサイズを反映」ボタン用)
function applyBBoxSizeSync(bboxes, tagKey, force) {
    if (!bboxes || !bboxes[tagKey]) return;
    const src = bboxes[tagKey];
    if (!force && !isBBoxSyncEnabled(src)) return;
    getBBoxSyncPeers(tagKey).forEach(peer => {
        const dst = bboxes[peer];
        if (!dst) return;
        if (!force && !isBBoxSyncEnabled(dst)) return;
        BBOX_SYNC_KEYS.forEach(key => {
            if (src[key] === undefined) delete dst[key];
            else dst[key] = src[key];
        });
    });
}

// ─── カラムヘッダー印字設定 (Phase A) ────────────────────────────────────────
// テンプレ共通 (tpl.columnHeader) + timeline BBox override (bbox.columnHeader) を
// マージして実効設定を返す。どちらも未定義なら既定 (show: false = 従来動作)。
const COLUMN_HEADER_DEFAULTS = {
    show: false,
    bgEnabled: true,
    bgColor: '#ffffff',
    textColor: '#000000',
    offsetX: 0,        // mm
    offsetY: 0,        // mm
    fontSize: null,    // mm。null = 自動 (セル高ベース)
    vertical: false
};

function resolveColumnHeaderConfig(tpl, bbox) {
    return Object.assign({},
        COLUMN_HEADER_DEFAULTS,
        (tpl && tpl.columnHeader) || {},
        (bbox && bbox.columnHeader) || {});
}

// ─── gengaDouga シート種別ラベル (Phase C-5) ──────────────────────────────────
// 原画/動画の表示文言。テンプレ単位で上書き可 (tpl.sheetTypeLabels)。
function getSheetTypeLabelDefaults() {
    const isJa = !(typeof currentLang !== 'undefined' && currentLang === 'en');
    return isJa
        ? {
            genga: '原画', douga: '動画',
            splitDougaNotice: 'こちらが動画シートです',
            separateGengaNotice: '原画シート',
            separateDougaNotice: '動画シート',
            showSplitNotice: true
          }
        : {
            genga: 'KEY', douga: 'INBTWN',
            splitDougaNotice: 'INBETWEEN AREA',
            separateGengaNotice: 'KEY SHEET',
            separateDougaNotice: 'INBETWEEN SHEET',
            showSplitNotice: true
          };
}
function resolveSheetTypeLabels(tpl) {
    return Object.assign({}, getSheetTypeLabelDefaults(), (tpl && tpl.sheetTypeLabels) || {});
}

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
// Phase 2: ページ別テンプレ画像のデコード済みキャッシュ (pageIndex文字列 → Image)
let currentExternalTemplatePageImages = {};

function getCurrentExternalTemplate() {
    return currentExternalTemplate;
}
// pageIndex を渡すと、そのページ専用画像があれば返す。無ければ基本画像 (fallback)。
function getCurrentExternalTemplateImage(pageIndex) {
    if (pageIndex !== undefined && pageIndex !== null) {
        const pi = currentExternalTemplatePageImages[String(pageIndex)];
        if (pi) return pi;
    }
    return currentExternalTemplateImage;
}

// pageImages の dataURL を Image にデコードしてキャッシュ
async function decodeExternalTemplatePageImages(tpl) {
    currentExternalTemplatePageImages = {};
    if (!tpl || !tpl.pageImages || typeof tpl.pageImages !== 'object') return;
    const keys = Object.keys(tpl.pageImages);
    for (const k of keys) {
        const pi = tpl.pageImages[k];
        if (!pi || !pi.image) continue;
        try {
            const img = await new Promise((resolve, reject) => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.onerror = reject;
                i.src = pi.image;
            });
            currentExternalTemplatePageImages[String(k)] = img;
        } catch (e) { /* skip broken page image */ }
    }
}
async function setCurrentExternalTemplate(id) {
    if (!id) {
        currentExternalTemplate = null;
        currentExternalTemplateImage = null;
        currentExternalTemplatePageImages = {};
        if (typeof refreshCustomFieldsSidebar === 'function') refreshCustomFieldsSidebar();
        return;
    }
    const tpl = await window.externalTemplate.get(id);
    if (!tpl) {
        currentExternalTemplate = null;
        currentExternalTemplateImage = null;
        currentExternalTemplatePageImages = {};
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
    // IDB保存済みテンプレは現状単一画像のみ。ページ別キャッシュはクリア。
    currentExternalTemplatePageImages = {};
    if (typeof refreshCustomFieldsSidebar === 'function') refreshCustomFieldsSidebar();
}
window.getCurrentExternalTemplate = getCurrentExternalTemplate;
window.getCurrentExternalTemplateImage = getCurrentExternalTemplateImage;
window.setCurrentExternalTemplate = setCurrentExternalTemplate;

// 適用中の外部テンプレ状態を最新化する (Preview「更新」ボタン等から呼ぶ)。
// - ライブラリテンプレ: IDB から再取得して currentExternalTemplate / 画像を差し替え
//   (setCurrentExternalTemplate は毎回 IDB を引くため forceReload オプション不要)
// - 一時テンプレ / Project由来テンプレ: IDB に無いので、現在のオブジェクトから
//   画像 / pageImages を再デコード (applyProjectExternalTemplate の再適用)
// 外部テンプレ未適用時は何もしない。BBox 設定はテンプレオブジェクト内なので維持される。
async function reloadCurrentExternalTemplate() {
    if (!currentExternalTemplate) return;
    const isInMemory = currentExternalTemplate === projectLoadedExternalTemplate
        || currentExternalTemplate.temporary
        || !currentExternalTemplate.id;
    if (isInMemory) {
        await applyProjectExternalTemplate(currentExternalTemplate);
        return;
    }
    const id = currentExternalTemplate.id;
    await setCurrentExternalTemplate(id);
    if (!currentExternalTemplate) {
        // IDB から消えていた場合は標準テンプレへ戻して select と状態を同期
        if (typeof window.resetToStandardTemplate === 'function') await window.resetToStandardTemplate();
        return;
    }
    if (typeof updateSidebarTemplateStatus === 'function') updateSidebarTemplateStatus();
}
window.reloadCurrentExternalTemplate = reloadCurrentExternalTemplate;

// 外部テンプレを IDB へ保存した直後に呼ぶ: 保存したテンプレが適用中なら
// メモリ状態を再読込して Edit/Preview へ即反映する (テンプレ切替不要にする)
async function syncAppliedExternalTemplateAfterSave(id) {
    if (!id || !currentExternalTemplate) return;
    if (currentExternalTemplate.id !== id) return;
    // 一時 / Project由来テンプレは IDB と別管理なので対象外
    if (currentExternalTemplate === projectLoadedExternalTemplate || currentExternalTemplate.temporary) return;
    await setCurrentExternalTemplate(id);
    if (typeof updateSidebarTemplateStatus === 'function') updateSidebarTemplateStatus();
    if (typeof currentMode !== 'undefined' && currentMode === 'preview'
        && typeof updateTemplatePreview === 'function') updateTemplatePreview();
    if (typeof drawAll === 'function') drawAll();
}
window.syncAppliedExternalTemplateAfterSave = syncAppliedExternalTemplateAfterSave;

// Project HTML 由来テンプレのインメモリキャッシュ (再選択時に IDB を引かず復元するため)
let projectLoadedExternalTemplate = null;

// プロジェクトHTML (P1-b) からのインメモリ復元用。
// IndexedDB には書き込まず、現在のテンプレ状態だけを差し替える。
// tpl: { id?, name, image (dataURL), imageWidth, imageHeight, bboxes }
async function applyProjectExternalTemplate(tpl) {
    if (!tpl) {
        currentExternalTemplate = null;
        currentExternalTemplateImage = null;
        currentExternalTemplatePageImages = {};
        if (typeof refreshCustomFieldsSidebar === 'function') refreshCustomFieldsSidebar();
        if (typeof updateSidebarTemplateStatus === 'function') updateSidebarTemplateStatus();
        return;
    }
    projectLoadedExternalTemplate = tpl; // 再選択用にキャッシュ
    currentExternalTemplate = tpl;
    if (tpl.image) {
        try {
            currentExternalTemplateImage = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = tpl.image;
            });
        } catch (e) {
            currentExternalTemplateImage = null;
        }
    } else {
        currentExternalTemplateImage = null;
    }
    // Phase 2: ページ別画像をデコード
    await decodeExternalTemplatePageImages(tpl);
    if (typeof refreshCustomFieldsSidebar === 'function') refreshCustomFieldsSidebar();
    if (typeof updateSidebarTemplateStatus === 'function') updateSidebarTemplateStatus();
}
window.applyProjectExternalTemplate = applyProjectExternalTemplate;

// 改善9: 画像ファイルから一時テンプレ (IDB未保存・Project内のみ) を生成して適用する。
// 既存の Project由来テンプレ機構 (applyProjectExternalTemplate) を流用。
// IDB には保存せず、必要なら後から「ライブラリに保存」で saveProjectTemplateToLibrary() できる。
// dataURL を長辺 maxLong 以下にリサイズ。超過しない場合はそのまま返す。
// 戻り値: { dataUrl, width, height }。出力は mimeType (デフォルト image/png、alpha維持)。
async function resizeTemplateImageDataUrl(dataUrl, options) {
    options = options || {};
    const maxLong = options.maxLong || 4000;
    const mimeType = options.mimeType || 'image/png';
    const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = dataUrl;
    });
    let w = img.naturalWidth, h = img.naturalHeight;
    const longSide = Math.max(w, h);
    if (longSide <= maxLong) {
        return { dataUrl, width: w, height: h };
    }
    const scale = maxLong / longSide;
    w = Math.round(w * scale);
    h = Math.round(h * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL(mimeType, mimeType === 'image/jpeg' ? 0.85 : undefined);
    return { dataUrl: out, width: w, height: h };
}
window.resizeTemplateImageDataUrl = resizeTemplateImageDataUrl;

// File → { image (PNG dataURL), imageWidth, imageHeight, name }
// TGA は tga-io で PNG dataURL に変換 + 長辺4000px制限、それ以外は pickExternalTemplateImage (自動リサイズ)。
async function pickTemplateImageEntry(file) {
    if (typeof window.tgaIo !== 'undefined' && window.tgaIo.isTgaFile && window.tgaIo.isTgaFile(file)) {
        const r = await window.tgaIo.tgaFileToPngData(file);
        // 通常画像と同じ長辺4000px制限を通す (Project HTML肥大化防止)
        const rs = await resizeTemplateImageDataUrl(r.dataUrl, { maxLong: 4000, mimeType: 'image/png' });
        return { image: rs.dataUrl, imageWidth: rs.width || 0, imageHeight: rs.height || 0, name: file.name || '' };
    }
    if (typeof pickExternalTemplateImage === 'function') {
        const p = await pickExternalTemplateImage(file);
        return { image: p.dataUrl, imageWidth: p.width || 0, imageHeight: p.height || 0, name: file.name || '' };
    }
    const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
    });
    const im = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = dataUrl;
    });
    return { image: dataUrl, imageWidth: im.naturalWidth, imageHeight: im.naturalHeight, name: file.name || '' };
}
window.pickTemplateImageEntry = pickTemplateImageEntry;

// 一時テンプレに pageImages エントリ群を適用するコア。
// entries: [{ image, imageWidth, imageHeight, name, pageIndex }]
// - 既存の一時/Project由来テンプレがあれば bboxes 維持で pageImages を追加/差し替え
// - 無ければ新規一時テンプレ作成 + (一時テンプレ) option 追加 + BBoxエディタ全OFF自動オープン
async function applyTemporaryTemplatePageEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return;
    const tr = (typeof t === 'function') ? t : (k, fb) => fb;
    const cur = currentExternalTemplate;
    const addPageMode = !!(cur && isCurrentTemplateProjectDerived());
    let isNewTemplate = false;
    let target;

    if (addPageMode) {
        target = cur;
        target.pageImages = target.pageImages || {};
    } else {
        isNewTemplate = true;
        const baseName = (entries[0].name || 'image').replace(/\.[^.]+$/, '');
        target = {
            id: null,
            temporary: true,
            name: baseName,
            image: entries[0].image,            // fallback
            imageWidth: entries[0].imageWidth || 0,
            imageHeight: entries[0].imageHeight || 0,
            pageImages: {},
            bboxes: {}
        };
    }

    entries.forEach(en => {
        const pi = Math.max(0, en.pageIndex | 0);
        const key = String(pi);
        if (target.pageImages[key]) {
            try { console.warn(`[temp-template] page ${pi} の画像を上書きします`); } catch (e) {}
        }
        target.pageImages[key] = {
            image: en.image,
            imageWidth: en.imageWidth || 0,
            imageHeight: en.imageHeight || 0,
            name: en.name || ''
        };
    });
    if (!target.image) {
        target.image = entries[0].image;
        target.imageWidth = entries[0].imageWidth || 0;
        target.imageHeight = entries[0].imageHeight || 0;
    }

    await applyProjectExternalTemplate(target);

    if (isNewTemplate) {
        const sel = document.getElementById('template-select');
        const group = document.getElementById('template-select-external-group') || sel;
        if (sel && group) {
            Array.from(sel.querySelectorAll('option'))
                .filter(o => o.dataset && o.dataset.projectLoaded === '1')
                .forEach(o => o.remove());
            const opt = document.createElement('option');
            opt.value = 'ext:__temp_template__';
            opt.textContent = `${tr('extTpl.temp.labelPrefix', '(一時テンプレ)')} ${target.name}`.trim();
            opt.dataset.projectLoaded = '1';
            opt.dataset.temp = '1';
            group.appendChild(opt);
            sel.value = opt.value;
        }
    }

    if (typeof updateSidebarTemplateStatus === 'function') updateSidebarTemplateStatus();
    if (typeof refreshCustomFieldsSidebar === 'function') refreshCustomFieldsSidebar();
    if (typeof updateTemplatePreview === 'function' && typeof currentMode !== 'undefined' && currentMode === 'preview') {
        updateTemplatePreview();
    }
    if (typeof drawAll === 'function') drawAll();
    if (typeof markDirty === 'function') markDirty();

    if (typeof showToast === 'function') {
        showToast(isNewTemplate
            ? tr('extTpl.temp.applied', '一時テンプレートを適用しました')
            : tr('extTpl.temp.pageImageSet', '現在ページの一時テンプレ画像を更新しました'));
    }
    // 新規作成時のみ BBoxエディタを自動で開く (全タグOFF)
    if (isNewTemplate && typeof openBBoxEditor === 'function') {
        openBBoxEditor(null, { inMemoryTemplate: currentExternalTemplate, initialAllOff: true });
    }
}
window.applyTemporaryTemplatePageEntries = applyTemporaryTemplatePageEntries;

// 単一ファイル → 現在ページに一時テンプレ画像を設定 (サイドバーボタン / 単数D&D)
async function applyTemporaryExternalTemplateFromImage(file) {
    if (!file) return;
    let entry;
    try {
        entry = await pickTemplateImageEntry(file);
    } catch (e) {
        const tr = (typeof t === 'function') ? t : (k, fb) => fb;
        alert(tr('extTpl.temp.loadFailed', '画像の読み込みに失敗しました: ') + (e && e.message ? e.message : e));
        return;
    }
    const pageIdx = (typeof currentPage === 'number' && currentPage >= 0) ? currentPage : 0;
    entry.pageIndex = pageIdx;
    await applyTemporaryTemplatePageEntries([entry]);
}
window.applyTemporaryExternalTemplateFromImage = applyTemporaryExternalTemplateFromImage;

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
    columnHeaderDefaults: COLUMN_HEADER_DEFAULTS,
    resolveColumnHeader:  resolveColumnHeaderConfig,
    resolveSheetTypeLabels: resolveSheetTypeLabels,
    syncGroups:  BBOX_SYNC_GROUPS,
    getSyncPeers: getBBoxSyncPeers,
    isSyncEnabled: isBBoxSyncEnabled,
    applySizeSync: applyBBoxSizeSync,
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
    // 再構築前の選択値を保持 (optgroup innerHTML 差替でselect.valueが失われるのを防ぐ)
    const sel = document.getElementById('template-select');
    const prevValue = sel ? sel.value : '';
    // バグ1修正: Project HTML 由来の仮 option (dataset.projectLoaded) を退避し、
    // innerHTML 差し替えで消えないよう再付与する。
    const preservedProjectOptions = Array.from(group.querySelectorAll('option'))
        .filter(o => o.dataset && o.dataset.projectLoaded === '1');
    if (!window.externalTemplate || typeof window.externalTemplate.list !== 'function') {
        group.innerHTML = '';
        preservedProjectOptions.forEach(o => group.appendChild(o));
        if (sel && prevValue) {
            const stillThere = Array.from(sel.options).some(o => o.value === prevValue);
            if (stillThere) sel.value = prevValue;
        }
        return;
    }
    try {
        const items = await window.externalTemplate.list();
        group.innerHTML = items.map(t => {
            const esc = (t.name || '無名').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<option value="ext:${t.id}">${esc}</option>`;
        }).join('');
        // 退避した Project 由来 option を末尾に戻す
        preservedProjectOptions.forEach(o => group.appendChild(o));
        // 選択値の復元: 直前値がまだ存在するなら復元 (ext:id / project由来 両対応)
        if (sel && prevValue) {
            const stillThere = Array.from(sel.options).some(o => o.value === prevValue);
            if (stillThere) sel.value = prevValue;
        }
    } catch (err) {
        console.error('外部テンプレート一覧取得失敗:', err);
        group.innerHTML = '';
        preservedProjectOptions.forEach(o => group.appendChild(o));
        if (sel && prevValue) {
            const stillThere = Array.from(sel.options).some(o => o.value === prevValue);
            if (stillThere) sel.value = prevValue;
        }
    }
}

// バグ1修正: 標準A3テンプレートへ確実に復帰する。
// dropdown 表示と内部状態がズレていても、内部状態・select・preview を強制同期する。
async function resetToStandardTemplate() {
    if (typeof setCurrentExternalTemplate === 'function') {
        await setCurrentExternalTemplate(null);
    } else {
        currentExternalTemplate = null;
        currentExternalTemplateImage = null;
    }
    const sel = document.getElementById('template-select');
    if (sel) sel.value = 'default';
    if (typeof updateSidebarTemplateStatus === 'function') updateSidebarTemplateStatus();
    if (typeof refreshCustomFieldsSidebar === 'function') refreshCustomFieldsSidebar();
    if (typeof updateTemplatePreview === 'function' && typeof currentMode !== 'undefined' && currentMode === 'preview') {
        updateTemplatePreview();
    }
    if (typeof drawAll === 'function') drawAll();
}
window.resetToStandardTemplate = resetToStandardTemplate;
window.refreshTemplateSelectExternalOptions = refreshTemplateSelectExternalOptions;

// 現在のテンプレが Project HTML 由来 (IDB 未保存の仮テンプレ) かどうか判定。
// template-select の選択 option の dataset.projectLoaded と内部キャッシュを併用。
function isCurrentTemplateProjectDerived() {
    if (!currentExternalTemplate) return false;
    const sel = document.getElementById('template-select');
    if (sel) {
        const opt = Array.from(sel.options).find(o => o.value === sel.value);
        if (opt && opt.dataset && opt.dataset.projectLoaded === '1') return true;
    }
    // フォールバック: キャッシュと一致し、IDB 用の正規 id を持たない場合も Project 由来とみなす
    if (projectLoadedExternalTemplate && currentExternalTemplate === projectLoadedExternalTemplate) {
        return true;
    }
    return false;
}
window.isCurrentTemplateProjectDerived = isCurrentTemplateProjectDerived;

// サイドバー: 設定/BBox編集/ローカル保存 ボタンの有効/表示状態をテンプレ選択に同期
// (現在テンプレの表示は <select> 自体が担うので独立ステータスは設けない)
function updateSidebarTemplateStatus() {
    const settingsBtn = document.getElementById('sidebar-template-settings-btn');
    const bboxBtn = document.getElementById('sidebar-template-bbox-btn');
    const saveLocalBtn = document.getElementById('sidebar-template-save-local-btn');
    const tpl = currentExternalTemplate;
    if (tpl) {
        if (settingsBtn) settingsBtn.classList.remove('disabled');
        if (bboxBtn) bboxBtn.style.display = '';
    } else {
        if (settingsBtn) settingsBtn.classList.add('disabled');
        if (bboxBtn) bboxBtn.style.display = 'none';
    }
    // ローカル保存ボタンは Project HTML 由来テンプレ選択時のみ表示
    if (saveLocalBtn) {
        saveLocalBtn.style.display = isCurrentTemplateProjectDerived() ? '' : 'none';
    }
}
window.updateSidebarTemplateStatus = updateSidebarTemplateStatus;

// Project HTML 由来テンプレを IndexedDB ライブラリへ保存する。
// 同名がある場合: confirm 2段 (上書き / 別名連番 / キャンセル)。
async function saveProjectTemplateToLibrary() {
    const src = currentExternalTemplate;
    if (!src) return;
    if (!isCurrentTemplateProjectDerived()) return;

    const tr = (typeof t === 'function') ? t : (k) => k;
    const baseName = (src.name || '').trim() || tr('extTpl.newTemplateName');

    let existing = [];
    try { existing = await listExternalTemplates(); } catch (e) { existing = []; }
    const sameName = existing.filter(x => (x.name || '') === baseName);

    const now = Date.now();
    let saveId = generateTemplateId();
    let saveName = baseName;
    let createdAt = now;

    if (sameName.length > 0) {
        // 1段目: 上書き確認
        const overwrite = confirm(tr('extTpl.saveLocal.confirmOverwrite').replace('{name}', baseName));
        if (overwrite) {
            saveId = sameName[0].id;
            createdAt = sameName[0].createdAt || now;
        } else {
            // 2段目: 別名保存確認
            const renameOk = confirm(tr('extTpl.saveLocal.confirmRename'));
            if (!renameOk) return; // キャンセル
            // 連番サフィックス: 既存名と衝突しない最初の番号
            const allNames = new Set(existing.map(x => x.name || ''));
            let n = 2;
            while (allNames.has(`${baseName} (${n})`)) n++;
            saveName = `${baseName} (${n})`;
            saveId = generateTemplateId();
            createdAt = now;
        }
    }

    const tpl = {
        id: saveId,
        name: saveName,
        image: src.image || null,
        imageWidth: src.imageWidth || 0,
        imageHeight: src.imageHeight || 0,
        createdAt: createdAt,
        updatedAt: now,
        bboxes: JSON.parse(JSON.stringify(src.bboxes || {}))
    };

    try {
        await saveExternalTemplate(tpl);
    } catch (e) {
        alert(tr('extTpl.saveLocal.failed') + (e && e.message ? e.message : e));
        return;
    }

    // 仮 projectLoaded option を削除
    const sel = document.getElementById('template-select');
    if (sel) {
        Array.from(sel.querySelectorAll('option'))
            .filter(o => o.dataset && o.dataset.projectLoaded === '1')
            .forEach(o => o.remove());
    }
    // projectLoaded キャッシュをクリア (もう仮ではない)
    projectLoadedExternalTemplate = null;

    // 一覧再構築 → 正規 option を選択 → IDB から正規テンプレとして再ロード
    await refreshTemplateSelectExternalOptions();
    if (sel) sel.value = `ext:${saveId}`;
    await setCurrentExternalTemplate(saveId);

    updateSidebarTemplateStatus();
    if (typeof refreshCustomFieldsSidebar === 'function') refreshCustomFieldsSidebar();
    if (typeof updateTemplatePreview === 'function' && typeof currentMode !== 'undefined' && currentMode === 'preview') {
        updateTemplatePreview();
    }
    if (typeof drawAll === 'function') drawAll();

    if (typeof showToast === 'function') {
        showToast(tr('extTpl.saveLocal.done').replace('{name}', saveName));
    }
}
window.saveProjectTemplateToLibrary = saveProjectTemplateToLibrary;

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
            // Project HTML 由来の仮 option はキャッシュから復元 (IDB を引くと取得失敗で消える)
            const selectedOpt = Array.from(e.target.options).find(o => o.value === v);
            if (selectedOpt && selectedOpt.dataset && selectedOpt.dataset.projectLoaded === '1'
                && projectLoadedExternalTemplate) {
                await applyProjectExternalTemplate(projectLoadedExternalTemplate);
                updateSidebarTemplateStatus();
                if (typeof updateTemplatePreview === 'function' && typeof currentMode !== 'undefined' && currentMode === 'preview') updateTemplatePreview();
                return;
            }
            const id = v.substring(4);
            await setCurrentExternalTemplate(id);
            updateSidebarTemplateStatus();
            if (typeof updateTemplatePreview === 'function') updateTemplatePreview();
            return;
        }
        // 標準テンプレート選択時は外部テンプレートを解除 (バグ1修正: 強制同期ヘルパー使用)
        await resetToStandardTemplate();
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
            if (typeof openBBoxEditor !== 'function') return;
            // Project由来 / 一時テンプレ (IDB未保存) はインメモリ編集モードで開く
            if (isCurrentTemplateProjectDerived()) {
                openBBoxEditor(null, { inMemoryTemplate: tpl });
            } else {
                openBBoxEditor(tpl.id);
            }
        });
    }
    // ライブラリに保存ボタン: Project HTML 由来テンプレ選択時のみ表示
    const saveLocalBtn = document.getElementById('sidebar-template-save-local-btn');
    if (saveLocalBtn) {
        saveLocalBtn.addEventListener('click', () => {
            saveProjectTemplateToLibrary();
        });
    }
    // 一時テンプレ読込ボタン: 常に表示。画像を選んでインメモリ適用 (改善9)
    const tempLoadBtn = document.getElementById('sidebar-template-temp-load-btn');
    const tempFileInput = document.getElementById('temp-template-file-input');
    if (tempLoadBtn && tempFileInput) {
        tempLoadBtn.addEventListener('click', () => {
            tempFileInput.value = '';
            tempFileInput.click();
        });
        tempFileInput.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            await applyTemporaryExternalTemplateFromImage(file);
            e.target.value = '';
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
    // gengaDouga: '2'側は同一フレーム範囲の別領域 (動画) なのでフレーム容量は '1'側のみ。
    // none/pageChunks: '1'+'2' (action2 は時間継続)。
    const mode = tpl.columnOverflowMode || 'none';
    if (mode === 'gengaDougaSplitPage' || mode === 'gengaDougaSeparatePages' || mode === 'gengaDougaAuto') {
        return getMaxFrames('1');
    }
    return getMaxFrames('1') + getMaxFrames('2');
}
window.getExternalTemplateSheetCapacity = getExternalTemplateSheetCapacity;

// ─── columns超過対応 Phase B: pageChunks ─────────────────────────────────────

// 実使用列数 (max index + 1)。cellData / dialogue / camera / BOOK / customRepeats を走査
function getUsedColumnCount(type) {
    const upper = String(type || '').toUpperCase();
    let maxIdx = -1;
    if (typeof cellData !== 'undefined' && typeof parseCellKey === 'function') {
        for (const key in cellData) {
            const p = parseCellKey(key);
            if (!p || p[0] !== upper) continue;
            const d = cellData[key];
            if (!d || !d.value) continue;
            const ci = parseInt(p[1], 10);
            if (!isNaN(ci) && ci > maxIdx) maxIdx = ci;
        }
    }
    if (upper === 'SOUND' && typeof dialogueBlocks !== 'undefined' && Array.isArray(dialogueBlocks)) {
        dialogueBlocks.forEach(b => { if (typeof b.colIndex === 'number' && b.colIndex > maxIdx) maxIdx = b.colIndex; });
    }
    if (upper === 'CAMERA' && typeof cameraBlocks !== 'undefined' && Array.isArray(cameraBlocks)) {
        cameraBlocks.forEach(b => {
            const last = (b.colIndex || 0) + ((b.colspan || 1) - 1);
            if (last > maxIdx) maxIdx = last;
        });
    }
    if (upper === 'ACTION' && typeof booksData !== 'undefined' && booksData && booksData['ACTION']) {
        Object.keys(booksData['ACTION']).forEach(k => {
            const ci = parseInt(k, 10);
            const arr = booksData['ACTION'][k];
            if (!isNaN(ci) && Array.isArray(arr) && arr.length && ci > maxIdx) maxIdx = ci;
        });
    }
    if (typeof customRepeats !== 'undefined' && Array.isArray(customRepeats)) {
        customRepeats.forEach(rep => {
            if (rep.colType === upper && typeof rep.colIndex === 'number' && rep.colIndex > maxIdx) maxIdx = rep.colIndex;
        });
    }
    return maxIdx + 1;
}
window.getUsedColumnCount = getUsedColumnCount;

// グループのページあたり列容量。b2有効時は min(cols1, cols2) (チャンク間で列幅を揃えるため)
function getExternalTemplateColumnCapacity(tpl, type) {
    if (!tpl || !tpl.bboxes) return 0;
    const b1 = tpl.bboxes[type + '1'];
    if (!b1 || !b1.enabled) return 0;
    const c1 = b1.columns || 5;
    const b2 = tpl.bboxes[type + '2'];
    if (b2 && b2.enabled) return Math.min(c1, b2.columns || 5);
    return c1;
}
window.getExternalTemplateColumnCapacity = getExternalTemplateColumnCapacity;

// 列チャンク数 (pageChunks モード時のみ >1)。容量は ACTION/CELL のみで決める
function getExternalTemplateChunkCount() {
    const tpl = currentExternalTemplate;
    if (!tpl || getExternalTemplateEffectiveMode() !== 'pageChunks') return 1;
    let chunks = 1;
    ['action', 'cell'].forEach(type => {
        const cap = getExternalTemplateColumnCapacity(tpl, type);
        if (cap <= 0) return;
        const used = getUsedColumnCount(type);
        if (used > cap) chunks = Math.max(chunks, Math.ceil(used / cap));
    });
    return chunks;
}
window.getExternalTemplateChunkCount = getExternalTemplateChunkCount;

// gengaDouga 領域容量: main BBox + continuation BBox の列数合計
function getGengaDougaAreaCapacity(tpl, mainKey, contKey) {
    if (!tpl || !tpl.bboxes) return 0;
    const b = tpl.bboxes[mainKey];
    if (!b || !b.enabled) return 0;
    let cap = b.columns || 5;
    const c = tpl.bboxes[contKey];
    if (c && c.enabled) cap += (c.columns || 5);
    return cap;
}

// 実効モード解決: gengaDougaAuto は列が SplitPage 容量に収まれば SplitPage、
// 収まらなければ SeparatePages。それ以外はそのまま。
function getExternalTemplateEffectiveMode() {
    const tpl = currentExternalTemplate;
    const mode = (tpl && tpl.columnOverflowMode) || 'none';
    if (mode !== 'gengaDougaAuto') return mode;
    if (!tpl || !tpl.bboxes) return 'gengaDougaSplitPage';
    const gengaCap = getGengaDougaAreaCapacity(tpl, 'action1', 'cell1');  // ACTION用 (原画領域)
    const dougaCap = getGengaDougaAreaCapacity(tpl, 'action2', 'cell2');  // CELL用 (動画領域)
    const actionUsed = getUsedColumnCount('action');
    const cellUsed = getUsedColumnCount('cell');
    if (actionUsed <= gengaCap && cellUsed <= dougaCap) return 'gengaDougaSplitPage';
    return 'gengaDougaSeparatePages';
}
window.getExternalTemplateEffectiveMode = getExternalTemplateEffectiveMode;

// 未描画列の検査。描画されない列がある場合 { action, cell } の不足列数を返す。
// none: 容量超過分。pageChunks/Split/Separate: それぞれの最大容量を超える分。
// 戻り値 { actionMissing, cellMissing, total } (0 なら未描画なし)
function getExternalTemplateUnrenderedColumns() {
    const tpl = currentExternalTemplate;
    if (!tpl || !tpl.bboxes) return { actionMissing: 0, cellMissing: 0, total: 0 };
    const mode = getExternalTemplateEffectiveMode();
    const actionUsed = getUsedColumnCount('action');
    const cellUsed = getUsedColumnCount('cell');
    let actionCap = 0, cellCap = 0;
    if (mode === 'none') {
        // action1(+action2) / cell1(+cell2) の合計列容量
        const cap = (a, b) => {
            let c = 0;
            const b1 = tpl.bboxes[a]; if (b1 && b1.enabled) c += (b1.columns || 5);
            const b2 = tpl.bboxes[b]; if (b2 && b2.enabled) c += (b2.columns || 5);
            return c;
        };
        actionCap = cap('action1', 'action2');
        cellCap = cap('cell1', 'cell2');
    } else if (mode === 'pageChunks') {
        // チャンクで全列カバーするので未描画は出ない
        return { actionMissing: 0, cellMissing: 0, total: 0 };
    } else if (mode === 'gengaDougaSplitPage') {
        actionCap = getGengaDougaAreaCapacity(tpl, 'action1', 'cell1');
        cellCap = getGengaDougaAreaCapacity(tpl, 'action2', 'cell2');
    } else if (mode === 'gengaDougaSeparatePages') {
        // 4枠すべてで1系列 → 両系列とも同じ全容量
        const total = ['action1', 'cell1', 'action2', 'cell2'].reduce((s, k) => {
            const b = tpl.bboxes[k]; return s + (b && b.enabled ? (b.columns || 5) : 0);
        }, 0);
        actionCap = total; cellCap = total;
    }
    const actionMissing = Math.max(0, actionUsed - actionCap);
    const cellMissing = Math.max(0, cellUsed - cellCap);
    return { actionMissing, cellMissing, total: actionMissing + cellMissing };
}
window.getExternalTemplateUnrenderedColumns = getExternalTemplateUnrenderedColumns;

// 1フレームページあたりの物理サブページ数
// pageChunks: チャンク数 / SeparatePages: 2 (原画+動画) / それ以外: 1
function getExternalTemplateSubPagesPerFrame() {
    const mode = getExternalTemplateEffectiveMode();
    if (mode === 'pageChunks') return getExternalTemplateChunkCount();
    if (mode === 'gengaDougaSeparatePages') return 2;
    return 1;
}
window.getExternalTemplateSubPagesPerFrame = getExternalTemplateSubPagesPerFrame;

// 物理ページ index → 論理ページ記述子 PageDesc
// { framePage, chunk, sheetKind, isPage0 }
// 並び: フレームページ内でサブページ (chunk / sheetKind) を連続
//   pageChunks:     1-1 → 1-2 → 2-1 → 2-2
//   SeparatePages:  1原 → 1動 → 2原 → 2動
function getExternalTemplatePageDesc(physicalIndex) {
    const hasZero = (typeof hasPage0 === 'function') && hasPage0();
    if (hasZero && physicalIndex === 0) {
        return { framePage: 0, chunk: 0, sheetKind: 'normal', isPage0: true };
    }
    const sub = getExternalTemplateSubPagesPerFrame();
    const idx = Math.max(0, hasZero ? physicalIndex - 1 : physicalIndex);
    const framePage = Math.floor(idx / sub);
    const inner = idx % sub;
    const mode = getExternalTemplateEffectiveMode();
    let chunk = 0;
    let sheetKind = 'normal';
    if (mode === 'pageChunks') chunk = inner;
    else if (mode === 'gengaDougaSeparatePages') sheetKind = (inner === 0) ? 'genga' : 'douga';
    return { framePage, chunk, sheetKind, isPage0: false };
}
window.getExternalTemplatePageDesc = getExternalTemplatePageDesc;

// ページ表記 (currentPage BBox 用)。
// pageChunks: "1-1" 形式 / それ以外 (none/Split/Separate): 物理ページ連番
function getExternalTemplatePageLabel(physicalIndex) {
    const desc = getExternalTemplatePageDesc(physicalIndex);
    if (desc.isPage0) return '0';
    const hasZero = (typeof hasPage0 === 'function') && hasPage0();
    const idx = Math.max(0, hasZero ? physicalIndex - 1 : physicalIndex);  // 0始まりの通常ページ連番
    const mode = getExternalTemplateEffectiveMode();
    if (mode === 'pageChunks') {
        const chunkCount = getExternalTemplateChunkCount();
        if (chunkCount > 1) return `${desc.framePage + 1}-${desc.chunk + 1}`;
        return String(desc.framePage + 1);
    }
    return String(idx + 1);
}
window.getExternalTemplatePageLabel = getExternalTemplatePageLabel;

// 総物理ページ数 = フレームページ数 × サブページ数 (+0ページ)
function getExternalTemplateTotalPages() {
    if (!currentExternalTemplate) return 0;
    const capacity = getExternalTemplateSheetCapacity();
    if (capacity <= 0) return 1;
    if (typeof targetFrames === 'undefined' || !targetFrames || targetFrames <= 0) return 1;
    const framePages = Math.max(1, Math.ceil(targetFrames / capacity));
    const normalPages = framePages * getExternalTemplateSubPagesPerFrame();
    // headMargin有効時は 0ページ目を追加
    const hasZero = (typeof hasPage0 === 'function') && hasPage0();
    return hasZero ? normalPages + 1 : normalPages;
}
window.getExternalTemplateTotalPages = getExternalTemplateTotalPages;

function getExternalTemplatePageStartFrame(pageIndex) {
    const capacity = getExternalTemplateSheetCapacity();
    if (capacity <= 0) return 0;
    const desc = getExternalTemplatePageDesc(pageIndex);
    if (desc.isPage0) {
        // 0ページ: -headMargin から開始
        const headMargin = (typeof getHeadMarginForPage === 'function') ? getHeadMarginForPage() : 0;
        return -headMargin;
    }
    return desc.framePage * capacity;
}
window.getExternalTemplatePageStartFrame = getExternalTemplatePageStartFrame;
