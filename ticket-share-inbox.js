/* On-device inbox for Android Share -> Live-Karte.
 * Used in both service worker and foreground page. No upload or cloud.
 * Pending items are NOT yet part of the main ticket library.
 */
'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.LivekarteTicketShareInbox=api;
})(typeof self!=='undefined'?self:typeof window!=='undefined'?window:undefined,function(){
  const DB_NAME='livekarte-ticket-share-inbox-v1';
  const MAX_BYTES=10*1024*1024,MAX_PENDING=5;
  const ALLOWED=new Set(['application/pdf','image/png','image/jpeg','image/webp']);
  function reqResult(req){return new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||Error('Temporärer Speicherfehler.'));
  });}
  function txDone(tx){return new Promise((resolve,reject)=>{
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error||Error('Temporärer Speicherfehler.'));
    tx.onabort=()=>reject(tx.error||Error('Temporärer Import abgebrochen.'));
  });}
  function dbOpen(){return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains('pending'))
        req.result.createObjectStore('pending',{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||Error('Lokaler Import nicht verfügbar.'));
    req.onblocked=()=>reject(Error('Import-Speicher wird in einem anderen Fenster genutzt.'));
  });}
  function id(){
    const bytes=new Uint8Array(16);
    if(!globalThis.crypto?.getRandomValues)throw Error('Zufallsgenerator nicht verfügbar.');
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
  }
  function detect(type,name,buffer){
    const lower=String(name||'').toLowerCase();
    let actual=ALLOWED.has(type)?type:
      lower.endsWith('.pdf')?'application/pdf':
      lower.endsWith('.png')?'image/png':
      lower.endsWith('.jpg')||lower.endsWith('.jpeg')?'image/jpeg':
      lower.endsWith('.webp')?'image/webp':'';
    if(!ALLOWED.has(actual))throw Error('Dateityp nicht unterstützt.');
    const b=new Uint8Array(buffer);
    const chars=(from,to)=>String.fromCharCode(...b.subarray(from,to));
    const matches=actual==='application/pdf'&&b.length>=5&&chars(0,5)==='%PDF-'||
      actual==='image/png'&&b.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v)||
      actual==='image/jpeg'&&b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255||
      actual==='image/webp'&&b.length>=12&&chars(0,4)==='RIFF'&&chars(8,12)==='WEBP';
    if(!matches)throw Error('Dateiinhalt ist kein unterstütztes Bild oder PDF.');
    return actual;
  }
  function normalize(input){
    if(!input||typeof input.arrayBuffer!=='function'||!Number.isFinite(input.size)||
      input.size<1||input.size>MAX_BYTES)throw Error('Nur Dateien von 1 Byte bis 10 MB.');
    const name=String(input.name||'Geteiltes Ticket').slice(0,120);
    return {name,providedType:String(input.type||'').toLowerCase()};
  }
  async function pending(){
    const db=await dbOpen();
    try{
      const tx=db.transaction('pending','readonly');
      return (await reqResult(tx.objectStore('pending').getAll()))
        .sort((a,b)=>String(a.created).localeCompare(String(b.created)));
    }finally{db.close();}
  }
  async function store(input){
    const {name,providedType}=normalize(input);
    const bytes=await input.arrayBuffer();
    if(bytes.byteLength!==input.size)throw Error('Geteilte Datei unvollständig.');
    const type=detect(providedType,name,bytes);
    const db=await dbOpen();
    try{
      const tx=db.transaction('pending','readwrite');
      const completed=txDone(tx);
      // Check count inside the same transaction. An unreviewed ticket
      // is never silently overwritten or moved to permanent storage.
      const store=tx.objectStore('pending');
      const existing=await reqResult(store.getAll());
      if(existing.length>=MAX_PENDING)throw Error('Bitte zuerst geteilte Tickets prüfen.');
      const item={id:id(),name,type,size:bytes.byteLength,
        created:new Date().toISOString(),blob:new Blob([bytes],{type})};
      store.add(item);
      await completed;
      return item.id;
    }finally{db.close();}
  }
  async function remove(key){
    const db=await dbOpen();
    try{
      const tx=db.transaction('pending','readwrite'),completed=txDone(tx);
      tx.objectStore('pending').delete(key);
      await completed;
    }finally{db.close();}
  }
  return Object.freeze({pending,store,remove,detect,MAX_BYTES,MAX_PENDING,DB_NAME});
});
