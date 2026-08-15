/*
 * SIM SMANSARI — Service Worker
 * Strategi:
 *   - App shell (HTML/CSS/ikon/manifest) → precache, tersedia offline.
 *   - Modul JS lokal & CDN pihak ketiga → stale-while-revalidate (runtime cache).
 *   - /api/* dan Firestore/Google APIs → NETWORK ONLY, tidak pernah di-cache
 *     agar data sekolah (absensi, nilai, pembayaran) selalu segar.
 *
 * Bump CACHE_VERSION setiap kali app shell berubah agar klien mengambil versi baru.
 */
const CACHE_VERSION = 'sim-v2';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Berkas inti yang di-precache saat install.
// Gunakan '/' (bukan '/index.html') karena hosting me-rewrite '/' ke index.html;
// path '/index.html' langsung dapat mengembalikan 404 di sebagian hosting (Vercel).
const SHELL_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/styles/design-tokens.css',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/maskable-512.png',
  '/assets/icons/apple-touch-icon.png',
];

// Host CDN yang boleh di-cache runtime (aset statis, aman untuk stale-while-revalidate).
const RUNTIME_CDN_HOSTS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'cdn.sheetjs.com',
  'cdn.tailwindcss.com',
]);

// Host yang TIDAK BOLEH di-cache (data dinamis / autentikasi).
const NETWORK_ONLY_HOST_HINTS = [
  'firestore.googleapis.com',
  'firebaseio.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'googleapis.com', // Firebase Auth/Firestore/Storage
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll gagal-total jika satu berkas 404; tambahkan satu per satu agar tahan.
      await Promise.all(
        SHELL_ASSETS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'reload' });
            if (response && response.ok) {
              await cache.put(url, response.clone());
            }
          } catch {
            /* abaikan berkas yang gagal diambil saat install */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// Izinkan halaman memicu update langsung: postMessage({type:'SKIP_WAITING'}).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isNetworkOnly(url) {
  if (url.pathname.startsWith('/api/')) return true;
  return NETWORK_ONLY_HOST_HINTS.some((hint) => url.hostname.endsWith(hint));
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);
  return cached || network || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Hanya tangani GET; biarkan POST/PUT/DELETE lewat apa adanya.
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Hanya http/https.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Data dinamis → jangan disentuh SW (network only).
  if (isNetworkOnly(url)) return;

  const isSameOrigin = url.origin === self.location.origin;

  // Navigasi (SPA) → App Shell fallback agar bisa dibuka offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const shell = await cache.match('/');
          return shell || Response.error();
        }
      })()
    );
    return;
  }

  // Aset lokal (JS module, CSS, ikon) → stale-while-revalidate.
  if (isSameOrigin) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // CDN allowlist → stale-while-revalidate.
  if (RUNTIME_CDN_HOSTS.has(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Sisanya biarkan default (network).
});
