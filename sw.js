// AddAll のサービスワーカー: ページはネットワーク優先（更新がすぐ届くように）、つながらないときは保存分を使う
const CACHE = 'addall-v2';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'img/hom/pebble_0.webp', 'img/hom/pebble_1.webp', 'img/hom/pebble_2.webp', 'img/hom/sprout_0.webp', 'img/hom/sprout_1.webp', 'img/hom/sprout_2.webp', 'img/hom/mist_0.webp', 'img/hom/mist_1.webp', 'img/hom/mist_2.webp', 'img/hom/copper_0.webp', 'img/hom/copper_1.webp', 'img/hom/copper_2.webp', 'img/hom/primrose_0.webp', 'img/hom/primrose_1.webp', 'img/hom/primrose_2.webp', 'img/hom/ammonite_0.webp', 'img/hom/ammonite_1.webp', 'img/hom/ammonite_2.webp'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // フォント（Google Fonts）は保存分を先に使い、裏で取り直す
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // navigate のリクエストは init 付きで作り直せないので、URL から作る
  const fresh = req.mode === 'navigate' ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(req, { cache: 'no-cache' });
  e.respondWith(fetch(fresh).then(r => {
    if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(h => h || caches.match('index.html'))));
});
