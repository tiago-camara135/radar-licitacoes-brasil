const CACHE_PREFIX = 'binary-ai-lab-';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)));
    await self.registration.unregister();
    await self.clients.claim();
  })());
});
