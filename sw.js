/* Installable Live-Karte: minimal offline shell only.
 * No OSM tiles, GitHub API, encrypted inboxes, GPS coordinates, passwords,
 * private repositories or authenticated requests are ever cached here.
 */
'use strict';
const CACHE_NAME='livekarte-shell-pwa-v19';
const SHELL_FILES=[
  'index.html','style.css','core.js','walking-core.js','day-plan-core.js','route-discovery.js','app.js','sync.js',
  'outbox-core.js','sync-out.js','build-version.js','pwa.js','manifest.json',
  'vendor/leaflet.js','vendor/leaflet.css',
  'icons/livekarte.svg','icons/livekarte-192.png',
  'icons/livekarte-512.png','icons/livekarte-maskable-512.png'
];
const SHELL_SET=new Set(SHELL_FILES);
const scopedUrl=path=>new URL(path,self.registration.scope).toString();
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_FILES.map(scopedUrl));
    // Activate this initial offline shell without requiring an extra reload.
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('livekarte-shell-') && k!==CACHE_NAME)
      .map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET'||req.headers.has('Authorization'))return;
  const url=new URL(req.url), scope=new URL(self.registration.scope);
  if(url.origin!==scope.origin || !url.pathname.startsWith(scope.pathname))return;
  const relative=url.pathname.slice(scope.pathname.length);
  // Strict allowlist: no /sync/inbox, GitHub, OSM or arbitrary URL data caching.
  const navigate=req.mode==='navigate';
  if(!navigate && !SHELL_SET.has(relative))return;
  if(navigate && relative && relative!=='index.html' && !relative.endsWith('/'))return;
  const cacheKey=scopedUrl(navigate?'index.html':relative);
  event.respondWith((async()=>{
    try{
      // Network first: deployed code and travel plans are always fresh online.
      // Bypass stale HTTP caches for source files while keeping the offline shell.
      const fresh=await fetch(req,{cache:'no-store'});
      if(fresh.ok && fresh.type==='basic'){
        try{
          const cache=await caches.open(CACHE_NAME);
          await cache.put(cacheKey,fresh.clone());
        }catch{} // Cache quota must never prevent displaying the live app.
      }
      return fresh;
    }catch(err){
      const cached=await caches.match(cacheKey,{cacheName:CACHE_NAME});
      if(cached)return cached;
      throw err;
    }
  })());
});
