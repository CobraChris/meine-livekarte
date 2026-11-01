/* Ticket vault UI: only local file picker, WebCrypto, IndexedDB and Blob URLs.
 * Never transfers uploaded tickets, QR images, names or passphrases to a server.
 */
'use strict';
(() => {
  const V=window.LivekarteTicketVault;
  const $=id=>document.getElementById(id);
  const root=$('ticket-vault');
  if(!V||!root)return;
  const vault=new V.Vault();
  const message=$('vault-message');
  const sections={setup:$('vault-setup'),locked:$('vault-locked'),open:$('vault-open')};
  let previewUrl=null,lastUse=0;
  const idleLimit=15*60*1000;
  const touch=()=>{lastUse=Date.now();};
  function showRecoveryCode(code){
    const panel=$('vault-recovery-display');
    $('vault-recovery-code').textContent=code;
    panel.hidden=false;
    panel.scrollIntoView({behavior:'smooth',block:'nearest'});
    status('Neuen Wiederherstellungsschlüssel jetzt sicher speichern. Danach neues verschlüsseltes Backup erstellen.');
  }
  function dismissRecovery(){
    $('vault-recovery-code').textContent='';
    $('vault-recovery-display').hidden=true;
  }
  $('vault-recovery-dismiss').onclick=dismissRecovery;
  $('vault-recovery-copy').onclick=()=>busy($('vault-recovery-copy'),async()=>{
    const code=$('vault-recovery-code').textContent;
    if(!code)throw Error('Kein Wiederherstellungsschlüssel sichtbar.');
    if(!navigator.clipboard?.writeText)throw Error('Kopieren nicht verfügbar. Den Schlüssel manuell in den Passwortmanager übertragen.');
    await navigator.clipboard.writeText(code);
    status('Schlüssel kopiert. Bitte im Passwortmanager sicher speichern und dann Anzeige schließen.');
  });
  function status(text,isError=false){
    message.textContent=text;
    message.classList.toggle('is-error',isError);
  }
  function mode(name){
    for(const [key,element] of Object.entries(sections))element.hidden=key!==name;
  }
  function busy(button,job){
    if(button.disabled)return;
    button.disabled=true;
    Promise.resolve().then(job).catch(e=>status(e.message||'Aktion fehlgeschlagen.',true))
      .finally(()=>{button.disabled=false;});
  }
  function closePreview(){
    const dialog=$('vault-preview');
    if(dialog.open)dialog.close();
    $('vault-preview-image').removeAttribute('src');
    $('vault-preview-pdf').removeAttribute('src');
    $('vault-preview-download').removeAttribute('href');
    if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
  }
  function lock(){
    dismissRecovery();
    closePreview();
    vault.lock();
    $('vault-password').value='';
    $('vault-open-input').value='';
    mode('locked');
    status('Tresor gesperrt. Zum Anzeigen und Importieren erneut entsperren.');
  }
  async function redraw(){
    if(!vault.key)return;
    const list=await vault.list();
    $('vault-legacy-upgrade').hidden=!vault.legacy;
    $('vault-modern-security').hidden=!!vault.legacy;
    const listEl=$('vault-files');
    listEl.replaceChildren();
    const total=list.reduce((sum,item)=>sum+item.size,0);
    $('vault-counter').textContent=list.length+' / '+V.MAX_ITEMS+' Dokumente · '+(total/1048576).toFixed(1)+' MB / 50 MB';
    if(!list.length){
      const empty=document.createElement('p');
      empty.className='vault-empty';
      empty.textContent='Noch keine Dateien gespeichert. Importiere ein PDF oder einen QR-Screenshot.';
      listEl.append(empty);
    }
    for(const item of list){
      const card=document.createElement('article');
      card.className='vault-file';
      const heading=document.createElement('div');
      heading.className='vault-file-heading';
      const title=document.createElement('strong');
      title.textContent=item.title;
      const subtitle=document.createElement('small');
      subtitle.textContent=(item.trip?item.trip+' · ':'')+
        (item.type==='application/pdf'?'PDF':'Bild')+' · '+
        (item.size/1048576).toFixed(2)+' MB';
      heading.append(title,subtitle);
      const actions=document.createElement('div');
      actions.className='vault-file-actions';
      const view=document.createElement('button');
      view.type='button';view.textContent='👁 Anzeigen';
      view.onclick=()=>busy(view,async()=>{
        touch();
        const result=await vault.file(item.id);
        closePreview();
        previewUrl=URL.createObjectURL(result.blob);
        $('vault-preview-title').textContent=result.metadata.title;
        const isPdf=result.metadata.type==='application/pdf';
        $('vault-preview-image').hidden=isPdf;
        $('vault-preview-pdf').hidden=!isPdf;
        if(isPdf)$('vault-preview-pdf').src=previewUrl;
        else $('vault-preview-image').src=previewUrl;
        const link=$('vault-preview-download');
        link.href=previewUrl;link.download=result.metadata.name;
        $('vault-preview').showModal();
      });
      const download=document.createElement('button');
      download.type='button';download.textContent='↓ Original';
      download.onclick=()=>busy(download,async()=>{
        touch();
        const result=await vault.file(item.id);
        downloadBlob(result.blob,result.metadata.name);
        status('Originaldatei zum Speichern geöffnet. Nach dem Download bitte Tresor wieder sperren.');
      });
      const remove=document.createElement('button');
      remove.type='button';remove.textContent='Löschen';
      remove.className='vault-delete';
      remove.onclick=()=>busy(remove,async()=>{
        if(!confirm('„'+item.title+'“ endgültig aus dem lokalen Tresor löschen?'))return;
        touch();
        await vault.remove(item.id);
        await redraw();
        status('Dokument lokal gelöscht. Bereits exportierte Sicherungen bleiben unverändert.');
      });
      actions.append(view,download,remove);
      card.append(heading,actions);listEl.append(card);
    }
  }
  function downloadBlob(blob,filename){
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=filename;a.style.display='none';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function refreshMode(){
    if(!V.available()){
      $('vault-unavailable').hidden=false;
      for(const el of Object.values(sections))el.hidden=true;
      status('Ticket-Tresor benötigt HTTPS, Web Crypto und IndexedDB.',true);
      return;
    }
    if(vault.key){mode('open');await redraw();return;}
    const exists=await vault.exists();
    mode(exists?'locked':'setup');
    $('vault-forgot').hidden=!exists||!(await vault.hasRecovery());
    status('Alle Dateien bleiben nur verschlüsselt auf diesem Gerät. Backup empfohlen.');
  }
  $('vault-create').onclick=()=>busy($('vault-create'),async()=>{
    const pass=$('vault-new-password').value,again=$('vault-repeat-password').value;
    if(pass!==again)throw Error('Die beiden Passwörter stimmen nicht überein.');
    const recovery=await vault.initialize(pass);
    $('vault-new-password').value='';$('vault-repeat-password').value='';
    touch();await refreshMode();
    showRecoveryCode(recovery);
  });
  $('vault-unlock').onclick=()=>busy($('vault-unlock'),async()=>{
    await vault.unlock($('vault-password').value);
    $('vault-password').value='';
    touch();await refreshMode();
    status('Tresor entsperrt. Dateien sind nur während der Entsperrung lesbar.');
  });
  $('vault-lock').onclick=lock;
  $('vault-forgot-submit').onclick=()=>busy($('vault-forgot-submit'),async()=>{
    const code=$('vault-forgot-code').value;
    const fresh=$('vault-forgot-new').value;
    if(fresh!==$('vault-forgot-again').value)
      throw Error('Neue Passwörter stimmen nicht überein.');
    const recovery=await vault.resetWithRecovery(code,fresh);
    for(const id of ['vault-forgot-code','vault-forgot-new','vault-forgot-again'])$(id).value='';
    $('vault-forgot').open=false;
    touch();await refreshMode();
    showRecoveryCode(recovery);
  });
  $('vault-change-submit').onclick=()=>busy($('vault-change-submit'),async()=>{
    const old=$('vault-change-old').value,fresh=$('vault-change-new').value;
    if(fresh!==$('vault-change-again').value)
      throw Error('Neue Passwörter stimmen nicht überein.');
    const recovery=await vault.changePassword(old,fresh);
    for(const id of ['vault-change-old','vault-change-new','vault-change-again'])$(id).value='';
    touch();await refreshMode();
    if(recovery)showRecoveryCode(recovery);
    else status('Passwort geändert. Aktueller Wiederherstellungsschlüssel bleibt gültig. Neues Backup erstellen.');
  });
  $('vault-rotate-submit').onclick=()=>busy($('vault-rotate-submit'),async()=>{
    const recovery=await vault.rotateRecovery($('vault-rotate-password').value);
    $('vault-rotate-password').value='';
    touch();showRecoveryCode(recovery);
  });
  $('vault-upgrade-submit').onclick=()=>busy($('vault-upgrade-submit'),async()=>{
    const recovery=await vault.upgradeLegacy($('vault-upgrade-password').value);
    $('vault-upgrade-password').value='';
    touch();await refreshMode();
    showRecoveryCode(recovery);
  });
  $('vault-restore-use-recovery').onchange=()=>{
    $('vault-restore-new-group').hidden=!$('vault-restore-use-recovery').checked;
  };
  $('vault-use-trip').onclick=()=>{
    const current=$('plan-select');
    const text=current?.selectedOptions?.[0]?.textContent?.trim();
    if(text&&current?.value!=='all')$('vault-trip').value=text.slice(0,100);
    else status('Bitte zuerst einen konkreten Reiseabschnitt auswählen.',true);
  };
  $('vault-add').onclick=()=>busy($('vault-add'),async()=>{
    const f=$('vault-open-input').files?.[0];
    if(!f)throw Error('Bitte zuerst eine Datei auswählen.');
    touch();
    const saved=await vault.add(f,{
      title:$('vault-title-input').value,
      trip:$('vault-trip').value
    });
    $('vault-open-input').value='';$('vault-title-input').value='';
    await redraw();
    status('✓ '+saved.title+' lokal und verschlüsselt gespeichert.');
  });
  $('vault-backup').onclick=()=>busy($('vault-backup'),async()=>{
    touch();
    const blob=await vault.backup();
    const day=new Date().toISOString().slice(0,10);
    downloadBlob(blob,'livekarte-ticket-backup-'+day+'.json');
    status('Verschlüsseltes Backup erstellt. In Android „Dateien“ kontrollieren und sicher aufbewahren. Ohne Passwort nicht lesbar.');
  });
  $('vault-restore').onclick=()=>busy($('vault-restore'),async()=>{
    const file=$('vault-restore-file').files?.[0];
    if(!file)throw Error('Bitte die verschlüsselte Backup-JSON-Datei wählen.');
    const recovering=$('vault-restore-use-recovery').checked;
    const recovery=await vault.restore(
      file,$('vault-restore-password').value,recovering?'recovery':'password',
      recovering?$('vault-restore-new-password').value:'');
    $('vault-restore-password').value='';$('vault-restore-file').value='';
    $('vault-restore-new-password').value='';
    $('vault-restore-use-recovery').checked=false;
    $('vault-restore-new-group').hidden=true;
    touch();await refreshMode();
    if(recovery)showRecoveryCode(recovery);
    else status('Backup geprüft und vollständig wiederhergestellt. Tresor entsperrt.');
  });
  $('vault-persist').onclick=()=>busy($('vault-persist'),async()=>{
    if(!navigator.storage?.persist)throw Error('Diese Browser-Version unterstützt keinen geschützten lokalen Speicher.');
    const granted=await navigator.storage.persist();
    status(granted?'Browser schützt den lokalen Speicher soweit möglich. Backup weiterhin nötig.':
      'Browser hat dauerhaften Speicher nicht gewährt. Ein Backup ist besonders wichtig.',!granted);
  });
  $('vault-preview-close').onclick=closePreview;
  $('vault-preview').addEventListener('close',()=>{
    $('vault-preview-image').removeAttribute('src');
    $('vault-preview-pdf').removeAttribute('src');
    if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
  });
  // When returning after lengthy inactivity, do not keep the file key resident.
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&vault.key&&Date.now()-lastUse>idleLimit)lock();
  });
  window.addEventListener('focus',()=>{
    if(vault.key&&Date.now()-lastUse>idleLimit)lock();
  });
  setInterval(()=>{if(vault.key&&Date.now()-lastUse>idleLimit)lock();},60000);
  void refreshMode().catch(e=>status('Tresor konnte nicht geöffnet werden: '+e.message,true));
})();
