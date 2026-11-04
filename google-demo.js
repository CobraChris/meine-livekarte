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
  // Same teal map pin and yellow 1..N badge as the Leaflet day route.
  // Created locally from the user's existing stop order; no Places/Routes API.
  function markerSvg(number){
    const value=Number.isInteger(number)&&number>0&&number<=99?String(number):'';
    const badge=value?'<circle cx="42" cy="13" r="11.5" fill="#ffe09c" stroke="#173b36" stroke-width="2.6"/>'+
      '<text x="42" y="18" font-family="Arial,sans-serif" font-size="15" font-weight="800" text-anchor="middle" fill="#19372e">'+value+'</text>':'';
    const svg='<svg xmlns="http://www.w3.org/2000/svg" width="56" height="70" viewBox="0 0 56 70">'+
      '<path d="M26 6C13 6 4 15 4 27c0 18 22 37 22 37s22-19 22-37C48 15 39 6 26 6z" fill="#a4ecc9" stroke="#19473e" stroke-width="3"/>'+
      '<path d="M26 18l10 10-10 10-10-10z" fill="none" stroke="#23675a" stroke-width="2"/>'+
      badge+'</svg>';
    return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg);
  }
  // Only reuse locally available Leaflet/OSRM geometry; never Google Routes.
  function normalizedDayRoute(source){
    if(!source||!Array.isArray(source.points)||source.points.length<2||
       source.points.length>12000)return null;
    const path=[];
    for(const point of source.points){
      if(!Array.isArray(point)||point.length<2||
         !Number.isFinite(point[0])||!Number.isFinite(point[1])||
         Math.abs(point[0])>90||Math.abs(point[1])>180)return null;
      path.push({lat:point[0],lng:point[1]});
    }
    return {path,real:source.real===true};
  }
  // Google Maps URLs are free and need no Places API or billing account.
  // Without a trusted Place ID, a name search may show several matches;
  // the user can choose the correct listing and read its current reviews.
  function placeDetailsUrl(place){
    const name=typeof place?.name==='string'?place.name.trim().slice(0,160):'';
    if(!name)return null;
    const address=typeof place.address==='string'?place.address.trim().slice(0,180):'';
    const query=address?name+', '+address:name;
    const params=new URLSearchParams({api:'1',query});
    const placeId=typeof place.googlePlaceId==='string'
      ?place.googlePlaceId.trim():'';
    if(/^[A-Za-z0-9_-]{15,160}$/.test(placeId))
      params.set('query_place_id',placeId);
    return 'https://www.google.com/maps/search/?'+params.toString();
  }
  let instance=null;
  function init(options){
    if(instance)return instance;
    const {map,places,stops=()=>[],route=()=>null,
      goals=()=>[],fitOSM=()=>{},onWalk=()=>{},onToggleTour=()=>{},
      tourSelected=()=>false,placeKey}=options;
    const $=id=>document.getElementById(id);
    const panel=$('google-demo-control'), googleEl=$('google-demo-map'),
      routeLegend=$('google-demo-route-legend'),
      routeMeaning=$('google-demo-route-meaning');
    const input=$('google-demo-key'),open=$('google-demo-start'),
      forget=$('google-demo-forget'),state=$('google-demo-status'),
      osm=$('provider-osm'),googleButton=$('provider-google'),
      settings=$('provider-settings'),notice=$('provider-notice'),
      heading=$('google-demo-summary'),workspace=googleEl.closest('.workspace');
    if(!panel||!googleEl||!routeLegend||!routeMeaning||!input||!open||!forget||!state||
       !osm||!googleButton||!settings||!notice||!heading||!workspace)
      return null;
    let googleMap=null,markers=[],routeLine=null,info=null,active=false,loading=false;
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
    function resetToOSM(message,fitDay=false){
      clearRoute();
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
      if(fitDay&&goals().length>=2){
        try{fitOSM();}catch{/* Fall back to the synchronized map camera. */}
      }
      if(message)say(message);
      notice.textContent='';
      notice.hidden=true;
    }
    function clearRoute(){
      if(routeLine)routeLine.setMap(null);
      routeLine=null;
      routeMeaning.textContent='';
      routeLegend.open=false;
      routeLegend.hidden=true;
    }
    function refreshRoute(){
      clearRoute();
      if(!active||!googleMap||!root.google?.maps?.Polyline)return;
      let prepared;
      try{prepared=normalizedDayRoute(route());}
      catch{return;}
      if(!prepared)return;
      const {path,real}=prepared;
      const options={
        map:googleMap,path,geodesic:false,clickable:false,zIndex:800,
        strokeColor:real?'#D58A13':'#FDB72A',
        strokeWeight:real?6:4,strokeOpacity:real?0.99:0
      };
      // Google's standard repeating line symbols, not walking geometry.
      if(!real)options.icons=[
        // Dark outline under the yellow dashes keeps them visible over both
        // Google parks (green) and light streets without implying a road.
        {icon:{path:'M 0,-1 0,1',strokeColor:'#203F3C',
          strokeOpacity:0.98,strokeWeight:6,scale:4},offset:'0',repeat:'26px'},
        {icon:{path:'M 0,-1 0,1',strokeColor:'#FFC13E',
          strokeOpacity:1,strokeWeight:3,scale:4},offset:'0',repeat:'26px'}
      ];
      try{routeLine=new google.maps.Polyline(options);}
      catch{clearRoute();return;}
      routeMeaning.textContent=real
        ?'━ Berechneter Fußweg aus OpenStreetMap-Routing'
        :'┄ Luftlinie zwischen Tageszielen – kein berechneter Fußweg';
      routeLegend.setAttribute('aria-label',real
        ?'Information zur berechneten Fußroute'
        :'Information zur gestrichelten Luftlinien-Vorschau');
      routeLegend.hidden=false;
    }
    function refreshPins(){
      if(!googleMap||!root.google?.maps)return;
      if(info?.close)info.close();
      for(const marker of markers)marker.setMap(null);
      markers=[];
      const all=places().slice(0,250);
      const ordered=stops().slice(0,20);
      const keyOf=p=>typeof placeKey==='function'
        ?placeKey(p):String(p.name)+'|'+p.lat+'|'+p.lng;
      const byKey=new Map(ordered.map((p,i)=>[keyOf(p),i+1]));
      for(const place of all){
        if(!Number.isFinite(place.lat)||!Number.isFinite(place.lng))continue;
        const number=byKey.get(keyOf(place))||null;
        const marker=new google.maps.Marker({
          map:googleMap,position:{lat:place.lat,lng:place.lng},
          title:number?number+'. '+place.name:place.name,
          zIndex:number?1500+number:1200,
          icon:{
            url:markerSvg(number),
            scaledSize:google.maps.Size?new google.maps.Size(48,60):{width:48,height:60},
            anchor:google.maps.Point?new google.maps.Point(23,55):{x:23,y:55}
          }
        });
        marker.addListener('click',()=>{
          if(!info)info=new google.maps.InfoWindow();
          const node=document.createElement('div');
          const title=document.createElement('strong');
          title.textContent=number?number+'. '+place.name:place.name;
          node.className='google-place-popup';
          const note=document.createElement('p');
          note.textContent='Die Google-Demo zeigt hier noch keine Sterne oder Rezensionen.';
          const actions=document.createElement('div');
          actions.className='google-place-actions';
          const details=document.createElement('a');
          details.href=placeDetailsUrl(place);
          details.target='_blank';
          details.rel='noopener noreferrer';
          details.textContent=place.category==='restaurant'
            ?'⭐ Bewertungen in Google Maps':'↗ Details in Google Maps';
          details.setAttribute('aria-label','Google Maps zu '+place.name+' öffnen');
          actions.append(details);
          const walk=document.createElement('button');
          walk.type='button';
          walk.textContent='🚶 Fußweg (OSM)';
          walk.addEventListener('click',()=>onWalk(place));
          actions.append(walk);
          const tour=document.createElement('button');
          tour.type='button';
          tour.textContent=tourSelected(place)?'✓ In Tour':'＋ In Tour';
          tour.addEventListener('click',()=>onToggleTour(place));
          actions.append(tour);
          node.append(title,note,actions);
          info.setContent(node);
          info.open({map:googleMap,anchor:marker});
        });
        markers.push(marker);
      }
      refreshRoute();
    }
    function fitGoogleGoals(){
      if(!active||!googleMap?.fitBounds||!root.google?.maps?.LatLngBounds)return false;
      const selected=goals().filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));
      if(selected.length<2)return false;
      const bounds=new google.maps.LatLngBounds();
      for(const p of selected)bounds.extend({lat:p.lat,lng:p.lng});
      const height=googleEl.clientHeight||map.getSize?.().y||650;
      const width=googleEl.clientWidth||map.getSize?.().x||380;
      // The picker covers the top of the Google canvas. Keep large map pins
      // and Street View controls out of the safe frame, with room for credits.
      const picker=document.querySelector?.('.plan-picker');
      const view=googleEl.getBoundingClientRect?.();
      const pickerRect=picker?.getBoundingClientRect?.();
      const overlayBottom=view&&pickerRect?Math.max(0,pickerRect.bottom-view.top):0;
      const padding={
        top:Math.min(Math.round(height*.46),
          Math.max(150,Math.ceil(overlayBottom)+48)),
        bottom:Math.min(95,Math.round(height*.21)),
        left:Math.min(52,Math.round(width*.16)),
        right:Math.min(110,Math.round(width*.28))
      };
      googleMap.fitBounds(bounds,padding);
      return true;
    }
    function showGoogle(){
      if(!root.google?.maps?.Map)throw new Error('Google-Kartenbibliothek ist nicht verfügbar.');
      const center=map.getCenter(),zoom=Math.max(2,Math.min(19,map.getZoom()));
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
      fitGoogleGoals();
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
    osm.addEventListener('click',()=>resetToOSM('OpenStreetMap aktiv. Google wird nicht erneut geladen.',true));
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
      refreshRoute(){if(active)refreshRoute();},
      syncFromOSM(){
        if(!active||!googleMap)return;
        const center=map.getCenter();
        googleMap.setCenter({lat:center.lat,lng:center.lng});
        googleMap.setZoom(Math.max(2,Math.min(19,map.getZoom())));
        fitGoogleGoals();
      },
      fitGoals(){return fitGoogleGoals();},
      forceOSM(){if(active)resetToOSM('Für unsere eigenen Routen verwenden wir OpenStreetMap.');},
      isGoogle(){return active;}
    };
    return instance;
  }
  const api={init,keyLooksValid,scriptUrl,markerSvg,normalizedDayRoute,placeDetailsUrl};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LivekarteGoogleDemo=api;
})(globalThis);
