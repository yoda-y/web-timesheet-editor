// === TGA 読み込み (Phase 3) ===
// ブラウザは TGA をネイティブ decode できないため、ArrayBuffer から自前で decode する。
// 対応: uncompressed true-color (type2, 24/32bit), uncompressed grayscale (type3, 8bit),
//        RLE true-color (type10, 24/32bit)。
// color-mapped (type1/9) は未対応。
//
// decodeTga(arrayBuffer) -> { width, height, imageData, dataUrl } または例外。

(function() {
    function isTgaFile(file) {
        if (!file) return false;
        const name = (file.name || '').toLowerCase();
        if (name.endsWith('.tga')) return true;
        const tp = (file.type || '').toLowerCase();
        return tp === 'image/tga' || tp === 'image/x-tga' || tp === 'image/targa';
    }

    // ArrayBuffer → { width, height, imageData, dataUrl }
    function decodeTga(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        if (bytes.length < 18) throw new Error('TGA: ファイルが小さすぎます');

        const idLength      = bytes[0];
        const colorMapType  = bytes[1];
        const imageType     = bytes[2];
        // color map spec (5 bytes): bytes[3..7] — 未対応形式では無視
        // image spec
        const width  = bytes[12] | (bytes[13] << 8);
        const height = bytes[14] | (bytes[15] << 8);
        const pixelDepth = bytes[16];
        const imageDescriptor = bytes[17];

        if (width <= 0 || height <= 0) throw new Error('TGA: サイズが不正です');
        if (colorMapType !== 0) throw new Error('TGA: color-mapped 形式は未対応です');

        const isTrueColor = (imageType === 2 || imageType === 10);
        const isGrayscale = (imageType === 3);
        const isRLE = (imageType === 10);
        if (!isTrueColor && !isGrayscale) {
            throw new Error('TGA: 未対応の imageType=' + imageType);
        }
        const bytesPerPixel = pixelDepth >> 3; // 8→1, 24→3, 32→4
        if (isTrueColor && bytesPerPixel !== 3 && bytesPerPixel !== 4) {
            throw new Error('TGA: 未対応の bit深度=' + pixelDepth);
        }
        if (isGrayscale && bytesPerPixel !== 1) {
            throw new Error('TGA: grayscale は 8bit のみ対応');
        }

        // データ開始位置: header(18) + image ID + color map(なし)
        let offset = 18 + idLength;

        const numPixels = width * height;
        // 読み出した生ピクセル (BGR(A) または gray) を numPixels*bytesPerPixel で保持
        const raw = new Uint8Array(numPixels * bytesPerPixel);

        if (!isRLE) {
            // 非圧縮: そのままコピー
            const need = numPixels * bytesPerPixel;
            if (offset + need > bytes.length) throw new Error('TGA: データ長不足 (非圧縮)');
            raw.set(bytes.subarray(offset, offset + need));
        } else {
            // RLE 展開
            let pi = 0; // raw への書き込みピクセル数
            let p = offset;
            while (pi < numPixels) {
                if (p >= bytes.length) throw new Error('TGA: データ長不足 (RLE)');
                const packet = bytes[p++];
                const count = (packet & 0x7f) + 1;
                if (packet & 0x80) {
                    // RLE packet: 1ピクセル分を count 回繰り返す
                    if (p + bytesPerPixel > bytes.length) throw new Error('TGA: RLE 途中切れ');
                    for (let c = 0; c < count && pi < numPixels; c++) {
                        for (let b = 0; b < bytesPerPixel; b++) raw[pi * bytesPerPixel + b] = bytes[p + b];
                        pi++;
                    }
                    p += bytesPerPixel;
                } else {
                    // RAW packet: count ピクセル分をそのまま
                    for (let c = 0; c < count && pi < numPixels; c++) {
                        if (p + bytesPerPixel > bytes.length) throw new Error('TGA: RAW 途中切れ');
                        for (let b = 0; b < bytesPerPixel; b++) raw[pi * bytesPerPixel + b] = bytes[p + b];
                        p += bytesPerPixel;
                        pi++;
                    }
                }
            }
        }

        // RGBA へ変換
        const rgba = new Uint8ClampedArray(numPixels * 4);
        for (let i = 0; i < numPixels; i++) {
            if (isGrayscale) {
                const g = raw[i];
                rgba[i * 4] = g; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = g; rgba[i * 4 + 3] = 255;
            } else {
                const o = i * bytesPerPixel;
                const b = raw[o], g = raw[o + 1], r = raw[o + 2];
                const a = (bytesPerPixel === 4) ? raw[o + 3] : 255;
                rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
            }
        }

        // origin: imageDescriptor bit5 = 1 なら top-left、0 なら bottom-left (上下反転が必要)
        //         bit4 = 1 なら right origin (左右反転)
        const topOrigin  = (imageDescriptor & 0x20) !== 0;
        const rightOrigin = (imageDescriptor & 0x10) !== 0;

        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);

        for (let y = 0; y < height; y++) {
            const srcY = topOrigin ? y : (height - 1 - y);
            for (let x = 0; x < width; x++) {
                const srcX = rightOrigin ? (width - 1 - x) : x;
                const src = (srcY * width + srcX) * 4;
                const dst = (y * width + x) * 4;
                imageData.data[dst]     = rgba[src];
                imageData.data[dst + 1] = rgba[src + 1];
                imageData.data[dst + 2] = rgba[src + 2];
                imageData.data[dst + 3] = rgba[src + 3];
            }
        }
        ctx.putImageData(imageData, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        return { width, height, imageData, dataUrl };
    }

    // File(TGA) → { dataUrl, width, height } (PNG dataURL に変換)
    async function tgaFileToPngData(file) {
        const buf = await file.arrayBuffer();
        const r = decodeTga(buf);
        return { dataUrl: r.dataUrl, width: r.width, height: r.height };
    }

    window.tgaIo = {
        isTgaFile,
        decodeTga,
        tgaFileToPngData
    };
})();
