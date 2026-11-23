const CACHE="tvc-control-shell-v21";
const SHELL=["/","/index.html","/offline.html","/theme-init.js?v=1","/styles.css?v=20","/app.js?v=19","/manifest.webmanifest","/icon.svg","/icon-180.png","/icon-192.png","/icon-512.png"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=="GET"||url.origin!==self.location.origin||url.pathname.startsWith("/api/"))return;
 if(event.request.mode==="navigate"){event.respondWith(fetch(event.request).catch(()=>caches.match("/offline.html")));return;}
 event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));return response;})));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(all=>{
  const existing=all.find(client=>client.url.startsWith(self.location.origin));
  if(existing)return existing.focus();
  return self.clients.openWindow("/");
 }));
});
