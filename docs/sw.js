// Service worker: precache everything for full offline play.
const CACHE = 'factory-72737efd874e';
const FILES = ["./","./fonts/fonts.css","./fonts/titillium-400.woff2","./fonts/titillium-600.woff2","./fonts/titillium-700.woff2","./game.js","./icons/icon-120.png","./icons/icon-152.png","./icons/icon-180.png","./icons/icon-192.png","./icons/icon-32.png","./icons/icon-512.png","./icons/icon-64.png","./icons/icon-maskable-512.png","./index.html","./manifest.webmanifest","./style.css"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res.ok && new URL(req.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
