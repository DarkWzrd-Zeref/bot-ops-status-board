// Minimal app-shell service worker: same-origin assets are served stale-while-revalidate,
// cross-origin requests (Google Sheets) always go to the network.
const CACHE = "area67-command-v3";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["./", "./manifest.webmanifest"]).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api") || url.pathname === "/mcp" || url.pathname.startsWith("/mcp/") || url.pathname === "/health") return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      // Load the newest app shell after deployment. Only immutable assets may
      // prefer their cached copy; never cache event streams or MCP requests.
      return req.mode === "navigate" ? (await network || Response.error()) : (cached || await network || Response.error());
    }),
  );
});
