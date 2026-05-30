const fs = require('fs');
const path = require('path');
const { ROOT, ASSETS } = require('./paths');

function normalizeBase(base) {
  const b = base || '/';
  return b.endsWith('/') ? b : `${b}/`;
}

function resolveAsset(relPath) {
  return path.join(ROOT, relPath.replace(/\//g, path.sep));
}

async function generatePwaIcons(docsDir, config) {
  const srcRel = config.site_icon || 'assets/icons/favicon.jpg';
  const src = resolveAsset(srcRel);
  if (!fs.existsSync(src)) {
    console.warn('pwa: missing site_icon, skipping PWA icons');
    return;
  }
  const outDir = path.join(docsDir, 'assets', 'icons');
  fs.mkdirSync(outDir, { recursive: true });
  try {
    const sharp = require('sharp');
    for (const size of [192, 512]) {
      const out = path.join(outDir, `pwa-${size}.png`);
      await sharp(src).resize(size, size, { fit: 'cover' }).png().toFile(out);
    }
    console.log('pwa: icons pwa-192.png, pwa-512.png');
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
    console.warn('pwa: sharp not installed — copy favicon as fallback icons');
    for (const size of [192, 512]) {
      fs.copyFileSync(src, path.join(outDir, `pwa-${size}.png`));
    }
  }
}

function writeManifest(docsDir, config, base) {
  const b = normalizeBase(base);
  const manifest = {
    name: config.site_title || 'भजन संग्रह',
    short_name: config.site_title || 'भजन संग्रह',
    description: 'भक्ति भजन संग्रह — स्थानीय ऑफ़लाइन पढ़ने के लिए इंस्टॉल करें',
    start_url: `${b}index.html`,
    scope: b,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#faf6f0',
    theme_color: '#8b3a4a',
    lang: 'hi',
    dir: 'ltr',
    icons: [
      {
        src: 'assets/icons/pwa-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'assets/icons/pwa-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'assets/icons/pwa-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
  fs.writeFileSync(
    path.join(docsDir, 'manifest.webmanifest'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

function writeServiceWorker(docsDir, base, buildId) {
  const b = normalizeBase(base);
  const sw = `/* Bhajan Sangrah PWA — build ${buildId} */
const BUILD = ${JSON.stringify(buildId)};
const BASE = ${JSON.stringify(b)};
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
`;
  fs.writeFileSync(path.join(docsDir, 'sw.js'), sw, 'utf8');
}

async function writePwaArtifacts(docsDir, config, base) {
  const buildId = new Date().toISOString().replace(/[-:]/g, '').slice(0, 14);
  await generatePwaIcons(docsDir, config);
  writeManifest(docsDir, config, base);
  writeServiceWorker(docsDir, base, buildId);
  console.log(`pwa: manifest + sw.js (build ${buildId})`);
}

module.exports = { writePwaArtifacts, normalizeBase };
