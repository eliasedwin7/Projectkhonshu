// Build replaces VERSION and ASSETS. Each release keeps a coherent app shell.
const VERSION = 'dev';
const ASSETS = [];
const PREFIX = 'khonshu-app:' + self.registration.scope + ':';
const CACHE = PREFIX + VERSION;
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(ASSETS.map(async asset => {
      const response = await fetch(asset, { cache: 'reload' });
      if (!response.ok) throw new Error('Could not save ' + asset);
      // Static hosts redirect index.html and remote.html to clean URLs. Store
      // their bodies under the original asset keys without redirect metadata,
      // so an offline navigation can safely use them as its final response.
      await cache.put(asset, new Response(await response.blob(), {
        status: response.status, statusText: response.statusText, headers: response.headers,
      }));
    }));
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'APPLY_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  // The cached shell and its scripts belong to the same release. A new worker
  // activates only after all its assets are saved and the user accepts the update.
  if (request.mode === 'navigate') {
    const page = /\/remote(?:\.html)?\/?$/.test(url.pathname) ? './remote.html' : './index.html';
    event.respondWith(caches.open(CACHE).then(async cache => await cache.match(new URL(page, self.location.href)) || fetch(request)));
    return;
  }
  const asset = ASSETS.some(path => new URL(path, self.location.href).pathname === url.pathname);
  if (asset) event.respondWith(caches.open(CACHE).then(async cache => await cache.match(request, { ignoreSearch: true }) || fetch(request)));
});
