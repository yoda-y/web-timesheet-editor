// === Image Splitter ===
// 読み込んだ手書きPNG / TDTS memo 等の画像を、Connected Components + 近接merge で
// 複数の小さな画像パーツに分割する。各パーツは {dataUrl, x, y, w, h} で返る。
//
// 使用例:
//   const result = await splitHandwritingImageDataUrl(dataUrl);
//   if (result.parts && result.parts.length) {
//       result.parts.forEach(p => images.push({ id, dataUrl: p.dataUrl, x: baseX + p.x, y: baseY + p.y, w: p.w, h: p.h }));
//   } else {
//       // fallback: 1枚画像として登録
//   }

const IMAGE_SPLIT_DEFAULTS = {
    alphaThreshold: 16,          // alpha > これ で前景とみなす（alphaあり画像）
    whiteThreshold: 240,         // RGB成分すべて >= これ で背景白とみなす（alpha無し画像）
    minPartSize: 8,              // 8x8 px 未満のパーツは破棄
    maxParts: 100,               // これを超えたら fallback
    mergeDistance: 4,            // bbox間がこの px 以下なら同じパーツとして merge
    minPartArea: 16              // bbox面積がこれ未満は破棄（minPartSize と併用）
};

/**
 * dataUrl の画像を読み込み、複数のパーツに分割する。
 * @param {string} dataUrl
 * @param {object} [options]
 * @returns {Promise<{parts: Array<{dataUrl,x,y,w,h}>|null, fallbackReason: string|null, sourceWidth: number, sourceHeight: number}>}
 */
async function splitHandwritingImageDataUrl(dataUrl, options) {
    const opts = Object.assign({}, IMAGE_SPLIT_DEFAULTS, options || {});
    let img;
    try {
        img = await _loadImage(dataUrl);
    } catch (e) {
        return { parts: null, fallbackReason: 'image-load-failed', sourceWidth: 0, sourceHeight: 0 };
    }
    const W = img.naturalWidth || img.width;
    const H = img.naturalHeight || img.height;
    if (!W || !H) return { parts: null, fallbackReason: 'empty-image', sourceWidth: 0, sourceHeight: 0 };

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    let imageData;
    try {
        imageData = ctx.getImageData(0, 0, W, H);
    } catch (e) {
        return { parts: null, fallbackReason: 'getImageData-failed', sourceWidth: W, sourceHeight: H };
    }

    // 前景マスク作成（背景方式の自動判定）
    const mask = _buildForegroundMask(imageData, opts);
    const detectMode = mask.hasTransparency ? 'alpha' : 'white-bg';
    if (!mask.foregroundCount) {
        return { parts: null, fallbackReason: 'no-foreground', sourceWidth: W, sourceHeight: H, detectMode };
    }

    // Connected components → bbox配列
    const bboxes = _connectedComponentBBoxes(mask.data, W, H);
    if (!bboxes.length) {
        return { parts: null, fallbackReason: 'no-components', sourceWidth: W, sourceHeight: H, detectMode };
    }

    // 小さすぎる成分を除外
    const filteredInitial = bboxes.filter(b => {
        const bw = b.x1 - b.x0 + 1;
        const bh = b.y1 - b.y0 + 1;
        return bw >= opts.minPartSize || bh >= opts.minPartSize;
    });
    if (!filteredInitial.length) {
        return { parts: null, fallbackReason: 'all-too-small', sourceWidth: W, sourceHeight: H, detectMode };
    }

    // 近接merge
    const merged = _mergeCloseBBoxes(filteredInitial, opts.mergeDistance);

    // 最終フィルタ
    const finalBoxes = merged.filter(b => {
        const bw = b.x1 - b.x0 + 1;
        const bh = b.y1 - b.y0 + 1;
        return (bw >= opts.minPartSize || bh >= opts.minPartSize) && (bw * bh >= opts.minPartArea);
    });

    if (!finalBoxes.length) {
        return { parts: null, fallbackReason: 'all-filtered', sourceWidth: W, sourceHeight: H, detectMode };
    }
    if (finalBoxes.length > opts.maxParts) {
        return { parts: null, fallbackReason: `too-many-parts(${finalBoxes.length}>${opts.maxParts})`, sourceWidth: W, sourceHeight: H, detectMode };
    }
    // 分割数1ならそのまま fallback（呼び出し側で元画像1枚として扱う）
    if (finalBoxes.length === 1) {
        return { parts: null, fallbackReason: 'single-part', sourceWidth: W, sourceHeight: H, detectMode };
    }

    // 各bboxをcropしてdataUrl化
    const parts = [];
    for (const b of finalBoxes) {
        const bw = b.x1 - b.x0 + 1;
        const bh = b.y1 - b.y0 + 1;
        const partCanvas = document.createElement('canvas');
        partCanvas.width = bw;
        partCanvas.height = bh;
        const pctx = partCanvas.getContext('2d');
        pctx.drawImage(canvas, b.x0, b.y0, bw, bh, 0, 0, bw, bh);
        parts.push({
            dataUrl: partCanvas.toDataURL('image/png'),
            x: b.x0,
            y: b.y0,
            w: bw,
            h: bh
        });
    }

    return { parts, fallbackReason: null, sourceWidth: W, sourceHeight: H, detectMode };
}

function _loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
    });
}

// 前景マスク（Uint8Array, 1=fg, 0=bg）を作成
// 透明背景PNG（alpha < 250 のピクセルが全体の1%以上）→ alpha のみで前景判定
// 不透明画像（白背景PNG/JPEG）→ alpha > threshold かつ RGB が白に近くないものを前景
// 重要: alpha <= threshold のピクセルは RGB に関係なく必ず背景。
//      （透明背景でRGBが黒のPNGを全画面前景にしてしまうのを防ぐ）
function _buildForegroundMask(imageData, opts) {
    const { data, width, height } = imageData;
    const N = width * height;
    const mask = new Uint8Array(N);
    let foregroundCount = 0;

    // 全ピクセルを正確にスキャンして透明背景かを判定
    let transparentish = 0;
    for (let i = 0; i < N; i++) {
        if (data[i * 4 + 3] < 250) transparentish++;
    }
    const hasTransparency = transparentish >= Math.max(100, Math.floor(N * 0.01));

    const aTh = opts.alphaThreshold;
    if (hasTransparency) {
        // 透明背景画像: alpha のみで判定（RGB は無視）
        for (let i = 0; i < N; i++) {
            if (data[i * 4 + 3] > aTh) { mask[i] = 1; foregroundCount++; }
        }
    } else {
        // 不透明画像（白背景想定）: alpha かつ RGB が白でない
        const wt = opts.whiteThreshold;
        for (let i = 0; i < N; i++) {
            const a = data[i * 4 + 3];
            if (a <= aTh) continue;
            const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
            if (r < wt || g < wt || b < wt) { mask[i] = 1; foregroundCount++; }
        }
    }
    return { data: mask, foregroundCount, hasTransparency };
}

// 2-pass connected components (4近傍, union-find)
// 戻り値: [{x0,y0,x1,y1}, ...]
function _connectedComponentBBoxes(mask, W, H) {
    const labels = new Int32Array(W * H);
    const parent = [0]; // index 0 unused; labels start at 1
    function find(x) {
        let r = x;
        while (parent[r] !== r) r = parent[r];
        while (parent[x] !== r) { const nx = parent[x]; parent[x] = r; x = nx; }
        return r;
    }
    function union(a, b) {
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent[ra < rb ? rb : ra] = ra < rb ? ra : rb;
    }
    let nextLabel = 1;

    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const idx = y * W + x;
            if (!mask[idx]) continue;
            const leftLabel = x > 0 ? labels[idx - 1] : 0;
            const topLabel = y > 0 ? labels[idx - W] : 0;
            if (leftLabel && topLabel) {
                const m = Math.min(leftLabel, topLabel);
                labels[idx] = m;
                if (leftLabel !== topLabel) union(leftLabel, topLabel);
            } else if (leftLabel) {
                labels[idx] = leftLabel;
            } else if (topLabel) {
                labels[idx] = topLabel;
            } else {
                labels[idx] = nextLabel;
                parent[nextLabel] = nextLabel;
                nextLabel++;
            }
        }
    }

    // 2nd pass: bbox集計
    const bboxMap = new Map(); // root label -> {x0,y0,x1,y1}
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const idx = y * W + x;
            const lbl = labels[idx];
            if (!lbl) continue;
            const root = find(lbl);
            const b = bboxMap.get(root);
            if (!b) {
                bboxMap.set(root, { x0: x, y0: y, x1: x, y1: y });
            } else {
                if (x < b.x0) b.x0 = x;
                if (x > b.x1) b.x1 = x;
                if (y < b.y0) b.y0 = y;
                if (y > b.y1) b.y1 = y;
            }
        }
    }
    return Array.from(bboxMap.values());
}

// 近接bboxをmerge。bbox間距離（X/Y軸ともの隙間）が dist 以下なら同じグループ。
// 反復してこれ以上mergeできなくなるまで繰り返す。
function _mergeCloseBBoxes(boxes, dist) {
    let arr = boxes.map(b => ({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }));
    let changed = true;
    let safetyLoops = 10;
    while (changed && safetyLoops-- > 0) {
        changed = false;
        const used = new Array(arr.length).fill(false);
        const out = [];
        for (let i = 0; i < arr.length; i++) {
            if (used[i]) continue;
            let cur = arr[i];
            used[i] = true;
            let mergedThisRound = true;
            while (mergedThisRound) {
                mergedThisRound = false;
                for (let j = 0; j < arr.length; j++) {
                    if (used[j]) continue;
                    if (_bboxGap(cur, arr[j]) <= dist) {
                        cur = {
                            x0: Math.min(cur.x0, arr[j].x0),
                            y0: Math.min(cur.y0, arr[j].y0),
                            x1: Math.max(cur.x1, arr[j].x1),
                            y1: Math.max(cur.y1, arr[j].y1)
                        };
                        used[j] = true;
                        mergedThisRound = true;
                        changed = true;
                    }
                }
            }
            out.push(cur);
        }
        arr = out;
    }
    return arr;
}

function _bboxGap(a, b) {
    const dx = (a.x1 < b.x0) ? (b.x0 - a.x1) : (b.x1 < a.x0 ? a.x0 - b.x1 : 0);
    const dy = (a.y1 < b.y0) ? (b.y0 - a.y1) : (b.y1 < a.y0 ? a.y0 - b.y1 : 0);
    // チェビシェフ距離（X/Yの大きい方）。対角でもmergeしすぎない
    return Math.max(dx, dy);
}

/**
 * 呼び出し側ヘルパー: dataUrlを分割し、画像オブジェクト配列を返す。
 * 分割失敗時は元画像1枚分の配列を返す（呼び出し側ロジック簡略化のため）。
 * @param {string} dataUrl
 * @param {object} params - { baseX, baseY, fallbackW, fallbackH, idPrefix, options }
 * @returns {Promise<Array<{id,dataUrl,x,y,w,h}>>}
 */
async function splitImageToHandwritingObjects(dataUrl, params) {
    const p = params || {};
    const baseX = p.baseX || 0;
    const baseY = p.baseY || 0;
    const idPrefix = p.idPrefix || 'img';
    const result = await splitHandwritingImageDataUrl(dataUrl, p.options);
    // scale: 元画像のピクセル座標をそのまま使う場合は 1.0。
    // 例: ファイル読込でテンプレート全面に引き伸ばす場合 sx = TEMPLATE_W_PX / srcW
    let sx = (typeof p.scaleX === 'number' && p.scaleX > 0) ? p.scaleX : 1;
    let sy = (typeof p.scaleY === 'number' && p.scaleY > 0) ? p.scaleY : 1;
    if ((p.targetW || p.targetH) && result.sourceWidth && result.sourceHeight) {
        if (p.targetW) sx = p.targetW / result.sourceWidth;
        if (p.targetH) sy = p.targetH / result.sourceHeight;
    }
    if (result.parts && result.parts.length > 1) {
        try { console.info(`[image-splitter] ${idPrefix}: ${result.parts.length} parts (src ${result.sourceWidth}x${result.sourceHeight}, mode=${result.detectMode || '-'}, scale=${sx.toFixed(2)}x${sy.toFixed(2)})`); } catch (e) {}
        const t = Date.now();
        return result.parts.map((part, i) => ({
            id: `${idPrefix}-${t}-${i}`,
            dataUrl: part.dataUrl,
            x: Math.round(baseX + part.x * sx),
            y: Math.round(baseY + part.y * sy),
            w: Math.round(part.w * sx),
            h: Math.round(part.h * sy)
        }));
    }
    // fallback: 1枚画像
    try { console.info(`[image-splitter] ${idPrefix}: fallback (${result.fallbackReason || 'unknown'}, mode=${result.detectMode || '-'})`); } catch (e) {}
    const fw = p.fallbackW || result.sourceWidth || 0;
    const fh = p.fallbackH || result.sourceHeight || 0;
    return [{
        id: `${idPrefix}-${Date.now()}-0`,
        dataUrl,
        x: baseX,
        y: baseY,
        w: fw,
        h: fh
    }];
}

// グローバル公開
window.splitHandwritingImageDataUrl = splitHandwritingImageDataUrl;
window.splitImageToHandwritingObjects = splitImageToHandwritingObjects;
window.IMAGE_SPLIT_DEFAULTS = IMAGE_SPLIT_DEFAULTS;
