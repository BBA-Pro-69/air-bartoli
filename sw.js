/* Air Bartoli / Keyrilès - Service Worker
   Même choix que Chicago-Bruno-Chris : cache versionné, réseau d'abord,
   repli sur le shell si le réseau est lent ou absent. Les appels Supabase
   ne sont pas mis en cache : les points doivent toujours venir de la base. */
const VERSION = '2026-09-19q';
const SHELL = 'air-bartoli-shell-' + VERSION;
const VENDOR = 'air-bartoli-vendor-' + VERSION;
const PATIENCE = 1200;
const SHELL_URLS = [
  './', './index.html', './login.html', './enfant.html', './historique.html',
  './dashboard.html', './reglages.html', './manifest.webmanifest', './robots.txt',
  './css/app.css', './css/avatars.css', './js/config.js', './js/api.js', './js/ui.js', './js/app.js',
  './js/login.js', './js/saisie.js', './js/enfant.js', './js/historique.js',
  './js/dashboard.js', './js/reglages.js', './js/cinematics.js', './js/pwa.js',
  './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable-512.png',
  './assets/apple-touch-icon-180.png', './assets/avatar_Keyran.png', './assets/avatar_Rilès.png',
  './assets/avatar_Bruno.png', './assets/avatar_Névine.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await Promise.all(SHELL_URLS.map(async url => {
      try { await cache.add(new Request(url, { cache: 'reload' })); } catch (_) {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('air-bartoli-') && k !== SHELL && k !== VENDOR)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'air-bartoli-skip-waiting') self.skipWaiting();
});

function timeout(ms) { return new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), ms)); }

async function networkThenCache(request, fallback = null) {
  const cache = await caches.open(SHELL);
  try {
    const response = await Promise.race([fetch(request), timeout(PATIENCE)]);
    if (response && (response.status === 200 || response.type === 'opaque')) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (_) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (fallback) return (await cache.match(fallback, { ignoreSearch: true })) || fetch(request);
    return fetch(request);
  }
}

async function vendorCacheFirst(request) {
  const cache = await caches.open(VENDOR);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response && (response.status === 200 || response.type === 'opaque')) cache.put(request, response.clone()).catch(() => {});
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Supabase : pas de cache pour éviter d'afficher un solde périmé.
  if (url.hostname.endsWith('.supabase.co')) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkThenCache(request, './index.html'));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(networkThenCache(request));
    return;
  }
  event.respondWith(vendorCacheFirst(request));
});
