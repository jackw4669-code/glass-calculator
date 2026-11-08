/* Wilson's Glass job book: the service worker.

   It keeps a copy of the app itself on this machine (the page, its fonts
   and its icons) so the job book still opens when there is no signal. It
   never keeps customers' details: the app has its own offline copy of the
   book for that, as before, and everything under /api/ goes straight to
   the shop's server.

   The page always comes from the server when the server answers. The
   saved copy is only used when it cannot be reached, or takes longer than
   WAIT to answer. The app then says it is showing the last copy saved on
   this machine, and offers the newer version once it can.

   Change VERSION whenever the icons or fonts change, so every machine
   fetches the new ones. Changes to index.html do not need it. */
const VERSION = '2026-11-08.1';
const CACHE = 'wg-app-' + VERSION;
const PAGE = '/';
const WAIT = 4000;

const KEEP = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/fonts/archivo-latin-400-normal.woff2',
  '/fonts/archivo-latin-500-normal.woff2',
  '/fonts/archivo-latin-600-normal.woff2',
  '/fonts/archivo-latin-700-normal.woff2',
  '/fonts/ibm-plex-mono-latin-400-normal.woff2',
  '/fonts/ibm-plex-mono-latin-500-normal.woff2',
  '/fonts/ibm-plex-mono-latin-600-normal.woff2'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(KEEP.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

/* Clear out the copies an older version kept. */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('wg-app-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;       // maps, postcodes, email: not ours
  if (req.mode === 'navigate') {
    if (url.pathname === '/' || url.pathname === '/index.html') e.respondWith(page(e));
    return;                                               // photo links and the rest: as normal
  }
  const p = url.pathname;
  if (p.startsWith('/fonts/') || p.startsWith('/icons/') || p === '/manifest.json' || p === '/favicon.ico')
    e.respondWith(kept(req));
  // anything else, including the job book itself (/api/), goes to the server untouched
});

const MATCH = { ignoreSearch: true, ignoreVary: true };
const slow = ms => new Promise((_, no) => setTimeout(() => no(new Error('slow')), ms));

/* The page: from the server if it answers within WAIT, keeping a fresh
   copy; otherwise the copy kept last time. */
async function page(e) {
  const cache = await caches.open(CACHE);
  const fresh = fetch(e.request).then(res => {
    if (res.ok && res.type === 'basic') e.waitUntil(cache.put(PAGE, res.clone()).catch(() => {}));
    return res;
  });
  e.waitUntil(fresh.catch(() => {}));                     // finish keeping it, even if the old copy was shown
  try {
    return await Promise.race([fresh, slow(WAIT)]);
  } catch (err) {
    return (await cache.match(PAGE, MATCH)) || fresh;     // nothing kept yet: wait for the server
  }
}

/* Fonts and icons: the kept copy, or fetch and keep it. */
async function kept(req) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(req, MATCH);
  if (saved) return saved;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') cache.put(req, res.clone());
  return res;
}
