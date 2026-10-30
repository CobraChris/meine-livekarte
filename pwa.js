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
