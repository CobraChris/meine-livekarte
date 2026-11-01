/* Local ticket library. No accounts, passwords, encryption or server requests.
 * Legacy encrypted IndexedDB is never modified or deleted.
 */
'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.LivekarteTicketLibrary=api;
})(typeof window!=='undefined'?window:undefined,function(){
  const DB_NAME='livekarte-ticket-library-v1',BACKUP_FORMAT='livekarte-ticket-library-backup-v1';
  const MAX_FILE=10*1024*1024,MAX_TOTAL=50*1024*1024,MAX_ITEMS=25,MAX_BACKUP=80*1024*1024;
  const TYPES=new Set(['application/pdf','image/png','image/jpeg','image/webp']);
  function available(){return typeof indexedDB!=='undefined'&&typeof Blob!=='undefined';}
  function request(req){return new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||Error('Lokaler Speicherfehler.'));
  });}
  function done(tx){return new Promise((resolve,reject)=>{
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('Speicherfehler.'));
    tx.onabort=()=>reject(tx.error||Error('Speichervorgang abgebrochen.'));
  });}
  function connect(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,1);
      req.onupgradeneeded=()=>{
        if(!req.result.objectStoreNames.contains('files'))
          req.result.createObjectStore('files',{keyPath:'id'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||Error('Lokaler Speicher nicht verfügbar.'));
      req.onblocked=()=>reject(Error('Dateiablage wird in einem anderen Tab verwendet.'));
    });
  }
  function clean(value,max=110){return String(value||'').trim().slice(0,max);}
  function mimeOf(type,name,bytes){
    const lower=String(name||'').toLowerCase();
    let mime=TYPES.has(type)?type:
      lower.endsWith('.pdf')?'application/pdf':
      lower.endsWith('.png')?'image/png':
      lower.endsWith('.jpg')||lower.endsWith('.jpeg')?'image/jpeg':
      lower.endsWith('.webp')?'image/webp':'';
    if(!TYPES.has(mime))throw Error('Nur PDF, PNG, JPG und WebP sind erlaubt.');
    const b=new Uint8Array(bytes);
    const ascii=(a,z)=>String.fromCharCode(...b.subarray(a,z));
    const good=mime==='application/pdf'&&b.length>=5&&ascii(0,5)==='%PDF-'||
      mime==='image/png'&&b.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v)||
      mime==='image/jpeg'&&b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255||
      mime==='image/webp'&&b.length>=12&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP';
    if(!good)throw Error('Der Dateiinhalt ist kein gültiges PDF oder unterstütztes Bild.');
    return mime;
  }
  function newId(){
    if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
    const bytes=new Uint8Array(16);
    if(!globalThis.crypto?.getRandomValues)throw Error('Sichere Zufallskennung nicht verfügbar.');
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  }
  function base64(bytes){
    const x=new Uint8Array(bytes);let s='';
    for(let i=0;i<x.length;i+=8192)s+=String.fromCharCode(...x.subarray(i,i+8192));
    return btoa(s);
  }
  function fromBase64(s){
    if(typeof s!=='string'||s.length>MAX_FILE*1.4+100||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))
      throw Error('Backup enthält eine ungültige Datei.');
    const text=atob(s),result=new Uint8Array(text.length);
    for(let i=0;i<text.length;i++)result[i]=text.charCodeAt(i);
    return result.buffer;
  }
  async function makeRecord(file,details={},id=newId()){
    if(!file||typeof file.arrayBuffer!=='function'||file.size<1||file.size>MAX_FILE)
      throw Error('Datei muss zwischen 1 Byte und 10 MB groß sein.');
    const bytes=await file.arrayBuffer();
    if(bytes.byteLength!==file.size)throw Error('Dateigröße konnte nicht geprüft werden.');
    const name=clean(file.name||details.name||'Ticket',120);
    const type=mimeOf(file.type,name,bytes);
    const title=clean(details.title||name,100)||name,trip=clean(details.trip,100);
    return {id,title,trip,name,type,size:bytes.byteLength,
      created:new Date().toISOString(),pinned:false,blob:new Blob([bytes],{type})};
  }
  function isRecord(r){return r&&typeof r.id==='string'&&r.id.length<=100&&
    clean(r.title,100)===r.title&&typeof r.name==='string'&&
    typeof r.trip==='string'&&TYPES.has(r.type)&&Number.isSafeInteger(r.size)&&
    r.size>0&&r.size<=MAX_FILE&&r.blob instanceof Blob&&r.blob.size===r.size&&
    (r.pinned===undefined||typeof r.pinned==='boolean');}
  function verifyCapacity(records,extra){
    if(records.length+extra.length>MAX_ITEMS||
      [...records,...extra].reduce((sum,item)=>sum+item.size,0)>MAX_TOTAL)
      throw Error('Speicherlimit erreicht (25 Dateien oder 50 MB).');
  }
  function filterTickets(items,query=''){
    const terms=String(query||'').trim().toLocaleLowerCase('de').split(/\s+/u).filter(Boolean);
    if(!terms.length)return items;
    return items.filter(item=>{
      const haystack=[item.title,item.trip,item.name]
        .map(v=>String(v||'').toLocaleLowerCase('de')).join(' ');
      return terms.every(term=>haystack.includes(term));
    });
  }
  class Library {
    constructor(){this.db=null;}
    async database(){if(!this.db)this.db=await connect();return this.db;}
    async all(){
      const db=await this.database(),tx=db.transaction('files','readonly');
      return request(tx.objectStore('files').getAll());
    }
    async list(){
      const all=await this.all();
      return all.map(({blob,...item})=>({...item,pinned:item.pinned===true}))
        .sort((a,b)=>Number(b.pinned)-Number(a.pinned)||
          String(b.created).localeCompare(String(a.created)));
    }
    async add(file,details={}){
      const record=await makeRecord(file,details);
      const db=await this.database(),existing=await this.all();
      verifyCapacity(existing,[record]);
      const tx=db.transaction('files','readwrite'),completed=done(tx);
      tx.objectStore('files').add(record);
      await completed;
      const {blob,...item}=record;return item;
    }
    async get(id){
      const db=await this.database(),tx=db.transaction('files','readonly');
      const record=await request(tx.objectStore('files').get(id));
      if(!isRecord(record))throw Error('Dokument nicht gefunden oder beschädigt.');
      return record;
    }
    async setPinned(id,pinned){
      const existing=await this.get(id);
      if(existing.pinned===!!pinned)return !!pinned;
      const db=await this.database(),tx=db.transaction('files','readwrite');
      const completed=done(tx);
      tx.objectStore('files').put({...existing,pinned:!!pinned});
      await completed;
      return !!pinned;
    }
    async remove(id){
      const db=await this.database(),tx=db.transaction('files','readwrite');
      const completed=done(tx);tx.objectStore('files').delete(id);await completed;
    }
    async addMany(records){
      const db=await this.database(),old=await this.all();
      const ids=new Set(old.map(r=>r.id));
      const fresh=records.filter(r=>!ids.has(r.id));
      if(fresh.some(r=>!isRecord(r))||new Set(fresh.map(r=>r.id)).size!==fresh.length)
        throw Error('Import enthält ungültige Dateien.');
      verifyCapacity(old,fresh);
      if(!fresh.length)return 0; // No-op restore/migration must not wait on an empty transaction.
      // One transaction: on quota errors all changes roll back.
      const tx=db.transaction('files','readwrite'),completed=done(tx);
      for(const record of fresh)tx.objectStore('files').add(record);
      await completed;return fresh.length;
    }
    async backup(){
      const records=await this.all();
      if(records.some(r=>!isRecord(r)))throw Error('Gespeicherte Daten beschädigt.');
      const files=[];
      for(const r of records){
        const bytes=await r.blob.arrayBuffer();
        mimeOf(r.type,r.name,bytes);
        const {blob,...meta}=r;
        files.push({...meta,base64:base64(bytes)});
      }
      return new Blob([JSON.stringify({format:BACKUP_FORMAT,files})],{type:'application/json'});
    }
    async restore(file){
      if(!file||file.size>MAX_BACKUP)throw Error('Backup ist zu groß.');
      let backup;
      try{backup=JSON.parse(await file.text());}catch{throw Error('Backup kann nicht gelesen werden.');}
      if(backup?.format!==BACKUP_FORMAT||!Array.isArray(backup.files)||
        backup.files.length>MAX_ITEMS)throw Error('Unbekanntes Backup-Format.');
      const records=[],seen=new Set();
      for(const item of backup.files){
        if(!item||typeof item.id!=='string'||item.id.length>100||seen.has(item.id))
          throw Error('Backup enthält doppelte oder ungültige Kennungen.');
        seen.add(item.id);
        if(typeof item.name!=='string'||typeof item.title!=='string'||
          typeof item.trip!=='string'||!Number.isSafeInteger(item.size)||
          item.size<1||item.size>MAX_FILE)throw Error('Backup enthält ungültige Metadaten.');
        const bytes=fromBase64(item.base64);
        if(bytes.byteLength!==item.size)throw Error('Backup-Dateigröße stimmt nicht.');
        const type=mimeOf(item.type,item.name,bytes);
        if(type!==item.type)throw Error('Backup-Dateityp stimmt nicht.');
        records.push({id:item.id,title:clean(item.title,100),name:clean(item.name,120),
          trip:clean(item.trip,100),created:clean(item.created,40),type,
          size:item.size,pinned:item.pinned===true,blob:new Blob([bytes],{type})});
      }
      return this.addMany(records);
    }
    async legacyCount(){
      // Old encrypted DB stays intact. Opening it may create an empty DB in
      // browsers lacking indexedDB.databases(); never deletes or writes data.
      if(indexedDB.databases){
        const dbs=await indexedDB.databases();
        if(!dbs.some(d=>d.name==='livekarte-ticket-vault-v1'))return 0;
      }
      return new Promise((resolve,reject)=>{
        const req=indexedDB.open('livekarte-ticket-vault-v1');
        req.onsuccess=async()=>{
          const db=req.result;
          if(!db.objectStoreNames.contains('files')){db.close();resolve(0);return;}
          try{
            const tx=db.transaction('files','readonly');
            const n=await request(tx.objectStore('files').count());
            db.close();resolve(n);
          }catch(e){db.close();reject(e);}
        };
        req.onerror=()=>reject(req.error||Error('Alte Tickets nicht abrufbar.'));
      });
    }
    async importLegacy(vault){
      const entries=await vault.list();
      const records=[];
      for(const e of entries){
        const result=await vault.file(e.id);
        const file={name:result.metadata.name,type:result.metadata.type,
          size:result.blob.size,arrayBuffer:()=>result.blob.arrayBuffer()};
        const record=await makeRecord(file,result.metadata,'legacy-'+e.id);
        records.push(record);
      }
      return this.addMany(records);
    }
  }
  return Object.freeze({Library,available,mimeOf,filterTickets,MAX_FILE,MAX_TOTAL,MAX_ITEMS,BACKUP_FORMAT});
});
