/* Private GitHub repo outbound sync: app -> private repository -> ChatGPT GitHub connector.
 * Credentials exist ONLY in JS memory during this browser session.
 * The public meine-livekarte repository must NEVER be the destination.
 */
'use strict';
(() => {
  const $=id=>document.getElementById(id), core=window.LivekarteOutboxCore;
  const repoInput=$('outbox-repo'), tokenInput=$('outbox-token');
  const connect=$('outbox-connect'), upload=$('outbox-upload');
  const disconnect=$('outbox-disconnect'), status=$('outbox-status');
  if(!core||!repoInput||!tokenInput||!window.LivekarteExportTicketSnapshot){
    if(status)status.textContent='Rückkanal nicht verfügbar. Webseite neu laden.';
    return;
  }
  let accessToken=null,connectedRepo=null,working=false,queued=false;
  let dirtyVersion=0,uploadedVersion=0,saveTimer=null;
  const configKey='livekarte-private-sync-repo-v1';
  try{repoInput.value=localStorage.getItem(configKey)||'CobraChris/meine-livekarte-private-sync';}
  catch{repoInput.value='CobraChris/meine-livekarte-private-sync';}
  function note(message,warning=false){
    status.textContent=message;
    status.classList.toggle('sync-warning',!!warning);
  }
  function updateControls(){
    const active=!!accessToken && !!connectedRepo;
    connect.hidden=active;upload.hidden=!active;disconnect.hidden=!active;
    repoInput.disabled=active;tokenInput.hidden=active;
  }
  const apiPath=repo=>'https://api.github.com/repos/'+repo;
  async function request(url,{method='GET',body}={}){
    if(!accessToken)throw new Error('GitHub-Sitzung nicht verbunden.');
    let response;
    try{
      response=await fetch(url,{
        method,mode:'cors',credentials:'omit',
        headers:{'Accept':'application/vnd.github+json',
          'Authorization':'Bearer '+accessToken,
          'Content-Type':'application/json',
          'X-GitHub-Api-Version':'2022-11-28'},
        ...(body?{body:JSON.stringify(body)}:{})
      });
    }catch{
      throw new Error('GitHub nicht erreichbar. Verbindung und Browser-CORS prüfen.');
    }
    if(response.status===401)throw new Error('GitHub-Zugangsschlüssel ungültig oder abgelaufen (401).');
    if(response.status===403)throw new Error('Keine Berechtigung oder API-Limit (403). Nur Contents: Read/Write für das private Repository freigeben.');
    if(!response.ok && response.status!==404 && response.status!==409
       && response.status!==422)
      throw new Error('GitHub-API HTTP '+response.status+'.');
    return response;
  }
  const b64encode=value=>{
    const bytes=new TextEncoder().encode(value);
    let text='';
    for(let i=0;i<bytes.length;i+=8192)
      text+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(text);
  };
  const b64decode=value=>{
    const data=atob(String(value||'').replace(/\s/g,''));
    return new TextDecoder().decode(Uint8Array.from(data,x=>x.charCodeAt(0)));
  };
  async function verifyPrivateRepo(repo){
    const res=await request(apiPath(repo));
    if(res.status===404)throw new Error('Repository nicht gefunden oder Token hat keinen Zugriff (404).');
    const info=await res.json();
    if(!info || info.full_name?.toLowerCase()!==repo.toLowerCase() || info.private!==true)
      throw new Error('Abbruch: Dieses Repository ist NICHT privat. Bitte ein separates privates Repository verwenden.');
  }
  async function getSnapshot(url){
    const response=await request(url);
    if(response.status===404)return {sha:null,data:null};
    if(response.status!==200)throw new Error('Statusdatei konnte nicht geladen werden.');
    const data=await response.json();
    if(!data || typeof data.sha!=='string' || typeof data.content!=='string'
       || data.content.length>160000)
      throw new Error('Ungültige GitHub-Datei.');
    let snapshot;
    try{snapshot=core.normalizeSnapshot(JSON.parse(b64decode(data.content)));}
    catch{throw new Error('Die private Statusdatei ist ungültig. Sie wird nicht überschrieben.');}
    return {sha:data.sha,data:snapshot};
  }
  async function publish(){
    if(!accessToken||!connectedRepo)return;
    if(working){queued=true;return;}
    working=true;upload.disabled=true;
    const startingVersion=dirtyVersion;
    let published=false;
    try{
      const device=await window.LivekarteGetDeviceId?.();
      if(!device)throw new Error('Zuerst die bestehende verschlüsselte Geräte-Kopplung vorbereiten.');
      const local=window.LivekarteExportTicketSnapshot();
      const url=apiPath(connectedRepo)+'/contents/livekarte/status/'+device+'.json';
      let success=false;
      for(let attempt=0;attempt<3;attempt++){
        const remote=await getSnapshot(url);
        const merged=core.mergeSnapshots(device,local,remote.data);
        const payload=JSON.stringify(merged);
        if(payload.length>75000)throw new Error('Zu viele Ticketinformationen für die Synchronisierung.');
        const body={message:'Sync: update private ticket statuses for paired device',
          content:b64encode(payload),
          ...(remote.sha?{sha:remote.sha}:{})};
        const response=await request(url,{method:'PUT',body});
        if(response.status===409||response.status===422)continue;
        if(!response.ok)throw new Error('Privates Ticketdokument konnte nicht gespeichert werden (HTTP '+response.status+').');
        success=true;
        note('✓ Privater Ticketstatus synchronisiert ('+merged.tickets.length+
          ' Zugabschnitte). ChatGPT kann diesen Stand über GitHub lesen.');
        break;
      }
      if(!success)throw new Error('GitHub-Konflikt beim Speichern. Bitte erneut synchronisieren.');
      uploadedVersion=startingVersion;
      published=true;
      try{localStorage.setItem(configKey,connectedRepo);}catch{}
    }catch(e){
      note('⚠ '+e.message,true);
    }finally{
      working=false;upload.disabled=false;
      // A failed write must not trigger an endless retry loop.
      // Retry only after an explicit button click or a new local change.
      if(published && (queued||dirtyVersion!==uploadedVersion)){
        queued=false;scheduleUpload();
      }else queued=false;
    }
  }
  function scheduleUpload(){
    if(!accessToken)return;
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>publish(),900);
  }
  async function start(){
    let repo,token=tokenInput.value.trim();
    try{
      repo=core.normalizeRepo(repoInput.value);
      if(repo.toLowerCase()==='cobrachris/meine-livekarte')
        throw new Error('Das öffentliche Live-Karte-Repository darf nicht als Statusspeicher benutzt werden.');
      if(!/^github_pat_[A-Za-z0-9_]{20,200}$/.test(token))
        throw new Error('Bitte einen Fine-grained GitHub-Token eingeben (github_pat_…).');
    }catch(e){note('⚠ '+e.message,true);return;}
    connect.disabled=true;
    accessToken=token;
    token='';tokenInput.value='';
    try{
      note('Privates Repository und Berechtigungen werden geprüft …');
      await verifyPrivateRepo(repo);
      connectedRepo=repo;
      updateControls();
      dirtyVersion++;
      await publish();
    }catch(e){
      accessToken=null;connectedRepo=null;
      updateControls();note('⚠ '+e.message,true);
    }finally{connect.disabled=false;}
  }
  function stop(){
    clearTimeout(saveTimer);
    accessToken=null;connectedRepo=null;queued=false;
    tokenInput.value='';
    updateControls();
    note('Rückkanal getrennt. Kein GitHub-Schlüssel im Browser gespeichert. Die lokale Karte und der verschlüsselte Eingang bleiben unverändert.');
  }
  connect.onclick=start;
  upload.onclick=()=>publish();
  disconnect.onclick=stop;
  window.addEventListener('livekarte:ticket-updated',()=>{dirtyVersion++;scheduleUpload();});
  window.addEventListener('pagehide',()=>{clearTimeout(saveTimer);accessToken=null;});
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden && accessToken && dirtyVersion!==uploadedVersion)scheduleUpload();
  });
  updateControls();
  note('Rückkanal noch nicht aktiviert. Ein separates privates Repository und ein eng begrenzter GitHub-Token sind erforderlich.');
})();
