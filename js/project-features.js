// === Project Only Features Detector & Save Warning (P3-w) ===
// TDTS/XDTS 保存時に「Web Timesheet Editor 独自の情報は完全には保持できない場合があります」
// と案内するための検出 + UI レイヤ。
//
// 公開関数:
//   - detectProjectOnlyFeatures()         : 現在のシート群を検査して機能フラグを返す
//   - showProjectSaveWarning(features, formatLabel)
//                                          : 警告トーストを表示
//   - maybeWarnProjectFeaturesAfterSave(formatLabel)
//                                          : 抑制条件を満たさなければ警告を出す
//
// 抑制条件:
//   - settings.preview.suppressProjectSaveWarning === true → 出さない
//   - 前回警告から60秒以内 → 出さない
//   - 独自機能が一切ない → 出さない
//   - TDTS/XDTS 保存成功時のみ呼ばれる (失敗/キャンセル時は呼ばれない)

(function() {
    const WARN_SUPPRESSION_MS = 60 * 1000;
    let _lastWarnAt = 0;

    function _hasHandwritingData(allSheets) {
        for (const sh of allSheets) {
            const pages = sh && sh.handwritingPages;
            if (!pages) continue;
            for (const k in pages) {
                const p = pages[k];
                if (!p) continue;
                if ((p.strokes && p.strokes.length) || (p.images && p.images.length)) return true;
            }
        }
        return false;
    }

    function _hasCustomFields(allSheets) {
        for (const sh of allSheets) {
            const md = sh && sh.metaData;
            if (!md || !md.customFields) continue;
            for (const k in md.customFields) {
                const v = md.customFields[k];
                if (v !== '' && v !== null && v !== undefined) return true;
            }
        }
        return false;
    }

    function _hasNonNormalDialogueTypes(allSheets) {
        for (const sh of allSheets) {
            const blocks = sh && sh.dialogueBlocks;
            if (!Array.isArray(blocks)) continue;
            for (const b of blocks) {
                if (b && b.dialogueType && b.dialogueType !== 'normal') return true;
            }
        }
        return false;
    }

    function detectProjectOnlyFeatures() {
        const result = {
            handwriting: false,
            externalTemplate: false,
            customFields: false,
            dialogueTypes: false,
            summary: [],
            hasAny: false
        };
        let allSheets = [];
        try {
            allSheets = (typeof exportAllSheetsData === 'function') ? exportAllSheetsData() : [];
        } catch (e) { allSheets = []; }

        result.handwriting = _hasHandwritingData(allSheets);
        try {
            if (typeof window !== 'undefined' && typeof window.getCurrentExternalTemplate === 'function') {
                result.externalTemplate = !!window.getCurrentExternalTemplate();
            }
        } catch (e) {}
        result.customFields = _hasCustomFields(allSheets);
        result.dialogueTypes = _hasNonNormalDialogueTypes(allSheets);

        // i18n 化された label を summary に
        const tFn = (typeof t === 'function') ? t : (k) => k;
        if (result.handwriting)       result.summary.push(tFn('projectSaveWarning.feature.handwriting'));
        if (result.externalTemplate)  result.summary.push(tFn('projectSaveWarning.feature.externalTemplate'));
        if (result.customFields)      result.summary.push(tFn('projectSaveWarning.feature.customFields'));
        if (result.dialogueTypes)     result.summary.push(tFn('projectSaveWarning.feature.dialogueTypes'));
        result.hasAny = result.summary.length > 0;
        return result;
    }

    // 警告トースト表示
    function showProjectSaveWarning(features, formatLabel) {
        const tFn = (typeof t === 'function') ? t : (k) => k;
        // 既存のものがあれば閉じる
        const existing = document.getElementById('project-save-warning');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        const isDark = !!(document.body && document.body.classList.contains('dark'));
        const wrap = document.createElement('div');
        wrap.id = 'project-save-warning';
        wrap.style.cssText = `
            position: fixed; right: 20px; bottom: 20px; z-index: 10001;
            max-width: 380px; padding: 14px 16px; border-radius: 6px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 13px; line-height: 1.5;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
            background: ${isDark ? '#2a2a2a' : '#fff'};
            color: ${isDark ? '#ddd' : '#222'};
            border: 1px solid ${isDark ? '#555' : '#ddd'};
        `;

        const title = document.createElement('div');
        title.style.cssText = 'font-weight: 600; margin-bottom: 6px;';
        // 例: 「TDTSとして保存しました。」
        title.textContent = (tFn('projectSaveWarning.title') || '保存しました').replace('{format}', formatLabel);

        const body = document.createElement('div');
        body.style.cssText = 'margin-bottom: 10px;';
        const featuresStr = (features.summary || []).join('・');
        // 例: 「ただし、手書き・外部テンプレートなどのWeb独自情報は完全には保持できない場合があります。」
        body.textContent = (tFn('projectSaveWarning.message') || '独自情報は完全には保持できない場合があります。')
            .replace('{features}', featuresStr || tFn('projectSaveWarning.feature.generic'));

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap; align-items: center;';

        const actionBtn = document.createElement('button');
        actionBtn.type = 'button';
        actionBtn.textContent = tFn('projectSaveWarning.action') || 'プロジェクトHTMLとしても保存…';
        actionBtn.style.cssText = `
            padding: 6px 12px; border-radius: 4px; cursor: pointer;
            background: #2469d4; color: #fff; border: 1px solid #2469d4;
            font-size: 12px; font-weight: 600;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = tFn('projectSaveWarning.close') || '閉じる';
        closeBtn.style.cssText = `
            padding: 6px 12px; border-radius: 4px; cursor: pointer;
            background: ${isDark ? '#3a3a3a' : '#fafafa'};
            color: ${isDark ? '#ddd' : '#222'};
            border: 1px solid ${isDark ? '#555' : '#bbb'};
            font-size: 12px;
        `;

        btnRow.appendChild(actionBtn);
        btnRow.appendChild(closeBtn);

        const suppressRow = document.createElement('label');
        suppressRow.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 11px; color: ' + (isDark ? '#888' : '#777') + '; cursor: pointer;';
        const suppressCb = document.createElement('input');
        suppressCb.type = 'checkbox';
        suppressCb.style.cssText = 'margin: 0;';
        const suppressLbl = document.createElement('span');
        suppressLbl.textContent = tFn('projectSaveWarning.suppress') || '今後表示しない';
        suppressRow.appendChild(suppressCb);
        suppressRow.appendChild(suppressLbl);

        wrap.appendChild(title);
        wrap.appendChild(body);
        wrap.appendChild(btnRow);
        wrap.appendChild(suppressRow);
        document.body.appendChild(wrap);

        function close() {
            if (suppressCb.checked) {
                try {
                    if (typeof settings !== 'undefined' && settings.preview) {
                        settings.preview.suppressProjectSaveWarning = true;
                        if (typeof saveSettings === 'function') saveSettings();
                    }
                } catch (e) {}
            }
            if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        }

        actionBtn.addEventListener('click', async () => {
            // close は成功・キャンセル問わず最後に
            try {
                if (window.projectHtml && typeof window.projectHtml.exportHTML === 'function') {
                    await window.projectHtml.exportHTML({ saveAs: true });
                }
            } catch (e) { /* exporter 内で alert 済み */ }
            close();
        });
        closeBtn.addEventListener('click', close);
    }

    function maybeWarnProjectFeaturesAfterSave(formatLabel) {
        try {
            if (typeof settings !== 'undefined' && settings.preview && settings.preview.suppressProjectSaveWarning === true) {
                return;
            }
        } catch (e) {}
        const now = Date.now();
        if (now - _lastWarnAt < WARN_SUPPRESSION_MS) return;
        const features = detectProjectOnlyFeatures();
        if (!features.hasAny) return;
        _lastWarnAt = now;
        showProjectSaveWarning(features, formatLabel || '');
    }

    // 公開
    window.detectProjectOnlyFeatures = detectProjectOnlyFeatures;
    window.showProjectSaveWarning = showProjectSaveWarning;
    window.maybeWarnProjectFeaturesAfterSave = maybeWarnProjectFeaturesAfterSave;
})();
