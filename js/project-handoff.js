// === Project Handoff (P2-1) ===
// .wtproj.html ランチャーから postMessage で projectData を受け取り、
// アプリへ自動読み込みする受信側ハンドラ。
//
// フロー:
//   1. DOMContentLoaded で location.hash を解析
//   2. #wtproj=<nonce> あり → 受信モード起動
//      - message listener 登録
//      - window.opener へ {type:'wt-app-ready', nonce} を post
//   3. {type:'wt-project-data', nonce, projectData} を受信
//      - origin / nonce 検証
//      - isDirty なら confirm。キャンセル時は error:'cancelled' で返答
//      - window.projectHtml.load(projectData) を呼び出し
//      - 結果を {type:'wt-project-loaded', nonce, ok, error?} で返答
//   4. クリーンアップ: listener解除、location.hash クリア、nonce破棄
//   5. 30秒以内にデータが来なければタイムアウト（silent cleanup）
//
// セキュリティ:
//   - URL fragment に nonce がない通常起動では何もしない
//   - event.origin はホワイトリスト検証
//   - nonce 一致確認、単発（1度処理したら以降のメッセージは無視）

(function initProjectHandoffReceiver() {
    const HANDOFF_TIMEOUT_MS = 30 * 1000;
    const ALLOWED_ORIGIN_PATTERNS = [
        /^https:\/\/yoda-y\.github\.io$/,
        /^http:\/\/localhost(:\d+)?$/,
        /^http:\/\/127\.0\.0\.1(:\d+)?$/,
        /^null$/ // file:// ランチャー
    ];

    function parseHashNonce() {
        const hash = String(window.location.hash || '');
        const m = hash.match(/(?:^#|&)wtproj=([A-Za-z0-9_\-]+)/);
        return m ? m[1] : null;
    }

    function isOriginAllowed(origin) {
        const o = String(origin || '');
        return ALLOWED_ORIGIN_PATTERNS.some(re => re.test(o));
    }

    function clearHandoffHash() {
        try {
            const newHash = String(window.location.hash || '').replace(/(^#|&)wtproj=[^&]*/g, '');
            const cleaned = newHash === '#' ? '' : newHash;
            history.replaceState(null, '', window.location.pathname + window.location.search + cleaned);
        } catch (e) { /* noop */ }
    }

    function start() {
        const nonce = parseHashNonce();
        if (!nonce) return; // 通常起動

        let handled = false;       // 単発フラグ
        let timeoutId = null;
        let opener = null;
        let openerOrigin = null;

        try { opener = window.opener; } catch (e) { opener = null; }
        if (!opener) {
            console.info('[project-handoff] nonce 検出するも window.opener が無いため受信待機をスキップ');
            clearHandoffHash();
            return;
        }

        console.info('[project-handoff] handoff 受信モード開始 nonce=', nonce.slice(0, 8) + '…');

        function cleanup() {
            handled = true;
            if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
            window.removeEventListener('message', onMessage);
            clearHandoffHash();
        }

        function reply(payload) {
            if (!opener) return;
            try {
                // openerOrigin が "null" (file:// ランチャー) の場合は target に "null" を渡せないため "*" を使う。
                // 安全性は nonce 検証で担保される。
                const target = (!openerOrigin || openerOrigin === 'null') ? '*' : openerOrigin;
                opener.postMessage(payload, target);
            } catch (e) { console.warn('[project-handoff] reply 送信失敗:', e); }
        }

        async function handleProjectData(projectData) {
            // isDirty 判定
            const dirty = (typeof isDirty !== 'undefined' && isDirty === true);
            if (dirty) {
                const ok = window.confirm('未保存の変更があります。プロジェクトを読み込みますか？');
                if (!ok) {
                    reply({ type: 'wt-project-loaded', nonce, ok: false, error: 'cancelled' });
                    cleanup();
                    return;
                }
            }

            if (!window.projectHtml || typeof window.projectHtml.load !== 'function') {
                reply({ type: 'wt-project-loaded', nonce, ok: false, error: 'load-failed', message: 'projectHtml.load が利用不可' });
                cleanup();
                return;
            }

            try {
                const r = await window.projectHtml.load(projectData);
                if (r && r.ok) {
                    // 受信由来は元ファイル参照を持たない
                    try { if (typeof currentFileHandle !== 'undefined') currentFileHandle = null; } catch (e) {}
                    try { if (typeof currentFileFormat !== 'undefined') currentFileFormat = null; } catch (e) {}
                    const dispName = (projectData && projectData.meta && projectData.meta.displayName) ? projectData.meta.displayName : '';
                    if (typeof setCurrentFileName === 'function') {
                        try { setCurrentFileName(dispName || 'handoff.wtproj.json', null); } catch (e) {}
                    }
                    if (typeof markClean === 'function') { try { markClean(); } catch (e) {} }
                    reply({ type: 'wt-project-loaded', nonce, ok: true });
                } else {
                    reply({ type: 'wt-project-loaded', nonce, ok: false, error: 'load-failed', message: (r && r.error) || '不明なエラー' });
                }
            } catch (e) {
                reply({ type: 'wt-project-loaded', nonce, ok: false, error: 'load-failed', message: String(e && e.message || e) });
            }
            cleanup();
        }

        function onMessage(event) {
            if (handled) return;
            const msg = event.data;
            if (!msg || typeof msg !== 'object') return;

            // ready の自己ack 等の他メッセージは無視
            if (msg.type !== 'wt-project-data') return;

            // origin 検証
            if (!isOriginAllowed(event.origin)) {
                console.warn('[project-handoff] 拒否: origin 不一致', event.origin);
                return;
            }
            // nonce 検証
            if (msg.nonce !== nonce) {
                console.warn('[project-handoff] 拒否: nonce 不一致');
                return;
            }
            // 期待された opener と一致するか（多重起動対策）
            if (event.source !== opener) {
                console.warn('[project-handoff] 拒否: 送信元が opener と一致しない');
                return;
            }

            // 以降このoriginを返答先に使う
            openerOrigin = event.origin;

            if (!msg.projectData || typeof msg.projectData !== 'object') {
                reply({ type: 'wt-project-loaded', nonce, ok: false, error: 'invalid', message: 'projectData が含まれていません' });
                cleanup();
                return;
            }

            handleProjectData(msg.projectData);
        }

        window.addEventListener('message', onMessage);

        // ready 通知（initialのみ '*' 許可：受信側は nonce で守る）
        try {
            opener.postMessage({ type: 'wt-app-ready', nonce }, '*');
        } catch (e) {
            console.warn('[project-handoff] ready 送信失敗:', e);
        }

        // 30秒タイムアウト
        timeoutId = setTimeout(() => {
            if (handled) return;
            console.info('[project-handoff] タイムアウト: データ未受信のため受信モード解除');
            cleanup();
        }, HANDOFF_TIMEOUT_MS);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
