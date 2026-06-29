/* Bhajan Sangrah PWA — build 20260629T13442 */
const BUILD = "20260629T13442";
const BASE = "/bhajan-sangrah/";
const CACHE_STATIC = 'static-' + BUILD;
const CACHE_RUNTIME = 'runtime-' + BUILD;

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function underScope(url) {
  const p = url.pathname;
  const root = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;
  return p.startsWith(BASE) || (root && p === root);
}

function isNetworkFirst(request, url) {
  if (!sameOrigin(url) || !underScope(url)) return false;
  if (request.mode === 'navigate') return true;
  if (request.destination === 'document') return true;
  if (url.pathname.endsWith('.html')) return true;
  if (url.pathname.endsWith('/assets/search-index.json')) return true;
  return false;
}

function isStaticAsset(url) {
  if (!sameOrigin(url) || !underScope(url)) return false;
  const p = url.pathname;
  return (
    p.includes('/assets/css/') ||
    p.includes('/assets/js/') ||
    p.includes('/assets/icons/') ||
    p.includes('/assets/banners/')
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_RUNTIME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_STATIC);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  return cached || (await fetchPromise) || fetch(request);
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_STATIC && key !== CACHE_RUNTIME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!sameOrigin(url)) return;

  if (isNetworkFirst(request, url)) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
