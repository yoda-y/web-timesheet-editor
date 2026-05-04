// === Import / Export 共通ユーティリティ ===

// ----- 前回保存ファイルハンドル記憶（IndexedDB） -----
// FileSystemFileHandle は localStorage に入れられないため IDB を使う

function _openHandleDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('webTimesheetEditor', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('handles');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveLastFileHandle(format, handle) {
    try {
        const db = await _openHandleDB();
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, format);
        return new Promise(resolve => { tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); });
    } catch (e) { /* 非対応環境は無視 */ }
}

async function getLastFileHandle(format) {
    try {
        const db = await _openHandleDB();
        const tx = db.transaction('handles', 'readonly');
        return await new Promise((resolve) => {
            const req = tx.objectStore('handles').get(format);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (e) { return null; }
}

// 現在編集中のファイル（最後に開いた/保存したハンドル）
let currentFileHandle = null;
let currentFileFormat = null;

// 既存ハンドルへ silent 書き込み（上書き保存）
async function silentSaveToHandle(handle, fileContent) {
    let perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') return false;
    const writable = await handle.createWritable();
    await writable.write(fileContent);
    await writable.close();
    return true;
}

// 保存処理共通ヘルパー
// opts: { saveAs: boolean }
//   saveAs=false (デフォルト) - currentFileHandle があればサイレント書き込み、なければピッカー
//   saveAs=true              - 必ずピッカーを出す
async function saveFileWithPicker(formatKey, suggestedName, fileContent, accept, opts) {
    opts = opts || {};
    const saveAs = opts.saveAs === true;

    // 上書き保存: 同じフォーマットで currentFileHandle があればサイレント書き込み
    if (!saveAs && currentFileHandle && currentFileFormat === formatKey) {
        try {
            const ok = await silentSaveToHandle(currentFileHandle, fileContent);
            if (ok) return currentFileHandle;
        } catch (e) { /* fallthrough to picker */ }
    }

    if (window.showSaveFilePicker) {
        const pickerOpts = { suggestedName, types: [{ description: accept.description, accept: accept.types }] };
        // 前回ハンドル参照（startIn 用）
        const lastHandle = await getLastFileHandle(formatKey);
        if (lastHandle) {
            try {
                let perm = await lastHandle.queryPermission({ mode: 'readwrite' });
                if (perm !== 'granted') perm = await lastHandle.requestPermission({ mode: 'readwrite' });
                if (perm === 'granted') pickerOpts.startIn = lastHandle;
            } catch (e) {}
        }
        const handle = await window.showSaveFilePicker(pickerOpts);
        const writable = await handle.createWritable();
        await writable.write(fileContent);
        await writable.close();
        await saveLastFileHandle(formatKey, handle);
        currentFileHandle = handle;
        currentFileFormat = formatKey;
        return handle;
    } else {
        // フォールバック: a タグダウンロード（同名ファイル上書きはOSダウンロード設定に従う）
        const blob = new Blob([fileContent], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = suggestedName; a.click();
        URL.revokeObjectURL(url);
        return null;
    }
}

// ----- フィールド選択ダイアログを開き、ユーザー選択を Promise で返す -----

let _ioModalResolve = null;

function openIOModal(opts) {
    // opts: { title, mode: 'import'|'export', format: 'tdts'|'xdts', warning?: string }
    const modal = document.getElementById('io-modal');
    document.getElementById('io-modal-title').innerText = opts.title;
    const warnEl = document.getElementById('io-modal-warn');
    if (opts.warning) { warnEl.innerText = opts.warning; warnEl.style.display = 'block'; }
    else warnEl.style.display = 'none';

    // XDTS用UI表示
    document.getElementById('io-xdts-mapping').style.display =
        (opts.format === 'xdts' && opts.mode === 'import') ? 'flex' : 'none';
    document.getElementById('io-xdts-export').style.display =
        (opts.format === 'xdts' && opts.mode === 'export') ? 'flex' : 'none';
    // インポート時のみマージモード表示
    document.getElementById('io-merge-mode').style.display =
        (opts.mode === 'import') ? 'flex' : 'none';

    // チェックボックス初期値: モード/フォーマットに応じて
    document.querySelectorAll('#io-modal input[type=checkbox][data-io]').forEach(cb => {
        cb.checked = true;
        cb.disabled = false;
    });
    // XDTS にはストロボ自動マージは無効
    if (opts.format === 'xdts') {
        const cb = document.querySelector('#io-modal input[type=checkbox][data-io="stroboMerge"]');
        cb.checked = false; cb.disabled = true;
    }
    // XDTS にはACTION欄が無いので、エクスポート時はACTIONチェックを目立たせる注意のみ。インポート時はACTION/CELLの選択は別UI
    modal.style.display = 'flex';
    return new Promise(resolve => { _ioModalResolve = resolve; });
}

function closeIOModal(result) {
    document.getElementById('io-modal').style.display = 'none';
    if (_ioModalResolve) { _ioModalResolve(result); _ioModalResolve = null; }
}

function readIOOptions() {
    const checks = {};
    document.querySelectorAll('#io-modal input[type=checkbox][data-io]').forEach(cb => {
        checks[cb.dataset.io] = cb.checked;
    });
    const xdtsCellTarget = (document.querySelector('input[name="xdtsCellTarget"]:checked') || {}).value || 'both';
    const xdtsExportSource = (document.querySelector('input[name="xdtsExportSource"]:checked') || {}).value || 'action';
    const merge = (document.querySelector('input[name="ioMerge"]:checked') || {}).value || 'new';
    return { checks, xdtsCellTarget, xdtsExportSource, merge };
}

document.getElementById('io-modal-ok').addEventListener('click', () => {
    closeIOModal(readIOOptions());
});
document.getElementById('io-modal-cancel').addEventListener('click', () => closeIOModal(null));
document.getElementById('io-modal').addEventListener('click', (e) => {
    if (e.target.id === 'io-modal') closeIOModal(null);
});

// 全て選択 / 解除トグル
document.getElementById('io-toggle-all').addEventListener('click', () => {
    const cbs = Array.from(document.querySelectorAll('#io-modal input[type=checkbox][data-io]:not(:disabled)'));
    const allChecked = cbs.every(cb => cb.checked);
    cbs.forEach(cb => { cb.checked = !allChecked; });
});

// === ファイル形式判定（プレフィックスで） ===
function detectFileFormat(text) {
    if (text.startsWith("toeiDigitalTimeSheet Save Data")) return 'tdts';
    if (text.startsWith("exchangeDigitalTimeSheet Save Data")) return 'xdts';
    return null;
}

// === フィールド選択結果を踏まえて取り込みデータを既存に反映する ===
// raw: importer が生成した中間データ
// checks: { meta, direction, action, sound, cell, camera, book, stroboMerge }
// mode: 'new' | 'overwrite'
//   new      = 新規タイムシートとして開く（全リセット → チェック項目を取込）
//   overwrite = チェックした項目だけ既存データを破棄 → 取込で差し替え（その他は維持）
function applyImportData(raw, checks, mode) {
    const fieldFlags = { ACTION: checks.action, SOUND: checks.sound, CELL: checks.cell, CAMERA: checks.camera };

    // 複数シートが含まれており「新規」なら、シート配列ごと差し替え
    if (mode === 'new' && raw.sheets && raw.sheets.length > 1 && typeof loadAllSheetsData === 'function') {
        const sheetArr = raw.sheets.map(rs => {
            const meta = rs.meta || {};
            const md = { title: meta.title || "", subTitle: meta.subTitle || "", scene: meta.scene || "", cut: meta.cut || "", lengthSec: meta.lengthSec || "6", lengthFrame: meta.lengthFrame || "00", creator: meta.creator || "", sheetName: rs.name || meta.sheetName || "sheet1", page: "1/1", memo: rs.direction || "" };
            // フィールドフィルタ反映
            const cells = {};
            if (rs.cellData) {
                for (const k in rs.cellData) {
                    const colType = k.split('-')[0];
                    if (!fieldFlags[colType]) continue;
                    cells[k] = rs.cellData[k];
                }
            }
            const books = { ACTION: {}, SOUND: {}, CELL: {}, CAMERA: {} };
            if (checks.book && rs.booksData) {
                for (const t in rs.booksData) if (fieldFlags[t]) books[t] = rs.booksData[t];
            }
            return {
                name: rs.name || md.sheetName,
                color: rs.color || 0,
                metaData: md,
                cellData: cells,
                booksData: books,
                customRepeats: rs.customRepeats || [],
                dialogueBlocks: checks.sound ? (rs.dialogueBlocks || []) : [],
                cameraBlocks: checks.camera ? (rs.cameraBlocks || []) : [],
                sections: rs.sectionsMeta || JSON.parse(JSON.stringify(sections))
            };
        });
        loadAllSheetsData(sheetArr, 0);
        return;
    }

    if (mode === 'new') {
        // 全リセット
        cellData = {};
        booksData = { "ACTION": {}, "SOUND": {}, "CELL": {}, "CAMERA": {} };
        customRepeats = [];
        dialogueBlocks = [];
        cameraBlocks = [];
        metaData = { title: "", subTitle: "", scene: "", cut: "", lengthSec: "6", lengthFrame: "00", creator: "", sheetName: "sheet1", page: "1/1", memo: "" };
        if (raw.sectionsMeta) sections = raw.sectionsMeta;
        if (typeof initSheets === 'function') initSheets();
    } else {
        // overwrite: チェック項目だけ既存をクリア
        if (checks.meta || checks.direction) {
            // メタは個別フィールド単位で上書き（部分上書き）
        }
        // 該当 colType のセルデータをクリア
        for (const k in cellData) {
            const colType = k.split('-')[0];
            if (fieldFlags[colType]) delete cellData[k];
        }
        // BOOK
        if (checks.book) {
            for (const t in booksData) {
                if (fieldFlags[t]) booksData[t] = {};
            }
        }
        // ブロック
        if (checks.sound) dialogueBlocks = [];
        if (checks.camera) cameraBlocks = [];
        // customRepeats は該当 colType だけ残す
        customRepeats = customRepeats.filter(r => !fieldFlags[r.colType]);

        // 該当チェック項目のセクション情報も取込で更新したい場合に対応
        if (raw.sectionsMeta) {
            ['ACTION', 'SOUND', 'CELL', 'CAMERA'].forEach(t => {
                if (!fieldFlags[t]) return;
                const newSec = raw.sectionsMeta.find(s => s.type === t);
                const curSec = sections.find(s => s.type === t);
                if (newSec && curSec) { curSec.cols = newSec.cols; curSec.chars = newSec.chars; }
            });
        }
    }

    // メタ情報の取込（new と overwrite 共通）
    if (checks.meta && raw.meta) Object.assign(metaData, raw.meta);
    if (checks.direction && raw.direction !== undefined) metaData.memo = raw.direction;

    // セルデータ取込
    if (raw.cellData) {
        for (const k in raw.cellData) {
            const colType = k.split('-')[0];
            if (!fieldFlags[colType]) continue;
            cellData[k] = raw.cellData[k];
        }
    }

    // BOOK 取込
    if (checks.book && raw.booksData) {
        for (const t in raw.booksData) {
            if (!fieldFlags[t]) continue;
            booksData[t] = raw.booksData[t];
        }
    }

    // ブロック取込（new/overwrite どちらも、該当配列はすでに空）
    if (checks.sound && raw.dialogueBlocks) dialogueBlocks = dialogueBlocks.concat(raw.dialogueBlocks);
    if (checks.camera && raw.cameraBlocks) cameraBlocks = cameraBlocks.concat(raw.cameraBlocks);
    if (raw.customRepeats && raw.customRepeats.length) customRepeats = customRepeats.concat(raw.customRepeats);
}
