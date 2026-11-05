/* Installable PWA controls. Works without beforeinstallprompt on browsers
 * that require manual "Add to Home screen" from the browser menu.
 * No tracking and no changes to existing IndexedDB/localStorage.
 */
'use strict';
(() => {
  const installCard=document.getElementById('install-app-card');
  const installButton=document.getElementById('install-app-button');
  const installStatus=document.getElementById('install-app-status');
  const offline=document.getElementById('offline-notice');
  if(!installCard || !installButton || !installStatus || !offline)return;
  let pendingPrompt=null;
  const media=window.matchMedia?.('(display-mode: standalone)');
  const isInstalled=()=>Boolean(media?.matches || navigator.standalone===true);
  function display(){
    installCard.hidden=isInstalled();
    installButton.hidden=!pendingPrompt || isInstalled();
  }
  function showConnection(){
    offline.hidden=navigator.onLine!==false;
  }
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    pendingPrompt=event;
    display();
    installStatus.textContent='Die Live-Karte kann als eigenständige App installiert werden.';
  });
  installButton.addEventListener('click',async()=>{
    if(!pendingPrompt)return;
    const prompt=pendingPrompt;
    pendingPrompt=null;
    display();
    try{
      await prompt.prompt();
      const choice=await prompt.userChoice;
      if(choice?.outcome==='accepted')
        installStatus.textContent='Installation bestätigt. Die Live-Karte erscheint auf deinem Startbildschirm.';
      else
        installStatus.textContent='Installation abgebrochen. Über das Browsermenü kannst du die App später installieren.';
    }catch{
      installStatus.textContent='Die Installation konnte nicht gestartet werden. Nutze im Browsermenü „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.';
    }
  });
  window.addEventListener('appinstalled',()=>{
    pendingPrompt=null;
    display();
  });
  media?.addEventListener?.('change',display);
  window.addEventListener('online',showConnection);
  window.addEventListener('offline',showConnection);
  showConnection();
  display();
  // GitHub Pages generates both files from the published commit SHA.
  // A running standalone PWA may keep an older JS bundle until restarted;
  // notify rather than forcibly reloading and risking unsaved user input.
  const updateBanner=document.getElementById('app-update-banner');
  const updateNow=document.getElementById('app-update-now');
  let lastUpdateCheck=0;
  async function checkForAppUpdate(){
    if(!window.LivekarteAppBuild || !updateBanner || !updateNow ||
       navigator.onLine===false)return;
    try{
      const response=await fetch('./app-version.json',{
        cache:'no-store',credentials:'omit',mode:'same-origin'
      });
      if(!response.ok)return;
      const info=await response.json();
      if(typeof info?.build!=='string'||!/^[a-f0-9]{40}$/.test(info.build))return;
      updateBanner.hidden=info.build===window.LivekarteAppBuild;
    }catch{ /* No disruption during temporary connectivity problems. */ }
  }
  function requestUpdateCheck(){
    const now=Date.now();
    if(now-lastUpdateCheck<90000)return;
    lastUpdateCheck=now;
    void checkForAppUpdate();
    if('serviceWorker' in navigator){
      navigator.serviceWorker.getRegistration('./')
        .then(reg=>reg?.update()).catch(()=>{});
    }
  }
  // Never discard an open, modified form just because a new Pages build
  // appeared. This is entirely ephemeral UI state: no form data is read,
  // copied, persisted or sent to a server.
  const editedDialogs=new WeakSet();
  const rememberDraft=event=>{
    const dialog=event.target?.closest?.('dialog[open]');
    if(dialog && event.target?.matches?.('input,textarea,select'))
      editedDialogs.add(dialog);
  };
  document.addEventListener('input',rememberDraft,true);
  document.addEventListener('change',rememberDraft,true);
  document.addEventListener('close',event=>{
    if(event.target?.tagName==='DIALOG')editedDialogs.delete(event.target);
  },true);
  if(updateNow)updateNow.addEventListener('click',()=>{
    const unsaved=[...document.querySelectorAll('dialog[open]')]
      .some(dialog=>editedDialogs.has(dialog));
    if(unsaved && !window.confirm(
      'Du hast möglicherweise ungespeicherte Änderungen in einem geöffneten Dialog. Wirklich die App aktualisieren?'
    ))return;
    // Reload keeps IndexedDB, localStorage and the private key unchanged.
    window.location.reload();
  });
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)requestUpdateCheck();
  });
  window.addEventListener('focus',requestUpdateCheck);
  window.addEventListener('online',requestUpdateCheck);
  window.addEventListener('load',requestUpdateCheck);
  if('serviceWorker' in navigator && window.isSecureContext){
    window.addEventListener('load',()=>{
      navigator.serviceWorker.register('./sw.js',{
        scope:'./',updateViaCache:'none'
      }).catch(()=>{
        // Offline caching is optional; no disruption to the online map.
        installStatus.textContent='Offline-Unterstützung ist in diesem Browser nicht verfügbar. Online funktioniert die Karte weiterhin.';
      });
    });
  }
})();
