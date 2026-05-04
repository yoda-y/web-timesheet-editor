// === Undo / Redo ===

function snapshotState() {
    return JSON.stringify({
        meta: metaData,
        cells: cellData,
        books: booksData,
        repeats: customRepeats,
        dialogues: dialogueBlocks,
        camera: cameraBlocks,
        actChars: [...sections.find(s => s.type === "ACTION").chars],
        cellChars: [...sections.find(s => s.type === "CELL").chars]
    });
}

function restoreState(d) {
    metaData = d.meta;
    cellData = d.cells;
    booksData = d.books || booksData;
    customRepeats = d.repeats || [];
    dialogueBlocks = d.dialogues || [];
    cameraBlocks = d.camera || [];
    let act = sections.find(s => s.type === "ACTION");
    let cell = sections.find(s => s.type === "CELL");
    if (d.actChars) { act.chars = d.actChars; act.cols = d.actChars.length; }
    if (d.cellChars) { cell.chars = d.cellChars; cell.cols = d.cellChars.length; }
}

function pushHistory() {
    undoStack.push(snapshotState());
    redoStack = [];
    if (undoStack.length > 100) undoStack.shift();
    if (typeof markDirty === 'function') markDirty();
}

window.undo = function() {
    if (undoStack.length === 0) return;
    if (cellInput.style.display === 'block') { cellInput.style.display = 'none'; selectionStart = null; selectionEnd = null; }
    redoStack.push(snapshotState());
    let d = JSON.parse(undoStack.pop());
    restoreState(d);
    updateSectionPositions();
    drawAll();
    if (typeof markDirty === 'function') markDirty();
};

window.redo = function() {
    if (redoStack.length === 0) return;
    if (cellInput.style.display === 'block') { cellInput.style.display = 'none'; selectionStart = null; selectionEnd = null; }
    undoStack.push(snapshotState());
    let d = JSON.parse(redoStack.pop());
    restoreState(d);
    updateSectionPositions();
    drawAll();
    if (typeof markDirty === 'function') markDirty();
};
