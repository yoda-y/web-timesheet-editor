// === .tdts ファイル 読み込み・書き出し ===

// 単一の timeTable を解析するヘルパー（TDTS本体内の1シート分）
function _parseTDTSSingleTable(header, table, opts) {
    const meta = {};
    meta.cut = header.cut || "";
    meta.scene = header.scene || "";
    meta.creator = table.operatorName || "";
    const rawEpisode = header.episode || "";
    if (rawEpisode.includes(" / ")) { const parts = rawEpisode.split(" / "); meta.title = parts[0]; meta.subTitle = parts.slice(1).join(" / "); }
    else if (rawEpisode.includes("/")) { const parts = rawEpisode.split("/"); meta.title = parts[0]; meta.subTitle = parts.slice(1).join("/"); }
    else { meta.title = rawEpisode; meta.subTitle = ""; }
    const d = table.duration || 144;
    meta.lengthSec = Math.floor(d / 24).toString();
    meta.lengthFrame = String(d % 24).padStart(2, '0');
    meta.sheetName = table.name || "sheet1";
    // _webEditor.customFields の復元 (TDTS仕様外、本家には無視される)
    if (table._webEditor && table._webEditor.customFields && typeof table._webEditor.customFields === 'object') {
        meta.customFields = Object.assign({}, table._webEditor.customFields);
    }
    const direction = table.direction || "";
    // headDummykomas/footDummykomas をマージン設定として記録
    if (typeof settings !== 'undefined' && settings.draw) {
        if (typeof table.headDummykomas === 'number') settings.draw.headMargin = table.headDummykomas;
        if (typeof table.footDummykomas === 'number') settings.draw.tailMargin = table.footDummykomas;
    }

    // セクション(レイヤー名/数)
    const sectionsMeta = JSON.parse(JSON.stringify(sections));
    if (table.timeTableHeaders) table.timeTableHeaders.forEach(th => {
        const colType = REVERSE_FIELD_MAP[th.fieldId];
        const sec = sectionsMeta.find(s => s.type === colType);
        if (sec && th.names) { sec.cols = th.names.length; sec.chars = th.names; }
    });

    // BOOKS
    const booksOut = { "ACTION": {}, "SOUND": {}, "CELL": {}, "CAMERA": {} };
    if (table.books) table.books.forEach(b => {
        const cType = REVERSE_FIELD_MAP[b.fieldId];
        if (cType && b.tracks) b.tracks.forEach(t => {
            if (t.texts && t.texts.length > 0) booksOut[cType][t.trackNo] = [...t.texts].reverse();
        });
    });

    // ブロック (ファイル内の dialogueBlocks/cameraBlocks プロパティを優先)
    let dialogueBlocksOut = table.dialogueBlocks ? JSON.parse(JSON.stringify(table.dialogueBlocks)) : [];
    let cameraBlocksOut = table.cameraBlocks ? JSON.parse(JSON.stringify(table.cameraBlocks)) : [];
    const hasDialogueInFile = (dialogueBlocksOut.length > 0);
    const hasCameraInFile = (cameraBlocksOut.length > 0);

    // 手書きメモ収集（cell-level + header-level）
    const memosOut = [];
    const headerMemo = table.headerMemoImageData ? { imageData: table.headerMemoImageData } : null;

    // セルデータ + ブロック復元
    const cellOut = {};
    if (table.fields) table.fields.forEach(field => {
        const colType = REVERSE_FIELD_MAP[field.fieldId];
        if (!colType || !field.tracks) return;
        field.tracks.forEach(track => {
            const colIdx = track.trackNo;
            let currentDialogue = null, currentCamera = null;
            if (!track.frames) return;
            const sorted = [...track.frames].sort((a, b) => a.frame - b.frame);
            sorted.forEach(fr => {
                if (!(fr.data && fr.data.length > 0 && fr.data[0].values && fr.data[0].values.length > 0)) return;
                const vals = fr.data[0].values;
                let v = vals[0], txt = null;
                if (colType === "SOUND") {
                    if (v === "SYMBOL_HYPHEN") v = "―";
                    else if (vals.length >= 2) { const speaker = vals[0]; const content = vals[1]; v = speaker; txt = content; }
                } else if (colType === "CAMERA") {
                    let cleanV = String(v).replace(/['"]/g, '').trim();
                    if (cleanV === "SYMBOL_HYPHEN") { v = "―"; txt = ""; }
                    else {
                        const parsedId = parseInt(cleanV, 10);
                        if (!isNaN(parsedId) && String(parsedId) === cleanV && TDTS_ID_TO_CAMERA_MAP[parsedId] !== undefined) v = TDTS_ID_TO_CAMERA_MAP[parsedId];
                        else v = cleanV;
                        txt = (hasCameraInFile && vals.length >= 2) ? String(vals[1]).replace(/['"]/g, '').trim() : "";
                    }
                } else {
                    if (v === "SYMBOL_TICK_1") v = "●";
                    else if (v === "SYMBOL_TICK_2") v = "○";
                    else if (v === "SYMBOL_NULL_CELL") v = "×";
                    else if (v === "SYMBOL_HYPHEN") v = "―";
                    // x/X 単体 → × (ACTION/CELL のみ)
                    else if ((v === "x" || v === "X") && (colType === "ACTION" || colType === "CELL")) v = "×";
                }
                let opt = null;
                const ext = fr.data[0];
                // 標準形式の options 配列を最優先
                if (ext.options && Array.isArray(ext.options) && ext.options.length > 0) {
                    const o = ext.options[0];
                    if (o === "OPTION_KEYFRAME" || o === "OPTION_REFERENCEFRAME") opt = o;
                }
                // 後方互換: 旧 _option フィールド
                else if (ext._option === 'K') opt = "OPTION_KEYFRAME";
                else if (ext._option === 'R') opt = "OPTION_REFERENCEFRAME";
                // 自動推定: ACTION で数値
                else if (colType === "ACTION" && /^\d+$/.test(v)) opt = "OPTION_KEYFRAME";
                const fcidIn = ext.fontColorId || 0;
                cellOut[`${colType}-${colIdx}-${fr.frame}`] = { value: v, option: opt, text: txt, fontColorId: fcidIn };
                // cell-level 手書きメモを収集
                if (fr.data[0].memo && fr.data[0].memo.imageData) {
                    memosOut.push({
                        imageData: fr.data[0].memo.imageData,
                        offsetX: fr.data[0].memo.offsetX || 0,
                        offsetY: fr.data[0].memo.offsetY || 0,
                        frame: fr.frame,
                        colType,
                        colIdx
                    });
                }
                // ブロック自動復元
                if (colType === "SOUND" && !hasDialogueInFile) {
                    if (v !== "―" && v !== "" && v !== "SYMBOL_NULL_CELL" && v !== "×") {
                        // 前ブロックの endFrame は "―" で既に確定済み。上書きしない（ギャップを潰さない）
                        if (currentDialogue) dialogueBlocksOut.push(currentDialogue);
                        currentDialogue = { id: Date.now() + Math.random(), colIndex: colIdx, speakerName: v, text: txt || "", startFrame: fr.frame, endFrame: fr.frame };
                    } else if (v === "―" && currentDialogue) currentDialogue.endFrame = fr.frame;
                }
                if (colType === "CAMERA" && !hasCameraInFile) {
                    if (v !== "―" && v !== "" && v !== "SYMBOL_NULL_CELL" && v !== "×") {
                        if (currentCamera) { currentCamera.endFrame = fr.frame - 1; cameraBlocksOut.push(currentCamera); }
                        let rawKind = v; if (rawKind.includes(',')) rawKind = rawKind.split(',')[0];
                        const vt = getCameraValueType(rawKind);
                        currentCamera = { id: Date.now() + Math.random(), colIndex: colIdx, startFrame: fr.frame, endFrame: fr.frame, kind: rawKind, valueType: vt, value: txt || "", colspan: 1, targetLayers: [], waypoints: [], isInlineEdit: false };
                        if (rawKind === "Rolling" || rawKind === "WipeIN") currentCamera.isInlineEdit = true;
                    } else if (v === "―" && currentCamera) currentCamera.endFrame = fr.frame;
                }
            });
            if (currentDialogue && !hasDialogueInFile) dialogueBlocksOut.push(currentDialogue);
            if (currentCamera && !hasCameraInFile) cameraBlocksOut.push(currentCamera);
        });
    });

    // ストロボ自動マージ
    // ファイル内に cameraBlocks が既にあればブロックは完成済みなのでスキップ
    // （フレームデータから自動検出したチャンク列に対してのみ有効）
    if (opts.stroboMerge && !hasCameraInFile) {
        cameraBlocksOut.sort((a, b) => a.colIndex !== b.colIndex ? a.colIndex - b.colIndex : a.startFrame - b.startFrame);
        const merged = []; let i = 0;
        while (i < cameraBlocksOut.length) {
            const b = cameraBlocksOut[i];
            if (b.kind === "Strobo1" || b.kind === "Strobo2") {
                const seq = [b]; let j = i + 1;
                let expectedNextStart = b.endFrame + 1;
                const chunkSize = b.endFrame - b.startFrame + 1;
                while (j < cameraBlocksOut.length) {
                    const nb = cameraBlocksOut[j];
                    if (nb.colIndex === b.colIndex && nb.startFrame === expectedNextStart && (nb.kind === "Strobo1" || nb.kind === "Strobo2")) {
                        const ncs = nb.endFrame - nb.startFrame + 1;
                        if (ncs === chunkSize || j === cameraBlocksOut.length - 1 || (j < cameraBlocksOut.length - 1 && cameraBlocksOut[j + 1].colIndex !== b.colIndex)) {
                            seq.push(nb); expectedNextStart = nb.endFrame + 1; j++;
                            if (ncs !== chunkSize) break;
                        } else break;
                    } else break;
                }
                if (seq.length > 1 || (seq.length === 1 && chunkSize > 0)) {
                    const first = seq[0]; const last = seq[seq.length - 1];
                    merged.push({ id: first.id, colIndex: first.colIndex, startFrame: first.startFrame, endFrame: last.endFrame, kind: first.kind, valueType: "numericFr", numericFr: chunkSize * 2, value: first.value, colspan: 1, targetLayers: first.targetLayers || [], waypoints: [], isInlineEdit: false });
                    i = j; continue;
                }
            }
            merged.push(b); i++;
        }
        cameraBlocksOut = merged;
    }

    return {
        meta, direction,
        sectionsMeta,
        cellData: cellOut,
        booksData: booksOut,
        dialogueBlocks: dialogueBlocksOut,
        cameraBlocks: cameraBlocksOut,
        customRepeats: [],
        memos: memosOut,
        headerMemo
    };
}

// TDTS テキスト → raw データ。複数シートを含む場合 sheets[] を返す。
// 互換のため最初のシートの内容を top-level にも展開
function parseTDTSToRaw(text, opts) {
    opts = opts || { stroboMerge: true };
    const prefix1 = "toeiDigitalTimeSheet Save Data\n";
    const prefix2 = "toeiDigitalTimeSheet Save Data\r\n";
    if (text.startsWith(prefix1)) text = text.substring(prefix1.length);
    else if (text.startsWith(prefix2)) text = text.substring(prefix2.length);
    const imported = JSON.parse(text);
    if (!(imported.timeSheets && imported.timeSheets.length > 0)) return null;

    const allSheets = [];
    imported.timeSheets.forEach((sheet, timeSheetIndex) => {
        const header = sheet.header || {};
        if (sheet.timeTables) {
            sheet.timeTables.forEach(table => {
                const parsed = _parseTDTSSingleTable(header, table, opts);
                if (parsed) {
                    parsed.name = (table.name || 'sheet');
                    parsed.color = table.color || 0;
                    parsed.isSharedCut = imported.timeSheets.length > 1 && timeSheetIndex > 0;
                    allSheets.push(parsed);
                }
            });
        }
    });
    if (allSheets.length === 0) return null;

    const sharedCuts = [];
    imported.timeSheets.forEach(sheet => {
        const cut = String(sheet.header?.cut || '').trim();
        if (cut && !sharedCuts.includes(cut)) sharedCuts.push(cut);
    });
    if (sharedCuts.length > 1) {
        allSheets.forEach(sheet => {
            sheet.meta = sheet.meta || {};
            sheet.meta.sharedCuts = sharedCuts;
        });
    }

    // 互換: 最初のシートを top-level に展開
    const first = allSheets[0];
    const result = Object.assign({}, first, { sheets: allSheets });
    // 手書きデータ有無フラグを伝搬（_webEditor.hasHandwriting）
    if (imported._webEditor && imported._webEditor.hasHandwriting) {
        result._hasHandwriting = true;
    }
    return result;
}

// fileInput change: 自動判定 → ダイアログ → 適用
// XDTSからカット番号を簡易取得
function extractXdtsCut(text) {
    try {
        const prefix1 = "exchangeDigitalTimeSheet Save Data\n";
        const prefix2 = "exchangeDigitalTimeSheet Save Data\r\n";
        let jsonText = text;
        if (text.startsWith(prefix1)) jsonText = text.substring(prefix1.length);
        else if (text.startsWith(prefix2)) jsonText = text.substring(prefix2.length);
        const data = JSON.parse(jsonText);
        // カット番号のみ取得。timeTables[0].name はシート名なのでフォールバックしない
        return data.header?.cut || '';
    } catch (e) { return ''; }
}

document.getElementById('fileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    // 既に同名ファイルが開かれていないかチェック
    if (typeof documentTabs !== 'undefined' && Array.isArray(documentTabs)) {
        const alreadyOpen = documentTabs.find(tab => tab.fileName === file.name);
        if (alreadyOpen) {
            alert(`「${file.name}」は既に開かれています。`);
            if (typeof activateDocumentTab === 'function') activateDocumentTab(alreadyOpen.id);
            e.target.value = '';
            return;
        }
    }
    const reader = new FileReader();
    reader.onload = async function(evt) {
        try {
            const text = evt.target.result;
            // P1-e: プロジェクトHTML / プロジェクトJSON を先に short-circuit
            const lowerName = (file.name || '').toLowerCase();
            const isHtml = lowerName.endsWith('.html') || lowerName.endsWith('.htm');
            const looksProj = (window.projectHtml && (window.projectHtml.looksLikeProjectHTML(text) || window.projectHtml.looksLikeProjectJSON(text)));
            if (isHtml || looksProj) {
                if (typeof isDirty !== 'undefined' && isDirty) {
                    if (!confirm('未保存の変更があります。破棄してプロジェクトを読み込みますか？')) { e.target.value = ''; return; }
                }
                const r = await window.projectHtml.loadFromTextAuto(text, file.name);
                if (!r.ok) { alert('プロジェクト読み込み失敗: ' + (r.error || '')); return; }
                if (r.warnings && r.warnings.length) console.warn('[projectHtml] warnings:', r.warnings);
                if (typeof showToast === 'function') showToast(`${file.name} を読み込みました`);
                e.target.value = '';
                return;
            }
            const fmt = detectFileFormat(text);
            if (!fmt) { alert("読み込みエラー: 対応していないファイル形式です。"); return; }
            const fileName = file.name;
            // XDTSの場合: カット番号を事前取得
            const defaultCut = (fmt === 'xdts') ? extractXdtsCut(text) : '';
            const opts = await openIOModal({
                title: `インポート: ${fileName}`,
                mode: 'import',
                format: fmt,
                source: 'file',
                defaultCut
            });
            if (!opts) return; // キャンセル
            let raw;
            if (fmt === 'tdts') raw = parseTDTSToRaw(text, { stroboMerge: opts.checks.stroboMerge });
            else {
                raw = parseXDTSToRaw(text, { cellTarget: opts.xdtsCellTarget });
                // XDTSの場合: xdtsCellTargetに基づいてACTION/CELLチェックを設定
                opts.checks.action = (opts.xdtsCellTarget === 'both' || opts.xdtsCellTarget === 'action');
                opts.checks.cell = (opts.xdtsCellTarget === 'both' || opts.xdtsCellTarget === 'cell');
                // ユーザーが入力したカット番号を反映
                if (opts.xdtsCut && raw.meta) raw.meta.cut = opts.xdtsCut;
                // 整理ルール: new以外ではmetaを勝手に上書きしない、カット尺は常に取込
                if (opts.merge !== 'new') opts.checks.meta = false;
                opts._forceLength = true;
            }
            if (!raw) { alert("読み込みエラー: ファイル構造が無効です。"); return; }
            if (fmt === 'tdts' && ((raw.memos && raw.memos.length) || raw.headerMemo)) {
                const msg = (typeof t === 'function')
                    ? t('confirm.importTdtsMemos')
                    : 'このTDTSには本家TDTSの手描きメモが含まれています。手書きレイヤーとして読み込みますか？';
                opts._importTdtsMemos = confirm(msg);
            }
            if (opts.merge === 'new' && typeof createDocumentTabForIncomingDocument === 'function') {
                createDocumentTabForIncomingDocument(fileName, fmt, null, null);
            } else {
                // 取込前の状態をUndoスタックに積む（Ctrl+Zで戻れるように）
                pushHistory();
            }
            applyImportData(raw, opts.checks, opts.merge, { forceLength: opts._forceLength, importTdtsMemos: opts._importTdtsMemos });
            // 完全新規(new)のときだけ現在ファイル名/ハンドルを切替。それ以外は既存ドキュメント名を維持。
            if (opts.merge === 'new') {
                currentFileHandle = null;
                currentDirectoryHandle = null;
                setCurrentFileName(fileName, fmt);
                if (typeof syncActiveDocumentTabAfterLoad === 'function') {
                    syncActiveDocumentTabAfterLoad(fileName, fmt, null, null);
                }
                if (typeof markClean === 'function') markClean();
            } else {
                if (typeof markDirty === 'function') markDirty();
            }
            // UI 状態リセット（undoStack は維持）
            redoStack = [];
            selectionStart = null; selectionEnd = null; selectedMeta = null;
            selectedDialogueId = null; selectedCameraId = null;
            cellInput.style.display = 'none'; metaInput.style.display = 'none';
            metaTextArea.style.display = 'none'; bookInput.style.display = 'none';
            updateSectionPositions(); drawAll();
            if (currentMode === 'preview' && typeof updateTemplatePreview === 'function') updateTemplatePreview();
            // 手書きデータ有無の通知（クリックで手書き読み込みダイアログを開く）
            if (raw._hasHandwriting) {
                if (typeof promptImportHandwritingBundleForFile === 'function') {
                    await promptImportHandwritingBundleForFile(fileName);
                    drawAll();
                    if (currentMode === 'preview' && typeof updateTemplatePreview === 'function') updateTemplatePreview();
                }
                showToast && showToast('手書きデータあり - クリックしてPNG読み込み', 8000, () => {
                    if (typeof importHandwritingPngFiles === 'function') importHandwritingPngFiles();
                });
            }
        } catch (err) {
            console.error(err);
            alert("読み込みエラー: " + (err.message || "ファイルが破損している可能性があります。"));
        }
    };
    reader.readAsText(file);
    e.target.accept = '.tdts,.xdts,.json,.html,.htm';
    e.target.value = '';
});

async function openTimesheetFromFolder() {
    if (!window.showDirectoryPicker) {
        alert('このブラウザではフォルダから開く機能を使用できません。通常の「開く...」を使用してください。');
        return;
    }
    try {
        const directoryHandle = await window.showDirectoryPicker();
        const candidates = [];
        for await (const [name, handle] of directoryHandle.entries()) {
            if (handle.kind === 'file' && /\.(tdts|xdts)$/i.test(name)) candidates.push({ name, handle });
        }
        if (candidates.length === 0) {
            alert('選択したフォルダにTDTS/XDTSファイルがありません。');
            return;
        }
        candidates.sort((a, b) => a.name.localeCompare(b.name));
        let selected = candidates[0];
        if (candidates.length > 1) {
            selected = await chooseTimesheetFileFromFolder(candidates);
            if (!selected) return;
        }
        const file = await selected.handle.getFile();
        const text = await file.text();
        const fmt = detectFileFormat(text);
        if (!fmt) {
            alert('対応していないファイル形式です。');
            return;
        }
        // XDTSの場合: カット番号を事前取得
        const defaultCut = (fmt === 'xdts') ? extractXdtsCut(text) : '';
        const opts = await openIOModal({
            title: `読み込み: ${selected.name}`,
            mode: 'import',
            format: fmt,
            source: 'folder',
            defaultCut
        });
        if (!opts) return;
        let raw;
        if (fmt === 'tdts') {
            raw = parseTDTSToRaw(text, { stroboMerge: opts.checks.stroboMerge });
        } else {
            raw = parseXDTSToRaw(text, { cellTarget: opts.xdtsCellTarget });
            // XDTSの場合: xdtsCellTargetに基づいてACTION/CELLチェックを設定
            opts.checks.action = (opts.xdtsCellTarget === 'both' || opts.xdtsCellTarget === 'action');
            opts.checks.cell = (opts.xdtsCellTarget === 'both' || opts.xdtsCellTarget === 'cell');
            // ユーザーが入力したカット番号を反映
            if (opts.xdtsCut && raw.meta) raw.meta.cut = opts.xdtsCut;
            // 整理ルール: new以外ではmetaを勝手に上書きしない、カット尺は常に取込
            if (opts.merge !== 'new') opts.checks.meta = false;
            opts._forceLength = true;
        }
        if (!raw) {
            alert('ファイルを読み込めませんでした。');
            return;
        }
        if (fmt === 'tdts' && ((raw.memos && raw.memos.length) || raw.headerMemo)) {
            const msg = (typeof t === 'function')
                ? t('confirm.importTdtsMemos')
                : 'このTDTSには本家TDTSの手描きメモが含まれています。手書きレイヤーとして読み込みますか？';
            opts._importTdtsMemos = confirm(msg);
        }
        if (opts.merge === 'new' && typeof createDocumentTabForIncomingDocument === 'function') {
            createDocumentTabForIncomingDocument(selected.name, fmt, selected.handle, directoryHandle);
        } else {
            pushHistory();
        }
        applyImportData(raw, opts.checks, opts.merge, { forceLength: opts._forceLength, importTdtsMemos: opts._importTdtsMemos });
        redoStack = [];
        selectionStart = null; selectionEnd = null; selectedMeta = null;
        selectedDialogueId = null; selectedCameraId = null;
        cellInput.style.display = 'none'; metaInput.style.display = 'none';
        metaTextArea.style.display = 'none'; bookInput.style.display = 'none';
        // 手書きデータ自動読み込み（フォルダ内に同名フォルダ+handwriting.iniがあれば）
        if (typeof importHandwritingBundleFromDirectory === 'function') {
            const hwCount = await importHandwritingBundleFromDirectory(directoryHandle, selected.name);
            if (hwCount > 0) {
                console.log(`手書きデータを自動読み込み: ${hwCount}件`);
                showToast && showToast(`手書きデータを自動読み込みしました (${hwCount}件)`);
            }
        }
        // 完全新規(new)のときだけ現在ファイル名/ハンドルを切替。それ以外は既存ドキュメント名を維持。
        if (opts.merge === 'new') {
            currentFileHandle = selected.handle;
            currentFileFormat = fmt;
            currentDirectoryHandle = directoryHandle;
            setCurrentFileName(selected.name, fmt);
            if (typeof syncActiveDocumentTabAfterLoad === 'function') {
                syncActiveDocumentTabAfterLoad(selected.name, fmt, selected.handle, directoryHandle);
            }
            await saveLastFileHandle(fmt, selected.handle);
        }
        updateSectionPositions();
        drawAll();
        if (currentMode === 'preview' && typeof updateTemplatePreview === 'function') updateTemplatePreview();
        // 完全新規(new)のみ markClean。それ以外は既存ドキュメントへの追加/変更なので未保存扱い。
        if (opts.merge === 'new') {
            if (typeof markClean === 'function') markClean();
        } else {
            if (typeof markDirty === 'function') markDirty();
        }
    } catch (err) {
        if (err && err.name === 'AbortError') return;
        console.error(err);
        alert('フォルダからの読み込みに失敗しました: ' + (err.message || '不明なエラー'));
    }
}

function chooseTimesheetFileFromFolder(candidates) {
    return new Promise(resolve => {
        let modal = document.getElementById('folder-open-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'folder-open-modal';
            modal.className = 'settings-modal';
            modal.innerHTML = `
                <div class="settings-modal-inner" style="min-width:360px;">
                    <h3>${typeof t === 'function' ? t('folderOpen.title') : 'フォルダから開く'}</h3>
                    <div class="io-note">${typeof t === 'function' ? t('folderOpen.note') : 'フォルダ内のTDTS/XDTSを選んで開きます。新規で開く場合は、TDTSと同名フォルダ内の手書きPNG/INIも自動で探します。'}</div>
                    <div class="settings-row" style="align-items:flex-start;">
                        <label>${typeof t === 'function' ? t('folderOpen.file') : 'ファイル:'}</label>
                        <select id="folder-open-select" style="flex:1; min-width:220px; background:var(--highlight); color:var(--text-color); border:1px solid var(--grid-thick); padding:4px;"></select>
                    </div>
                    <div class="settings-actions">
                        <button id="folder-open-ok" class="primary">${typeof t === 'function' ? t('btn.open') : '開く'}</button>
                        <button id="folder-open-cancel">${typeof t === 'function' ? t('btn.cancel') : 'キャンセル'}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const select = document.getElementById('folder-open-select');
        select.innerHTML = '';
        candidates.forEach((item, index) => {
            const option = document.createElement('option');
            option.value = String(index);
            option.textContent = item.name;
            select.appendChild(option);
        });

        const cleanup = result => {
            modal.style.display = 'none';
            document.getElementById('folder-open-ok').onclick = null;
            document.getElementById('folder-open-cancel').onclick = null;
            modal.onclick = null;
            resolve(result);
        };

        document.getElementById('folder-open-ok').onclick = () => {
            cleanup(candidates[parseInt(select.value, 10)] || null);
        };
        document.getElementById('folder-open-cancel').onclick = () => cleanup(null);
        modal.onclick = e => {
            if (e.target === modal) cleanup(null);
        };
        modal.style.display = 'flex';
        select.focus();
    });
}

/* === 旧 import コードは削除（parseTDTSToRaw + applyImportData に統合済） === */
/* LEGACY_BEGIN_REMOVED
function _legacyDirectImportTDTS(e) { if (false) {
            if (true) {
                const sheet = imported.timeSheets[0];
                const header = sheet.header || {};
                const table = sheet.timeTables ? sheet.timeTables[0] : {};
                metaData.cut = header.cut || "";
                metaData.scene = header.scene || "";
                metaData.memo = table.direction || "";
                metaData.creator = table.operatorName || "";
                let rawEpisode = header.episode || "";
                if (rawEpisode.includes(" / ")) { let parts = rawEpisode.split(" / "); metaData.title = parts[0]; metaData.subTitle = parts.slice(1).join(" / "); }
                else if (rawEpisode.includes("/")) { let parts = rawEpisode.split("/"); metaData.title = parts[0]; metaData.subTitle = parts.slice(1).join("/"); }
                else { metaData.title = rawEpisode; metaData.subTitle = ""; }

                let d = table.duration || 144;
                metaData.lengthSec = Math.floor(d / 24).toString();
                metaData.lengthFrame = String(d % 24).padStart(2, '0');
                metaData.sheetName = table.name || "sheet1";

                booksData = { "ACTION": {}, "SOUND": {}, "CELL": {}, "CAMERA": {} };
                if (table.books) table.books.forEach(b => {
                    let cType = REVERSE_FIELD_MAP[b.fieldId];
                    if (cType && b.tracks) b.tracks.forEach(t => {
                        if (t.texts && t.texts.length > 0) booksData[cType][t.trackNo] = [...t.texts].reverse();
                    });
                });
                if (table.timeTableHeaders) table.timeTableHeaders.forEach(th => {
                    let colType = REVERSE_FIELD_MAP[th.fieldId];
                    let sec = sections.find(s => s.type === colType);
                    if (sec && th.names) { sec.cols = th.names.length; sec.chars = th.names; }
                });
                cellData = {}; customRepeats = [];

                dialogueBlocks = table.dialogueBlocks ? JSON.parse(JSON.stringify(table.dialogueBlocks)) : [];
                cameraBlocks = table.cameraBlocks ? JSON.parse(JSON.stringify(table.cameraBlocks)) : [];
                const hasDialogueInFile = (dialogueBlocks.length > 0);
                const hasCameraInFile = (cameraBlocks.length > 0);

                if (table.fields) table.fields.forEach(field => {
                    let colType = REVERSE_FIELD_MAP[field.fieldId];
                    if (!colType || !field.tracks) return;
                    field.tracks.forEach(track => {
                        let colIdx = track.trackNo;
                        let currentDialogue = null;
                        let currentCamera = null;
                        if (!track.frames) return;
                        let sortedFrames = [...track.frames].sort((a, b) => a.frame - b.frame);
                        sortedFrames.forEach(fr => {
                            if (fr.data && fr.data.length > 0 && fr.data[0].values && fr.data[0].values.length > 0) {
                                let vals = fr.data[0].values;
                                let v = vals[0], txt = null;

                                if (colType === "SOUND") {
                                    if (v === "SYMBOL_HYPHEN") v = "―";
                                    else if (vals.length >= 2) { let speaker = vals[0]; let content = vals[1]; v = speaker; txt = content; }
                                } else if (colType === "CAMERA") {
                                    let cleanV = String(v).replace(/['"]/g, '').trim();
                                    if (cleanV === "SYMBOL_HYPHEN") {
                                        v = "―"; txt = "";
                                    } else {
                                        let parsedId = parseInt(cleanV, 10);
                                        if (!isNaN(parsedId) && String(parsedId) === cleanV && TDTS_ID_TO_CAMERA_MAP[parsedId] !== undefined) {
                                            v = TDTS_ID_TO_CAMERA_MAP[parsedId];
                                        } else { v = cleanV; }
                                        if (hasCameraInFile && vals.length >= 2) { txt = String(vals[1]).replace(/['"]/g, '').trim(); }
                                        else { txt = ""; }
                                    }
                                } else {
                                    if (v === "SYMBOL_TICK_1") v = "●";
                                    else if (v === "SYMBOL_TICK_2") v = "○";
                                    else if (v === "SYMBOL_NULL_CELL") v = "×";
                                    else if (v === "SYMBOL_HYPHEN") v = "―";
                                    else if ((v === "x" || v === "X") && (colType === "ACTION" || colType === "CELL")) v = "×";
                                }

                                let opt = null;
                                if (colType === "ACTION" && /^\d+$/.test(v)) opt = "OPTION_KEYFRAME";
                                cellData[`${colType}-${colIdx}-${fr.frame}`] = { value: v, option: opt, text: txt };

                                if (colType === "SOUND" && !hasDialogueInFile) {
                                    if (v !== "―" && v !== "" && v !== "SYMBOL_NULL_CELL" && v !== "×") {
                                        // 前ブロックの endFrame は "―" で既に確定済み。上書きしない
                                        if (currentDialogue) dialogueBlocks.push(currentDialogue);
                                        currentDialogue = { id: Date.now() + Math.random(), colIndex: colIdx, speakerName: v, text: txt || "", startFrame: fr.frame, endFrame: fr.frame };
                                    } else if (v === "―" && currentDialogue) { currentDialogue.endFrame = fr.frame; }
                                }

                                if (colType === "CAMERA" && !hasCameraInFile) {
                                    if (v !== "―" && v !== "" && v !== "SYMBOL_NULL_CELL" && v !== "×") {
                                        if (currentCamera) { currentCamera.endFrame = fr.frame - 1; cameraBlocks.push(currentCamera); }
                                        let rawKind = v;
                                        if (rawKind.includes(',')) rawKind = rawKind.split(',')[0];
                                        let vt = getCameraValueType(rawKind);
                                        currentCamera = {
                                            id: Date.now() + Math.random(), colIndex: colIdx, startFrame: fr.frame, endFrame: fr.frame,
                                            kind: rawKind, valueType: vt, value: txt || "", colspan: 1, targetLayers: [], waypoints: [], isInlineEdit: false
                                        };
                                        if (rawKind === "Rolling" || rawKind === "WipeIN") currentCamera.isInlineEdit = true;
                                    } else if (v === "―" && currentCamera) { currentCamera.endFrame = fr.frame; }
                                }
                            }
                        });
                        if (currentDialogue && !hasDialogueInFile) dialogueBlocks.push(currentDialogue);
                        if (currentCamera && !hasCameraInFile) cameraBlocks.push(currentCamera);
                    });
                });

                cameraBlocks.sort((a, b) => a.colIndex !== b.colIndex ? a.colIndex - b.colIndex : a.startFrame - b.startFrame);
                let mergedCameraBlocks = [];
                let i = 0;
                while (i < cameraBlocks.length) {
                    let b = cameraBlocks[i];
                    if (b.kind === "Strobo1" || b.kind === "Strobo2") {
                        let seq = [b]; let j = i + 1;
                        let expectedNextKind = b.kind === "Strobo1" ? "Strobo2" : "Strobo1";
                        let expectedNextStart = b.endFrame + 1;
                        let chunkSize = b.endFrame - b.startFrame + 1;
                        while (j < cameraBlocks.length) {
                            let nextB = cameraBlocks[j];
                            if (nextB.colIndex === b.colIndex && nextB.startFrame === expectedNextStart && (nextB.kind === "Strobo1" || nextB.kind === "Strobo2")) {
                                let nextChunkSize = nextB.endFrame - nextB.startFrame + 1;
                                if (nextChunkSize === chunkSize || (j === cameraBlocks.length - 1) || (j < cameraBlocks.length - 1 && cameraBlocks[j + 1].colIndex !== b.colIndex)) {
                                    seq.push(nextB);
                                    expectedNextKind = expectedNextKind === "Strobo1" ? "Strobo2" : "Strobo1";
                                    expectedNextStart = nextB.endFrame + 1;
                                    j++;
                                    if (nextChunkSize !== chunkSize) break;
                                } else { break; }
                            } else { break; }
                        }
                        if (seq.length > 1 || (seq.length === 1 && chunkSize > 0)) {
                            let firstB = seq[0]; let lastB = seq[seq.length - 1];
                            mergedCameraBlocks.push({ id: firstB.id, colIndex: firstB.colIndex, startFrame: firstB.startFrame, endFrame: lastB.endFrame, kind: firstB.kind, valueType: "numericFr", numericFr: chunkSize * 2, value: firstB.value, colspan: 1, targetLayers: firstB.targetLayers || [], waypoints: [], isInlineEdit: false });
                            i = j; continue;
                        }
                    }
                    mergedCameraBlocks.push(b); i++;
                }
                cameraBlocks = mergedCameraBlocks;

                undoStack = []; redoStack = [];
                selectionStart = null; selectionEnd = null; selectedMeta = null;
                selectedDialogueId = null; selectedCameraId = null;
                cellInput.style.display = 'none'; metaInput.style.display = 'none';
                metaTextArea.style.display = 'none'; bookInput.style.display = 'none';
                updateSectionPositions(); drawAll();
            }
        } catch (err) { console.error(err); alert("読み込みエラー: ファイルが破損している可能性があります。"); }
    };
    reader.readAsText(file);
    e.target.value = '';
} }
LEGACY_END_REMOVED */

// 1シート分の timeTable JSON を組み立て
function _buildTDTSTimeTable(sheetData, checks) {
    const md = sheetData.metaData;
    const sx = sheetData.sections;
    const cells = sheetData.cellData;
    const books = sheetData.booksData;
    const dialogues = sheetData.dialogueBlocks;
    const cameras = sheetData.cameraBlocks;

    const duration = (parseInt(md.lengthSec) || 0) * 24 + (parseInt(md.lengthFrame) || 0);
    const fieldEnabled = { ACTION: checks.action, SOUND: checks.sound, CELL: checks.cell, CAMERA: checks.camera };

    let outBooks = [];
    if (checks.book) {
        for (let cType in books) {
            if (!fieldEnabled[cType]) continue;
            let fId = FIELD_MAP[cType]; if (fId === undefined) continue;
            let tracks = [];
            for (let tNo in books[cType]) if (books[cType][tNo] && books[cType][tNo].length > 0) tracks.push({ "trackNo": parseInt(tNo), "texts": [...books[cType][tNo]].reverse() });
            if (tracks.length > 0) outBooks.push({ "fieldId": fId, "tracks": tracks });
        }
    }
    let outHeaders = [];
    sx.forEach(s => {
        if (!fieldEnabled[s.type]) return;
        let fId = FIELD_MAP[s.type]; if (fId !== undefined) outHeaders.push({ "fieldId": fId, "names": s.chars });
    });

    const exportCameraBlocks = checks.camera ? cameras.map(b => { let e = JSON.parse(JSON.stringify(b)); e.kind = e.kind.split(' (')[0].trim(); return e; }) : [];
    const exportDialogueBlocks = checks.sound ? dialogues : [];

    let fieldsObj = {};
    for (let sec of sx) {
        if (!fieldEnabled[sec.type]) continue;
        let fId = FIELD_MAP[sec.type]; if (fId === undefined) continue;
        fieldsObj[fId] = {};
        for (let i = 0; i < sec.cols; i++) fieldsObj[fId][i] = [];
    }

    for (let key in cells) {
        const _kp = parseCellKey(key); if (!_kp) continue; let colType = _kp[0], colIdx = _kp[1], frame = _kp[2];
        colIdx = parseInt(colIdx); frame = parseInt(frame);
        if (colType === "SOUND" || colType === "CAMERA") continue;
        if (!fieldEnabled[colType]) continue;
        let fieldId = FIELD_MAP[colType]; if (fieldId === undefined) continue;
        let val = cells[key].value, outVal = val;
        if (val === "●") outVal = "SYMBOL_TICK_1";
        else if (val === "○") outVal = "SYMBOL_TICK_2";
        else if (val === "×") outVal = "SYMBOL_NULL_CELL";
        else if (val === "―" || val === "-") outVal = "SYMBOL_HYPHEN";
        const fontColorId = cells[key].fontColorId || 0;
        const dataObj = { "fontColorId": fontColorId, "id": 0, "values": [outVal] };
        const opt = cells[key].option;
        if (opt === "OPTION_KEYFRAME" || opt === "OPTION_REFERENCEFRAME") dataObj.options = [opt];
        fieldsObj[fieldId][colIdx].push({ "frame": frame, "data": [dataObj] });
    }

    let sndFid = FIELD_MAP["SOUND"];
    if (checks.sound && fieldsObj[sndFid]) dialogues.forEach(b => {
        let colI = b.colIndex;
        if (!fieldsObj[sndFid][colI]) fieldsObj[sndFid][colI] = [];
        for (let f = b.startFrame; f <= b.endFrame; f++) {
            let vArr = ["SYMBOL_HYPHEN"];
            if (f === b.startFrame) vArr = [b.speakerName || "", b.text || ""];
            fieldsObj[sndFid][colI].push({ "frame": f, "data": [{ "fontColorId": 0, "id": 0, "values": vArr }] });
        }
    });

    let camFid = FIELD_MAP["CAMERA"];
    if (checks.camera && fieldsObj[camFid]) cameras.forEach(b => {
        let colI = b.colIndex;
        if (!fieldsObj[camFid][colI]) fieldsObj[camFid][colI] = [];
        let pKind = b.kind.split(' (')[0].trim();
        if (b.valueType === 'numericFr' && (pKind === "Strobo1" || pKind === "Strobo2")) {
            let chunkSize = Math.max(1, Math.floor((b.numericFr || 4) / 2));
            for (let f = b.startFrame; f <= b.endFrame; f++) {
                let vArr = ["SYMBOL_HYPHEN"];
                let chunkIndex = Math.floor((f - b.startFrame) / chunkSize);
                let isKind1 = (pKind === "Strobo1") ? (chunkIndex % 2 === 0) : (chunkIndex % 2 !== 0);
                let currentKind = isKind1 ? "Strobo1" : "Strobo2";
                if ((f - b.startFrame) % chunkSize === 0) {
                    let kindId = TDTS_CAMERA_ID_MAP[currentKind];
                    vArr = [String(kindId !== undefined ? kindId : currentKind), ""];
                }
                fieldsObj[camFid][colI].push({ "frame": f, "data": [{ "fontColorId": 0, "id": 0, "values": vArr }] });
            }
        } else {
            for (let f = b.startFrame; f <= b.endFrame; f++) {
                let vArr = ["SYMBOL_HYPHEN"];
                if (f === b.startFrame) {
                    let dispTxt = b.freeText || "";
                    if (b.valueType === "fromTo") dispTxt = b.value || "";
                    else if (b.valueType === "fromToLayers") dispTxt = `${(b.layersFrom || []).join(',')}⋈${(b.layersTo || []).join(',')}`;
                    else if (b.valueType === "multiLayerDirection") dispTxt = (b.multiDirs || []).map(d => `${d.layer}(${d.direction})`).join(', ');
                    else if (b.valueType === "fairing") dispTxt = b.fairingMode;
                    let kindId = TDTS_CAMERA_ID_MAP[pKind];
                    if (kindId !== undefined) vArr = [String(kindId), dispTxt]; else vArr = [pKind, dispTxt];
                }
                fieldsObj[camFid][colI].push({ "frame": f, "data": [{ "fontColorId": 0, "id": 0, "values": vArr }] });
            }
        }
    });

    const fields = [];
    for (let fId in fieldsObj) {
        let tracks = [];
        for (let tId in fieldsObj[fId]) {
            if (fieldsObj[fId][tId].length > 0) {
                fieldsObj[fId][tId].sort((a, b) => a.frame - b.frame);
                tracks.push({ "trackNo": parseInt(tId), "frames": fieldsObj[fId][tId] });
            }
        }
        if (tracks.length > 0) fields.push({ "fieldId": parseInt(fId), "tracks": tracks });
    }

    const exportName = checks.meta ? (sheetData.name || md.sheetName || "sheet1") : "sheet1";
    const exportCreator = checks.meta ? (md.creator || "") : "";
    const exportDirection = checks.direction ? (md.memo || "") : "";
    const headDummy = (typeof settings !== 'undefined' && settings.draw && typeof settings.draw.headMargin === 'number') ? settings.draw.headMargin : 24;
    const footDummy = (typeof settings !== 'undefined' && settings.draw && typeof settings.draw.tailMargin === 'number') ? settings.draw.tailMargin : 24;
    const out = {
        "duration": duration || 144,
        "direction": exportDirection,
        "operatorName": exportCreator,
        "name": exportName,
        "color": sheetData.color || 0,
        "headDummykomas": headDummy,
        "footDummykomas": footDummy,
        "timeTableHeaders": outHeaders,
        "books": outBooks,
        "dialogueBlocks": exportDialogueBlocks,
        "cameraBlocks": exportCameraBlocks,
        "fields": fields
    };
    // customFields は本家 TDTS 仕様外なので _webEditor 名前空間に格納 (読込時に復元)
    if (md && md.customFields && typeof md.customFields === 'object') {
        const keys = Object.keys(md.customFields).filter(k => md.customFields[k] !== '' && md.customFields[k] != null);
        if (keys.length > 0) {
            const cf = {};
            keys.forEach(k => { cf[k] = md.customFields[k]; });
            out._webEditor = Object.assign(out._webEditor || {}, { customFields: cf });
        }
    }
    return out;
}

function _buildTDTSTimeSheetHeader(md, checks) {
    let combinedEpisode = md.title || "";
    if (md.subTitle) combinedEpisode += (combinedEpisode ? " / " : "") + md.subTitle;
    return {
        "cut": checks.meta ? (md.cut || "") : "",
        "episode": checks.meta ? combinedEpisode : "",
        "scene": checks.meta ? (md.scene || "") : "",
        "showHeadDummy": false,
        "timeTableFontColors": [[0,0,0],[224,0,0],[32,128,32],[32,32,192],[192,32,192],[255,128,32]]
    };
}

function _buildTDTSTimeSheets(allSheetData, checks) {
    const sharedCuts = [];
    allSheetData.forEach(sheet => {
        const cuts = sheet.metaData && Array.isArray(sheet.metaData.sharedCuts) ? sheet.metaData.sharedCuts : [];
        cuts.forEach(cut => {
            const key = String(cut || '').trim();
            if (key && !sharedCuts.includes(key)) sharedCuts.push(key);
        });
    });

    if (sharedCuts.length > 1) {
        const grouped = [];
        sharedCuts.forEach(cut => {
            const sheetsForCut = allSheetData.filter(sheet => String(sheet.metaData?.cut || '').trim() === String(cut));
            if (sheetsForCut.length === 0) return;
            const md = sheetsForCut[0].metaData || {};
            grouped.push({
                "free": [],
                "header": _buildTDTSTimeSheetHeader(md, checks),
                "timeTables": sheetsForCut.map(sheet => _buildTDTSTimeTable(sheet, checks))
            });
        });
        if (grouped.length > 0) return grouped;
    }

    const md = (allSheetData[0] && allSheetData[0].metaData) || {};
    return [{
        "free": [],
        "header": _buildTDTSTimeSheetHeader(md, checks),
        "timeTables": allSheetData.map(sheet => _buildTDTSTimeTable(sheet, checks))
    }];
}

window.exportTDTS = async function(arg) {
    const saveAs = arg && arg.saveAs === true;
    const directoryWorkflow = arg && arg.directoryWorkflow === true;
    saveInput(); saveBookInput();

    const opts = await openIOModal({
        title: 'エクスポート: TDTS',
        mode: 'export',
        format: 'tdts'
    });
    if (!opts) return;
    const checks = opts.checks;

    // 全シートのデータを取得
    const allSheetData = (typeof exportAllSheetsData === 'function')
        ? exportAllSheetsData()
        : [{ name: metaData.sheetName, color: 0, metaData, cellData, booksData, customRepeats, dialogueBlocks, cameraBlocks, sections }];

    // 手書きデータの有無を事前チェック
    const hasHandwritingData = allSheetData.some(sheet => {
        const pages = sheet.handwritingPages || {};
        return Object.values(pages).some(page =>
            (page.strokes && page.strokes.length) || (page.images && page.images.length)
        );
    });

    const tdts = {
        "version": 11,
        "timeSheets": _buildTDTSTimeSheets(allSheetData, checks)
    };
    // 手書きデータがある場合、カスタムフィールドに記録（本家は無視する）
    if (hasHandwritingData) {
        tdts._webEditor = { hasHandwriting: true };
    }
    const fileContent = "toeiDigitalTimeSheet Save Data\n" + JSON.stringify(tdts, null, 4);
    // 別名保存時は現在のファイル名を優先
    const fileName = currentFileName
        ? currentFileName.replace(/\.(tdts|xdts)$/i, '') + '.tdts'
        : (typeof buildTimesheetSaveFilename === 'function')
            ? buildTimesheetSaveFilename('tdts')
            : `timesheet${metaData.scene ? `_s${metaData.scene}` : ''}${metaData.cut ? `_cut${metaData.cut}` : ''}.tdts`;
    try {
        if ((directoryWorkflow || (hasHandwritingData && (saveAs || !currentFileHandle) && !currentDirectoryHandle)) && window.showDirectoryPicker) {
            const directoryHandle = await window.showDirectoryPicker();
            const handle = await directoryHandle.getFileHandle(fileName, { create: true });
            const writable = await handle.createWritable();
            await writable.write(fileContent);
            await writable.close();
            await saveLastFileHandle('tdts', handle);
            currentFileHandle = handle;
            currentFileFormat = 'tdts';
            currentDirectoryHandle = directoryHandle;
            setCurrentFileName(handle.name || fileName, 'tdts');
            if (typeof saveHandwritingBundleForFile === 'function') {
                try {
                    await saveHandwritingBundleForFile(fileName, allSheetData, { dpi: 150 });
                } catch (handwritingErr) {
                    console.warn('handwriting auto-save failed', handwritingErr);
                    if (hasHandwritingData) {
                        alert("TDTSは保存しましたが、手書きPNG/INIの自動保存に失敗しました。ブラウザ権限または保存先フォルダを確認してください。");
                    }
                }
            }
            if (typeof markClean === 'function') markClean();
            return;
        }
        const savedHandle = await saveFileWithPicker('tdts', fileName, fileContent, {
            description: 'Toei Digital Time Sheet',
            types: { 'application/octet-stream': ['.tdts'] }
        }, { saveAs });
        // 手書きも保存（対応ブラウザのみ）
        if (false && savedHandle && hasHandwritingData && typeof exportHandwritingBundleToDirectory === 'function') {
            if (currentDirectoryHandle) {
                // 上書き保存 or 既にディレクトリがある場合: 自動保存
                try {
                    await exportHandwritingBundleToDirectory(currentDirectoryHandle, savedHandle.name || fileName, allSheetData, 150);
                } catch (handwritingErr) {
                    console.warn('handwriting auto-save failed', handwritingErr);
                }
            } else if (saveAs && window.showDirectoryPicker) {
                // 別名保存でディレクトリ未設定: フォルダ選択を促す
                try {
                    const parentDir = await window.showDirectoryPicker({ mode: 'readwrite', startIn: savedHandle });
                    if (parentDir) {
                        await exportHandwritingBundleToDirectory(parentDir, savedHandle.name || fileName, allSheetData, 150);
                        currentDirectoryHandle = parentDir;
                    }
                } catch (handwritingErr) {
                    if (handwritingErr.name !== 'AbortError') {
                        console.warn('handwriting save failed', handwritingErr);
                    }
                }
            }
        }
        if (savedHandle && hasHandwritingData && typeof saveHandwritingBundleForFile === 'function') {
            try {
                const ok = await saveHandwritingBundleForFile(savedHandle.name || fileName, allSheetData, { dpi: 150 });
                if (!ok) alert('TDTSは保存しましたが、手書きPNG/INIの保存先フォルダが選択されませんでした。');
            } catch (handwritingErr) {
                console.warn('handwriting auto-save failed', handwritingErr);
                alert('TDTSは保存しましたが、手書きPNG/INIの自動保存に失敗しました。');
            }
        }
        if (typeof markClean === 'function') markClean();
    } catch (err) { if (err.name !== 'AbortError') alert("保存に失敗しました。"); }
};
