// Service worker: يخلّي التطبيق يفتح حتى لو النت واقع، ويحدّث نفسه لما النت يرجع.
const V = 'thrills-v4';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'orders.js', 'book.js', 'costs.js', 'payroll.js', 'firebase-config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const CDN = /^(www\.gstatic\.com\/firebasejs\/|fonts\.googleapis\.com\/|fonts\.gstatic\.com\/)/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // الملفات بتاعتنا: النت الأول، والكاش لو النت واقع
    e.respondWith(
      fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(V).then(c => c.put(req, copy)); } return r; })
        .catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
    );
  } else if (CDN.test(url.host + url.pathname)) {
    // مكتبات Firebase والخطوط: الكاش الأول
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(r => { const copy = r.clone(); caches.open(V).then(c => c.put(req, copy)); return r; }))
    );
  }
});
