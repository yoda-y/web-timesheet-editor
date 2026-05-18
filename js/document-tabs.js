// === Document Tabs ===
// Top-level document switching. VERSION and shared-cut switching stay inside each tab.

let documentTabs = [];
let activeDocumentTabId = null;
let documentTabSerial = 1;
let isSwitchingDocumentTab = false;
let draggedDocumentTabId = null;

function getUntitledDocumentName() {
    return `untitled${documentTabSerial++}.tdts`;
}

function getCurrentDocumentLabel() {
    return currentFileName || (metaData?.title || metaData?.cut ? buildTimesheetSaveFilename('tdts') : getUntitledDocumentName());
}

function captureDocumentTabState(tab) {
    const snap = (typeof buildSessionSnapshot === 'function') ? buildSessionSnapshot() : {
        sheets: (typeof exportAllSheetsData === 'function') ? exportAllSheetsData() : null,
        currentSheetIndex: (typeof currentSheetIndex !== 'undefined') ? currentSheetIndex : 0,
        metaData: JSON.parse(JSON.stringify(metaData)),
        cellData: JSON.parse(JSON.stringify(cellData)),
        booksData: JSON.parse(JSON.stringify(booksData)),
        customRepeats: JSON.parse(JSON.stringify(customRepeats)),
        dialogueBlocks: JSON.parse(JSON.stringify(dialogueBlocks)),
        cameraBlocks: JSON.parse(JSON.stringify(cameraBlocks)),
        handwritingPages: (typeof exportHandwritingData === 'function') ? exportHandwritingData() : {},
        sections: JSON.parse(JSON.stringify(sections))
    };
    tab.snapshot = snap;
    tab.fileName = currentFileName || '';
    tab.fileFormat = currentFileFormat || null;
    tab.fileHandle = currentFileHandle || null;
    tab.directoryHandle = currentDirectoryHandle || null;
    tab.dirty = !!isDirty;
    tab.title = currentFileName || tab.title || (typeof t === 'function' ? t('tab.unsavedTitle') : '未保存');
}

function saveActiveDocumentTabState() {
    const tab = getActiveDocumentTab();
    if (!tab || isSwitchingDocumentTab) return;
    if (typeof saveBookInput === 'function') saveBookInput();
    captureDocumentTabState(tab);
    renderDocumentTabs();
}

function applyDocumentTabState(tab) {
    if (!tab || !tab.snapshot) return;
    isSwitchingDocumentTab = true;
    try {
        if (typeof applySession === 'function') applySession(tab.snapshot);
        currentFileHandle = tab.fileHandle || null;
        currentDirectoryHandle = tab.directoryHandle || null;
        setCurrentFileName(tab.fileName || '', tab.fileFormat || null);
        isDirty = !!tab.dirty;
        if (typeof updateModeStatus === 'function') updateModeStatus();
        if (typeof updateSectionPositions === 'function') updateSectionPositions();
        if (typeof drawAll === 'function') drawAll();
        if (currentMode === 'preview' && typeof updateTemplatePreview === 'function') updateTemplatePreview();
        if (typeof updatePageIndicator === 'function') updatePageIndicator();
    } finally {
        isSwitchingDocumentTab = false;
    }
}

function getActiveDocumentTab() {
    return documentTabs.find(tab => tab.id === activeDocumentTabId) || null;
}

function initDocumentTabs() {
    if (documentTabs.length > 0) return;
    const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tab = {
        id,
        title: currentFileName || (typeof t === 'function' ? t('tab.unsavedTitle') : '未保存'),
        fileName: currentFileName || '',
        fileFormat: currentFileFormat || null,
        fileHandle: currentFileHandle || null,
        directoryHandle: currentDirectoryHandle || null,
        dirty: !!isDirty,
        snapshot: null
    };
    documentTabs.push(tab);
    activeDocumentTabId = id;
    captureDocumentTabState(tab);
    renderDocumentTabs();
}

function activateDocumentTab(id) {
    if (id === activeDocumentTabId) return;
    saveActiveDocumentTabState();
    const tab = documentTabs.find(item => item.id === id);
    if (!tab) return;
    activeDocumentTabId = id;
    applyDocumentTabState(tab);
    renderDocumentTabs();
}

function createDocumentTabForIncomingDocument(name, format, handle, directoryHandle) {
    initDocumentTabs();
    saveActiveDocumentTabState();
    const active = getActiveDocumentTab();
    const canReuse = active && !active.dirty && !active.fileName && documentTabs.length === 1;
    const tab = canReuse ? active : {
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: name || (typeof t === 'function' ? t('tab.unsavedTitle') : '未保存'),
        fileName: '',
        fileFormat: null,
        fileHandle: null,
        directoryHandle: null,
        dirty: false,
        snapshot: null
    };
    if (!canReuse) documentTabs.push(tab);
    activeDocumentTabId = tab.id;
    tab.title = name || (typeof t === 'function' ? t('tab.unsavedTitle') : '未保存');
    tab.fileName = name || '';
    tab.fileFormat = format || null;
    tab.fileHandle = handle || null;
    tab.directoryHandle = directoryHandle || null;
    tab.dirty = false;
    renderDocumentTabs();
}

function syncActiveDocumentTabAfterLoad(name, format, handle, directoryHandle) {
    initDocumentTabs();
    const tab = getActiveDocumentTab();
    if (!tab) return;
    tab.title = name || currentFileName || (typeof t === 'function' ? t('tab.unsavedTitle') : '未保存');
    tab.fileName = currentFileName || name || '';
    tab.fileFormat = currentFileFormat || format || null;
    tab.fileHandle = currentFileHandle || handle || null;
    tab.directoryHandle = currentDirectoryHandle || directoryHandle || null;
    tab.dirty = !!isDirty;
    captureDocumentTabState(tab);
    renderDocumentTabs();
}

function updateActiveDocumentTabMeta() {
    const tab = getActiveDocumentTab();
    if (!tab) return;
    tab.fileName = currentFileName || '';
    tab.fileFormat = currentFileFormat || null;
    tab.fileHandle = currentFileHandle || null;
    tab.directoryHandle = currentDirectoryHandle || null;
    tab.title = currentFileName || tab.title || (typeof t === 'function' ? t('tab.unsavedTitle') : '未保存');
    tab.dirty = !!isDirty;
    renderDocumentTabs();
}

function resetWorkspaceToBlankDocument() {
    cellData = {};
    booksData = { ACTION: {}, SOUND: {}, CELL: {}, CAMERA: {} };
    customRepeats = [];
    dialogueBlocks = [];
    cameraBlocks = [];
    metaData = { title:"", subTitle:"", scene:"", cut:"", sharedCuts: [], lengthSec:"6", lengthFrame:"00", creator:"", sheetName:"sheet1", page:"1/1", memo:"", customFields: {} };
    undoStack = [];
    redoStack = [];
    selectionStart = null;
    selectionEnd = null;
    selectedMeta = null;
    selectedDialogueId = null;
    selectedCameraId = null;
    if (typeof resetHandwritingData === 'function') resetHandwritingData();
    currentFileHandle = null;
    currentFileFormat = null;
    currentDirectoryHandle = null;
    if (typeof setCurrentFileName === 'function') setCurrentFileName('', null);
    sections = [
        { type:"ACTION", x:25, cols:7, cw:32, chars:["A","B","C","D","E","F","G"] },
        { type:"SOUND",  x:0, cols:2, cw:68, chars:["S1","S2"] },
        { type:"CELL",   x:0, cols:7, cw:58, chars:["a","b","c","d","e","f","g"] },
        { type:"CAMERA", x:0, cols:3, cw:58, chars:["CAM1","CAM2","CAM3"] }
    ];
    if (typeof closeSharedCutSwitcher === 'function') closeSharedCutSwitcher();
    if (typeof initSheets === 'function') initSheets();
    if (typeof updateSectionPositions === 'function') updateSectionPositions();
    if (typeof drawAll === 'function') drawAll();
    if (typeof clearLastSession === 'function') clearLastSession();
    if (typeof markClean === 'function') markClean();
}

function createNewBlankDocumentTab() {
    // 既存のアクティブタブがあれば保存
    if (activeDocumentTabId) saveActiveDocumentTabState();
    const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tab = { id, title: (typeof t === 'function' ? t('tab.unsavedTitle') : '未保存'), fileName: '', fileFormat: null, fileHandle: null, directoryHandle: null, dirty: false, snapshot: null };
    documentTabs.push(tab);
    activeDocumentTabId = id;
    resetWorkspaceToBlankDocument();
    // 新規タブは必ずclean状態
    tab.dirty = false;
    if (typeof markClean === 'function') markClean();
    captureDocumentTabState(tab);
    renderDocumentTabs();
}

function closeDocumentTab(id) {
    const tab = documentTabs.find(item => item.id === id);
    if (!tab) return;
    // アクティブタブの場合、グローバルのisDirtyを直接チェック
    if (id === activeDocumentTabId && typeof isDirty !== 'undefined') {
        tab.dirty = isDirty;
    }
    if (tab.dirty && !confirm(`「${tab.title || tab.fileName || (typeof t === 'function' ? t('tab.unsavedTitle') : '未保存')}」${typeof t === 'function' ? t('tab.confirmClose') : '変更が保存されていません。閉じますか？'}`)) return;
    const index = documentTabs.indexOf(tab);
    documentTabs.splice(index, 1);
    if (documentTabs.length === 0) {
        activeDocumentTabId = null;
        createNewBlankDocumentTab();
        return;
    }
    if (id === activeDocumentTabId) {
        const next = documentTabs[Math.max(0, index - 1)];
        activeDocumentTabId = next.id;
        applyDocumentTabState(next);
    }
    renderDocumentTabs();
}

function reorderDocumentTab(draggedId, targetId, placeAfter) {
    if (!draggedId || !targetId || draggedId === targetId) return;
    const from = documentTabs.findIndex(tab => tab.id === draggedId);
    const to = documentTabs.findIndex(tab => tab.id === targetId);
    if (from < 0 || to < 0) return;
    const [tab] = documentTabs.splice(from, 1);
    let insertAt = documentTabs.findIndex(item => item.id === targetId);
    if (insertAt < 0) insertAt = documentTabs.length;
    if (placeAfter) insertAt += 1;
    documentTabs.splice(insertAt, 0, tab);
    renderDocumentTabs();
}

function renderDocumentTabs() {
    const host = document.getElementById('document-tabs');
    if (!host) return;
    host.innerHTML = '';
    documentTabs.forEach(tab => {
        const item = document.createElement('div');
        item.className = 'document-tab';
        item.draggable = true;
        item.dataset.tabId = tab.id;
        item.classList.toggle('active', tab.id === activeDocumentTabId);
        item.classList.toggle('dirty', !!tab.dirty);
        item.title = tab.fileName || tab.title || (typeof t === 'function' ? t('tab.unsavedTitle') : '未保存');
        const title = document.createElement('span');
        title.className = 'document-tab-title';
        title.textContent = tab.fileName || tab.title || (typeof t === 'function' ? t('tab.unsavedTitle') : '未保存');
        item.appendChild(title);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'document-tab-close';
        close.textContent = '×';
        close.title = '閉じる';
        close.onclick = function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            closeDocumentTab(tab.id);
        };
        item.appendChild(close);
        item.addEventListener('dragstart', ev => {
            draggedDocumentTabId = tab.id;
            item.classList.add('dragging');
            if (ev.dataTransfer) {
                ev.dataTransfer.effectAllowed = 'move';
                ev.dataTransfer.setData('text/plain', tab.id);
            }
        });
        item.addEventListener('dragend', () => {
            draggedDocumentTabId = null;
            item.classList.remove('dragging');
        });
        item.addEventListener('dragover', ev => {
            if (!draggedDocumentTabId || draggedDocumentTabId === tab.id) return;
            ev.preventDefault();
            if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
        });
        item.addEventListener('drop', ev => {
            ev.preventDefault();
            ev.stopPropagation();
            const rect = item.getBoundingClientRect();
            reorderDocumentTab(draggedDocumentTabId, tab.id, ev.clientX > rect.left + rect.width / 2);
            draggedDocumentTabId = null;
        });
        item.addEventListener('auxclick', ev => {
            if (ev.button === 1) {
                ev.preventDefault();
                closeDocumentTab(tab.id);
            }
        });
        item.addEventListener('click', () => activateDocumentTab(tab.id));
        host.appendChild(item);
    });
}
