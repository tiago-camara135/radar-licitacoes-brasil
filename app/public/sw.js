const CACHE='radar-licitacoes-v3-1-secure';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/styles.css','/app.js']))));
self.addEventListener('fetch',e=>{if(e.request.url.includes('/api/')) return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));});
