/* End-to-end encrypted one-way inbox: ChatGPT -> user's browser.
 * Public GitHub Pages hosts only ciphertext. Private RSA key is nonextractable
 * and stored in this browser's IndexedDB. Pairing publishes ONLY public SPKI.
 * No GitHub token, user credential or booking reference is stored in this file.
 */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const status=$('sync-status'), result=$('sync-pair-code');
  const generate=$('sync-generate'), copy=$('sync-copy'), check=$('sync-check');
  const remove=$('sync-disconnect');
  if(!status || !window.crypto?.subtle || !window.indexedDB) {
    if(status)status.textContent='Dieser Browser unterstützt die geschützte Kopplung nicht.';
    if(generate)generate.disabled=true;
    return;
  }
  const storeName='livekarte-sync-device-v1';
  const bytesToBase64 = bytes => {
    let out='';
    for(let i=0;i<bytes.length;i+=8192)
      out+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(out).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  };
  const base64ToBytes = value => {
    if(typeof value!=='string'||value.length>1300||!/^[A-Za-z0-9_-]+$/.test(value))
      throw new Error('Ungültige verschlüsselte Nachricht.');
    const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));
    return Uint8Array.from(raw,c=>c.charCodeAt(0));
  };
  const openDB = () => new Promise((resolve,reject)=>{
    const request=indexedDB.open(storeName,1);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains('keys'))
        request.result.createObjectStore('keys');
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error || new Error('Browserdatenbank nicht verfügbar.'));
  });
  async function dbAction(mode,fn) {
    const db=await openDB();
    try {
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction('keys',mode);
        const request=fn(tx.objectStore('keys'));
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
        tx.onerror=()=>reject(tx.error);
      });
    } finally { db.close(); }
  }
  const load=()=>dbAction('readonly',store=>store.get('active'));
  // Safe public identifier only. Never expose the local private CryptoKey.
  window.LivekarteGetDeviceId=async()=>{
    const device=current||await load();
    return device?.id||null;
  };
  const save=value=>dbAction('readwrite',store=>store.put(value,'active'));
  const clear=()=>dbAction('readwrite',store=>store.delete('active'));
  let current=null, checking=false, interval=null;
  function setStatus(text,warning=false) {
    status.textContent=text;
    status.classList.toggle('sync-warning',!!warning);
  }
  function pairingText(device) {
    return JSON.stringify({v:1,device:device.id,publicKey:device.publicKey});
  }
  function display() {
    const ready=!!current;
    generate.hidden=ready;
    copy.hidden=!ready;
    check.hidden=!ready;
    remove.hidden=!ready;
    result.hidden=!ready;
    result.value=ready?pairingText(current):'';
    if(ready)setStatus('🔒 Gerät vorbereitet (ID '+current.id+'). Sobald ChatGPT das Postfach eingerichtet hat, kommen Updates automatisch an.');
    else setStatus('Noch nicht gekoppelt. Der private Schlüssel bleibt ausschließlich in diesem Browser.');
  }
  async function setup() {
    if(current || generate.disabled)return;
    generate.disabled=true;
    setStatus('Sicheres Schlüsselpaar wird auf diesem Gerät erstellt …');
    try {
      const keys=await crypto.subtle.generateKey(
        {name:'RSA-OAEP',modulusLength:3072,
          publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},
        false,['encrypt','decrypt']);
      const publicKey=bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('spki',keys.publicKey)));
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',
        Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')+
          '='.repeat((4-publicKey.length%4)%4)),c=>c.charCodeAt(0))));
      const id=[...digest.slice(0,12)].map(b=>b.toString(16).padStart(2,'0')).join('');
      const newDevice={id,publicKey,privateKey:keys.privateKey};
      await save(newDevice);
      current=newDevice;
      display();
      setStatus('🔒 Schlüssel erstellt. Bitte „Kopplungscode kopieren“ wählen und den Code an ChatGPT schicken. Erst nach Einrichtung des Postfachs kann der Status automatisch synchronisiert werden.');
    } catch(e){setStatus('Kopplung fehlgeschlagen: '+(e?.message||'Browserfehler'),true);}
    finally{generate.disabled=false;}
  }
  async function copyPairing() {
    if(!current)return;
    try {
      await navigator.clipboard.writeText(pairingText(current));
      setStatus('Öffentlichen Kopplungscode kopiert. Bitte als Nachricht an ChatGPT senden. Er enthält keinen privaten Schlüssel.');
    } catch {
      result.focus();result.select();
      setStatus('Kopieren nicht verfügbar. Markierten öffentlichen Code manuell kopieren.',true);
    }
  }
  function seenIds() {
    try {
      const ids=JSON.parse(localStorage.getItem('livekarte-sync-seen-v1')||'[]');
      return new Set(Array.isArray(ids)?ids.filter(x=>typeof x==='string').slice(-100):[]);
    }catch{return new Set();}
  }
  function markSeen(ids){
    try{localStorage.setItem('livekarte-sync-seen-v1',JSON.stringify([...ids].slice(-100)));}catch{}
  }
  async function poll(showResult=false) {
    if(checking || !current || document.visibilityState==='hidden')return;
    checking=true;
    try {
      if(typeof window.LivekarteApplySyncedTicket!=='function')
        throw new Error('Ticketmodul ist noch nicht geladen. Seite neu laden.');
      const url=new URL('./sync/inbox/'+current.id+'.json',new URL('.',location.href));
      const response=await fetch(url.toString(),{cache:'no-store',credentials:'omit'});
      if(response.status===404){
        if(showResult)setStatus(
          'Postfach noch nicht über GitHub Pages erreichbar (HTTP 404). '+
          'Falls es eben eingerichtet wurde, Seite später erneut laden.',true);
        return;
      }
      if(!response.ok)throw new Error('Postfach HTTP '+response.status);
      const body=await response.text();
      if(body.length>180000)throw new Error('Postfach zu groß.');
      const data=JSON.parse(body);
      if(data?.v!==1 || data?.device!==current.id ||
          !Array.isArray(data.messages)||data.messages.length>100)
        throw new Error('Postfachformat ungültig.');
      const seen=seenIds();
      const counts={found:data.messages.length,already:0,new:0,decrypted:0,
        accepted:0,invalid:0,rejected:0};
      for(const message of data.messages){
        // Reject malformed entries visibly; never acknowledge them as processed.
        if(!message || typeof message.id!=='string' ||
           !/^[0-9a-z-]{8,80}$/.test(message.id)){
          counts.invalid++;
          continue;
        }
        if(seen.has(message.id)){
          counts.already++;
          continue;
        }
        counts.new++;
        let plain;
        try{
          const ciphertext=base64ToBytes(message.ciphertext);
          if(ciphertext.length!==384)throw new Error('Ungültige RSA-3072-Nachrichtenlänge.');
          plain=await crypto.subtle.decrypt(
            {name:'RSA-OAEP'},current.privateKey,ciphertext);
          counts.decrypted++;
        }catch{
          counts.invalid++;
          continue; // Important: retry if a corrected ciphertext is later published.
        }
        let payload;
        try {
          payload=JSON.parse(new TextDecoder().decode(plain));
          if(payload?.v!==1 || payload.id!==message.id ||
             !Number.isSafeInteger(payload.issuedAt) ||
             payload.issuedAt<=0 || payload.issuedAt>Date.now()+600000)
            throw new Error('Nachrichtenmetadaten ungültig.');
        }catch{
          counts.invalid++;
          continue;
        }
        let ok=false;
        try {ok=window.LivekarteApplySyncedTicket(payload.ticket,payload.issuedAt);}
        catch {ok=false;}
        if(ok===true){
          counts.accepted++;
          seen.add(message.id); // Only acknowledge VALID and accepted messages.
        }else{
          counts.rejected++;
          // A route/date mismatch may become resolvable if the itinerary changes.
          // Do not mark as seen: the user should be able to retry.
        }
      }
      markSeen(seen);
      const trouble=counts.invalid+counts.rejected;
      if(showResult || counts.accepted || trouble) {
        const detail='Postfach erreichbar: '+counts.found+' Nachricht(en). '+
          'Bereits verarbeitet: '+counts.already+
          ' · Neu entschlüsselt: '+counts.decrypted+
          ' · Akzeptiert: '+counts.accepted+
          ' · Entschlüsselung/Format fehlgeschlagen: '+counts.invalid+
          ' · Reiseplan passt nicht/Übernahme fehlgeschlagen: '+counts.rejected+'.';
        setStatus((trouble?'⚠️ ':'🔒 ')+detail+
          (trouble?' Fehlerhafte Nachrichten werden nicht als erledigt markiert.':
          counts.accepted?' Ticketstatus kann bereits vorher grün gewesen sein.':''),!!trouble);
      }
    }catch(e){
      if(showResult)setStatus('Synchronisierung nicht verfügbar: '+e.message,true);
    }finally{checking=false;}
  }
  async function disconnect() {
    if(!current || !confirm('Dieses Gerät entkoppeln? Danach lassen sich alte verschlüsselte Updates auf diesem Browser nicht mehr entschlüsseln.'))return;
    try {
      await clear();
      current=null;
      try{localStorage.removeItem('livekarte-sync-seen-v1');}catch{}
      display();
      setStatus('Gerät entkoppelt. Bereits gespeicherte Ticketstatus bleiben erhalten.');
    }catch(e){setStatus('Entkoppeln fehlgeschlagen: '+e.message,true);}
  }
  generate.onclick=setup;
  copy.onclick=copyPairing;
  check.onclick=()=>poll(true);
  remove.onclick=disconnect;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll(false);});
  load().then(device=>{
    if(device && /^[a-f0-9]{24}$/.test(device.id) && device.privateKey &&
        typeof device.publicKey==='string')current=device;
    display();
    if(current)poll(false);
  }).catch(e=>setStatus('Schlüsselspeicher nicht verfügbar: '+e.message,true));
  interval=setInterval(()=>{if(current && !document.hidden)poll(false);},90000);
  window.addEventListener('pagehide',()=>{if(interval)clearInterval(interval);});
})();
