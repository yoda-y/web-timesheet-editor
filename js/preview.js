// === プレビューモード（テンプレートプレビュー） ===
// Phase J-1: テンプレートベースのタイムシートプレビュー

let previewContainer = null;
let previewImage = null;

// プレビューモード有効化
function enablePreviewMode() {
    previewContainer = document.getElementById('preview-container');
    if (!previewContainer) return;

    // プレビュー生成
    updateTemplatePreview();

    // 表示切替
    previewContainer.style.display = 'flex';
    document.getElementById('preview-toolbar').style.display = 'flex';
    document.getElementById('main-wrapper').style.display = 'none';
}

// プレビューモード無効化
function disablePreviewMode() {
    if (previewContainer) previewContainer.style.display = 'none';
    document.getElementById('preview-toolbar').style.display = 'none';
    document.getElementById('main-wrapper').style.display = 'flex';
}

// テンプレートプレビュー更新
function updateTemplatePreview() {
    if (!previewContainer) return;
    if (typeof getTemplatePreview !== 'function') return;

    const canvas = getTemplatePreview();
    previewImage = document.getElementById('preview-image');

    if (!previewImage) {
        previewImage = document.createElement('img');
        previewImage.id = 'preview-image';
        previewImage.style.cssText = 'max-width:100%; max-height:100%; object-fit:contain;';
        previewContainer.innerHTML = '';
        previewContainer.appendChild(previewImage);
    }

    previewImage.src = canvas.toDataURL('image/png');
}

// プレビュー更新（モード切替時やデータ変更時に呼ばれる）
function refreshPreview() {
    if (currentMode === 'preview') {
        updateTemplatePreview();
    }
}
