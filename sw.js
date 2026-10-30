// HandyGo · service worker: guarda la app para que abra rápido y sin señal.
const CACHE = 'handygo-v26';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
// Librerías externas con versión fija: se descargan una sola vez y quedan guardadas
const LIBS = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/', 'https://unpkg.com/maplibre-gl@4.7.1/', 'https://fonts.gstatic.com/'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) return; // el chat y los datos siempre van a la red

  if (LIBS.some(p => req.url.startsWith(p))) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return r;
    })));
    return;
  }
  if (url.origin !== location.origin) return;

  // La app: se pide la versión nueva, pero si la red tarda más de 2,5 s se abre la guardada
  const net = fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; });
  const cached = caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : null));
  e.respondWith(new Promise(resolve => {
    let done = false; const finish = r => { if (!done && r) { done = true; resolve(r); } };
    const t = setTimeout(() => cached.then(finish), 2500);
    net.then(r => { clearTimeout(t); finish(r); }).catch(() => { clearTimeout(t); cached.then(r => r ? finish(r) : finish(Response.error())); });
  }));
});
