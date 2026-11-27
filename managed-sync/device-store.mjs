import {generateDeviceKey} from './browser-auth.mjs';
// CryptoKeys are structured-cloned into IndexedDB; private keys never become JSON.
export function createDeviceStore(indexedDBImpl=globalThis.indexedDB){
 const open=()=>new Promise((resolve,reject)=>{const r=indexedDBImpl.open('livekarte-managed-sync-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('device');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Gerätespeicher blockiert'));});
 async function access(mode,fn){const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('device',mode);const r=fn(tx.objectStore('device'));tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
 const load=()=>access('readonly',s=>s.get('active'));
 return {load,save:record=>access('readwrite',s=>s.put(record,'active')),async prepare(device){
  const existing=await load();
  if(existing){if(existing.device!==device)throw new Error('Geräteidentität geändert; erneute Freigabe erforderlich');return existing;}
  const record={device,...await generateDeviceKey(),paused:false};
  // add, rather than put, prevents two tabs from silently replacing a paired key.
  try{await access('readwrite',s=>s.add(record,'active'));return record;}
  catch(error){const winner=await load();if(winner?.device===device)return winner;throw error;}
 }};
}
