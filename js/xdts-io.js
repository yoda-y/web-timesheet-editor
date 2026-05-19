// === XDTS (exchangeDigitalTimeSheet) I/O ===
//
// 仕様 (XDTSFileFormat_ver10):
//   - prefix: "exchangeDigitalTimeSheet Save Data\n"
//   - fields: 0=CELL, 3=セリフ, 5=カメラワーク
//   - カメラ values 7要素: [指示文字, X, Y, 拡大率, 回転角度, 中心X, 中心Y]
//   - timeTables[]: 複数シート想定（minItems:1）
//   - SYMBOL_TICK_1=○, SYMBOL_TICK_2=●, SYMBOL_NULL_CELL=×, SYMBOL_HYPHEN=継続

// XDTS フィールド <-> 内部 colType
//   XDTSのCELL(0) は原画/動画区別なし → ユーザー選択でACTION/CELL/両方へ
const XDTS_FIELD_TO_COLTYPE = { 0: "CELL", 3: "SOUND", 5: "CAMERA" };
const COLTYPE_TO_XDTS_FIELD = { ACTION: 0, CELL: 0, SOUND: 3, CAMERA: 5 };

// XDTS テキスト → 中間データ
function parseXDTSToRaw(text, opts) {
    opts = opts || { cellTarget: 'both' };
    const prefix1 = "exchangeDigitalTimeSheet Save Data\n";
    const prefix2 = "exchangeDigitalTimeSheet Save Data\r\n";
    if (text.startsWith(prefix1)) text = text.substring(prefix1.length);
    else if (text.startsWith(prefix2)) text = text.substring(prefix2.length);
    const imported = JSON.parse(text);

    // XDTS は header と timeTables が直下
    const header = imported.header || {};
    const tables = imported.timeTables || [];
    if (tables.length === 0) return null;
    const table = tables[0];

    const meta = {};
    meta.cut = header.cut || "";
    meta.scene = header.scene || "";
    meta.title = "";
    meta.subTitle = "";
    meta.creator = "";
    const d = table.duration || 144;
    meta.lengthSec = Math.floor(d / 24).toString();
    meta.lengthFrame = String(d % 24).padStart(2, '0');
    meta.sheetName = table.name || "sheet1";
    const direction = "";

    // セクション(レイヤー名/数)
    const sectionsMeta = JSON.parse(JSON.stringify(sections));
    if (table.timeTableHeaders) table.timeTableHeaders.forEach(th => {
        const xType = XDTS_FIELD_TO_COLTYPE[th.fieldId];
        if (!xType || !th.names) return;
        if (xType === "CELL") {
            // ACTION/CELL の両方に同じ名前を反映（後でユーザーが調整可能）
            if (opts.cellTarget === 'both' || opts.cellTarget === 'action') {
                const a = sectionsMeta.find(s => s.type === "ACTION");
                if (a) { a.cols = th.names.length; a.chars = th.names; }
            }
            if (opts.cellTarget === 'both' || opts.cellTarget === 'cell') {
                const c = sectionsMeta.find(s => s.type === "CELL");
                if (c) { c.cols = th.names.length; c.chars = th.names; }
            }
        } else {
            const sec = sectionsMeta.find(s => s.type === xType);
            if (sec) { sec.cols = th.names.length; sec.chars = th.names; }
        }
    });

    const cellOut = {};
    const dialogueBlocksOut = [];
    const cameraBlocksOut = [];

    if (table.fields) table.fields.forEach(field => {
        const xType = XDTS_FIELD_TO_COLTYPE[field.fieldId];
        if (!xType || !field.tracks) return;
        // CELL の取込先
        const targetTypes = (xType === "CELL")
            ? (opts.cellTarget === 'both' ? ["ACTION", "CELL"] : opts.cellTarget === 'action' ? ["ACTION"] : ["CELL"])
            : [xType];

        field.tracks.forEach(track => {
            const colIdx = track.trackNo;
            let currentDialogue = null, currentCamera = null;
            if (!track.frames) return;
            const sorted = [...track.frames].sort((a, b) => a.frame - b.frame);
            sorted.forEach(fr => {
                if (!(fr.data && fr.data.length > 0 && fr.data[0].values && fr.data[0].values.length > 0)) return;
                const vals = fr.data[0].values;
                let v = vals[0], txt = null;

                if (xType === "SOUND") {
                    if (v === "SYMBOL_HYPHEN") v = "―";
                    else if (vals.length >= 2) { const sp = vals[0]; const co = vals[1]; v = sp; txt = co; }
                } else if (xType === "CAMERA") {
                    // XDTS は最初の値が指示文字（数値ではなくテキスト）
                    if (v === "SYMBOL_HYPHEN") { v = "―"; txt = ""; }
                    else { txt = ""; /* X/Y等は捨てる */ }
                } else {
                    // CELL系（TDTS と同じマッピング: TICK_1=●, TICK_2=○）
                    if (v === "SYMBOL_TICK_1") v = "●";
                    else if (v === "SYMBOL_TICK_2") v = "○";
                    else if (v === "SYMBOL_NULL_CELL") v = "×";
                    else if (v === "SYMBOL_HYPHEN") v = "―";
                    else if ((v === "x" || v === "X") && (xType === "ACTION" || xType === "CELL")) v = "×";
                }

                const isNumeric = /^\d+$/.test(v);
                const ext = fr.data[0];
                let savedOpt = null;
                // 標準 options 配列を最優先
                if (ext.options && Array.isArray(ext.options) && ext.options.length > 0) {
                    const o = ext.options[0];
                    if (o === "OPTION_KEYFRAME" || o === "OPTION_REFERENCEFRAME") savedOpt = o;
                }
                // 後方互換: 旧 _option
                else if (ext._option === 'K') savedOpt = "OPTION_KEYFRAME";
                else if (ext._option === 'R') savedOpt = "OPTION_REFERENCEFRAME";
                const savedFcid = ext.fontColorId || ext._fontColorId || 0;

                targetTypes.forEach(tt => {
                    const autoOpt = (tt === "ACTION" && isNumeric) ? "OPTION_KEYFRAME" : null;
                    cellOut[`${tt}-${colIdx}-${fr.frame}`] = {
                        value: v,
                        option: savedOpt || autoOpt,
                        text: txt,
                        fontColorId: savedFcid
                    };
                });

                // ブロック自動復元
                if (xType === "SOUND") {
                    if (v !== "―" && v !== "" && v !== "×") {
                        // 前ブロックの endFrame は "―" で既に確定済み。上書きしない
                        if (currentDialogue) dialogueBlocksOut.push(currentDialogue);
                        currentDialogue = { id: Date.now() + Math.random(), colIndex: colIdx, speakerName: v, text: txt || "", startFrame: fr.frame, endFrame: fr.frame };
                    } else if (v === "―" && currentDialogue) currentDialogue.endFrame = fr.frame;
                }
                if (xType === "CAMERA") {
                    if (v !== "―" && v !== "" && v !== "×") {
                        if (currentCamera) { currentCamera.endFrame = fr.frame - 1; cameraBlocksOut.push(currentCamera); }
                        let rawKind = v; if (rawKind.includes(',')) rawKind = rawKind.split(',')[0];
                        const vt = (typeof getCameraValueType === 'function') ? getCameraValueType(rawKind) : "freeText";
                        currentCamera = { id: Date.now() + Math.random(), colIndex: colIdx, startFrame: fr.frame, endFrame: fr.frame, kind: rawKind, valueType: vt, value: txt || "", colspan: 1, targetLayers: [], waypoints: [], isInlineEdit: false };
                        if (rawKind === "Rolling" || rawKind === "WipeIN") currentCamera.isInlineEdit = true;
                    } else if (v === "―" && currentCamera) currentCamera.endFrame = fr.frame;
                }
            });
            if (currentDialogue) dialogueBlocksOut.push(currentDialogue);
            if (currentCamera) cameraBlocksOut.push(currentCamera);
        });
    });

    // BOOK は XDTS には無い（仕様外）
    const booksOut = { "ACTION": {}, "SOUND": {}, "CELL": {}, "CAMERA": {} };

    return {
        meta, direction,
        sectionsMeta,
        cellData: cellOut,
        booksData: booksOut,
        dialogueBlocks: dialogueBlocksOut,
        cameraBlocks: cameraBlocksOut,
        customRepeats: []
    };
}

// === XDTS エクスポート ===
window.exportXDTS = async function(arg) {
    const saveAs = arg && arg.saveAs === true;
    if (typeof saveInput === 'function') saveInput();
    if (typeof saveBookInput === 'function') saveBookInput();

    const opts = await openIOModal({
        title: 'エクスポート: XDTS',
        mode: 'export',
        format: 'xdts'
    });
    if (!opts) return;

    // XDTS は仕様上、外部テンプレ情報 (画像/BBox/customFields) を保持できない。
    // 該当データが存在する場合は警告。
    const hasExtTpl = (typeof getCurrentExternalTemplate === 'function') && !!getCurrentExternalTemplate();
    const cfKeys = (metaData && metaData.customFields && typeof metaData.customFields === 'object')
        ? Object.keys(metaData.customFields).filter(k => metaData.customFields[k] !== '' && metaData.customFields[k] != null)
        : [];
    if (hasExtTpl || cfKeys.length > 0) {
        const items = [];
        if (hasExtTpl) items.push('外部テンプレートの紐付け（画像/BBox配置）');
        if (cfKeys.length > 0) items.push(`カスタム項目 (${cfKeys.length}件)`);
        const msg = `XDTS形式では以下の情報を保持できません:\n\n・${items.join('\n・')}\n\n` +
            `これらを保持するには TDTS 形式で保存してください。\n` +
            `このまま XDTS で書き出しますか？`;
        if (!confirm(msg)) return;
    }

    const checks = opts.checks;
    const exportSource = opts.xdtsExportSource;

    // duration
    const duration = (parseInt(metaData.lengthSec, 10) || 0) * 24 + (parseInt(metaData.lengthFrame, 10) || 0) || 144;

    // timeTableHeaders: ACTION/CELL の片方のレイヤー名を CELL(0) に出す
    const headers = [];
    let cellSourceSec = null;
    if (exportSource === 'action' || exportSource === 'merge') cellSourceSec = sections.find(s => s.type === "ACTION");
    else cellSourceSec = sections.find(s => s.type === "CELL");
    if (checks.action || checks.cell) {
        if (cellSourceSec) headers.push({ fieldId: 0, names: cellSourceSec.chars });
    }
    if (checks.sound) {
        const s = sections.find(x => x.type === "SOUND"); if (s) headers.push({ fieldId: 3, names: s.chars });
    }
    if (checks.camera) {
        const s = sections.find(x => x.type === "CAMERA"); if (s) headers.push({ fieldId: 5, names: s.chars });
    }

    // フィールド組み立て
    const fieldsByXdtsId = { 0: {}, 3: {}, 5: {} };
    const colCountByXdts = {
        0: cellSourceSec ? cellSourceSec.cols : 0,
        3: (sections.find(s => s.type === "SOUND") || {}).cols || 0,
        5: (sections.find(s => s.type === "CAMERA") || {}).cols || 0
    };
    for (const fId in fieldsByXdtsId) {
        for (let i = 0; i < colCountByXdts[fId]; i++) fieldsByXdtsId[fId][i] = [];
    }

    // セルデータ → CELL(0)
    if (checks.action || checks.cell) {
        // フレーム毎にACTION/CELL の優先ロジック適用
        const numFr = duration;
        const cols = colCountByXdts[0];
        for (let ci = 0; ci < cols; ci++) {
            for (let f = 0; f < numFr; f++) {
                let pickedKey = null;
                if (exportSource === 'action' && checks.action) pickedKey = `ACTION-${ci}-${f}`;
                else if (exportSource === 'cell' && checks.cell) pickedKey = `CELL-${ci}-${f}`;
                else { // merge
                    if (checks.action && cellData[`ACTION-${ci}-${f}`]) pickedKey = `ACTION-${ci}-${f}`;
                    else if (checks.cell && cellData[`CELL-${ci}-${f}`]) pickedKey = `CELL-${ci}-${f}`;
                }
                if (!pickedKey || !cellData[pickedKey]) continue;
                let v = cellData[pickedKey].value;
                let outV = v;
                // TDTS と同じマッピング: TICK_1=●, TICK_2=○
                if (v === "●") outV = "SYMBOL_TICK_1";
                else if (v === "○") outV = "SYMBOL_TICK_2";
                else if (v === "×") outV = "SYMBOL_NULL_CELL";
                else if (v === "―" || v === "-") outV = "SYMBOL_HYPHEN";
                const dataObj = { id: 0, values: [outV] };
                // 標準形式 options: ["OPTION_KEYFRAME"] / ["OPTION_REFERENCEFRAME"]
                const opt = cellData[pickedKey].option;
                if (opt === "OPTION_KEYFRAME" || opt === "OPTION_REFERENCEFRAME") dataObj.options = [opt];
                const fcid = cellData[pickedKey].fontColorId;
                if (fcid && fcid > 0) dataObj.fontColorId = fcid;
                fieldsByXdtsId[0][ci].push({ frame: f, data: [dataObj] });
            }
        }
    }

    // SOUND
    if (checks.sound) {
        dialogueBlocks.forEach(b => {
            const colI = b.colIndex;
            if (!fieldsByXdtsId[3][colI]) fieldsByXdtsId[3][colI] = [];
            for (let f = b.startFrame; f <= b.endFrame; f++) {
                let vArr;
                if (f === b.startFrame) vArr = [b.speakerName || "", b.text || ""];
                else vArr = ["SYMBOL_HYPHEN"];
                fieldsByXdtsId[3][colI].push({ frame: f, data: [{ id: 0, values: vArr }] });
            }
        });
    }

    // CAMERA: XDTS は7要素 [指示文字, X, Y, 拡大率, 回転, 中心X, 中心Y]
    if (checks.camera) {
        cameraBlocks.forEach(b => {
            const colI = b.colIndex;
            if (!fieldsByXdtsId[5][colI]) fieldsByXdtsId[5][colI] = [];
            const pKind = b.kind.split(' (')[0].trim();
            for (let f = b.startFrame; f <= b.endFrame; f++) {
                if (f === b.startFrame) {
                    let dispTxt = pKind;
                    let extra = b.value || b.freeText || "";
                    if (extra) dispTxt = `${pKind} ${extra}`;
                    // XDTS values: [指示文字, X, Y, 拡大率, 回転, 中心X, 中心Y]
                    fieldsByXdtsId[5][colI].push({ frame: f, data: [{ id: 0, values: [dispTxt, "0", "0", "100", "0", "0", "0"] }] });
                } else {
                    fieldsByXdtsId[5][colI].push({ frame: f, data: [{ id: 0, values: ["SYMBOL_HYPHEN"] }] });
                }
            }
        });
    }

    // fields 配列化
    const fields = [];
    for (const fId of Object.keys(fieldsByXdtsId)) {
        const tracks = [];
        for (const tId in fieldsByXdtsId[fId]) {
            if (fieldsByXdtsId[fId][tId].length > 0) {
                fieldsByXdtsId[fId][tId].sort((a, b) => a.frame - b.frame);
                tracks.push({ trackNo: parseInt(tId), frames: fieldsByXdtsId[fId][tId] });
            }
        }
        if (tracks.length > 0) fields.push({ fieldId: parseInt(fId), tracks });
    }

    const xdts = {
        version: 10,
        header: {
            cut: metaData.cut || "",
            scene: metaData.scene || ""
        },
        timeTables: [{
            duration: duration,
            name: metaData.sheetName || "sheet1",
            timeTableHeaders: headers,
            fields: fields
        }]
    };

    const fileContent = "exchangeDigitalTimeSheet Save Data\n" + JSON.stringify(xdts, null, 4);
    const allSheetData = (typeof exportAllSheetsData === 'function')
        ? exportAllSheetsData()
        : [{ name: metaData.sheetName, color: 0, metaData, cellData, booksData, customRepeats, dialogueBlocks, cameraBlocks, sections, handwritingPages }];
    const hasHandwritingData = (typeof hasHandwritingInSheetsData === 'function') && hasHandwritingInSheetsData(allSheetData);
    // 別名保存時は現在のファイル名を優先
    const fileName = currentFileName
        ? currentFileName.replace(/\.(tdts|xdts)$/i, '') + '.xdts'
        : (typeof buildTimesheetSaveFilename === 'function')
            ? buildTimesheetSaveFilename('xdts')
            : `timesheet${metaData.scene ? `_s${metaData.scene}` : ''}${metaData.cut ? `_cut${metaData.cut}` : ''}.xdts`;
    try {
        if (hasHandwritingData && (saveAs || !currentFileHandle) && !currentDirectoryHandle && window.showDirectoryPicker) {
            const directoryHandle = await window.showDirectoryPicker();
            const handle = await directoryHandle.getFileHandle(fileName, { create: true });
            const writable = await handle.createWritable();
            await writable.write(fileContent);
            await writable.close();
            await saveLastFileHandle('xdts', handle);
            currentFileHandle = handle;
            currentFileFormat = 'xdts';
            currentDirectoryHandle = directoryHandle;
            setCurrentFileName(handle.name || fileName, 'xdts');
            if (typeof saveHandwritingBundleForFile === 'function') {
                await saveHandwritingBundleForFile(fileName, allSheetData, { dpi: 150 });
            }
            if (typeof markClean === 'function') markClean();
            return;
        }
        const savedHandle = await saveFileWithPicker('xdts', fileName, fileContent, {
            description: 'exchange Digital Time Sheet',
            types: { 'application/octet-stream': ['.xdts'] }
        }, { saveAs });
        if (savedHandle && hasHandwritingData && typeof saveHandwritingBundleForFile === 'function') {
            try {
                const ok = await saveHandwritingBundleForFile(savedHandle.name || fileName, allSheetData, { dpi: 150 });
                if (!ok) alert('XDTSは保存しましたが、手書きPNG/INIの保存先フォルダが選択されませんでした。');
            } catch (handwritingErr) {
                console.warn('handwriting auto-save failed', handwritingErr);
                alert('XDTSは保存しましたが、手書きPNG/INIの自動保存に失敗しました。');
            }
        }
        if (typeof markClean === 'function') markClean();
    } catch (err) { if (err.name !== 'AbortError') alert("XDTS 保存に失敗しました。"); }
};
