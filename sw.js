// Service Worker for Web Timesheet Editor
const CACHE_NAME = 'timesheet-editor-v1';
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
  './js/document-tabs.js'
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
