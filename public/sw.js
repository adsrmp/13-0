// 13–0 service worker: lets the game install on phones and open offline.
// The page and its files are fetched fresh when online (so updates show up right away)
// and served from the cache when there's no connection. The /api routes are never cached.
const CACHE = "thirteen-v1";
const CORE = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req.mode === "navigate" ? "/" : req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req.mode === "navigate" ? "/" : req);
      if (hit) return hit;
      throw err;
    }
  })());
});
