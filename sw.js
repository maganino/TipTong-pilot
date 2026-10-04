/**
 * Offline support for the pilot PWA.
 *
 * Strategy, chosen for a build whose JS bundles carry content hashes:
 *  - navigations: network-first, so an online launch always gets the newest
 *    deploy; the last good index.html is the offline fallback.
 *  - everything else same-origin: stale-while-revalidate — served from cache
 *    immediately (this is what makes play work offline), refreshed in the
 *    background for next time.
 *
 * Cross-origin requests (Supabase auth + telemetry) are deliberately not
 * touched: caching an API response would be wrong, and the telemetry sink
 * already handles failed delivery by retrying.
 */
const CACHE = "tiptong-pilot-v1";

// The SW lives at the scope root, so "./index.html" resolves inside
// /TipTong-pilot/ regardless of where Pages hosts us.
const SHELL = ["./", "./index.html", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // SPA navigations (/, /play, /settings …) all resolve to index.html.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Deep links come back as Pages' 404.html (same SPA, 404 status) —
          // only a clean 200 should refresh the cached shell.
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("./index.html")),
    );
    return;
  }

  // Assets: cached copy wins, network refreshes the cache in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const refresh = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? refresh;
    }),
  );
});
