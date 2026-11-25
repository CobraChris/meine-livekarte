import {generateDeviceKey,signedSnapshot} from "./browser-auth.mjs";
const open=()=>new Promise((resolve,reject)=>{const r=indexedDB.open("livekarte-managed-sync-v1",1);r.onupgradeneeded=()=>r.result.createObjectStore("device");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function access(mode,fn){const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction("device",mode);const r=fn(tx.objectStore("device"));tx.oncomplete=()=>resolve(r.result);tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
const load=()=>access("readonly",s=>s.get("active"));
async function prepare(device){
 let record=await load();
 if(record&&record.device===device)return record;
 const keys=await generateDeviceKey();
 record={device,...keys};
 await access("readwrite",s=>s.put(record,"active"));
 return record;
}
export async function activateManagedSync({endpoint}){
 const status=document.getElementById("outbox-status");
 const connect=document.getElementById("outbox-connect");
 const upload=document.getElementById("outbox-upload");
 const disconnect=document.getElementById("outbox-disconnect");
 const token=document.getElementById("outbox-token");
 const repo=document.getElementById("outbox-repo");
 if(!status||!connect||!upload||!disconnect||!token||!repo)throw new Error("Missing sync UI");
 let busy=false,timer,record,enabled=false,dirty=0,done=0;
 const note=text=>{status.textContent=text;};
 async function publish(){
  if(!enabled||busy)return;
  busy=true;const version=dirty;
  try{
   const device=await window.LivekarteGetDeviceId?.();
   if(!device||device!==record.device)throw new Error("Gerät neu koppeln.");
   const snapshot=window.LivekarteOutboxCore.normalizeSnapshot({v:1,device,tickets:window.LivekarteExportTicketSnapshot()});
   const result=await signedSnapshot({endpoint,device,privateKey:record.privateKey,snapshot});
   if(result?.ok!==true)throw new Error("Synchronisierung nicht bestätigt");
   done=version;note("Privater Ticketstatus synchronisiert.");
  }catch(e){note("Synchronisierung nicht verfügbar: "+e.message);}
  finally{busy=false;if(enabled&&done===version&&dirty!==done)schedule();}
 }
 function schedule(){clearTimeout(timer);if(enabled)timer=setTimeout(publish,900);}
 async function start(){
  try{
   const device=await window.LivekarteGetDeviceId?.();
   if(!device)throw new Error("Zuerst geschützte Geräteverbindung vorbereiten.");
   record=await prepare(device);
   const response=await fetch(endpoint.replace(/\/$/,"")+"/challenge",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({device}),credentials:"omit",redirect:"error",cache:"no-store"});
   if(!response.ok){
    enabled=false;
    const code=JSON.stringify({device,publicKey:record.publicKey});
    const field=document.createElement("textarea");field.readOnly=true;field.value=code;field.setAttribute("aria-label","Öffentlicher Gerätecode");
    document.getElementById("managed-sync-enrollment")?.remove();
    const box=document.createElement("div");box.id="managed-sync-enrollment";box.append(field);
    const copy=document.createElement("button");copy.type="button";copy.textContent="Öffentlichen Gerätecode kopieren";copy.onclick=()=>navigator.clipboard.writeText(code).catch(()=>field.select());box.append(copy);status.after(box);
    note("Einmalige Gerätefreigabe erforderlich. Nur öffentlichen Gerätecode übergeben.");
    return;
   }
   document.getElementById("managed-sync-enrollment")?.remove();
   enabled=true;connect.hidden=true;upload.hidden=false;disconnect.hidden=false;dirty++;await publish();
  }catch(e){note(e.message);}
 }
 // This mode replaces legacy controls only when explicitly enabled by a release.
 token.hidden=true;token.disabled=true;token.value="";repo.hidden=true;repo.disabled=true;
 connect.textContent="Gerät verbinden";connect.hidden=false;upload.hidden=true;disconnect.hidden=true;
 connect.onclick=start;upload.onclick=publish;
 disconnect.onclick=()=>{enabled=false;clearTimeout(timer);connect.hidden=false;upload.hidden=true;disconnect.hidden=true;note("Synchronisierung auf diesem Gerät pausiert.");};
 window.addEventListener("livekarte:ticket-updated",()=>{dirty++;schedule();});
 window.addEventListener("online",()=>{if(enabled){dirty++;schedule();}else if(record)void start();});
 document.addEventListener("visibilitychange",()=>{if(!document.hidden&&enabled&&dirty!==done)schedule();});
 record=await load();if(record)await start();else note("Einmalige Geräteverbindung erforderlich.");
}
