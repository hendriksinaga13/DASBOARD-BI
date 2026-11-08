/* M245 Sales Intelligence — Service Worker */

const CACHE_VERSION = 'm245-v5.2-FIX';   // ← naikkan versi
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/styles.css',
  './assets/mobile.css',
  './assets/icon.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] precache failed:', err))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;

  if(req.mode === 'navigate' || req.destination === 'document'){
    event.respondWith(
      fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, clone));
        return res;
      }).catch(() =>
        caches.match(req).then(hit => hit || caches.match('./index.html'))
      )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if(res && res.ok){
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});