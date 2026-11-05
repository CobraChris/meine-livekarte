/* Central, opt-in FOSSGIS foot-routing request boundary.
 * One throttle for single walks, day optimization, and multi-stop tours.
 * No GPS watch, storage, analytics, Google APIs or background requests.
 */
(function(root){
'use strict';
const ORIGIN='https://routing.openstreetmap.de';
const PATH_PREFIX='/routed-foot/';
const CONFIG=Object.freeze({
  walk:Object.freeze({
    timeoutMs:15000,maxChars:2000000,
    busy:'Routingdienst ist ausgelastet (Limit). Bitte später erneut versuchen.',
    unavailable:'Routingdienst ist nicht erreichbar',
    oversized:'Die Fußwegantwort war ungewöhnlich groß.'
  }),
  tour:Object.freeze({
    timeoutMs:18000,maxChars:2500000,
    busy:'Routingdienst ausgelastet. Bitte später erneut versuchen.',
    unavailable:'Routingdienst nicht erreichbar',
    oversized:'Rundgangantwort ungewöhnlich groß.'
  }),
  day:Object.freeze({
    timeoutMs:18000,maxChars:2500000,
    busy:'Routingdienst ausgelastet. Bitte später erneut versuchen.',
    unavailable:'Routingdienst nicht erreichbar',
    oversized:'Die Fußwegantwort ist ungewöhnlich groß.'
  })
});
function approvedUrl(url){
  if(typeof url!=='string')return false;
  try{
    const p=new URL(url);
    return p.origin===ORIGIN && p.pathname.startsWith(PATH_PREFIX)
      && (p.pathname.startsWith('/routed-foot/route/v1/driving/')||
          p.pathname.startsWith('/routed-foot/trip/v1/driving/'))
      && !p.username&&!p.password&&!p.hash;
  }catch{return false;}
}
function create({fetcher,clock=()=>Date.now(),setTimer=setTimeout,
  clearTimer=clearTimeout,minIntervalMs=1200}={}){
  if(typeof fetcher!=='function'||typeof clock!=='function'||
      !Number.isFinite(minIntervalMs)||minIntervalMs<1000)
    throw new Error('Routingdienst ist nicht korrekt konfiguriert.');
  let lastRequested=-Infinity;
  function claim(){
    const now=clock();
    if(!Number.isFinite(now)||now-lastRequested<minIntervalMs)return false;
    lastRequested=now;
    return true;
  }
  async function request({kind,url,controller}={}){
    const cfg=CONFIG[kind];
    if(!cfg)throw new Error('Unbekannte Fußweg-Anfrage.');
    if(!approvedUrl(url))throw new Error('Unerlaubter Routingdienst.');
    if(!controller||typeof controller.abort!=='function'||!controller.signal)
      throw new Error('Routing-Abbruchsteuerung fehlt.');
    const timeout=setTimer(()=>controller.abort(),cfg.timeoutMs);
    try{
      const response=await fetcher(url,{
        method:'GET',mode:'cors',credentials:'omit',referrerPolicy:'origin',
        headers:{Accept:'application/json'},signal:controller.signal
      });
      if(!response.ok){
        if(response.status===429)throw new Error(cfg.busy);
        throw new Error(cfg.unavailable+' (HTTP '+response.status+').');
      }
      const raw=await response.text();
      if(raw.length>cfg.maxChars)throw new Error(cfg.oversized);
      return JSON.parse(raw);
    }finally{clearTimer(timeout);}
  }
  return Object.freeze({claim,request});
}
const api=Object.freeze({create,approvedUrl});
if(typeof module==='object'&&module.exports)module.exports=api;
else root.LivekarteRoutingRequests=api;
})(globalThis);
