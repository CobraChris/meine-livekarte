/* Optional Maps Demo Key prototype. OSM is the default and always remains
 * available. No paid API is enabled or invoked by this module.
 *
 * The browser key is supplied by its owner inside their own browser, stored
 * only in localStorage, and NEVER published with this static repository.
 * User-generated Google reviews/photos are NOT available on Demo Keys.
 */
(function(root){
  'use strict';
  const KEY_STORE='livekarte-google-demo-key-v1';
  const CALLBACK='__livekarteDemoReady';
  const ONLY_GOOGLE_JS='https://maps.googleapis.com/maps/api/js';
  const keyLooksValid=value=>/^AIza[0-9A-Za-z_-]{25,90}$/.test(value);
  const scriptUrl=key=>ONLY_GOOGLE_JS+'?'+new URLSearchParams({
    key,loading:'async',callback:CALLBACK,auth_referrer_policy:'origin',v:'weekly',language:'de'
  }).toString();
  let instance=null;
  function init(options){
    if(instance)return instance;
    const {map,places}=options;
    const $=id=>document.getElementById(id);
    const panel=$('google-demo-control'), googleEl=$('google-demo-map');
    const input=$('google-demo-key'),open=$('google-demo-start'),
      forget=$('google-demo-forget'),state=$('google-demo-status'),
      osm=$('provider-osm'),googleButton=$('provider-google'),
      settings=$('provider-settings'),notice=$('provider-notice'),
      heading=$('google-demo-summary'),workspace=googleEl.closest('.workspace');
    if(!panel||!googleEl||!input||!open||!forget||!state||
       !osm||!googleButton||!settings||!notice||!heading||!workspace)
      return null;
    let googleMap=null,markers=[],info=null,active=false,loading=false;
    let sdkKey=null,pending=null,expiry=null;
    const say=text=>{state.textContent=text;};
    const haveKey=()=>{try{return localStorage.getItem(KEY_STORE)||'';}catch{return '';}};
    const setKey=key=>{localStorage.setItem(KEY_STORE,key);};
    const clearKey=()=>{try{localStorage.removeItem(KEY_STORE);}catch{}};
    function updateUI(){
      const provider=active?'google':'osm';
      workspace.dataset.provider=provider;
      panel.dataset.provider=provider;
      heading.textContent='⚙ Google-Demo-Einstellungen';
      osm.setAttribute('aria-pressed',String(!active));
      googleButton.setAttribute('aria-pressed',String(active));
      googleButton.disabled=loading;
      googleButton.textContent=loading?'Google lädt …':'Google';
      settings.setAttribute('aria-expanded',String(panel.open));
      open.disabled=loading;
      open.textContent=loading?'Google wird geladen …':active?'Google aktualisieren':'Google Demo testen';
      forget.disabled=!haveKey();
      googleEl.hidden=!active;
      $('map').setAttribute('aria-hidden',String(active));
    }
    function resetToOSM(message){
      const center=active?googleMap?.getCenter?.():null;
      const zoom=active?googleMap?.getZoom?.():null;
      active=false;
      if(center&&typeof center.lat==='function'&&typeof center.lng==='function'&&
         Number.isFinite(zoom)){
        const next=[center.lat(),center.lng()];
        if(next.every(Number.isFinite))map.setView(next,Math.min(19,Math.max(2,zoom)),{animate:false});
      }
      updateUI();
      map.invalidateSize();
      if(message)say(message);
      notice.textContent='';
      notice.hidden=true;
    }
    function refreshPins(){
      if(!googleMap||!root.google?.maps)return;
      for(const marker of markers)marker.setMap(null);
      markers=[];
      const all=places().slice(0,250);
      for(const place of all){
        if(!Number.isFinite(place.lat)||!Number.isFinite(place.lng))continue;
        const marker=new google.maps.Marker({
          map:googleMap,position:{lat:place.lat,lng:place.lng},
          title:place.name
        });
        marker.addListener('click',()=>{
          if(!info)info=new google.maps.InfoWindow();
          const node=document.createElement('div');
          const title=document.createElement('strong');
          title.textContent=place.name;
          const note=document.createElement('p');
          note.textContent='Für Tagesplanung und Fußweg bitte auf OpenStreetMap wechseln.';
          node.append(title,note);
          info.setContent(node);
          info.open({map:googleMap,anchor:marker});
        });
        markers.push(marker);
      }
    }
    function showGoogle(){
      if(!root.google?.maps?.Map)throw new Error('Google-Kartenbibliothek ist nicht verfügbar.');
      const center=map.getCenter(),zoom=Math.max(2,Math.min(19,Math.round(map.getZoom())));
      active=true;
      updateUI();
      if(!googleMap){
        googleMap=new google.maps.Map(googleEl,{
          center:{lat:center.lat,lng:center.lng},zoom,
          mapTypeControl:false,fullscreenControl:false,streetViewControl:true,
          gestureHandling:'greedy', clickableIcons:true
        });
      }else{
        googleMap.setCenter({lat:center.lat,lng:center.lng});
        googleMap.setZoom(zoom);
      }
      refreshPins();
      panel.open=false;
      notice.textContent='';
      notice.hidden=true;
      say('Google-Demokarte aktiv. Eigene Touren und Fußwege bleiben in OSM.');
      updateUI();
    }
    function fail(reason){
      loading=false;
      clearTimeout(expiry);expiry=null;
      pending=null;
      if(active)resetToOSM();
      updateUI();
      const message=reason||'Google-Demo nicht verfügbar. OpenStreetMap bleibt nutzbar.';
      say(message);
      notice.textContent=message;
      notice.hidden=false;
    }
    function ready(){
      if(!pending)return;
      clearTimeout(expiry);expiry=null;
      loading=false;
      pending=null;
      try{showGoogle();}catch{fail('Google-Demo konnte nicht angezeigt werden. OpenStreetMap bleibt verfügbar.');}
      updateUI();
    }
    root[CALLBACK]=ready;
    // Google's JS authorization hook is public API. If Google blocks this
    // demo key (invalid referrer/quota), return to the free map.
    root.gm_authFailure=()=>fail('Google hat den Demo-Zugang abgelehnt oder das Limit erreicht. OpenStreetMap ist verfügbar.');
    open.addEventListener('click',()=>{
      if(loading)return;
      const provided=input.value.trim();
      const key=provided||haveKey();
      if(!keyLooksValid(key)){
        say('Bitte deinen Google-Demo-Key eingeben (beginnt normalerweise mit AIza).');
        return;
      }
      if(root.google?.maps?.Map&&sdkKey&&sdkKey!==key){
        say('Neuer Schlüssel gespeichert. Bitte die App neu öffnen, bevor du Google testest.');
        try{setKey(key);}catch{say('Schlüssel konnte nicht lokal gespeichert werden.');}
        input.value='';return;
      }
      try{setKey(key);}catch{
        say('Lokaler Speicher nicht verfügbar. Schlüssel nicht gespeichert.');return;
      }
      input.value='';
      if(root.google?.maps?.Map){
        try{showGoogle();}catch{fail('Google-Demokarte konnte nicht geladen werden.');}
        return;
      }
      loading=true;sdkKey=key;pending=true;
      updateUI();
      say('Google wird nur für diesen Test geladen. Keine kostenpflichtigen APIs.');
      const script=document.createElement('script');
      script.async=true;script.referrerPolicy='origin';
      script.src=scriptUrl(key);
      script.onerror=()=>fail('Google nicht erreichbar. OpenStreetMap bleibt verfügbar.');
      expiry=setTimeout(()=>fail('Google lädt zu lange. OpenStreetMap bleibt verfügbar.'),18000);
      document.head.append(script);
    });
    osm.addEventListener('click',()=>resetToOSM('OpenStreetMap aktiv. Google wird nicht erneut geladen.'));
    googleButton.addEventListener('click',()=>{
      if(active||loading)return;
      if(!haveKey()){
        panel.open=true;
        updateUI();
        notice.textContent='Google-Demo-Key einmalig unter Einstellungen eintragen.';
        notice.hidden=false;
        input.focus();
        return;
      }
      open.click();
    });
    settings.addEventListener('click',()=>{
      panel.open=!panel.open;
      updateUI();
      if(panel.open)panel.scrollIntoView({behavior:'smooth',block:'nearest'});
    });
    panel.addEventListener('toggle',updateUI);
    forget.addEventListener('click',()=>{
      clearKey();input.value='';
      resetToOSM('Demo-Key nur auf diesem Gerät aus dem Browser-Speicher entfernt.');
    });
    input.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();open.click();}
    });
    if(haveKey())say('Demo-Key auf diesem Gerät vorhanden. Google startet erst auf Knopfdruck.');
    else say('Demo-Key hier einfügen. Er wird nicht an GitHub oder ChatGPT gesendet.');
    updateUI();
    instance={
      refresh(){if(active)refreshPins();},
      syncFromOSM(){
        if(!active||!googleMap)return;
        const center=map.getCenter();
        googleMap.setCenter({lat:center.lat,lng:center.lng});
        googleMap.setZoom(Math.max(2,Math.min(19,Math.round(map.getZoom()))));
      },
      forceOSM(){if(active)resetToOSM('Für unsere eigenen Routen verwenden wir OpenStreetMap.');},
      isGoogle(){return active;}
    };
    return instance;
  }
  const api={init,keyLooksValid,scriptUrl};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LivekarteGoogleDemo=api;
})(globalThis);
