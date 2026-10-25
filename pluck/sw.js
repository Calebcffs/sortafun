// Bump VERSION whenever any cached file changes, so phones pick up the new copy.
const VERSION = 'pluck-v2';

const FILES = [
  './',
  'index.html',
  'app.js',
  'style.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'fonts/barlow-condensed-400.woff2',
  'fonts/barlow-condensed-600.woff2',
  'fonts/barlow-condensed-700.woff2',
  'fonts/dm-sans-400.woff2',
  'fonts/dm-sans-500.woff2',
  'fonts/dm-sans-600.woff2',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      // ?v= so a CDN in front (sortafun.org sits behind Cloudflare) can't hand back an old copy.
      // Lookups below ignore the query, so the cached entries still match plain URLs.
      .then(cache => cache.addAll(FILES.map(f => new Request(f + '?v=' + VERSION, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache first. Everything the app needs is precached, so this works in airplane mode.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(req).catch(() => {
        if (req.mode === 'navigate') return caches.match('index.html', { ignoreSearch: true });
        return Response.error();
      });
    })
  );
});
