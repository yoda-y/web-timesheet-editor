// === 保存形式選択モーダル (P2-2d) ===
// Ctrl+Shift+S / ファイル > 別名で保存 から呼び出される。
// 4 形式 (Project HTML / Project JSON / TDTS / XDTS) から1つ選んで Promise で返す。

// openSaveFormatChooser({defaultFormat}): Promise<'wtproj-html'|'wtproj-json'|'tdts'|'xdts'|null>
//   - default: 現在の形式に応じた推奨値
//   - cancel: null を返す
(function() {
    const FORMATS = [
        { id: 'wtproj-html', label: 'Project HTML (.html)',      desc: 'Web Timesheet Editor 標準形式。全データを保持' },
        { id: 'wtproj-json', label: 'Project JSON (.wtproj.json)', desc: '補助/復旧用。テキスト形式' },
        { id: 'tdts',        label: 'TDTS (.tdts)',                desc: '本家互換書き出し。手書き/外部テンプレ/拡張情報は失われます' },
        { id: 'xdts',        label: 'XDTS (.xdts)',                desc: '他社互換書き出し。セリフタイプ/外部テンプレ/カスタム項目は失われます' }
    ];

    // currentFileFormat → モーダルのデフォルト選択
    function mapToDefaultChoice(currentFormat) {
        switch (currentFormat) {
            case 'tdts':        return 'tdts';
            case 'xdts':        return 'xdts';
            case 'wtproj-html': return 'wtproj-html';
            case 'wtproj-json': return 'wtproj-html'; // JSON → HTML に昇格
            default:            return 'wtproj-html';
        }
    }

    function openSaveFormatChooser(opts) {
        opts = opts || {};
        const defaultChoice = mapToDefaultChoice(opts.defaultFormat);
        return new Promise((resolve) => {
            // overlay
            const overlay = document.createElement('div');
            overlay.id = 'save-format-chooser-overlay';
            overlay.style.cssText = `
                position: fixed; inset: 0; background: rgba(0,0,0,0.5);
                display: flex; align-items: center; justify-content: center;
                z-index: 100000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            `;

            // dialog
            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: var(--bg-color, #fff); color: var(--fg-color, #222);
                border: 1px solid var(--border-color, #ccc); border-radius: 8px;
                padding: 20px 24px; min-width: 380px; max-width: 520px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            `;

            const isDark = (typeof document !== 'undefined') && document.body && document.body.classList.contains('dark');
            if (isDark) {
                dialog.style.background = '#2a2a2a';
                dialog.style.color = '#ddd';
                dialog.style.borderColor = '#444';
            }

            const title = document.createElement('h3');
            title.textContent = '保存形式を選択';
            title.style.cssText = 'margin: 0 0 12px 0; font-size: 16px; font-weight: 600;';
            dialog.appendChild(title);

            const list = document.createElement('div');
            list.style.cssText = 'display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px;';

            const radios = [];
            FORMATS.forEach((f) => {
                const row = document.createElement('label');
                row.style.cssText = `
                    display: flex; align-items: flex-start; gap: 8px;
                    padding: 8px 10px; border-radius: 4px; cursor: pointer;
                    border: 1px solid transparent;
                `;
                row.onmouseenter = () => { row.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'; };
                row.onmouseleave = () => { row.style.background = ''; };

                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = 'save-format';
                radio.value = f.id;
                radio.style.cssText = 'margin-top: 2px; flex-shrink: 0;';
                if (f.id === defaultChoice) radio.checked = true;
                radios.push(radio);

                const textWrap = document.createElement('div');
                textWrap.style.cssText = 'flex: 1; min-width: 0;';
                const lbl = document.createElement('div');
                lbl.textContent = f.label;
                lbl.style.cssText = 'font-weight: 600; font-size: 13px;';
                const desc = document.createElement('div');
                desc.textContent = f.desc;
                desc.style.cssText = 'font-size: 11px; color: ' + (isDark ? '#999' : '#777') + '; margin-top: 2px;';
                textWrap.appendChild(lbl);
                textWrap.appendChild(desc);

                row.appendChild(radio);
                row.appendChild(textWrap);
                list.appendChild(row);
            });

            dialog.appendChild(list);

            // buttons
            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.textContent = 'キャンセル';
            cancelBtn.style.cssText = `
                padding: 6px 14px; border-radius: 4px; cursor: pointer;
                background: ${isDark ? '#3a3a3a' : '#fafafa'};
                color: ${isDark ? '#ddd' : '#222'};
                border: 1px solid ${isDark ? '#555' : '#bbb'};
                font-size: 13px;
            `;
            const okBtn = document.createElement('button');
            okBtn.type = 'button';
            okBtn.textContent = '保存…';
            okBtn.style.cssText = `
                padding: 6px 14px; border-radius: 4px; cursor: pointer;
                background: #2469d4; color: #fff; border: 1px solid #2469d4;
                font-size: 13px; font-weight: 600;
            `;
            btnRow.appendChild(cancelBtn);
            btnRow.appendChild(okBtn);
            dialog.appendChild(btnRow);

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            function cleanup() {
                document.removeEventListener('keydown', onKey);
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }
            function done(value) {
                cleanup();
                resolve(value);
            }
            function onKey(e) {
                if (e.key === 'Escape') { e.preventDefault(); done(null); }
                else if (e.key === 'Enter') { e.preventDefault(); confirmChoice(); }
            }
            function confirmChoice() {
                const checked = radios.find(r => r.checked);
                done(checked ? checked.value : null);
            }
            okBtn.addEventListener('click', confirmChoice);
            cancelBtn.addEventListener('click', () => done(null));
            overlay.addEventListener('click', (e) => { if (e.target === overlay) done(null); });
            document.addEventListener('keydown', onKey);

            // フォーカス
            const checked = radios.find(r => r.checked) || radios[0];
            if (checked) checked.focus();
        });
    }

    window.openSaveFormatChooser = openSaveFormatChooser;
})();
