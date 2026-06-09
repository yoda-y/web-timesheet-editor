// Service Worker for Web Timesheet Editor
// CACHE_NAME を更新するとクライアントが旧キャッシュを破棄してリロード
const CACHE_NAME = 'timesheet-editor-v2-0.21.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icons/icon.svg',
  './js/main.js',
  './js/state.js',
  './js/utils.js',
  './js/draw.js',
  './js/input.js',
  './js/menu.js',
  './js/settings.js',
  './js/history.js',
  './js/sections.js',
  './js/dialogue.js',
  './js/camera.js',
  './js/repeat.js',
  './js/frame-ops.js',
  './js/sheets.js',
  './js/template.js',
  './js/template-bbox.js',
  './js/preview.js',
  './js/handwriting.js',
  './js/psd-export.js',
  './js/autosave.js',
  './js/i18n.js',
  './js/io-common.js',
  './js/tdts-io.js',
  './js/xdts-io.js',
  './js/document-tabs.js',
  // v0.8.0 追加: 外部テンプレート関連
  './js/external-template.js',
  './js/external-template-ui.js',
  './js/bbox-editor.js',
  './js/bbox-editor-canvas.js',
  // v0.9.0 追加: プロジェクトHTML/JSON
  './js/project-html.js',
  // v0.9.1 追加: 読み込み画像の自動分割
  './js/image-splitter.js',
  // v0.20.0 追加 (Phase 3): TGA 読み込み
  './js/tga-io.js',
  // v0.10.0 追加 (P2-1): プロジェクトHTMLからの postMessage 受信
  './js/project-handoff.js',
  // v0.12.0 追加 (P2-2d): 別名保存の形式選択モーダル
  './js/save-format-chooser.js',
  // v0.13.0 追加 (P3-w): TDTS/XDTS保存時の独自拡張警告
  './js/project-features.js',
  './js/version.js'
];

// Install: cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: cache-first strategy
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Return cached, but also update cache in background
        event.waitUntil(
          fetch(event.request).then(response => {
            if (response.ok) {
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, response);
              });
            }
          }).catch(() => {})
        );
        return cached;
      }

      // Not cached, fetch from network
      return fetch(event.request).then(response => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});
