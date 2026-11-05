/* Installable Live-Karte: minimal offline shell only.
 * No OSM tiles, GitHub API, encrypted inboxes, GPS coordinates, passwords,
 * private repositories or authenticated requests are ever cached here.
 */
'use strict';
const CACHE_NAME='livekarte-shell-pwa-v22';
const SHELL_FILES=[
  'index.html','style.css','map-popup-core.js','map-camera-core.js','core.js','walking-core.js','routing-requests.js','tour-navigation-core.js','day-plan-core.js','multi-day-core.js','day-context-core.js','day-selector-ui.js','place-ui.js','tour-ui.js','route-model-core.js','route-discovery.js','place-search-core.js','next-step-core.js','japanese-destination.js','station-transfer-core.js','google-demo.js','app.js','sync.js',
  'outbox-core.js','sync-out.js','build-version.js','pwa.js','ticket-vault.js','ticket-library.js','ticket-library-ui.js','ticket-share-inbox.js','manifest.json',
  'vendor/leaflet.js','vendor/leaflet.css',
  'icons/livekarte.svg','icons/livekarte-192.png',
  'icons/livekarte-512.png','icons/livekarte-maskable-512.png'
];
// Shared document payloads are only written to local IndexedDB and never
// fetched over the network or cached as HTTP responses.
if(typeof importScripts==='function')importScripts('./ticket-share-inbox.js');
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
  if(req.headers.has('Authorization'))return;
  const url=new URL(req.url), scope=new URL(self.registration.scope);
  if(url.origin!==scope.origin || !url.pathname.startsWith(scope.pathname))return;
  const relative=url.pathname.slice(scope.pathname.length);
  if(req.method==='POST'&&relative==='share-ticket'){
    event.respondWith((async()=>{
      // Only an installed Android PWA advertises the manifest share target.
      // A POST to this exact local path never reaches GitHub Pages.
      let code='invalid';
      try{
        const form=await req.formData();
        const file=form.get('ticket');
        if(!file||typeof file.arrayBuffer!=='function')code='missing';
        else if(!self.LivekarteTicketShareInbox)code='offline';
        else{
          await self.LivekarteTicketShareInbox.store(file);
          code='ready';
        }
      }catch{
        code='error';
      }
      const destination=new URL('./?shared-ticket='+code+'#ticket-vault',self.registration.scope);
      return Response.redirect(destination.href,303);
    })());
    return;
  }
  if(req.method!=='GET')return;
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
