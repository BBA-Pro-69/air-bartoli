// Service Worker Air Bartoli - Cache versionné
const VERSION = '2026-09-23g';
const CACHE_NAME = 'air-bartoli-' + VERSION;

const SHELL = [
  './',
  './index.html?v=' + VERSION,
  './login.html?v=' + VERSION,
  './manifest.webmanifest?v=' + VERSION,
  './css/app.css?v=' + VERSION,
  './css/avatars.css?v=' + VERSION,
  './js/config.js',
  './js/api.js',
  './js/ui.js',
  './js/app.js',
  './js/login.js',
  './js/saisie.js',
  './js/enfant.js',
  './js/historique.js',
  './js/dashboard.js',
  './js/reglages.js',
  './js/cinematics.js',
  './js/pwa.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon-180.png',
  './assets/avatar_Bruno.png',
  './assets/avatar_Névine.png',
  './assets/avatar_Keyran.png',
  './assets/avatar_Rilès.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});
