/* Simple local ticket shelf. No login, password or automatic uploads.
 * The only password entry is optional one-time conversion of old encrypted
 * documents, shown only if such documents exist.
 */
'use strict';
(() => {
  const API=window.LivekarteTicketLibrary,$=id=>document.getElementById(id);
  const root=$('ticket-vault');
  if(!API||!root)return;
  const shelf=new API.Library();
  const SHARE=window.LivekarteTicketShareInbox;
  let sharedDraft=null,lastSharedId=null;
  const status=(message,error=false)=>{
    const el=$('ticket-status');
    el.textContent=message;el.classList.toggle('is-error',error);
  };
  let currentPreviewUrl=null;
  const busy=(button,action)=>{
    if(button.disabled)return;
    button.disabled=true;
    try{
      Promise.resolve(action()).catch(e=>status(e.message||'Vorgang fehlgeschlagen.',true))
        .finally(()=>{button.disabled=false;});
    }catch(e){status(e.message||'Vorgang fehlgeschlagen.',true);button.disabled=false;}
  };
  const node=(type,text,cls)=>{
    const el=document.createElement(type);
    if(cls)el.className=cls;
    if(text!==undefined)el.textContent=text;
    return el;
  };
  function download(blob,name){
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=name;link.hidden=true;
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function closePreview(){
    const dialog=$('vault-preview');
    if(dialog.open)dialog.close();
    $('vault-preview-image').removeAttribute('src');
    $('vault-preview-pdf').removeAttribute('src');
    $('vault-preview-download').removeAttribute('href');
    if(currentPreviewUrl){URL.revokeObjectURL(currentPreviewUrl);currentPreviewUrl=null;}
  }
  $('vault-preview-close').onclick=closePreview;
  $('vault-preview').addEventListener('close',closePreview);
  async function viewTicket(id){
    return preview(await shelf.get(id));
  }
  function preview(item){
    closePreview();
    currentPreviewUrl=URL.createObjectURL(item.blob);
    $('vault-preview-title').textContent=item.title;
    const isPdf=item.type==='application/pdf';
    $('vault-preview-image').hidden=isPdf;
    $('vault-preview-pdf').hidden=!isPdf;
    if(isPdf)$('vault-preview-pdf').src=currentPreviewUrl;
    else $('vault-preview-image').src=currentPreviewUrl;
    const original=$('vault-preview-download');
    original.href=currentPreviewUrl;original.download=item.name;
    $('vault-preview').showModal();
  }
  async function render(){
    const files=await shelf.list(),list=$('ticket-files');
    list.replaceChildren();
    const total=files.reduce((sum,item)=>sum+item.size,0);
    $('ticket-count').textContent=files.length+' / '+API.MAX_ITEMS+
      ' Dokumente · '+(total/1048576).toFixed(1)+' MB / 50 MB';
    if(!files.length)list.append(node('p','Noch keine Tickets gespeichert. PDF oder Screenshot auswählen und hinzufügen.','vault-empty'));
    for(const item of files){
      const card=node('article',undefined,'vault-file'),
        header=node('div',undefined,'vault-file-heading'),
        title=node('strong',item.title),desc=node('small',
          (item.trip?item.trip+' · ':'')+
          (item.type==='application/pdf'?'PDF':'Bild')+' · '+
          (item.size/1048576).toFixed(2)+' MB');
      header.append(title,desc);
      const actions=node('div',undefined,'vault-file-actions');
      const show=node('button','👁 Anzeigen');
      show.type='button';show.onclick=()=>busy(show,()=>viewTicket(item.id));
      const save=node('button','↓ Original');
      save.type='button';save.onclick=()=>busy(save,async()=>{
        const file=await shelf.get(item.id);
        download(file.blob,file.name);
        status('Original gespeichert. Die heruntergeladene Datei liegt ebenfalls unverschlüsselt vor.');
      });
      const remove=node('button','Löschen','vault-delete');
      remove.type='button';remove.onclick=()=>busy(remove,async()=>{
        if(!confirm('Dokument „'+item.title+'“ wirklich aus dieser lokalen Ablage löschen?'))return;
        await shelf.remove(item.id);await render();
        status('Dokument gelöscht. Bereits exportierte Backups bleiben unverändert.');
      });
      actions.append(show,save,remove);card.append(header,actions);list.append(card);
    }
  }
  async function renderShared(){
    if(!SHARE)return;
    const items=await SHARE.pending();
    sharedDraft=items[0]||null;
    const panel=$('ticket-shared');
    panel.hidden=!sharedDraft;
    if(!sharedDraft){lastSharedId=null;return;}
    if(lastSharedId!==sharedDraft.id){
      lastSharedId=sharedDraft.id;
      $('ticket-shared-title-input').value=sharedDraft.name.slice(0,100);
      $('ticket-shared-trip').value='';
    }
    $('ticket-shared-name').textContent=sharedDraft.name+' · '+
      (sharedDraft.type==='application/pdf'?'PDF':'Bild')+' · '+
      (sharedDraft.size/1048576).toFixed(2)+' MB';
    $('ticket-shared-note').textContent=
      (items.length>1?items.length+' geteilte Dateien warten. Zuerst diese prüfen. ':
        'Geteilte Datei bereit. ')+
      'Sie ist noch kein gespeichertes Ticket. Vorschau ansehen, speichern oder verwerfen.';
  }
  $('ticket-shared-preview').onclick=()=>busy($('ticket-shared-preview'),async()=>{
    if(!sharedDraft)throw Error('Keine geteilte Datei vorhanden.');
    preview({...sharedDraft,title:$('ticket-shared-title-input').value||sharedDraft.name});
  });
  $('ticket-shared-save').onclick=()=>busy($('ticket-shared-save'),async()=>{
    if(!sharedDraft)throw Error('Keine geteilte Datei vorhanden.');
    const item=sharedDraft;
    const file={name:item.name,type:item.type,size:item.size,
      arrayBuffer:()=>item.blob.arrayBuffer()};
    const saved=await shelf.add(file,{
      title:$('ticket-shared-title-input').value,
      trip:$('ticket-shared-trip').value
    });
    await SHARE.remove(item.id);
    await render();await renderShared();
    status('✓ Geteiltes Ticket „'+saved.title+'“ lokal gespeichert – ohne Passwort.');
  });
  $('ticket-shared-discard').onclick=()=>busy($('ticket-shared-discard'),async()=>{
    if(!sharedDraft)return;
    if(!confirm('Geteilte Datei verwerfen? Sie wurde noch nicht dauerhaft als Ticket gespeichert.'))return;
    await SHARE.remove(sharedDraft.id);
    await renderShared();
    status('Geteilte Datei verworfen. Bereits gespeicherte Tickets bleiben erhalten.');
  });
  async function showLegacy(){
    try{
      const oldCount=await shelf.legacyCount();
      if(!oldCount){$('ticket-legacy').hidden=true;return;}
      const files=await shelf.list();
      const imported=files.filter(f=>f.id.startsWith('legacy-')).length;
      $('ticket-legacy').hidden=imported>=oldCount;
      $('ticket-legacy-count').textContent=oldCount+' ältere verschlüsselte Dokumente erkannt. Nur bei Bedarf einmalig übertragen.';
    }catch{
      $('ticket-legacy').hidden=true;
    }
  }
  $('ticket-file').addEventListener('change',()=>{
    const file=$('ticket-file').files?.[0];
    if(file&&!$('ticket-title').value)$('ticket-title').value=file.name.slice(0,100);
  });
  $('ticket-trip-current').onclick=()=>{
    const selected=$('plan-select');
    const trip=selected?.selectedOptions?.[0]?.textContent?.trim();
    if(!trip||selected.value==='all')status('Bitte zuerst einen konkreten Reiseabschnitt auswählen.',true);
    else $('ticket-trip').value=trip.slice(0,100);
  };
  $('ticket-add').onclick=()=>busy($('ticket-add'),async()=>{
    const file=$('ticket-file').files?.[0];
    if(!file)throw Error('Bitte zuerst ein PDF oder Bild auswählen.');
    const item=await shelf.add(file,{title:$('ticket-title').value,trip:$('ticket-trip').value});
    $('ticket-file').value='';$('ticket-title').value='';
    await render();
    status('✓ '+item.title+' gespeichert. Du kannst es sofort ohne Passwort öffnen.');
  });
  $('ticket-backup').onclick=()=>busy($('ticket-backup'),async()=>{
    if(!confirm('Backup ist NICHT verschlüsselt. Möchtest du die Ticketdateien als lokale JSON-Sicherung exportieren?'))return;
    const blob=await shelf.backup();
    download(blob,'livekarte-ticketablage-'+new Date().toISOString().slice(0,10)+'.json');
    status('Lokales Backup erstellt (unverschlüsselt). Bitte außerhalb der App sicher aufbewahren.');
  });
  $('ticket-restore').onclick=()=>busy($('ticket-restore'),async()=>{
    const file=$('ticket-restore-file').files?.[0];
    if(!file)throw Error('Bitte eine Sicherungsdatei auswählen.');
    const imported=await shelf.restore(file);
    $('ticket-restore-file').value='';
    await render();
    status(imported+' Dokumente aus dem lokalen Backup hinzugefügt. Bereits vorhandene Dokumente nicht überschrieben.');
  });
  $('ticket-persist').onclick=()=>busy($('ticket-persist'),async()=>{
    if(!navigator.storage?.persist)throw Error('Dein Browser unterstützt diese Speicherfunktion nicht.');
    const ok=await navigator.storage.persist();
    status(ok?'Lokaler Speicher wird vom Browser möglichst beibehalten. Eigenes Backup bleibt wichtig.':
      'Dauerhafter Speicher wurde nicht gewährt. Eigenes Backup wichtig.',!ok);
  });
  $('ticket-legacy-import').onclick=()=>busy($('ticket-legacy-import'),async()=>{
    if(!window.LivekarteTicketVault)throw Error('Der alte Tresor kann nicht geladen werden.');
    const password=$('ticket-legacy-password').value;
    if(!password)throw Error('Für die einmalige Übernahme wird das bisherige Passwort benötigt.');
    const old=new window.LivekarteTicketVault.Vault();
    await old.unlock(password);
    const imported=await shelf.importLegacy(old);
    old.lock();$('ticket-legacy-password').value='';
    await render();await showLegacy();
    status('✓ '+imported+' bisher verschlüsselte Dokumente in die neue Ablage übertragen. Der alte Tresor bleibt unverändert erhalten.');
  });
  async function start(){
    if(!API.available()){
      $('ticket-file-area').hidden=true;
      status('Lokaler Dokumentenspeicher ist in diesem Browser nicht verfügbar.',true);
      return;
    }
    await render();
    await showLegacy();
    if(SHARE)await renderShared();
    const shareStatus=new URLSearchParams(window.location.search).get('shared-ticket');
    if(shareStatus){
      root.open=true;
      root.scrollIntoView({behavior:'smooth',block:'start'});
      if(shareStatus==='ready'){
        status('Eine Datei wurde aus Android übergeben. Bitte die Importkarte prüfen und „Als Ticket speichern“ wählen.');
      }else{
        status('Android konnte diese Datei nicht übernehmen. Unterstützt sind PDF, PNG, JPG und WebP bis 10 MB. Alternativ die Dateiauswahl nutzen.',true);
      }
    }else{
      status('Bereit · Dateien bleiben lokal auf diesem Gerät, ohne Passwort und ohne Cloud.');
    }
  }
  window.addEventListener('focus',()=>{
    if(SHARE)void renderShared().catch(e=>status('Geteilte Dateien konnten nicht geladen werden: '+e.message,true));
  });
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&SHARE)void renderShared().catch(e=>status('Geteilte Dateien konnten nicht geladen werden: '+e.message,true));
  });
  void start().catch(e=>status('Ticketablage nicht verfügbar: '+e.message,true));
})();
