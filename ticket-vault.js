/* Private, offline encrypted ticket documents. No request ever leaves this module.
 * Metadata (including file names and journey labels) and binary file bytes
 * are encrypted with AES-256-GCM using a PBKDF2-SHA-256 passphrase key.
 * The passphrase and CryptoKey exist in memory only while unlocked.
 */
'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.LivekarteTicketVault=api;
})(typeof window!=='undefined'?window:undefined,function(){
  const FORMAT='livekarte-ticket-vault-backup-v2';
  const LEGACY_FORMAT='livekarte-ticket-vault-backup-v1';
  const DB_NAME='livekarte-ticket-vault-v1';
  const MAX_FILE=10*1024*1024,MAX_TOTAL=50*1024*1024,MAX_ITEMS=25;
  const MAX_BACKUP=80*1024*1024,ITERATIONS=310000;
  const MIME=Object.freeze({
    'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg','image/webp':'webp'
  });
  const enc=new TextEncoder(),dec=new TextDecoder();
  const cryptoApi=()=>globalThis.crypto;
  function available(){
    return typeof indexedDB!=='undefined'&&!!cryptoApi()?.subtle&&
      typeof cryptoApi().getRandomValues==='function'&&
      typeof isSecureContext!=='undefined'&&isSecureContext;
  }
  const random=n=>cryptoApi().getRandomValues(new Uint8Array(n));
  function base64(bytes){
    const a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    let s='';
    for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));
    return btoa(s);
  }
  function unbase64(value){
    if(typeof value!=='string'||value.length>MAX_BACKUP*1.4||
       !/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('Ungültiges Backup-Format.');
    const str=atob(value),bytes=new Uint8Array(str.length);
    for(let i=0;i<str.length;i++)bytes[i]=str.charCodeAt(i);
    return bytes;
  }
  async function derive(passphrase,salt){
    if(typeof passphrase!=='string'||passphrase.length<10)
      throw Error('Bitte ein Passwort mit mindestens 10 Zeichen eingeben.');
    const material=await cryptoApi().subtle.importKey('raw',enc.encode(passphrase),
      'PBKDF2',false,['deriveKey']);
    return cryptoApi().subtle.deriveKey(
      {name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},
      material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function seal(key,bytes){
    const iv=random(12);
    const cipher=await cryptoApi().subtle.encrypt({name:'AES-GCM',iv},key,bytes);
    return {iv:base64(iv),cipher};
  }
  async function openSeal(key,iv,cipher){
    return cryptoApi().subtle.decrypt({name:'AES-GCM',iv:unbase64(iv)},key,cipher);
  }
  function request(req){
    return new Promise((resolve,reject)=>{
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||Error('Lokaler Speicherfehler.'));
    });
  }
  function finished(tx){
    return new Promise((resolve,reject)=>{
      tx.oncomplete=()=>resolve();
      tx.onabort=()=>reject(tx.error||Error('Speichervorgang abgebrochen.'));
      tx.onerror=()=>reject(tx.error||Error('Lokaler Speicherfehler.'));
    });
  }
  function connect(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,1);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta',{keyPath:'key'});
        if(!db.objectStoreNames.contains('files'))db.createObjectStore('files',{keyPath:'id'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||Error('IndexedDB nicht verfügbar.'));
      req.onblocked=()=>reject(Error('Ticket-Tresor in einem anderen Tab geöffnet.'));
    });
  }
  function validateMime(type,filename,bytes){
    let mime=String(type||'').toLowerCase();
    const name=String(filename||'').toLowerCase();
    if(!Object.hasOwn(MIME,mime)){
      if(name.endsWith('.pdf'))mime='application/pdf';
      else if(name.endsWith('.png'))mime='image/png';
      else if(name.endsWith('.jpg')||name.endsWith('.jpeg'))mime='image/jpeg';
      else if(name.endsWith('.webp'))mime='image/webp';
    }
    if(!Object.hasOwn(MIME,mime))throw Error('Nur PDF, PNG, JPG und WebP sind erlaubt.');
    const b=new Uint8Array(bytes);
    const pdf=b.length>=5&&String.fromCharCode(...b.slice(0,5))==='%PDF-';
    const png=b.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v);
    const jpg=b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255;
    const webp=b.length>=12&&String.fromCharCode(...b.slice(0,4))==='RIFF'&&
      String.fromCharCode(...b.slice(8,12))==='WEBP';
    if(!(mime==='application/pdf'&&pdf||mime==='image/png'&&png||
      mime==='image/jpeg'&&jpg||mime==='image/webp'&&webp))
      throw Error('Dateiinhalt passt nicht zum PDF- oder Bildformat.');
    return mime;
  }
  function goodRecord(r){
    return !!r&&typeof r.id==='string'&&/^[a-f0-9-]{16,64}$/i.test(r.id)&&
      typeof r.iv==='string'&&typeof r.metaIv==='string'&&
      typeof r.metaCipher==='string'&&r.metaCipher.length<16384&&
      r.cipher instanceof ArrayBuffer&&r.cipher.byteLength<=MAX_FILE+16;
  }
  function goodLegacyConfig(c){
    return !!c&&c.key==='config'&&c.version===1&&c.iterations===ITERATIONS&&
      typeof c.salt==='string'&&unbase64(c.salt).length===16&&
      typeof c.iv==='string'&&unbase64(c.iv).length===12&&
      typeof c.cipher==='string'&&unbase64(c.cipher).length>=16;
  }
  // Version 2 separates an independent random document key from the
  // password-derived wrapping key. A 256-bit recovery key wraps the same
  // document key independently and is shown once, never stored in plaintext.
  function goodConfigV2(c){
    try{
      if(!c||c.key!=='config'||c.version!==2||c.iterations!==ITERATIONS ||
        !c.password||!c.recovery)return false;
      const p=c.password,r=c.recovery;
      return unbase64(p.salt).length===16&&unbase64(p.iv).length===12&&
        unbase64(p.cipher).length===48&&
        unbase64(r.iv).length===12&&unbase64(r.cipher).length===48;
    }catch{return false;}
  }
  const goodConfig=c=>goodConfigV2(c)||goodLegacyConfig(c);
  async function documentKey(raw){
    return cryptoApi().subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
  }
  function newRecovery(){
    const bytes=random(32);
    const token='LKV2-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
    return {token,bytes};
  }
  function recoveryBytes(token){
    if(typeof token!=='string'||!/^LKV2-[A-Fa-f0-9]{64}$/.test(token.trim()))
      throw Error('Wiederherstellungsschlüssel hat ein ungültiges Format.');
    const hex=token.trim().slice(5);
    return Uint8Array.from({length:32},(_,i)=>parseInt(hex.slice(i*2,i*2+2),16));
  }
  async function passwordEnvelope(password,raw){
    const salt=random(16),wrapKey=await derive(password,salt);
    const sealed=await seal(wrapKey,raw);
    return {salt:base64(salt),iv:sealed.iv,cipher:base64(sealed.cipher)};
  }
  async function recoveryEnvelope(raw,recovery){
    const sealed=await seal(await documentKey(recovery.bytes),raw);
    return {iv:sealed.iv,cipher:base64(sealed.cipher)};
  }
  async function newV2Config(password,raw){
    const recovery=newRecovery();
    const [pwd,rec]=await Promise.all([
      passwordEnvelope(password,raw),recoveryEnvelope(raw,recovery)
    ]);
    return {config:{key:'config',version:2,iterations:ITERATIONS,
      password:pwd,recovery:rec},recoveryCode:recovery.token};
  }
  async function passwordRaw(config,password){
    const wrap=await derive(password,unbase64(config.password.salt));
    return new Uint8Array(await openSeal(
      wrap,config.password.iv,unbase64(config.password.cipher)));
  }
  async function recoveryRaw(config,recoveryCode){
    return new Uint8Array(await openSeal(
      await documentKey(recoveryBytes(recoveryCode)),config.recovery.iv,
      unbase64(config.recovery.cipher)));
  }
  class Vault {
    constructor(){this.db=null;this.key=null;this.legacy=false;}
    async database(){
      if(!this.db)this.db=await connect();
      return this.db;
    }
    async config(){
      const db=await this.database();
      const tx=db.transaction('meta','readonly');
      return request(tx.objectStore('meta').get('config'));
    }
    async exists(){return !!(await this.config());}
    async initialize(password){
      if(await this.exists())throw Error('Es gibt bereits einen Ticket-Tresor auf diesem Gerät.');
      // Make no durable state until the password and recovery wrapping keys exist.
      const raw=random(32),result=await newV2Config(password,raw);
      const db=await this.database(),tx=db.transaction('meta','readwrite');
      const done=finished(tx);
      tx.objectStore('meta').add(result.config);
      await done;
      this.key=await documentKey(raw);
      this.legacy=false;
      return result.recoveryCode;
    }
    async unlock(password){
      const cfg=await this.config();
      if(!cfg)throw Error('Noch kein Ticket-Tresor eingerichtet.');
      if(!goodConfig(cfg))throw Error('Nicht unterstütztes Tresorformat.');
      try{
        if(cfg.version===2){
          this.key=await documentKey(await passwordRaw(cfg,password));
          this.legacy=false;
        }else{
          const key=await derive(password,unbase64(cfg.salt));
          const proof=dec.decode(await openSeal(key,cfg.iv,unbase64(cfg.cipher)));
          if(proof!=='livekarte-ticket-vault-verifier-v1')throw Error('invalid');
          this.key=key;
          this.legacy=true;
        }
      }catch{
        this.key=null;
        throw Error('Passwort falsch oder Tresordaten beschädigt.');
      }
    }
    lock(){this.key=null;this.legacy=false;}
    requireKey(){
      if(!this.key)throw Error('Ticket-Tresor zuerst entsperren.');
      return this.key;
    }
    async hasRecovery(){return (await this.config())?.version===2;}
    async changePassword(oldPassword,newPassword){
      this.requireKey();
      const cfg=await this.config();
      if(!goodConfig(cfg))throw Error('Tresor-Konfiguration beschädigt.');
      if(cfg.version===1)return this.upgradeLegacy(oldPassword,newPassword);
      let raw;
      try{raw=await passwordRaw(cfg,oldPassword);}
      catch{throw Error('Das bisherige Passwort ist falsch.');}
      const pwd=await passwordEnvelope(newPassword,raw);
      const db=await this.database(),tx=db.transaction('meta','readwrite');
      const done=finished(tx);
      tx.objectStore('meta').put({...cfg,password:pwd});
      await done;
      // The data key and recovery key remain unchanged; old password no
      // longer unlocks this device, but old exported backups are unaffected.
      return null;
    }
    async rotateRecovery(password){
      this.requireKey();
      const cfg=await this.config();
      if(!goodConfigV2(cfg))throw Error('Bitte zuerst den alten Tresor aktualisieren.');
      let raw;
      try{raw=await passwordRaw(cfg,password);}
      catch{throw Error('Tresor-Passwort ist falsch.');}
      const recovery=newRecovery(),envelope=await recoveryEnvelope(raw,recovery);
      const db=await this.database(),tx=db.transaction('meta','readwrite');
      const done=finished(tx);
      tx.objectStore('meta').put({...cfg,recovery:envelope});
      await done;
      return recovery.token;
    }
    async resetWithRecovery(recoveryCode,newPassword){
      const cfg=await this.config();
      if(!goodConfigV2(cfg))throw Error('Für diesen Tresor ist noch kein Wiederherstellungsschlüssel eingerichtet.');
      let raw;
      try{raw=await recoveryRaw(cfg,recoveryCode);}
      catch{throw Error('Wiederherstellungsschlüssel falsch oder beschädigt.');}
      // Recovery always rotates the old recovery key so a lost token does
      // not remain usable against this device's future vault state.
      const result=await newV2Config(newPassword,raw);
      const db=await this.database(),tx=db.transaction('meta','readwrite');
      const done=finished(tx);
      tx.objectStore('meta').put(result.config);
      await done;
      this.key=await documentKey(raw);
      this.legacy=false;
      return result.recoveryCode;
    }
    async upgradeLegacy(oldPassword,newPassword=oldPassword){
      this.requireKey();
      const cfg=await this.config();
      if(!goodLegacyConfig(cfg))throw Error('Tresor wurde bereits aktualisiert.');
      let oldKey;
      try{
        oldKey=await derive(oldPassword,unbase64(cfg.salt));
        const proof=dec.decode(await openSeal(oldKey,cfg.iv,unbase64(cfg.cipher)));
        if(proof!=='livekarte-ticket-vault-verifier-v1')throw Error('invalid');
      }catch{throw Error('Das bisherige Passwort ist falsch.');}
      const records=await this.rawRecords();
      if(records.length>MAX_ITEMS)throw Error('Zu viele Ticketdateien für Migration.');
      const raw=random(32),newKey=await documentKey(raw);
      const upgraded=[];
      let total=0;
      for(const r of records){
        if(!goodRecord(r))throw Error('Alte Ticketdatei beschädigt.');
        try{
          const original=await openSeal(oldKey,r.iv,r.cipher);
          const metadata=await openSeal(oldKey,r.metaIv,unbase64(r.metaCipher));
          const m=JSON.parse(dec.decode(metadata));
          if(m.size!==original.byteLength||m.size<1||m.size>MAX_FILE||
             validateMime(m.type,m.name,original)!==m.type)throw Error('invalid');
          total+=m.size;
          if(total>MAX_TOTAL)throw Error('invalid');
          const [data,meta]=await Promise.all([
            seal(newKey,original),seal(newKey,metadata)
          ]);
          upgraded.push({id:r.id,iv:data.iv,cipher:data.cipher,
            metaIv:meta.iv,metaCipher:base64(meta.cipher)});
        }catch{throw Error('Alte Tickets konnten nicht vollständig gelesen werden. Keine Daten geändert.');}
      }
      const result=await newV2Config(newPassword,raw);
      const db=await this.database(),tx=db.transaction(['meta','files'],'readwrite');
      const done=finished(tx);
      for(const record of upgraded)tx.objectStore('files').put(record);
      tx.objectStore('meta').put(result.config);
      await done;
      this.key=newKey;
      this.legacy=false;
      return result.recoveryCode;
    }
    async rawRecords(){
      const db=await this.database();
      const tx=db.transaction('files','readonly');
      return request(tx.objectStore('files').getAll());
    }
    async list(){
      const key=this.requireKey(),records=await this.rawRecords();
      const entries=[];
      for(const record of records){
        if(!goodRecord(record))throw Error('Ticketdatei beschädigt.');
        try{
          const meta=JSON.parse(dec.decode(await openSeal(key,record.metaIv,unbase64(record.metaCipher))));
          entries.push({id:record.id,...meta});
        }catch{throw Error('Ticket-Metadaten beschädigt oder Passwort ungültig.');}
      }
      return entries.sort((a,b)=>String(b.created||'').localeCompare(String(a.created||'')));
    }
    async add(file,details={}){
      const key=this.requireKey();
      if(!file||typeof file.arrayBuffer!=='function')throw Error('Bitte eine Datei auswählen.');
      if(file.size===0||file.size>MAX_FILE)
        throw Error('Datei muss zwischen 1 Byte und 10 MB groß sein.');
      const previous=await this.list();
      if(previous.length>=MAX_ITEMS||previous.reduce((a,b)=>a+b.size,0)+file.size>MAX_TOTAL)
        throw Error('Tresorlimit erreicht (25 Dateien bzw. 50 MB insgesamt).');
      const data=await file.arrayBuffer();
      const type=validateMime(file.type,file.name,data);
      const name=String(file.name||'Ticket').slice(0,120);
      const title=String(details.title||name).trim().slice(0,100)||name;
      const trip=String(details.trip||'').trim().slice(0,100);
      const id=cryptoApi().randomUUID?cryptoApi().randomUUID():base64(random(24))
        .replace(/[^a-f0-9]/ig,'a').slice(0,32);
      const metadata={title,name,type,trip,size:data.byteLength,created:new Date().toISOString()};
      const [sealedFile,sealedMeta]=await Promise.all([
        seal(key,data),seal(key,enc.encode(JSON.stringify(metadata)))
      ]);
      const db=await this.database(),tx=db.transaction('files','readwrite');
      const done=finished(tx);
      tx.objectStore('files').add({id,iv:sealedFile.iv,cipher:sealedFile.cipher,
        metaIv:sealedMeta.iv,metaCipher:base64(sealedMeta.cipher)});
      await done;
      return {id,...metadata};
    }
    async file(id){
      const key=this.requireKey(),db=await this.database();
      const tx=db.transaction('files','readonly');
      const record=await request(tx.objectStore('files').get(id));
      if(!goodRecord(record))throw Error('Ticketdatei nicht gefunden.');
      let metadata,bytes;
      try{
        metadata=JSON.parse(dec.decode(await openSeal(key,record.metaIv,unbase64(record.metaCipher))));
        bytes=await openSeal(key,record.iv,record.cipher);
      }catch{throw Error('Ticketdatei kann nicht entschlüsselt werden.');}
      if(bytes.byteLength!==metadata.size||validateMime(metadata.type,metadata.name,bytes)!==metadata.type)
        throw Error('Dateiinhalt beschädigt.');
      return {metadata,blob:new Blob([bytes],{type:metadata.type})};
    }
    async remove(id){
      this.requireKey();
      const db=await this.database(),tx=db.transaction('files','readwrite');
      const done=finished(tx);
      tx.objectStore('files').delete(id);
      await done;
    }
    async backup(){
      this.requireKey();
      const config=await this.config(),records=await this.rawRecords();
      if(!goodConfig(config)||records.length>MAX_ITEMS)throw Error('Tresordaten ungültig.');
      return new Blob([JSON.stringify({
        format:config.version===2?FORMAT:LEGACY_FORMAT,config,
        files:records.map(r=>{
          if(!goodRecord(r))throw Error('Ticketdatei beschädigt.');
          return {id:r.id,iv:r.iv,metaIv:r.metaIv,metaCipher:r.metaCipher,
            cipher:base64(r.cipher)};
        })
      })],{type:'application/json'});
    }
    async restore(backupFile,credential,mode='password',newPassword=''){
      if(await this.exists())throw Error('Wiederherstellen nur auf einem leeren Gerät/Tresor möglich. Vorhandene Tickets bleiben geschützt.');
      if(!backupFile||backupFile.size>MAX_BACKUP)throw Error('Backup ist zu groß.');
      let backup;
      try{backup=JSON.parse(await backupFile.text());}
      catch{throw Error('Backup kann nicht gelesen werden.');}
      if(!(backup?.format===FORMAT&&goodConfigV2(backup.config)||
           backup?.format===LEGACY_FORMAT&&goodLegacyConfig(backup.config))||
        !Array.isArray(backup.files)||backup.files.length>MAX_ITEMS)
        throw Error('Nicht unterstütztes oder beschädigtes Backup.');
      if(!['password','recovery'].includes(mode)||
        mode==='recovery'&&backup.config.version!==2)
        throw Error('Backup unterstützt diese Wiederherstellungsmethode nicht.');
      let key,updatedConfig=backup.config,rotatedCode=null;
      try{
        if(backup.config.version===2){
          const raw=mode==='recovery'
            ?await recoveryRaw(backup.config,credential)
            :await passwordRaw(backup.config,credential);
          if(mode==='recovery'){
            const rotated=await newV2Config(newPassword,raw);
            updatedConfig=rotated.config;
            rotatedCode=rotated.recoveryCode;
          }
          key=await documentKey(raw);
        }else{
          key=await derive(credential,unbase64(backup.config.salt));
          const proof=dec.decode(await openSeal(key,backup.config.iv,unbase64(backup.config.cipher)));
          if(proof!=='livekarte-ticket-vault-verifier-v1')throw Error('invalid');
        }
      }catch{throw Error('Backup-Passwort oder Wiederherstellungsschlüssel falsch bzw. Backup beschädigt.');}
      const seen=new Set(),records=[];
      let total=0;
      for(const f of backup.files){
        const record={id:f?.id,iv:f?.iv,metaIv:f?.metaIv,
          metaCipher:f?.metaCipher,cipher:unbase64(f?.cipher)};
        record.cipher=record.cipher.buffer;
        if(!goodRecord(record)||seen.has(record.id)||
          unbase64(record.iv).length!==12||unbase64(record.metaIv).length!==12)
          throw Error('Ungültiger Dateieintrag im Backup.');
        seen.add(record.id);
        try{
          const m=JSON.parse(dec.decode(await openSeal(key,record.metaIv,unbase64(record.metaCipher))));
          const bytes=await openSeal(key,record.iv,record.cipher);
          if(!Number.isSafeInteger(m.size)||m.size<1||m.size>MAX_FILE||
             bytes.byteLength!==m.size||validateMime(m.type,m.name,bytes)!==m.type)
             throw Error('invalid');
          total+=m.size;
          if(total>MAX_TOTAL)throw Error('invalid');
        }catch{throw Error('Backup enthält beschädigte oder nicht unterstützte Ticketdateien.');}
        records.push(record);
      }
      const db=await this.database(),tx=db.transaction(['meta','files'],'readwrite');
      const done=finished(tx);
      tx.objectStore('meta').add(updatedConfig);
      for(const record of records)tx.objectStore('files').add(record);
      await done;
      this.key=key;
      this.legacy=updatedConfig.version===1;
      return rotatedCode;
    }
  }
  return Object.freeze({Vault,available,validateMime,MAX_FILE,MAX_TOTAL,MAX_ITEMS,FORMAT});
});
