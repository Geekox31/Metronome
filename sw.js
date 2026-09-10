/* Service worker : mise en cache pour un usage hors ligne. */
const CACHE = 'accordeur-harmonie-v2';
const ASSETS = [
  './', './index.html', './css/style.css',
  './js/instruments.js', './js/pitch.js', './js/pitch-worker.js', './js/synth.js', './js/app.js',
  './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './manifest.webmanifest'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res && res.ok && new URL(e.request.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
