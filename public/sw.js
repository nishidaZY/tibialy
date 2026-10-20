// TIBIALY service worker: makes the site installable and quick to reopen.
// Versioned files (sprites, scripts: ?v=...) and icons come from the cache once fetched; pages
// try the network first and fall back to the last copy when offline. Market prices are always live.
const CACHE = 'tibialy-v1';

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/items/market_prices')) return;
  const fixed = /^\/(stash|damage|icons|figures|assets)\//.test(url.pathname);
  e.respondWith(fixed ? fromCache(req) : fromNetwork(req));
});

async function fromCache(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}
async function fromNetwork(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch (err) {
    return (await caches.match(req)) || Response.error();
  }
}
