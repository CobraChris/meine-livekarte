'use strict';
(() => {
  const $ = id => document.getElementById(id), C = MapCore;
  const symbols = { restaurant: '♨', sight: '◇', station: '▤', hotel: '⌂' };
  let places = [], filter = 'all', position = null, watch = null, following = false, userDot, accuracy;
  let distanceDisplays = [];
  let customPlans = [], planAssignments = Object.create(null), planJourneys = Object.create(null);
  let activePlanId = 'all';
  let ticketStatuses=Object.create(null); // local-only; nothing is stored in the public repository.
  const allPlans = () => [...C.planPresets,...customPlans];
  const currentPlan = () => allPlans().find(p=>p.id===activePlanId) || C.planPresets[0];
  const currentPlaces = () => C.placesForPlan(places,planAssignments,activePlanId);
  function assignToCurrentPlan(items) {
    if (activePlanId === 'all') return;
    items.forEach(p => {
      const key=C.placePlanKey(p);
      const list=Array.isArray(planAssignments[key]) ? planAssignments[key] : [];
      planAssignments[key]=[...new Set([...list,activePlanId])];
    });
    persistPlanState();
  }
  function persistPlanState() {
    try {
      localStorage.setItem('livekarte-custom-plans-v1',JSON.stringify(customPlans));
      localStorage.setItem('livekarte-plan-assignments-v1',JSON.stringify(planAssignments));
      localStorage.setItem('livekarte-plan-journeys-v1',JSON.stringify(planJourneys));
      localStorage.setItem('livekarte-active-plan-v1',activePlanId);
      return true;
    } catch { say('Reiseabschnitte konnten nicht dauerhaft gespeichert werden.'); return false; }
  }
  function activeJourney() {
    if (Object.prototype.hasOwnProperty.call(planJourneys,activePlanId)) return planJourneys[activePlanId];
    return activePlanId === 'ride-takayama' ? C.presetJourney('hakone-takayama-2026-10-30') : null;
  }

  let heading = null, visualHeading = null, compassGeneration = 0;
  function renderHeading() {
    const el = userDot?.getElement();
    if (!el) return;
    el.classList.toggle('has-heading', heading !== null);
    const arrow = el.querySelector('.gps-bearing');
    if (heading === null || !arrow) return;
    // Rotate via the shortest angular path to avoid a full spin at north (359° → 1°).
    if (visualHeading === null) visualHeading = heading;
    else visualHeading += ((heading - visualHeading + 540) % 360) - 180;
    arrow.style.transform = `rotate(${visualHeading}deg)`;
  }
  function onOrientation(e) {
    if (watch === null) return;
    const next = C.compassHeading(e);
    if (next === null) return; // Do not show arbitrary relative orientation.
    heading = next;
    renderHeading();
  }
  function stopCompass() {
    compassGeneration++;
    window.removeEventListener('deviceorientationabsolute', onOrientation);
    window.removeEventListener('deviceorientation', onOrientation);
    heading = null;
    visualHeading = null;
  }
  function startCompass() {
    const generation = ++compassGeneration;
    const listen = () => {
      if (watch === null || generation !== compassGeneration) return;
      window.addEventListener('deviceorientationabsolute', onOrientation);
      // Safari may provide webkitCompassHeading on the standard event.
      window.addEventListener('deviceorientation', onOrientation);
    };
    if (typeof DeviceOrientationEvent === 'undefined') return;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      // Request while the GPS button's user activation is still active.
      try {
        Promise.resolve(DeviceOrientationEvent.requestPermission(true))
          .then(result => { if (result === 'granted') listen(); })
          .catch(() => {}); // GPS remains usable if orientation permission is denied.
      } catch { /* Browser denied sensor permission. */ }
    } else listen();
  }
  let statusTimer = null;
  const say = message => {
    const status = $('status'), text = String(message || '');
    clearTimeout(statusTimer);
    // The GPS precision remains available on the GPS button without a
    // permanent full-width toast obscuring the map.
    if (/^GPS aktiv\b/.test(text)) {
      $('gps').title = text;
      $('gps').setAttribute('aria-label','GPS ausschalten · '+text);
      return;
    }
    status.textContent=text;
    status.hidden=!text;
    // Errors persist; ordinary actions fade so the map remains unobstructed.
    if(text && !/(?:nicht|ungültig|fehler|konnte|gesperrt|fehlgeschlagen|benötigt)/i.test(text))
      statusTimer=setTimeout(()=>{status.textContent='';status.hidden=true;},4500);
  };
  if (!window.L) { say('Die Kartenbibliothek konnte nicht geladen werden. Bitte Seite neu laden.'); return; }
  // No hard-coded home city. Without saved places, show a neutral world view until GPS is enabled.
  // Smooth two-finger zoom on mobile; smaller half-step zoom buttons. OSM raster tiles remain discrete.
  const map = L.map('map', { zoomControl: false, zoomSnap: 0, zoomDelta: 0.5 }).setView([25, 0], 2);
  L.control.zoom({ position:'topright' }).addTo(map);
  // Keep the required OpenStreetMap map-data credit, omit optional Leaflet prefix.
  map.attributionControl.setPrefix(false);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>' }).addTo(map);
  let tileWarning = false;
  tiles.on('tileerror', () => { if (!tileWarning) { say('Kartenkacheln nicht erreichbar. Bitte Internetverbindung prüfen.'); tileWarning = true; } });
  const pins = L.layerGroup().addTo(map);
  const walkingLayers=L.layerGroup().addTo(map);
  const tourLayers=L.layerGroup().addTo(map);
  const discoveryLayers=L.layerGroup().addTo(map);
  const mapPlacePreview=L.layerGroup().addTo(map);
  const W=window.LivekarteWalkingCore;
  const D=window.LivekarteDayPlan;
  const R=window.LivekarteRouteDiscovery;
  let discoveryController=null,discoveryGeneration=0,discoveries=[],lastDiscoveryAt=0;
  let dayPlans=Object.create(null);
  let tourDrafts=Object.create(null),tourRoute=null,tourController=null,tourRequestGeneration=0;
  let tourNavigation=null; // In-memory only; never persist GPS, current step or route.
  let mapTourPickMode=false; // UI only. Tap selected POI markers to toggle tour membership.
  let mapPlacePicking=false,mapPlacePoint=null; // UI only; never store until user confirms.

  let lastTourRequestedAt=0;
  let walkDestination=null,walkController=null,walkRequestGeneration=0;
  let lastWalkingRequestAt=0,positionUpdatedAt=0,positionAccuracy=null;
  const node = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  // The map coordinates and any GPS are not stored until "Ort dauerhaft speichern".
  const mapPlaceDialog=$('map-place-dialog');
  const mapPlaceForm=$('map-place-form');
  const mapPlaceButton=$('map-save-place');
  const mapPlaceHint=$('map-save-place-hint');
  const mapPlaceError=$('map-place-error');
  function updateMapPlaceButton(){
    mapPlaceButton.setAttribute('aria-pressed',String(mapPlacePicking));
    mapPlaceButton.textContent=mapPlacePicking?'✕ Markierung abbrechen':'📌 Ort merken';
    mapPlaceHint.hidden=!mapPlacePicking;
  }
  function setMapPlacePicking(value){
    mapPlacePicking=!!value;
    if(mapPlacePicking){
      pauseGPSFollow();
      if(mapTourPickMode)setMapTourPickMode(false);
      map.closePopup();
    }
    updateMapPlaceButton();
  }
  function showMapPlacePreview(point){
    const lat=Number(point?.lat),lng=Number(point?.lng);
    if(!Number.isFinite(lat)||Math.abs(lat)>90||
       !Number.isFinite(lng)||Math.abs(lng)>180)
      throw new Error('Ungültiger Kartenpunkt. Bitte erneut auswählen.');
    mapPlacePoint={lat,lng};
    mapPlacePreview.clearLayers();
    L.circleMarker([lat,lng],{radius:10,color:'#ffffff',weight:2,
      fillColor:'#70d3ec',fillOpacity:.85,interactive:false}).addTo(mapPlacePreview);
    $('map-place-coordinates').textContent='📍 Markierung: '+
      lat.toFixed(6)+', '+lng.toFixed(6);
  }
  function openMapPlaceDialog(point){
    if(mapPlaceDialog.open)return;
    try{showMapPlacePreview(point);}catch(e){say(e.message);return;}
    setMapPlacePicking(false);
    mapPlaceForm.reset();
    mapPlaceError.textContent='';
    $('map-place-category').value='restaurant';
    $('map-place-target').textContent='Speichern in: '+currentPlan().name;
    pauseGPSFollow();
    mapPlaceDialog.showModal();
    $('map-place-name').focus();
  }
  mapPlaceButton.onclick=()=>setMapPlacePicking(!mapPlacePicking);
  $('map-place-cancel').onclick=()=>mapPlaceDialog.close();
  mapPlaceDialog.addEventListener('close',()=>{
    mapPlacePoint=null;
    mapPlacePreview.clearLayers();
    mapPlaceError.textContent='';
    setMapPlacePicking(false);
  });
  map.on('click',event=>{
    if(!mapPlacePicking)return;
    const target=event.originalEvent?.target;
    if(target?.closest?.('.leaflet-marker-icon,.leaflet-control'))return;
    openMapPlaceDialog(event.latlng);
  });
  map.on('contextmenu',event=>{
    if(mapTourPickMode||mapPlaceDialog.open)return;
    const target=event.originalEvent?.target;
    if(target?.closest?.('.leaflet-marker-icon,.leaflet-control'))return;
    event.originalEvent?.preventDefault?.();
    openMapPlaceDialog(event.latlng);
  });
  $('map-place-use-gps').onclick=()=>{
    if(watch===null||!position||Date.now()-positionUpdatedAt>60000){
      mapPlaceError.textContent='Bitte GPS aktivieren und einen aktuellen Standort abwarten.';
      return;
    }
    if(!Number.isFinite(positionAccuracy)||positionAccuracy>60){
      mapPlaceError.textContent='GPS ist ungenau. Bitte einen Punkt auf der Karte wählen.';
      return;
    }
    showMapPlacePreview(position);
    mapPlaceError.textContent='GPS-Punkt übernommen. Prüfe die Position vor dem Speichern.';
  };
  mapPlaceForm.onsubmit=event=>{
    event.preventDefault();
    if(!mapPlacePoint)return;
    const name=$('map-place-name').value.trim();
    const category=$('map-place-category').value;
    const note=$('map-place-note').value.trim();
    if(!name){
      mapPlaceError.textContent='Bitte einen Namen eingeben.';
      return;
    }
    let bookmark;
    try{
      bookmark=C.normalize([{name,lat:mapPlacePoint.lat,lng:mapPlacePoint.lng,
        category,note,description:'Persönlich auf der Karte markiert.'}])[0];
      if(places.some(item=>item.name.toLocaleLowerCase('de-DE')===
        bookmark.name.toLocaleLowerCase('de-DE')&&C.distance(item,bookmark)<45)){
        mapPlaceError.textContent='Ein Ort mit diesem Namen ist hier bereits gespeichert.';
        return;
      }
      const nextPlaces=C.merge(places,[bookmark]);
      // Store both the place and its current-section assignment; do not
      // modify tour drafts, routes, GPS location history or day plans.
      const previousPlaces=places;
      places=nextPlaces;
      if(!persist()){
        places=previousPlaces;
        mapPlaceError.textContent='Speichern fehlgeschlagen. Bitte Speicherplatz prüfen.';
        return;
      }
      if(activePlanId!=='all')assignToCurrentPlan([bookmark]);
      filter='all';
      document.querySelectorAll('[data-filter]').forEach(button=>
        button.setAttribute('aria-pressed',String(button.dataset.filter==='all')));
      const savedPoint={...mapPlacePoint};
      mapPlaceDialog.close();
      render();
      following=false;refreshGPSFollowControl();
      map.setView([savedPoint.lat,savedPoint.lng],Math.max(map.getZoom(),16));
      say('📌 '+bookmark.name+' gespeichert · '+currentPlan().name+'.');
    }catch(e){
      mapPlaceError.textContent=e.message||'Der Ort konnte nicht gespeichert werden.';
    }
  };
  // The external Google walking link remains available as a full navigation fallback.
  function route(p) {
    const a = node('a', '↗ Google Maps', 'navigate');
    a.href = 'https://www.google.com/maps/dir/?api=1&destination='+
      p.lat+','+p.lng+'&travelmode=walking';
    a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
  }
  const walkingPanel=$('walk-route-panel');
  const walkingTitle=$('walk-route-title'), walkingStats=$('walk-route-stats');
  const walkingNote=$('walk-route-note'), walkingRetry=$('walk-route-retry');
  const walkingLink=$('walk-route-google');
  const walkingMini=$('walk-route-mini'), walkingMiniText=$('walk-route-mini-text');
  const walkingStop=$('walk-route-stop');
  const walkingNavButton=$('walk-route-nav'),walkingNavState=$('walk-route-nav-state');
  let walkRouteData=null,walkingNavigation=null;
  let offRouteReadings=0,nearGoalReadings=0;
  const walkingDistanceLabel=data=>W.distanceText(data.distance)+' · '+W.durationText(data.duration);
  function stopWalkingNavigation(){
    const wasNavigating=!!walkingNavigation;
    walkingNavigation=null;offRouteReadings=0;nearGoalReadings=0;
    walkingNavButton.textContent='▶ GPS-Navigation starten';
    walkingNavButton.setAttribute('aria-pressed','false');
    walkingNavButton.disabled=!walkRouteData;
    walkingNavState.hidden=true;
    walkingNavState.textContent='';
    walkingNavState.className='walk-route-nav-state';
    walkingMini.classList.remove('walk-off-route','walk-arrived','walk-weak-gps');
    if(walkRouteData && walkDestination){
      walkingMiniText.textContent='🚶 '+walkingDistanceLabel(walkRouteData);
      walkingStats.textContent=W.distanceText(walkRouteData.distance)+' · ca. '+
        W.durationText(walkRouteData.duration);
    }
    // Stopping navigation does not deactivate GPS or erase the route.
    if(wasNavigating){
      following=false;refreshGPSFollowControl();
    }
  }
  function updateWalkingNavigation(point,gpsAccuracy){
    if(!walkingNavigation || !walkDestination)return;
    let progress;
    try{progress=W.navigationProgress(walkingNavigation,point,gpsAccuracy);}
    catch{return;}
    if(progress.status==='near-goal')nearGoalReadings++;
    else nearGoalReadings=0;
    if(progress.status==='off-route')offRouteReadings++;
    else offRouteReadings=0;
    const reached=nearGoalReadings>=2;
    const deviated=offRouteReadings>=2;
    walkingMini.classList.toggle('walk-off-route',deviated);
    walkingMini.classList.toggle('walk-arrived',reached);
    walkingMini.classList.toggle('walk-weak-gps',progress.status==='poor-gps');
    walkingNavState.hidden=false;
    const suffix=W.distanceText(progress.remainingMeters)+' · ca. '+
      W.durationText(progress.remainingSeconds);
    if(reached){
      walkingMiniText.textContent='✓ Ziel erreicht';
      walkingStats.textContent='Du bist am Ziel.';
      walkingNavState.textContent='Ziel erreicht – GPS-Position nahe dem Zielpunkt.';
    }else if(progress.status==='poor-gps'){
      walkingMiniText.textContent='📍 GPS ungenau · Standort prüfen';
      walkingStats.textContent='GPS-Genauigkeit unzureichend';
      walkingNavState.textContent='Die aktuelle GPS-Messung ist zu ungenau. Bitte auf eine bessere Position warten.';
    }else if(deviated){
      walkingMiniText.textContent='⚠ Weg verlassen · neu berechnen';
      walkingStats.textContent='Abseits der Route · '+suffix;
      walkingNavState.textContent='Du bist vermutlich vom berechneten Weg abgewichen. Tippe „Neu berechnen“, wenn du eine andere Strecke brauchst.';
    }else{
      walkingMiniText.textContent='🚶 Noch '+W.distanceText(progress.remainingMeters)+
        ' · '+W.durationText(progress.remainingSeconds);
      walkingStats.textContent='Noch '+suffix;
      walkingNavState.textContent='GPS-Navigation aktiv · '+Math.round(progress.progressFraction*100)+
        '% des Weges zurückgelegt. Die Gehzeit ist eine Schätzung.';
    }
    walkingNavState.classList.toggle('walk-route-warning',
      deviated||progress.status==='poor-gps');
    // GPS progress is deliberately offline-only: no fetch, history or telemetry.
  }
  function startWalkingNavigation(){
    if(!walkRouteData||!walkDestination||!W){
      say('Bitte zuerst einen Fußweg berechnen.');return;
    }
    if(watch===null||!position||Date.now()-positionUpdatedAt>60000){
      say('Für die Navigation wird ein aktueller GPS-Standort benötigt.');return;
    }
    try{walkingNavigation=W.prepareNavigation(walkRouteData);}
    catch(e){say(e.message);return;}
    offRouteReadings=0;nearGoalReadings=0;
    walkingNavButton.textContent='■ GPS-Navigation stoppen';
    walkingNavButton.setAttribute('aria-pressed','true');
    walkingNavButton.disabled=false;
    following=true;refreshGPSFollowControl();
    centerOnGPS([position.lat,position.lng],Math.max(map.getZoom(),16));
    updateWalkingNavigation(position,positionAccuracy);
    hideWalkingDetails();
  }
  // Closing the large info popup only collapses it. The actual Leaflet
  // route remains visible until the user explicitly ends the route,
  // changes the travel context or turns off GPS.
  function hideWalkingDetails() {
    walkingPanel.hidden=true;
    walkingMini.hidden=!walkDestination;
  }
  function showWalkingDetails() {
    if(!walkDestination)return;
    walkingPanel.hidden=false;
    walkingMini.hidden=true;
  }
  function clearWalkingRoute() {
    walkRequestGeneration++;
    if(walkController)walkController.abort();
    stopWalkingNavigation();
    walkController=null;walkDestination=null;walkRouteData=null;
    walkingNavButton.disabled=true;
    walkingLayers.clearLayers();
    walkingPanel.hidden=true;
    walkingMini.hidden=true;
    walkingMiniText.textContent='';
  }
  $('walk-route-close').onclick=hideWalkingDetails;
  walkingMini.onclick=showWalkingDetails;
  walkingStop.onclick=clearWalkingRoute;
  walkingNavButton.onclick=()=>{
    if(walkingNavigation)stopWalkingNavigation();
    else startWalkingNavigation();
  };
  walkingRetry.onclick=()=>{
    if(walkDestination)void showWalkingRoute(walkDestination);
  };
  function walkingButton(p){
    const btn=node('button','🚶 Fußweg anzeigen','walk-start');
    btn.type='button';
    btn.title='Echten Fußweg auf der Karte berechnen (Start- und Zielkoordinaten an FOSSGIS senden)';
    btn.onclick=()=>{void showWalkingRoute(p);};
    return btn;
  }
  // User-triggered ONLY: we never post GPS coordinates on watchPosition updates,
  // while showing a place, or merely by opening the app.
  async function showWalkingRoute(place){
    if(!W) { say('Fußwegfunktion ist noch nicht geladen. Bitte App aktualisieren.');return; }
    if(watch===null||!position||!positionUpdatedAt){
      say('Bitte zuerst GPS einschalten und den Standort abwarten, um einen Fußweg anzuzeigen.');
      return;
    }
    if(Date.now()-positionUpdatedAt>60000){
      say('Der GPS-Standort ist zu alt. Bitte einen aktuellen Standort abwarten.');
      return;
    }
    let url;
    try{ url=W.requestUrl(position,place); }
    catch(e){say(e.message);return;}
    const elapsed=Date.now()-Math.max(lastWalkingRequestAt,lastTourRequestedAt);
    if(elapsed<1200){
      say('Bitte kurz warten, bevor du einen weiteren Fußweg berechnen lässt.');
      return;
    }
    lastWalkingRequestAt=Date.now(); // FOSSGIS: never more than 1 request/second.
    if(tourRoute || tourController)clearTourRoute();
    if(walkController)walkController.abort();
    const controller=new AbortController();
    walkController=controller;
    const generation=++walkRequestGeneration;
    const continueNavigation=!!walkingNavigation&&!!walkDestination&&
      walkDestination.lat===place.lat&&walkDestination.lng===place.lng;
    if(!continueNavigation)stopWalkingNavigation();
    walkRouteData=null;
    walkingNavButton.disabled=true;
    walkDestination=place;
    walkingLayers.clearLayers();
    showWalkingDetails();
    walkingMini.setAttribute('aria-label','Fußwegdetails zu '+place.name+' anzeigen');
    walkingMiniText.textContent='🚶 Route wird berechnet …';
    // A route launched from the list should become visible on the map immediately.
    if(window.matchMedia?.('(max-width:760px)').matches)
      $('map').scrollIntoView({behavior:'smooth',block:'start'});
    walkingTitle.textContent='🚶 '+place.name;
    walkingStats.textContent='Fußweg wird berechnet …';
    walkingNote.textContent='Start und Ziel werden einmalig an den FOSSGIS-Fußgänger-Routingdienst übermittelt.';
    walkingRetry.disabled=true;
    walkingLink.href=route(place).href;
    const startedAt={...position};
    const startedAccuracy=positionAccuracy;
    let timeout;
    try{
      timeout=setTimeout(()=>controller.abort(),15000);
      const response=await fetch(url,{
        method:'GET',mode:'cors',credentials:'omit',
        referrerPolicy:'origin', // identify app origin, not the full URL or query
        headers:{'Accept':'application/json'},signal:controller.signal
      });
      if(!response.ok){
        if(response.status===429)throw new Error('Routingdienst ist ausgelastet (Limit). Bitte später erneut versuchen.');
        throw new Error('Routingdienst ist nicht erreichbar (HTTP '+response.status+').');
      }
      const raw=await response.text();
      if(raw.length>2000000)throw new Error('Die Fußwegantwort war ungewöhnlich groß.');
      const result=W.parse(JSON.parse(raw),startedAt,place);
      if(generation!==walkRequestGeneration || watch===null)return;
      walkRouteData=result;
      walkingNavButton.disabled=false;
      L.polyline(result.points,{color:'#10364e',weight:11,opacity:.90,
        lineCap:'round',lineJoin:'round',interactive:false}).addTo(walkingLayers);
      L.polyline(result.points,{color:'#f5fcff',weight:6,opacity:1,
        dashArray:'2 13',lineCap:'round',lineJoin:'round',interactive:false}).addTo(walkingLayers);
      L.polyline(result.points,{color:'#4da4ff',weight:3,opacity:1,
        dashArray:'2 13',lineCap:'round',lineJoin:'round',interactive:false}).addTo(walkingLayers);
      walkingStats.textContent=W.distanceText(result.distance)+' · ca. '+
        W.durationText(result.duration);
      // Keep the collapsed summary synchronized even when the info panel
      // was closed while the route request was still running.
      walkingMiniText.textContent='🚶 '+W.distanceText(result.distance)+' · '+
        W.durationText(result.duration);
      const direct=W.metres(startedAt,place);
      const detour=result.distance>direct*2.1 && direct>80
        ? ' Hinweis: Ungewöhnlich langer Umweg. Zielpunkt und Weg in Google Maps gegenprüfen.' : '';
      const gpsWarning=startedAccuracy>80
        ? ' GPS ungenau (ca. '+Math.round(startedAccuracy)+' m); Startposition prüfen.' : '';
      walkingNote.textContent=(result.shorterAlternative
        ? 'Kürzere Fußweg-Alternative gewählt. ' : '')+
        'Fußweg entlang von Straßen und Wegen · Startposition beim Abruf.'+
        detour+gpsWarning+' Kein Live-Abbiegeassistent; bei Standortwechsel „Neu berechnen“ tippen.';
      map.closePopup();
      if(continueNavigation){
        // A deliberately requested recalculation keeps the current navigation
        // active, while replacing all progress computations with the new path.
        try{
          walkingNavigation=W.prepareNavigation(result);
          offRouteReadings=0;nearGoalReadings=0;
          updateWalkingNavigation(position,positionAccuracy);
          showWalkingDetails();
        }catch(e){stopWalkingNavigation();say(e.message);}
      }else{
        following=false;refreshGPSFollowControl();
        map.fitBounds(L.latLngBounds(result.points),{padding:[55,55],maxZoom:17});
      }
    }catch(e){
      if(generation!==walkRequestGeneration)return;
      if(controller.signal.aborted){
        walkingStats.textContent='Fußweg konnte nicht rechtzeitig berechnet werden.';
      }else{
        walkingStats.textContent=e instanceof SyntaxError
          ?'Der Routingdienst hat eine ungültige Antwort geliefert.'
          :e.message||'Fußweg nicht verfügbar.';
      }
      walkingMiniText.textContent='🚶 Fußweg nicht verfügbar';
      if(walkingNavigation)stopWalkingNavigation();
      walkingNavButton.disabled=true;
      walkingNote.textContent='Bitte später erneut versuchen oder „Google Maps“ verwenden. Es wird keine Luftlinie als echter Fußweg angezeigt.';
    }finally{
      clearTimeout(timeout);
      if(generation===walkRequestGeneration){
        walkController=null;
        walkingRetry.disabled=false;
      }
    }
  }
  // Multi-stop tours are opt-in and local: only the selected place identifiers
  // (already saved on this device) persist across reloads, never GPS or route
  // geometry. One FOSSGIS route request is made per deliberate calculation.
  const tourBuilder=$('tour-builder');
  const tourSelectedList=$('tour-stops');
  const tourBuilderStatus=$('tour-builder-status');
  const tourResult=$('tour-result');
  const tourHud=$('tour-route-hud');
  // Explore sights in a fixed buffer around an existing pedestrian route.
  // The user must explicitly request the search: no GPS-watch networking.
  const discoveryPanel=$('route-discovery');
  const discoveryStatus=$('route-discovery-status');
  const discoveryResults=$('route-discovery-results');
  const discoverySearch=$('route-discovery-search');
  const discoveryCount=$('route-discovery-count');
  const discoveryRadius=$('route-discovery-radius');
  function clearRouteDiscovery(){
    discoveryGeneration++;
    if(discoveryController)discoveryController.abort();
    discoveryController=null;
    discoveries=[];
    discoveryLayers.clearLayers();
    discoveryResults.replaceChildren();
    discoveryCount.textContent='Neue Orte finden';
    discoveryStatus.textContent='Bitte zuerst eine Fußroute berechnen oder optimieren.';
    discoverySearch.disabled=true;
    discoverySearch.textContent='◇ Sehenswürdigkeiten suchen';
  }
  function renderRouteDiscoveryUI(){
    const available=!!(tourRoute&&tourRoute.planId===activePlanId&&R);
    discoverySearch.disabled=!available||!!discoveryController;
    if(!R)discoveryStatus.textContent='Entdeckungsmodul nicht geladen. Bitte App aktualisieren.';
    else if(available&&discoveryStatus.textContent.startsWith('Bitte zuerst'))
      discoveryStatus.textContent='Rundgang bereit · starte die Suche für neue Sehenswürdigkeiten.';
    else if(!available)
      discoveryStatus.textContent='Bitte zuerst eine Fußroute berechnen oder optimieren.';
  }
  function savedDiscoveryPlace(item){
    const normalize=name=>String(name||'').trim().toLocaleLowerCase('de-DE');
    return places.find(p=>normalize(p.name)===normalize(item.name)&&C.distance(p,item)<100);
  }
  function saveDiscoveredPlace(item,addToTour=false){
    if(!tourRoute||!discoveries.some(p=>p.id===item.id))return;
    if(addToTour&&tourSelection().length>=6){
      discoveryStatus.textContent='Maximal sechs Ziele. Bitte vor dem Hinzufügen einen Stopp entfernen.';
      return;
    }
    try{
      let stored=savedDiscoveryPlace(item);
      if(!stored){
        const [incoming]=C.normalize([{
          name:item.name,lat:item.lat,lng:item.lng,category:'sight',
          description:item.type+' aus OpenStreetMap · Erreichbarkeit und Öffnungszeiten vor Ort prüfen.'
        }]);
        const merged=C.merge(places,[incoming]);
        places=merged;
        persist();
        stored=savedDiscoveryPlace(item)||incoming;
        assignToCurrentPlan([stored]);
      }else if(activePlanId!=='all'&&!currentPlaces().some(p=>
        C.placePlanKey(p)===C.placePlanKey(stored)))assignToCurrentPlan([stored]);
      if(addToTour){
        const current=tourSelection();
        if(!current.some(p=>C.placePlanKey(p)===C.placePlanKey(stored))){
          setTourSelection([...current,stored]);
          tourBuilder.open=true;
          tourBuilderStatus.textContent='Neues Ziel hinzugefügt. Bitte Route erneut optimieren oder berechnen.';
          discoveryPanel.open=true;
        }else{
          render();
          discoveryStatus.textContent='Ort ist bereits in deiner Tour enthalten.';
        }
      }else{
        render();
        renderDiscoveryResults();
        discoveryStatus.textContent='✓ '+item.name+' gespeichert. Deine Route bleibt unverändert.';
      }
    }catch(error){
      discoveryStatus.textContent='Konnte den Ort nicht übernehmen: '+(error.message||'Unbekannter Fehler.');
    }
  }
  function renderDiscoveryResults(){
    discoveryLayers.clearLayers();
    discoveryResults.replaceChildren();
    if(!tourRoute)return;
    for(const item of discoveries){
      const saved=savedDiscoveryPlace(item);
      if(!saved){
        const popup=node('div');
        popup.append(node('strong',item.name));
        popup.append(node('p',item.type+' · ca. '+item.distance+' m von der Route'));
        const marker=L.marker([item.lat,item.lng],{
          title:item.name,
          icon:L.divIcon({className:'route-discovery-marker',html:'<span>◇</span>',
            iconSize:[27,33],iconAnchor:[13,30]})
        }).bindPopup(popup,{maxWidth:260}).addTo(discoveryLayers);
        item._marker=marker;
      }
      const card=node('div',undefined,'route-discovery-card');
      card.append(node('strong',item.name));
      card.append(node('small',item.type+' · ca. '+item.distance+' m seitlich vom Fußweg'));
      const actions=node('div',undefined,'route-discovery-actions');
      const focus=node('button','Auf Karte');
      focus.type='button';
      focus.onclick=()=>{
        following=false;refreshGPSFollowControl();
        map.setView([item.lat,item.lng],17);
        item._marker?.openPopup();
        $('map').scrollIntoView({behavior:'smooth',block:'start'});
      };
      const save=node('button',saved?'✓ Gespeichert':'Speichern');
      save.type='button';
      save.disabled=!!saved;
      save.onclick=()=>saveDiscoveredPlace(item);
      const add=node('button','＋ Tour');
      add.type='button';
      const selected=tourSelection().some(p=>C.placePlanKey(p)===C.placePlanKey(saved||item));
      add.textContent=selected?'✓ In Tour':'＋ Tour';
      add.disabled=selected||tourSelection().length>=6;
      add.title='Ort hinzufügen; vorhandene Route danach neu berechnen';
      add.onclick=()=>saveDiscoveredPlace(item,true);
      const source=node('a','OSM ↗');
      source.href='https://www.openstreetmap.org/'+item.id;
      source.target='_blank';source.rel='noopener noreferrer';
      actions.append(focus,save,add,source);
      card.append(actions);
      discoveryResults.append(card);
    }
    discoveryCount.textContent=discoveries.length+' Vorschläge';
  }
  discoverySearch.onclick=async()=>{
    if(discoveryController)return;
    if(!tourRoute||tourRoute.planId!==activePlanId||!R){
      renderRouteDiscoveryUI();
      return;
    }
    const radius=Number(discoveryRadius.value);
    let query;
    try{query=R.query(tourRoute.points,radius);}
    catch(error){discoveryStatus.textContent=error.message;return;}
    if(Date.now()-lastDiscoveryAt<30000){
      discoveryStatus.textContent='Bitte frühestens nach 30 Sekunden erneut suchen – öffentliche OSM-Schnittstelle.';
      return;
    }
    const route=tourRoute,planId=activePlanId;
    const controller=new AbortController();
    discoveryController=controller;
    const generation=++discoveryGeneration;
    lastDiscoveryAt=Date.now();
    discoverySearch.disabled=true;
    discoverySearch.textContent='Suche läuft …';
    discoveryStatus.textContent='Suche Sehenswürdigkeiten in OpenStreetMap …';
    let timer;
    try{
      timer=setTimeout(()=>controller.abort(),19000);
      const response=await fetch(R.ENDPOINT,{
        method:'POST',mode:'cors',credentials:'omit',referrerPolicy:'origin',
        headers:{'Accept':'application/json'},
        body:new URLSearchParams({data:query}),signal:controller.signal
      });
      if(!response.ok){
        if([406,429,502,503,504].includes(response.status))
          throw new Error('Der öffentliche OpenStreetMap-Suchdienst lehnt die Anfrage gerade ab (HTTP '+response.status+'). Bitte später erneut versuchen. Deine Tour bleibt erhalten.');
        throw new Error('OpenStreetMap-Suche ist nicht erreichbar (HTTP '+response.status+').');
      }
      const text=await response.text();
      if(text.length>2000000)throw new Error('Zu große Antwort. Bitte eine kürzere lokale Tour verwenden.');
      const result=R.parse(JSON.parse(text),route.points,places,radius);
      if(discoveryGeneration!==generation||tourRoute!==route||activePlanId!==planId)return;
      discoveries=result;
      renderDiscoveryResults();
      discoveryStatus.textContent=result.length
        ?result.length+' neue Orte gefunden – nur Vorschau, noch nicht gespeichert.'
        :'Keine weiteren benannten Sehenswürdigkeiten nah genug an dieser Strecke gefunden.';
    }catch(error){
      if(discoveryGeneration!==generation||tourRoute!==route)return;
      discoveryStatus.textContent=controller.signal.aborted
        ?'Suche hat zu lange gedauert. Bitte später erneut versuchen.'
        :error instanceof SyntaxError?'Der Kartendienst hat eine ungültige Antwort gesendet.'
        :error.message||'Suche zurzeit nicht verfügbar.';
    }finally{
      clearTimeout(timer);
      if(discoveryGeneration===generation){
        discoveryController=null;
        discoverySearch.textContent='◇ Sehenswürdigkeiten suchen';
        renderRouteDiscoveryUI();
      }
    }
  };
  const mapTourModeButton=$('tour-map-mode');
  const mapTourCounter=$('tour-map-counter');
  const mapTourDone=$('tour-map-done');
  const planMapPickButton=$('tour-pick-on-map');
  function updateMapTourControls(){
    const number=tourSelection().length;
    mapTourModeButton.setAttribute('aria-pressed',String(mapTourPickMode));
    mapTourModeButton.textContent=mapTourPickMode?'✓ Tour auswählen':'＋ Tour auf Karte';
    mapTourModeButton.title=mapTourPickMode
      ?'Auswahlmodus beenden – markierte Kartenpins zur Tour hinzufügen oder entfernen'
      :'Markierungen direkt antippen und sofort zur Tour hinzufügen';
    mapTourCounter.hidden=!mapTourPickMode;
    mapTourDone.hidden=!mapTourPickMode;
    mapTourCounter.textContent=number+'/6 Ziele · '+
      (number===6?'Maximum erreicht':'Kartenpins antippen');
    mapTourDone.textContent='Fertig'+(number?' · '+number:'');
    planMapPickButton.textContent=mapTourPickMode?'✓ Kartenauswahl aktiv':'📍 Orte direkt auf Karte auswählen';
    planMapPickButton.setAttribute('aria-pressed',String(mapTourPickMode));
  }
  function setMapTourPickMode(enabled,focusMap=false){
    mapTourPickMode=!!enabled;
    if(mapTourPickMode&&mapPlacePicking)setMapPlacePicking(false);
    if(mapTourPickMode)pauseGPSFollow();
    if(mapTourPickMode&&filter!=='all'){
      filter='all';
      document.querySelectorAll('[data-filter]').forEach(button=>
        button.setAttribute('aria-pressed',String(button.dataset.filter==='all')));
    }
    map.closePopup();
    render(); // Marker click handlers and visible number badges follow mode.
    if(focusMap)$('map').scrollIntoView({behavior:'smooth',block:'start'});
  }
  mapTourModeButton.onclick=()=>setMapTourPickMode(!mapTourPickMode);
  planMapPickButton.onclick=()=>setMapTourPickMode(true,true);
  mapTourDone.onclick=()=>{
    setMapTourPickMode(false);
    tourBuilder.open=true;
    const number=tourSelection().length;
    tourBuilderStatus.textContent=number>=2
      ?number+' Ziele gewählt. Jetzt Route optimieren oder Rundgang berechnen.'
      :'Bitte mindestens zwei Ziele auf der Karte auswählen.';
    tourBuilder.scrollIntoView({behavior:'smooth',block:'start'});
  };
  function tourSelection(){
    const keys=Array.isArray(tourDrafts[activePlanId])?tourDrafts[activePlanId]:[];
    const byKey=new Map(currentPlaces().map(p=>[C.placePlanKey(p),p]));
    return [...new Set(keys)].map(k=>byKey.get(k)).filter(Boolean).slice(0,6);
  }
  function tourIsSelected(p){
    return tourSelection().some(item=>C.placePlanKey(item)===C.placePlanKey(p));
  }
  function persistTourDrafts(){
    try{
      localStorage.setItem('livekarte-tour-drafts-v1',JSON.stringify(tourDrafts));
    }catch{say('Rundgang-Auswahl konnte nicht gespeichert werden.');}
  }
  function clearTourRoute(){
    clearRouteDiscovery();
    stopTourNavigation();
    ++tourRequestGeneration;
    if(tourController)tourController.abort();
    tourController=null;tourRoute=null;
    tourLayers.clearLayers();
    tourHud.hidden=true;
    tourResult.hidden=true;
    renderDayPlanSummary();
    $('tour-calculate').disabled=tourSelection().length<2;
    $('tour-optimize').disabled=tourSelection().length<2;
  }
  function setTourSelection(items){
    clearTourRoute();
    tourDrafts[activePlanId]=items.map(p=>C.placePlanKey(p)).slice(0,6);
    persistTourDrafts();
    render(); // Keep per-place selected states and numbered tour list synchronized.
  }
  function toggleTourPlace(place,fromMap=false){
    const selected=tourSelection(),key=C.placePlanKey(place);
    const at=selected.findIndex(p=>C.placePlanKey(p)===key);
    if(at<0 && selected.length>=6){
      tourBuilder.open=true;
      tourBuilderStatus.textContent='Maximal sechs Orte pro Rundgang. Entferne zuerst ein Ziel.';
      return;
    }
    if(at>=0)selected.splice(at,1);
    else selected.push(place);
    setTourSelection(selected);
    tourBuilder.open=true;
    tourBuilderStatus.textContent=at>=0?'Ziel aus Rundgang entfernt.':'Ziel hinzugefügt. Reihenfolge unten anpassen.';
    if(!fromMap&&at<0&&selected.length===1)
      tourBuilder.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function renderTourBuilder(){
    const selected=tourSelection();
    $('tour-count').textContent=selected.length+'/6 Ziele';
    tourSelectedList.replaceChildren();
    if(!selected.length){
      tourSelectedList.append(node('li','Noch keine Ziele ausgewählt.','tour-empty'));
    }
    selected.forEach((place,index)=>{
      const li=node('li',undefined,'tour-stop');
      li.append(node('span',String(index+1),'tour-stop-number'));
      const name=node('span',place.name,'tour-stop-name');
      if(place.duration){
        const dur=node('small','Besuch: '+place.duration);
        name.append(dur);
      }
      li.append(name);
      const controls=node('div',undefined,'tour-stop-controls');
      for(const [label,direction] of [['↑',-1],['↓',1]]){
        const btn=node('button',label);
        btn.type='button';
        btn.setAttribute('aria-label',place.name+' '+(direction<0?'nach oben':'nach unten'));
        btn.disabled=index+direction<0||index+direction>=selected.length;
        btn.onclick=()=>{
          const reordered=selected.slice();
          const other=index+direction;
          [reordered[index],reordered[other]]=[reordered[other],reordered[index]];
          setTourSelection(reordered);
          tourBuilder.open=true;
          tourBuilderStatus.textContent='Reihenfolge angepasst. Rundgang neu berechnen.';
        };
        controls.append(btn);
      }
      const remove=node('button','×');
      remove.type='button';
      remove.setAttribute('aria-label',place.name+' aus Rundgang entfernen');
      remove.onclick=()=>toggleTourPlace(place);
      controls.append(remove);
      li.append(controls);
      tourSelectedList.append(li);
    });
    $('tour-calculate').disabled=selected.length<2||!!tourController;
    $('tour-clear').disabled=!selected.length;
    $('tour-optimize').disabled=selected.length<2||!!tourController;
    if(!selected.length && !tourRoute)
      tourBuilderStatus.textContent='Wähle zunächst zwei bis sechs Orte über „＋ Tour“.';
    renderDayPlanControls();
    updateMapTourControls();
  }
  // Day schedule reuses only the already calculated OSRM route legs.
  // Store solely explicitly chosen settings, never GPS or route geometry.
  const dayPlanState=$('day-plan-state');
  const dayPlanAlert=$('day-plan-alert');
  const dayPlanOutput=$('day-plan-output');
  const dayPlanTimeline=$('day-plan-timeline');
  const dayStopSettings=$('day-stop-settings');
  function dayPlanPrefs(){
    if(!dayPlans[activePlanId]){
      dayPlans[activePlanId]={
        start:'10:30',buffer:10,lunch:45,stops:Object.create(null)
      };
    }
    return dayPlans[activePlanId];
  }
  function persistDayPlans(){
    try{localStorage.setItem('livekarte-day-plans-v1',JSON.stringify(dayPlans));}
    catch{dayPlanAlert.textContent='Tagesplan-Einstellungen konnten nicht gespeichert werden.';}
  }
  function dayPlanStops(){
    return tourRoute?.planId===activePlanId?tourRoute.stops:tourSelection();
  }
  function dayStopPrefs(place){
    const pref=dayPlanPrefs(),key=C.placePlanKey(place);
    if(!pref.stops[key])pref.stops[key]=Object.create(null);
    return pref.stops[key];
  }
  function dayVisitMinutes(place){
    const custom=dayStopPrefs(place).minutes;
    return Number.isInteger(custom)&&custom>=5&&custom<=480
      ?custom:(D?.visitMinutes(place.duration)??45);
  }
  function renderDayPlanSummary(){
    if(!D)return;
    const pref=dayPlanPrefs();
    const matching=tourRoute?.planId===activePlanId&&tourRoute.legs?.length===tourRoute.stops.length;
    if(!matching){
      dayPlanOutput.hidden=true;
      dayPlanState.textContent='Route fehlt';
      dayPlanAlert.textContent='Bitte zuerst den Rundgang berechnen oder optimieren. Ohne echte Gehzeiten ist kein belastbarer Tagesplan möglich.';
      return;
    }
    const stops=tourRoute.stops;
    try{
      const schedule=D.build({
        start:pref.start,stops,legs:tourRoute.legs,
        visits:stops.map(p=>dayVisitMinutes(p)),
        windows:stops.map(p=>{
          const opts=dayStopPrefs(p);
          return {open:opts.open||'',close:opts.close||''};
        }),
        buffer:pref.buffer,lunch:pref.lunch
      });
      dayPlanOutput.hidden=false;
      const end=D.clockText(schedule.end);
      dayPlanState.textContent=D.clockText(schedule.start)+'–'+end;
      $('day-plan-summary').textContent='🗓 '+D.clockText(schedule.start)+' bis '+end+
        ' · '+schedule.walkingMinutes+' Min. Gehzeit · '+
        schedule.visitingMinutes+' Min. Besichtigung';
      dayPlanTimeline.replaceChildren();
      schedule.items.forEach(item=>{
        const li=node('li',undefined,'day-timeline-item');
        const heading=node('strong','Stopp '+item.index+' · '+item.name);
        const walking=node('p',D.clockText(item.depart)+'–'+D.clockText(item.arrival)+
          ' 🚶 Fußweg '+W.distanceText(item.legMeters)+' · '+item.legMinutes+' Min.');
        const visit=node('p',D.clockText(item.visitStart)+'–'+D.clockText(item.visitEnd)+
          ' 🏛 Besichtigung '+item.visitMinutes+' Min.');
        li.append(heading,walking);
        if(item.wait)li.append(node('p','⏳ '+item.wait+' Min. bis zur eingetragenen Öffnungszeit warten','day-wait'));
        li.append(visit);
        if(item.hoursKnown){
          li.append(node('small','Öffnungsfenster (deine Eingabe): '+
            D.clockText(item.opening)+'–'+D.clockText(item.closing)));
        }else li.append(node('small','Öffnungszeiten nicht hinterlegt – vor Ort prüfen.'));
        if(item.windowWarning)li.append(node('p','⚠ '+item.windowWarning,'day-warning'));
        if(item.schedule)li.append(node('small','🗓 Hinweis: '+item.schedule));
        if(item.note)li.append(node('small','💡 '+item.note));
        if(item.lunchAfter)li.append(node('p','🍽 '+item.lunchAfter+' Min. Mittagspause nach diesem Stopp'));
        if(item.bufferAfter)li.append(node('p','＋ '+item.bufferAfter+' Min. Zeitpuffer nach diesem Stopp'));
        dayPlanTimeline.append(li);
      });
      const warnings=$('day-plan-warnings');
      warnings.replaceChildren();
      if(schedule.unknownHours){
        warnings.append(node('p','⚠ Für '+schedule.unknownHours+
          ' von '+stops.length+' Zielen sind keine Öffnungszeiten eingetragen.','day-warning'));
      }
      if(pref.lunch>0&&!schedule.lunchScheduled){
        warnings.append(node('p','Hinweis: Die Mittagspause passt nicht nach einem Stopp ins Zeitfenster 11:30–14:30.','day-warning'));
      }
      for(const message of schedule.warnings)warnings.append(node('p','⚠ '+message,'day-warning'));
      dayPlanAlert.textContent='Zeitplan mit echten Fußwegetappen erstellt · alle Zeiten sind Schätzwerte.';
    }catch(e){
      dayPlanOutput.hidden=true;
      dayPlanState.textContent='Angaben prüfen';
      dayPlanAlert.textContent=e.message||'Tagesplan konnte nicht berechnet werden.';
    }
  }
  function renderDayPlanControls(){
    if(!D)return;
    const pref=dayPlanPrefs();
    $('day-start').value=pref.start;
    $('day-buffer').value=String(pref.buffer);
    $('day-lunch').value=String(pref.lunch);
    dayStopSettings.replaceChildren();
    const stops=dayPlanStops();
    stops.forEach((place,i)=>{
      const settings=dayStopPrefs(place);
      const row=node('div',undefined,'day-stop-row');
      const title=node('strong',(i+1)+'. '+place.name);
      const fields=node('div',undefined,'day-stop-fields');
      const createField=(caption,type,value,onchange)=>{
        const label=node('label',caption);
        const input=node('input');
        input.type=type;
        input.value=value;
        if(type==='number'){
          input.min='5';input.max='480';input.step='5';
          input.inputMode='numeric';
        }
        input.onchange=()=>onchange(input);
        label.append(input);
        fields.append(label);
      };
      const known=D.visitMinutes(place.duration);
      createField('Besuch (Min.)','number',String(dayVisitMinutes(place)),input=>{
        const value=Number(input.value);
        if(!Number.isInteger(value)||value<5||value>480){
          dayPlanAlert.textContent='Besuchsdauer bitte zwischen 5 und 480 Minuten eingeben.';
          return;
        }
        settings.minutes=value;
        persistDayPlans();
        renderDayPlanSummary();
      });
      createField('Öffnet','time',settings.open||'',input=>{
        settings.open=input.value;
        persistDayPlans();
        renderDayPlanSummary();
      });
      createField('Schließt','time',settings.close||'',input=>{
        settings.close=input.value;
        persistDayPlans();
        renderDayPlanSummary();
      });
      row.append(title);
      row.append(node('small',known===null
        ?'45 Min. als Schätzung vorbelegt – bitte anpassen.'
        :'Übernommen aus Besuchsdauer: '+place.duration+'. Mittelwert bei Zeitspanne.'));
      row.append(fields);
      dayStopSettings.append(row);
    });
    renderDayPlanSummary();
  }
  $('day-start').onchange=()=>{
    const time=$('day-start').value;
    try{D.minuteOf(time);}catch(e){dayPlanAlert.textContent=e.message;return;}
    dayPlanPrefs().start=time;
    persistDayPlans();
    renderDayPlanSummary();
  };
  $('day-buffer').onchange=()=>{
    dayPlanPrefs().buffer=Number($('day-buffer').value);
    persistDayPlans();renderDayPlanSummary();
  };
  $('day-lunch').onchange=()=>{
    dayPlanPrefs().lunch=Number($('day-lunch').value);
    persistDayPlans();renderDayPlanSummary();
  };
  $('day-plan-refresh').onclick=()=>renderDayPlanSummary();
  $('tour-clear').onclick=()=>{
    setTourSelection([]);
    tourBuilderStatus.textContent='Auswahl geleert. Deine gespeicherten Orte bleiben erhalten.';
  };
  $('tour-optimize').onclick=()=>{void calculateTour(true);};
  // Live tour uses only the existing full-route geometry and individual leg
  // metrics; live GPS updates NEVER contact a routing server or store a track.
  const tourLiveState=$('tour-live-state');
  const tourLiveStep=$('tour-live-step');
  const tourLiveProgress=$('tour-live-progress');
  const tourLiveMessage=$('tour-live-message');
  const tourLiveToggle=$('tour-live-toggle');
  const tourLiveNext=$('tour-live-next');
  const tourLiveRetry=$('tour-live-retry');
  function stopTourNavigation(){
    const wasFollowing=!!tourNavigation&&!tourNavigation.paused;
    tourNavigation=null;
    tourLiveState.hidden=true;
    tourLiveStep.textContent='';
    tourLiveProgress.textContent='';
    tourLiveMessage.textContent='';
    tourLiveToggle.textContent='▶ Tour starten';
    tourLiveToggle.setAttribute('aria-pressed','false');
    tourLiveNext.hidden=true;
    tourLiveRetry.hidden=true;
    if(wasFollowing){following=false;refreshGPSFollowControl();}
  }
  function updateTourNavigation(point,gpsAccuracy){
    if(!tourNavigation||tourNavigation.paused||!tourRoute)return;
    const state=tourNavigation;
    const place=tourRoute.stops[state.stage];
    if(!place)return;
    let progress;
    try{progress=W.tourLegProgress(state.nav,tourRoute.legs,
      state.stage,place,point,gpsAccuracy);}
    catch{tourLiveMessage.textContent='GPS-Fortschritt derzeit nicht verfügbar.';return;}
    state.nearReadings=progress.status==='near-goal'?state.nearReadings+1:0;
    state.offReadings=progress.status==='off-route'?state.offReadings+1:0;
    if(state.nearReadings>=2)state.arrived=true;
    const offRoute=state.offReadings>=2;
    tourLiveStep.textContent='Stopp '+(state.stage+1)+' von '+tourRoute.stops.length+
      ' · '+place.name;
    tourLiveProgress.textContent=state.arrived?'✓ Ziel erreicht':
      progress.status==='poor-gps'?'📍 GPS ungenau':
      'Noch '+W.distanceText(progress.remainingMeters)+' · '+
      W.durationText(progress.remainingSeconds);
    tourLiveMessage.textContent=state.arrived
      ?'Nach deinem Besuch auf „Nächster Stopp“ tippen.':
      progress.status==='poor-gps'
        ?'Auf eine genauere GPS-Messung warten. Manuelles Weitergehen ist möglich.'
      :offRoute
        ?'⚠ Vermutlich vom Fußweg abgewichen. Restweg bei Bedarf neu berechnen.'
      :'GPS-Führung aktiv · keine automatische Neuberechnung.';
    tourLiveRetry.hidden=!offRoute;
    tourLiveNext.textContent=state.stage===tourRoute.stops.length-1
      ?'✓ Tour abschließen':'Nächster Stopp →';
  }
  function startTourNavigation(){
    if(!tourRoute||!W){say('Bitte zuerst einen Rundgang berechnen.');return;}
    if(watch===null||!position||Date.now()-positionUpdatedAt>60000){
      tourLiveMessage.textContent='Bitte GPS einschalten und einen aktuellen Standort abwarten.';
      tourLiveState.hidden=false;return;
    }
    try{
      const nav=W.prepareNavigation(tourRoute);
      tourNavigation={nav,stage:0,nearReadings:0,offReadings:0,arrived:false,paused:false};
    }catch(e){say('GPS-Rundgang nicht verfügbar: '+e.message);return;}
    tourLiveState.hidden=false;
    tourLiveNext.hidden=false;
    tourLiveRetry.hidden=true;
    tourLiveToggle.textContent='Ⅱ Tour pausieren';
    tourLiveToggle.setAttribute('aria-pressed','true');
    following=true;refreshGPSFollowControl();
    centerOnGPS([position.lat,position.lng],Math.max(16,map.getZoom()));
    updateTourNavigation(position,positionAccuracy);
  }
  tourLiveToggle.onclick=()=>{
    if(!tourNavigation){startTourNavigation();return;}
    if(tourNavigation.paused){
      if(watch===null||!position||Date.now()-positionUpdatedAt>60000){
        tourLiveMessage.textContent='Zum Fortsetzen wird ein aktueller GPS-Standort benötigt.';
        return;
      }
      tourNavigation.paused=false;
      tourNavigation.nearReadings=0;tourNavigation.offReadings=0;
      tourLiveToggle.textContent='Ⅱ Tour pausieren';
      tourLiveToggle.setAttribute('aria-pressed','true');
      following=true;refreshGPSFollowControl();
      centerOnGPS([position.lat,position.lng],Math.max(16,map.getZoom()));
      updateTourNavigation(position,positionAccuracy);
    }else{
      tourNavigation.paused=true;
      tourLiveToggle.textContent='▶ Tour fortsetzen';
      tourLiveToggle.setAttribute('aria-pressed','false');
      tourLiveMessage.textContent='Pausiert · die Route bleibt sichtbar.';
      tourLiveRetry.hidden=true;
      following=false;refreshGPSFollowControl();
    }
  };
  tourLiveNext.onclick=()=>{
    if(!tourNavigation||!tourRoute)return;
    if(tourNavigation.stage>=tourRoute.stops.length-1){
      stopTourNavigation();
      tourLiveState.hidden=false;
      tourLiveStep.textContent='✓ Rundgang abgeschlossen';
      tourLiveProgress.textContent='Alle Ziele erledigt.';
      tourLiveMessage.textContent='Die Route bleibt auf der Karte. Du kannst sie erneut starten.';
      tourLiveToggle.textContent='↺ Tour erneut starten';
      return;
    }
    tourNavigation.stage++;
    tourNavigation.nearReadings=0;
    tourNavigation.offReadings=0;
    tourNavigation.arrived=false;
    tourNavigation.paused=false;
    tourLiveToggle.textContent='Ⅱ Tour pausieren';
    tourLiveToggle.setAttribute('aria-pressed','true');
    if(position&&Date.now()-positionUpdatedAt<60000)
      updateTourNavigation(position,positionAccuracy);
    else{
      tourLiveStep.textContent='Stopp '+(tourNavigation.stage+1)+' von '+tourRoute.stops.length;
      tourLiveProgress.textContent='Standort wird ermittelt …';
    }
    tourLiveRetry.hidden=true;
  };
  tourLiveRetry.onclick=()=>{void calculateTour(false,true);};
  $('tour-route-close').onclick=()=>{
    clearTourRoute();
    tourBuilderStatus.textContent='Rundgang von der Karte entfernt. Deine Zielauswahl bleibt erhalten.';
  };
  $('tour-calculate').onclick=()=>{void calculateTour();};
  async function calculateTour(optimized=false,remaining=false){
    if(tourController)return;
    const selected=remaining&&tourNavigation&&tourRoute
      ?tourRoute.stops.slice(tourNavigation.stage):tourSelection();
    if(selected.length<(remaining?1:2)){
      tourBuilderStatus.textContent='Bitte mindestens zwei Orte auswählen.';return;
    }
    if(!W){tourBuilderStatus.textContent='Rundgang-Modul nicht geladen. Bitte App aktualisieren.';return;}
    if(watch===null||!position||Date.now()-positionUpdatedAt>60000){
      tourBuilderStatus.textContent='Bitte GPS aktivieren und auf eine aktuelle Positionsmessung warten.';
      return;
    }
    const from={...position},startPlanId=activePlanId;
    let request;
    try{request=selected.length===1?W.requestUrl(from,selected[0]):
      optimized?W.optimizedTourRequestUrl(from,selected):W.tourRequestUrl(from,selected);}
    catch(error){tourBuilderStatus.textContent=error.message;return;}
    // Public FOSSGIS fair use: at most one deliberate request per 1.2 seconds
    // across both single-destination navigation and multi-stop tours.
    if(Date.now()-Math.max(lastTourRequestedAt,lastWalkingRequestAt)<1200){
      tourBuilderStatus.textContent='Bitte kurz warten und den Rundgang danach erneut berechnen.';
      return;
    }
    lastTourRequestedAt=Date.now();
    clearWalkingRoute();
    clearTourRoute();
    const controller=new AbortController();
    tourController=controller;
    const generation=++tourRequestGeneration;
    $('tour-calculate').disabled=true;
    $('tour-optimize').disabled=true;
    tourBuilderStatus.textContent=optimized
      ?'Fußwege und günstigste Stoppreihenfolge werden ermittelt …'
      :'Rundgang wird entlang der Fußwege berechnet …';
    tourBuilder.open=true;
    let timeout;
    try{
      timeout=setTimeout(()=>controller.abort(),18000);
      const response=await fetch(request,{
        method:'GET',mode:'cors',credentials:'omit',referrerPolicy:'origin',
        headers:{Accept:'application/json'},signal:controller.signal
      });
      if(!response.ok){
        if(response.status===429)throw new Error('Routingdienst ausgelastet. Bitte später erneut versuchen.');
        throw new Error('Routingdienst nicht erreichbar (HTTP '+response.status+').');
      }
      const raw=await response.text();
      if(raw.length>2500000)throw new Error('Rundgangantwort ungewöhnlich groß.');
      const data=JSON.parse(raw);
      const result=selected.length===1
        ?(()=>{const single=W.parse(data,from,selected[0]);
          return {...single,legs:[{distance:single.distance,duration:single.duration}]};})()
        :optimized?W.parseOptimizedTour(data,from,selected):W.parseTour(data,from,selected);
      if(generation!==tourRequestGeneration||activePlanId!==startPlanId)return;
      const ordered=optimized?result.orderedStops:selected;
      if(optimized){
        // Persist only selected place IDs, never the GPS origin or geometry.
        tourDrafts[activePlanId]=ordered.map(p=>C.placePlanKey(p));
        persistTourDrafts();
        render();
      }
      tourRoute={...result,stops:ordered.map(p=>({...p})),start:from,planId:activePlanId};
      renderRouteDiscoveryUI();
      L.polyline(result.points,{color:'#12313b',opacity:.9,weight:10,
        lineCap:'round',lineJoin:'round',interactive:false}).addTo(tourLayers);
      L.polyline(result.points,{color:'#ffdb74',opacity:1,weight:5,
        dashArray:'4 12',lineCap:'round',lineJoin:'round',interactive:false}).addTo(tourLayers);
      ordered.forEach((place,i)=>{
        const marker=L.marker([place.lat,place.lng],{
          title:'Stopp '+(i+1)+': '+place.name,
          icon:L.divIcon({className:'tour-stop-marker',
            html:'<span>'+(i+1)+'</span>',iconSize:[30,38],iconAnchor:[15,34]})
        });
        marker.bindPopup(node('strong','Stopp '+(i+1)+': '+place.name));
        marker.addTo(tourLayers);
      });
      const walkSummary=W.distanceText(result.distance)+' · ca. '+
        W.durationText(result.duration)+' zu Fuß';
      $('tour-route-title').textContent='🚶 Rundgang · '+ordered.length+' Ziele';
      $('tour-route-metrics').textContent=walkSummary;
      $('tour-route-note').textContent='Start am GPS-Punkt bei Berechnung · keine automatische Aktualisierung';
      tourHud.hidden=false;
      $('tour-result-summary').textContent=walkSummary;
      const legs=$('tour-result-legs');
      legs.replaceChildren();
      result.legs.forEach((leg,i)=>{
        const label=(i?'Stopp '+i:'Standort')+' → '+ordered[i].name+
          ': '+W.distanceText(leg.distance)+' · '+W.durationText(leg.duration);
        legs.append(node('li',label));
      });
      tourResult.hidden=false;
      renderDayPlanControls();
      tourBuilderStatus.textContent=remaining
        ?'Restweg ab deiner aktuellen Position berechnet. GPS-Führung bei Bedarf erneut starten.'
        :optimized
        ?'Reihenfolge anhand echter Fußwege optimiert und gespeichert. Gelbe Ziffern zeigen die neuen Stopps.'
        :'Rundgang auf der Karte eingezeichnet. Gelbe Ziffern zeigen die Stopps.';
      following=false;refreshGPSFollowControl();
      map.closePopup();
      map.fitBounds(L.latLngBounds(result.points),{padding:[52,52],maxZoom:16});
      $('map').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){
      if(generation!==tourRequestGeneration)return;
      tourBuilderStatus.textContent=controller.signal.aborted
        ?'Der Routingdienst hat zu lange gebraucht. Bitte erneut versuchen.'
        :error instanceof SyntaxError?'Ungültige Routenantwort. Bitte später erneut versuchen.'
        :error.message||'Rundgang derzeit nicht verfügbar.';
    }finally{
      clearTimeout(timeout);
      if(generation===tourRequestGeneration){
        tourController=null;
        $('tour-calculate').disabled=tourSelection().length<2;
        $('tour-optimize').disabled=tourSelection().length<2;
      }
    }
  }
  function placeMeta(p) {
    const parts = [];
    if (p.priority) parts.push('Schulnote ' + p.priority);
    if (p.duration) parts.push('Dauer ' + p.duration);
    return parts.join(' · ');
  }
  function appendPlaceTiming(target,p) {
    if (p.schedule) target.append(node('p','🗓 '+p.schedule,'place-schedule'));
    if (p.note) target.append(node('p','💡 '+p.note,'place-note'));
  }
  function metric(p) {
    if (!position) return '';
    const d = C.distance(position, p);
    return d < 1000 ? `${Math.round(d)} m Luftlinie` : `${(d/1000).toLocaleString('de-DE',{maximumFractionDigits:1})} km Luftlinie`;
  }
  function refreshDistances() {
    // GPS updates must not rebuild markers: that would close an open place popup.
    distanceDisplays.forEach(({ place, inPopup, inList }) => {
      const value = metric(place);
      inPopup.textContent = value;
      inList.textContent = value;
    });
  }
  function fit(items = currentPlaces()) {
    const visible = items.filter(p => filter === 'all' || p.category === filter);
    if (visible.length) map.fitBounds(visible.map(p => [p.lat,p.lng]), { padding:[45,45], maxZoom:16 });
  }
  function render() {
    pins.clearLayers(); $('places').replaceChildren(); distanceDisplays = [];
    const planPlaces=currentPlaces();
    $('count').textContent = planPlaces.length;
    $('empty').hidden = planPlaces.length > 0;
    $('demo').hidden = activePlanId !== 'all';
    $('empty').querySelector('h3').textContent = activePlanId === 'all'
      ? 'Hier beginnt dein nächster Ausflug' : 'Für diesen Abschnitt sind noch keine Orte gespeichert';
    $('empty').querySelector('p').textContent = activePlanId === 'all'
      ? 'Füge deine Empfehlungen hinzu oder erkunde eine kleine Beispielroute durch Berlin.'
      : 'Importiere Ziele, während dieser Abschnitt ausgewählt ist. Deine anderen Ziele bleiben erhalten.';
    $('share').disabled = !planPlaces.length; $('clear').disabled = !places.length;
    let shown = 0;
    planPlaces.forEach(p => {
      if (filter !== 'all' && p.category !== filter) return;
      shown++;
      const inPopup = node('p',metric(p));
      const popup = node('div');
      popup.append(node('strong',p.name));
      const quickActions=node('div',undefined,'popup-quick-actions');
      const popupTourButton=node('button',tourIsSelected(p)?'✓ In Tour':'＋ Tour','tour-pick');
      popupTourButton.type='button';
      popupTourButton.title='Ort direkt zum Rundgang hinzufügen oder entfernen';
      popupTourButton.setAttribute('aria-pressed',String(tourIsSelected(p)));
      popupTourButton.onclick=()=>toggleTourPlace(p,true);
      quickActions.append(popupTourButton,walkingButton(p),route(p));
      popup.append(quickActions);
      const metaText = placeMeta(p);
      if (metaText) popup.append(node('p',metaText,'place-meta'));
      appendPlaceTiming(popup,p);
      popup.append(node('p',p.description),inPopup);
      const chosenIndex=tourSelection().findIndex(item=>
        C.placePlanKey(item)===C.placePlanKey(p));
      const badge=chosenIndex<0?'':'<b class="pin-tour-index" aria-hidden="true">'+
        (chosenIndex+1)+'</b>';
      const marker = L.marker([p.lat,p.lng], {
        title:p.name+(mapTourPickMode
          ?(chosenIndex<0?' zur Tour hinzufügen':' aus Tour entfernen'):''),
        icon:L.divIcon({
          className:'pin'+(chosenIndex>=0?' pin-tour-selected':'')+
            (mapTourPickMode?' pin-tour-picking':''),
          html:`<div class="pin-inner pin-${p.category}"><span>${symbols[p.category]}</span></div>`+badge,
          iconSize:[36,36],iconAnchor:[18,36]
        })
      }).addTo(pins);
      if(mapTourPickMode){
        // While picking, one marker tap selects immediately instead of opening a popup.
        marker.on('click',()=>{pauseGPSFollow();toggleTourPlace(p,true);});
      }else{
        marker.bindPopup(popup,{maxWidth:320,maxHeight:250,autoPan:true});
        marker.on('popupopen', () => { following = false; });
      }
      const card = node('article',undefined,'place'), top = node('div',undefined,'place-top'), title = node('div');
      title.append(node('div',C.categories[p.category], 'category'),node('h3',p.name)); top.append(node('span',symbols[p.category],'place-icon'), title);
      const actions = node('div',undefined,'place-actions'), show = node('button','Auf Karte');
      show.onclick = () => { following = false; map.setView([p.lat,p.lng],16); marker.openPopup(); $('map').scrollIntoView({behavior:'smooth',block:'center'}); };
      const distance = node('span',metric(p),'distance');
      const tourButton=node('button',tourIsSelected(p)?'✓ Tour':'＋ Tour','tour-pick');
      tourButton.type='button';
      tourButton.setAttribute('aria-pressed',String(tourIsSelected(p)));
      tourButton.title='Ort zu einem Rundgang hinzufügen oder entfernen';
      tourButton.onclick=()=>toggleTourPlace(p);
      actions.append(show,walkingButton(p),tourButton,route(p),distance);
      const assignRow=node('div',undefined,'plan-assign-row');
      const assignSelect=node('select',undefined,'place-plan-select');
      assignSelect.setAttribute('aria-label','Ort '+p.name+' einem Reiseabschnitt zuordnen');
      const tags=planAssignments[C.placePlanKey(p)] || [];
      const options=[{id:'',name:'Keinem Abschnitt zugeordnet'},...allPlans().filter(section=>section.id!=='all')];
      options.forEach(section=>{
        const opt=node('option',section.name);
        opt.value=section.id;
        if (section.id=== (tags[0]||'')) opt.selected=true;
        assignSelect.append(opt);
      });
      assignSelect.onchange=()=>{
        const key=C.placePlanKey(p);
        if(assignSelect.value) planAssignments[key]=[assignSelect.value];
        else delete planAssignments[key];
        persistPlanState(); render();
        say('Zuordnung gespeichert. Alle Orte bleiben erhalten.');
      };
      assignRow.append(assignSelect);
      if (metaText) card.append(node('p',metaText,'place-meta'));
      appendPlaceTiming(card,p);
      card.append(node('p',p.description),actions,assignRow); $('places').append(card);
      distanceDisplays.push({ place:p, inPopup, inList:distance });
    });
    if (places.length && !shown) $('places').append(node('p','Keine Orte in dieser Kategorie.'));
    renderTourBuilder();
  }
  function persist() {
    try {
      localStorage.setItem('livekarte-places-v1', JSON.stringify(places));
      // Once a shared link has been saved, remove its fragment. A later "Leeren"
      // must not import those same places again after a reload.
      if (location.hash.startsWith('#places=')) history.replaceState(null, '', location.pathname + location.search);
      return true;
    } catch {
      say('Browserspeicher nicht verfügbar. Sichere deine Orte mit einem Kartenlink.');
      return false;
    }
  }
  function readLink() {
    try {
      const shared = C.decode(location.hash);
      if (shared === null) return false;
      const before = places.length;
      const combined = C.merge(places, shared);
      places = combined;
      filter = 'all';
      document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === 'all')));
      const saved = persist();
      assignToCurrentPlan(shared);
      render();
      following = false;
      if (shared.length) fit(shared); // Focus on the newly received recommendations, even if older places are far away.
      else fit();
      const added = places.length - before;
      say(saved ? (added ? `${added} neue Orte gespeichert · ${places.length} insgesamt.` : 'Alle Orte aus dem Link sind bereits gespeichert.')
                : 'Orte übernommen, aber nicht dauerhaft gespeichert. Bitte den Kartenlink sichern.');
      return true;
    } catch (e) {
      say('Kartenlink konnte nicht geladen werden: ' + e.message);
      return false;
    }
  }
  // A journey is an optional separate overlay; saved recommendations remain untouched.
  const journeyLayer = L.layerGroup().addTo(map);
  let journey = null;
  const transferCard = $('station-transfer');
  let transferDismissed = false;
  const hakoneYumoto = L.latLng(35.23365, 139.10398);
  const platformOverlayLayer = L.layerGroup().addTo(map);
  let platformOverlay = null;
  function buildPlatformOverlay() {
    // This is a schematic diagram tied to the station, not invented
    // georeferenced platform positions or a pedestrian routing claim.
    const root = node('div',undefined,'rail-station-map');
    root.setAttribute('role','group');
    root.setAttribute('aria-label','Schematische Umstiegshilfe Hakone-Yumoto. Ankunft 09:16 aus Gōra: Ankunftsgleis vor Ort prüfen. Gleis 2: Abfahrt 09:24 nach Odawara. Gleis 2 und 3 liegen an einem durchgehenden Bahnsteigbereich; Weg ebenerdig. Umsteigezeit 8 Minuten.');
    root.append(node('div','UMSTEIGEN · DEUTSCH','rail-map-heading'));
    const track3 = node('div',undefined,'rail-track-label rail-track-label-gora');
    track3.append(node('strong','Gleis 3'),node('span','Richtung Gōra'));
    const track2 = node('div',undefined,'rail-track-label rail-track-label-odawara');
    track2.append(node('strong','Gleis 2'),node('span','09:24 → Odawara'));
    const arrival = node('div',undefined,'rail-arrival-note');
    arrival.append(node('span','09:16 Ankunft aus Gōra'),node('strong','Gleis vor Ort prüfen'));
    const crossing = node('div',undefined,'rail-crossing');
    crossing.append(node('span','Gleis 2 suchen','rail-crossing-main'),node('span','→ ebenerdig','rail-crossing-sub'));
    const disclosure = node('div',undefined,'rail-map-disclosure');
    disclosure.append(node('span','Gleis 2/3: gleicher Bahnsteigbereich · 8 Min. Zeit'));
    const info = node('a','Plan auf Englisch ↗','rail-map-official');
    info.href = 'https://www.hakonenavi.jp/international/en/station/yumoto';
    info.target = '_blank';
    info.rel = 'noopener noreferrer';
    info.addEventListener('click', e => e.stopPropagation());
    disclosure.append(info);
    root.append(track3,arrival,crossing,track2,disclosure);
    // Keep the leaflet station pin below the labels. Taps on the external
    // official-plan link remain possible; other gestures pan/zoom the map.
    return root;
  }
  function updateStationTransfer() {
    const routeIncludesStation = !!journey?.stops.some(stop => stop.name.trim().toLowerCase() === 'hakone-yumoto');
    const visible = routeIncludesStation && map.getZoom() >= 17 &&
      map.getBounds().contains(hakoneYumoto);
    const showMapLabels = visible && map.getZoom() >= 18;
    document.querySelector('.workspace').classList.toggle('show-station-detail', showMapLabels);
    if (showMapLabels && !platformOverlay) {
      platformOverlay = L.marker(hakoneYumoto,{
        interactive:true,keyboard:false,zIndexOffset:750,
        icon:L.divIcon({className:'platform-map-icon',html:buildPlatformOverlay(),
          iconSize:[320,210],iconAnchor:[160,170]})
      }).addTo(platformOverlayLayer);
    } else if (!showMapLabels && platformOverlay) {
      platformOverlayLayer.removeLayer(platformOverlay);
      platformOverlay = null;
    }
    if (!visible) transferDismissed = false;
    // At close zoom, prefer the smaller labels directly on the map over the large card.
    transferCard.hidden = !visible || transferDismissed || showMapLabels;
  }
  $('station-transfer-close').onclick = () => {
    transferDismissed = true;
    transferCard.hidden = true;
  };
  map.on('zoomend moveend', updateStationTransfer);
  // Nagoya station pilot: a manually stepped, source-grounded guide, not indoor GPS.
  const nagoya = L.latLng(35.17073,136.88184);
  const ng = C.stationGuides.nagoya;
  const ngDialog = $('nagoya-dialog'), ngTrigger=$('nagoya-guide-trigger');
  let ngStep=0;
  try {ngStep=Math.max(0,Math.min(ng.steps.length-1,Number(localStorage.getItem('livekarte-nagoya-step-v1'))||0));}catch{}
  function updateNagoyaTrigger() {
    const hasNagoya = !!journey?.stops.some(s=>s.name.toLowerCase()==='nagoya');
    ngTrigger.hidden = !hasNagoya || map.getZoom()<15 || !map.getBounds().contains(nagoya);
  }
  function renderNagoyaStep() {
    const step=ng.steps[ngStep];
    $('nagoya-progress').textContent='Schritt '+(ngStep+1)+' von '+ng.steps.length;
    $('nagoya-floor').textContent=step.level;
    $('nagoya-step-title').textContent=step.title;
    $('nagoya-step-action').textContent=step.action;
    $('nagoya-sign').textContent=step.sign;
    $('nagoya-step-caution').textContent=step.caution;
    $('nagoya-prev').disabled=ngStep===0;
    $('nagoya-next').textContent=ngStep===ng.steps.length-1?'Fertig':'Nächster Schritt';
  }
  function openNagoyaGuide() {
    // Never claim the user has moved indoors when only map/GPS data changed.
    pauseGPSFollow();
    if(map.getZoom()<16 || !map.getBounds().contains(nagoya))
      map.setView(nagoya,16.75,{animate:false});
    renderNagoyaStep();
    if(!ngDialog.open) ngDialog.showModal();
  }
  function setNagoyaStep(n) {
    ngStep=Math.max(0,Math.min(ng.steps.length-1,n));
    try{localStorage.setItem('livekarte-nagoya-step-v1',String(ngStep));}catch{}
    renderNagoyaStep();
  }
  ngTrigger.onclick=openNagoyaGuide;
  $('nagoya-close').onclick=()=>ngDialog.close();
  $('nagoya-prev').onclick=()=>setNagoyaStep(ngStep-1);
  $('nagoya-next').onclick=()=>ngStep===ng.steps.length-1?ngDialog.close():setNagoyaStep(ngStep+1);
  $('nagoya-arrival-track').onchange=()=>{
    try{localStorage.setItem('livekarte-nagoya-arrival-v1',$('nagoya-arrival-track').value);}catch{}
  };
  try {
    const saved=localStorage.getItem('livekarte-nagoya-arrival-v1')||'';
    if([...$('nagoya-arrival-track').options].some(o=>o.value===saved))$('nagoya-arrival-track').value=saved;
  }catch{}
  map.on('moveend zoomend',updateNagoyaTrigger);
  function fitJourney() {
    if (!journey) return;
    const coords = journey.stops.flatMap(stop => [[stop.lat,stop.lng], ...stop.via]);
    following = false;
    if (coords.length) map.fitBounds(coords, {padding:[38,38],maxZoom:13});
  }
  const ticketSymbols={unknown:'❗',missing:'⛔',booked:'◔',ready:'✓'};
  function ticketStatusFor(planId,trip,index) {
    return ticketStatuses[C.ticketLegKey(planId,trip,index)]?.status || 'unknown';
  }
  function saveTicketStatus(planId,trip,index,status,source='manual',updatedAt=Date.now()) {
    if(!Object.hasOwn(C.ticketStates,status))throw new Error('Unbekannter Ticketstatus.');
    const key=C.ticketLegKey(planId,trip,index);
    ticketStatuses[key]={status,
      source:['chat-link','encrypted-sync'].includes(source)?source:'manual',
      updatedAt:Number.isFinite(updatedAt)?updatedAt:Date.now()};
    try {
      localStorage.setItem('livekarte-ticket-status-v1',JSON.stringify(ticketStatuses));
      window.dispatchEvent(new Event('livekarte:ticket-updated'));
      return true;
    }catch{
      say('Ticketstatus konnte nicht dauerhaft gespeichert werden. Browserspeicher prüfen.');
      return false;
    }
  }
  // Explicitly limited private return sync data: no coordinates, saved places,
  // actual ticket images, booking codes, passwords, or personal identity.
  window.LivekarteExportTicketSnapshot=()=>{
    const entries=[];
    for(const plan of allPlans()){
      if(plan.kind!=='journey')continue;
      const trip=Object.hasOwn(planJourneys,plan.id)?planJourneys[plan.id]
        :plan.id==='ride-takayama'
          ?C.presetJourney('hakone-takayama-2026-10-30'):null;
      if(!trip)continue;
      for(let i=0;i<trip.stops.length-1;i++){
        const stop=trip.stops[i],next=trip.stops[i+1];
        if(!stop.departure)continue;
        const saved=ticketStatuses[C.ticketLegKey(plan.id,trip,i)];
        entries.push({plan:plan.id,date:trip.date,
          from:stop.name,to:next.name,departure:stop.departure,
          status:saved?.status||'unknown',
          source:saved?.source||'manual',
          updatedAt:saved?.updatedAt||0});
      }
    }
    return entries;
  };
  // Called solely by the optional encrypted inbox once an RSA-OAEP message
  // has been decrypted with this browser's nonextractable private key.
  // Older server messages NEVER overwrite more recent on-device choices.
  window.LivekarteApplySyncedTicket=(raw,issuedAt)=>{
    try {
      const update=C.normalizeTicketUpdate(raw);
      if(!Number.isSafeInteger(issuedAt)||issuedAt<=0||issuedAt>Date.now()+600000)
        return false;
      const plan=allPlans().find(p=>p.id===update.plan && p.kind==='journey');
      if(!plan)return false;
      const trip=Object.hasOwn(planJourneys,update.plan)?planJourneys[update.plan]
        :update.plan==='ride-takayama'?C.presetJourney('hakone-takayama-2026-10-30'):null;
      if(!trip || trip.date!==update.date)return false;
      const index=trip.stops.findIndex((st,i)=>i<trip.stops.length-1 &&
        st.name===update.from && st.departure===update.departure &&
        trip.stops[i+1].name===update.to);
      if(index<0)return false;
      const key=C.ticketLegKey(update.plan,trip,index);
      if((ticketStatuses[key]?.updatedAt||0)>=issuedAt)return true;
      if(!saveTicketStatus(update.plan,trip,index,update.status,'encrypted-sync',issuedAt))
        return false;
      if(activePlanId===update.plan)renderJourney();
      say('🔒 Ticketstatus synchronisiert: '+update.from+' → '+update.to+'.');
      return true;
    } catch {return false;}
  };
  // A confirmation link is a proposal, NOT a booking certificate or a trusted API.
  const ticketUpdateDialog=$('ticket-update-dialog');
  let pendingTicketUpdate=null;
  function clearTicketImportHash() {
    if(location.hash.startsWith('#ticket='))
      history.replaceState(null,'',location.pathname+location.search);
  }
  function dismissTicketUpdate() {
    pendingTicketUpdate=null;
    ticketUpdateDialog.close();
    clearTicketImportHash();
  }
  function readTicketUpdate() {
    if(!location.hash.startsWith('#ticket='))return false;
    try {
      const update=C.decodeTicketUpdate(location.hash);
      const plan=allPlans().find(p=>p.id===update.plan && p.kind==='journey');
      if(!plan)throw new Error('Dieser Reiseabschnitt ist hier nicht vorhanden.');
      const trip=Object.hasOwn(planJourneys,update.plan) ? planJourneys[update.plan]
        : update.plan==='ride-takayama' ? C.presetJourney('hakone-takayama-2026-10-30') : null;
      if(!trip || trip.date!==update.date)throw new Error('Datum bzw. Fahrt stimmt nicht mit dem Reiseplan überein.');
      const index=trip.stops.findIndex((stop,i)=>i<trip.stops.length-1 &&
        stop.name===update.from && stop.departure===update.departure &&
        trip.stops[i+1].name===update.to);
      if(index<0)throw new Error('Diese Zugverbindung existiert nicht im aktuellen Reiseplan.');
      pendingTicketUpdate={update,trip,index};
      $('ticket-update-route').textContent=update.from+' → '+update.to+
        ' · '+update.date+' · '+update.departure;
      $('ticket-update-proposed').textContent='Vorgeschlagener Status: '+
        ticketSymbols[update.status]+' '+C.ticketStates[update.status];
      if(!ticketUpdateDialog.open)ticketUpdateDialog.showModal();
    }catch(e){
      clearTicketImportHash();
      say('Ticketstatus-Link nicht übernommen: '+e.message);
    }
    return true;
  }
  $('ticket-update-close').onclick=dismissTicketUpdate;
  $('ticket-update-cancel').onclick=dismissTicketUpdate;
  ticketUpdateDialog.addEventListener('close',()=>{
    if(pendingTicketUpdate){pendingTicketUpdate=null;clearTicketImportHash();}
  });
  $('ticket-update-apply').onclick=()=>{
    if(!pendingTicketUpdate)return;
    const {update,trip,index}=pendingTicketUpdate;
    const saved=saveTicketStatus(update.plan,trip,index,update.status,'chat-link');
    dismissTicketUpdate();
    if(activePlanId!==update.plan) selectPlan(update.plan);
    else renderJourney();
    if(saved)say('Ticketstatus für '+update.from+' → '+update.to+' übernommen.');
  };
  function renderJourney() {
    journeyLayer.clearLayers();
    const panel = $('journey-panel'), info = $('journey-info');
    info.replaceChildren();
    panel.hidden = !journey;
    if (!journey) { updateStationTransfer(); updateNagoyaTrigger(); return; }
    info.append(node('h2',journey.title),node('p',journey.date + ' · Alle Zeiten Ortszeit Japan','journey-date'));
    const totalLegs=journey.stops.length-1;
    const unresolved=journey.stops.slice(0,-1).filter((_,i)=>ticketStatusFor(activePlanId,journey,i)!=='ready').length;
    const summary=node('div',unresolved
      ? '❗ '+unresolved+' von '+totalLegs+' Fahrtickets noch nicht als vollständig bestätigt'
      : '✓ Alle '+totalLegs+' Fahrtickets als vorhanden markiert',
      'ticket-summary'+(unresolved?' ticket-summary-warn':' ticket-summary-ready'));
    info.append(summary);
    journey.stops.forEach((stop,i) => {
      if (i < journey.stops.length-1) {
        const next = journey.stops[i+1];
        L.polyline([[stop.lat,stop.lng],...stop.via,[next.lat,next.lng]],{
          color:'#ffdf86',weight:4,opacity:.85,dashArray:'7 7'
        }).addTo(journeyLayer);
      }
      const item = node('div',undefined,'journey-item');
      const times = [stop.arrival && stop.arrival+' an',stop.departure && stop.departure+' ab'].filter(Boolean).join(' · ');
      item.append(node('span',times,'times'),node('strong',(i+1)+'. '+stop.name));
      if (stop.description) item.append(node('span',stop.description,'stop-note'));
      if (stop.leg) item.append(node('span','Weiter: '+stop.leg,'leg'));
      if (i<journey.stops.length-1) {
        const state=ticketStatusFor(activePlanId,journey,i);
        const ticketRow=node('div',undefined,'ticket-row ticket-state-'+state);
        const badge=node('span',ticketSymbols[state]+' '+C.ticketStates[state],'ticket-badge');
        badge.setAttribute('aria-live','polite');
        const ticketLabel=node('label','Ticket','ticket-label');
        const picker=node('select',undefined,'ticket-choice');
        const pickerId='ticket-'+i;
        picker.id=pickerId;
        ticketLabel.htmlFor=pickerId;
        picker.setAttribute('aria-label','Ticketstatus '+stop.name+' nach '+journey.stops[i+1].name);
        for(const [key,text] of Object.entries(C.ticketStates)){
          const opt=node('option',ticketSymbols[key]+' '+text);
          opt.value=key;picker.append(opt);
        }
        picker.value=state;
        picker.addEventListener('click',e=>e.stopPropagation());
        picker.addEventListener('change',e=>{
          e.stopPropagation();
          const saved=saveTicketStatus(activePlanId,journey,i,picker.value);
          renderJourney();
          if(saved)say('Ticketstatus aktualisiert: '+stop.name+' → '+journey.stops[i+1].name);
        });
        ticketRow.addEventListener('click',e=>e.stopPropagation());
        ticketRow.append(ticketLabel,badge,picker);
        item.append(ticketRow);
      }
      info.append(item);
      const popup = node('div');
      popup.append(node('strong',(i+1)+'. '+stop.name),node('p',times),node('p',stop.description),node('p',stop.leg ? 'Weiter: '+stop.leg : 'Ankunft'));
      // Use DOM text nodes, not HTML interpolation, for untrusted station names.
      const label = node('div',undefined,'trip-marker'+(i===1?' trip-marker-alt trip-hakone-yumoto':''));
      label.append(node('span',String(i+1),'trip-number'),node('span',stop.name,'trip-marker-name'));
      const marker = L.marker([stop.lat,stop.lng],{zIndexOffset:500,icon:L.divIcon({
        className:'trip-pin',html:label,iconSize:[30,30],iconAnchor:[15,15]
      })}).bindPopup(popup).addTo(journeyLayer);
      marker.on('popupopen',()=>{following=false;});
      if(stop.name==='Nagoya' && journey.stops[i-1]?.leg?.includes('Hikari 637')) {
        item.append(node('span','Umstieg: Hikari 637 → Hida 9 · Gleis 11','stop-note'));
        const btn=node('button','Bahnhofsmodus · Gleis 11','transfer-details-button');
        btn.onclick=e=>{e.stopPropagation();openNagoyaGuide();};
        item.append(btn);
        const details=node('button','Umstieg Nagoya öffnen','transfer-details-button');
        details.onclick=()=>{marker.closePopup();openNagoyaGuide();};
        popup.append(details);
      }
      if (stop.name === 'Hakone-Yumoto') {
        const details = node('button','Umstieg im Detail anzeigen','transfer-details-button');
        details.onclick = () => {
          following = false;
          transferDismissed = false;
          marker.closePopup();
          map.setView([stop.lat,stop.lng],18.25);
          updateStationTransfer();
        };
        popup.append(details);
      }
      item.addEventListener('click',()=>{
        following=false;
        if (stop.name === 'Hakone-Yumoto') {
          transferDismissed=false;
          map.setView([stop.lat,stop.lng],18.25);
          updateStationTransfer();
        } else { map.setView([stop.lat,stop.lng],14); marker.openPopup(); }
      });
    });
    info.append(node('p','Gestrichelte Linien verbinden Stationen nur schematisch – nicht entlang der tatsächlichen Gleise. Fahrpläne vor Abfahrt nochmals prüfen.','journey-warning'));
    updateStationTransfer();
    updateNagoyaTrigger();
  }
  function renderPlanPicker() {
    const pick=$('plan-select'), info=$('plan-summary');
    pick.replaceChildren();
    allPlans().forEach(plan=>{
      const opt=node('option',plan.name);
      opt.value=plan.id;pick.append(opt);
    });
    pick.value=activePlanId;
    const plan=currentPlan();
    $('fit').lastElementChild.textContent=plan.kind==='journey' ? 'Route zeigen'
      : plan.kind==='city' ? 'Ziele zeigen' : 'Alle Orte';
    $('fit').setAttribute('aria-label',$('fit').lastElementChild.textContent);
    $('fit').title=$('fit').lastElementChild.textContent;
    info.replaceChildren();
    // No redundant description under the map for already-configured journeys
    // or city browsing. Keep the warning for travel days still missing a route.
    info.hidden=activePlanId==='all' || plan.kind==='city' || !!activeJourney();
    if (!info.hidden) {
      info.append(node('strong',plan.name));
      const note=plan.kind==='city'
        ? 'Stadtansicht: hier kannst du Restaurants, Sehenswürdigkeiten und andere Ziele sammeln.'
        : activeJourney()
          ? 'Reisetag mit eingezeichneter Zugroute, Zeiten und Umstiegen.'
          : 'Reisetag angelegt. Fahrzeiten und Strecke sind noch nicht hinterlegt – keine erfundenen Verbindungen.';
      info.append(node('p',note));
    }
  }
  function selectPlan(id,options={}) {
    const plan=allPlans().find(p=>p.id===id);
    if(!plan)return false;
    if(activePlanId!==id && walkDestination)clearWalkingRoute();
    if(activePlanId!==id)clearTourRoute();
    if(activePlanId!==id)mapTourPickMode=false;
    if(activePlanId!==id)setMapPlacePicking(false);
    activePlanId=id;
    journey=activeJourney();
    pauseGPSFollow();
    renderPlanPicker();renderJourney();render();
    if (options.focus!==false) {
      if(journey) fitJourney();
      else {
        const matching=currentPlaces();
        if(matching.length) fit(matching);
        else if(plan.center) map.setView(plan.center,plan.kind==='city'?14:8);
      }
    }
    if (options.save!==false) persistPlanState();
    if(options.url!==false) {
      const url=new URL(location.href);
      url.searchParams.set('view',id);
      history.replaceState(null,'',url.pathname+url.search+url.hash);
    }
    if(options.announce!==false) say('Abschnitt ausgewählt: '+plan.name);
    return true;
  }
  $('plan-select').onchange=()=>selectPlan($('plan-select').value);
  $('add-plan').onclick=()=>{
    $('plan-error').textContent='';
    $('plan-dialog').showModal();
  };
  $('plan-form').onsubmit=e=>{
    e.preventDefault();
    try {
      const name=$('plan-title').value.trim().slice(0,60);
      const kind=$('plan-type').value;
      if(!name || !['city','journey'].includes(kind))throw Error('Name und Art fehlen.');
      if(customPlans.length>=30)throw Error('Maximal 30 eigene Reiseabschnitte.');
      const id='custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
      const center=map.getCenter();
      customPlans=C.validCustomPlans([...customPlans,{id,name,kind,center:[center.lat,center.lng]}]);
      $('plan-dialog').close();$('plan-title').value='';
      selectPlan(id);
    }catch(error){$('plan-error').textContent=error.message;}
  };
  function readJourneyLink() {
    const params = new URLSearchParams(location.search);
    const slug = params.get('trip');
    const hasLongLink = location.hash.startsWith('#trip=');
    if (!slug && !hasLongLink) return false;
    try {
      const decoded = slug ? C.presetJourney(slug) : C.decodeJourney(location.hash);
      if (!decoded) throw new Error('Unbekannter Reiseplan.');
      // Existing Hakone→Takayama links select their travel day automatically.
      // New custom long itinerary links attach to the currently active travel day.
      const nextView=slug==='hakone-takayama-2026-10-30' ? 'ride-takayama'
        : currentPlan().kind==='journey' ? activePlanId : 'ride-takayama';
      activePlanId=nextView;
      planJourneys[nextView]=decoded;
      journey=decoded;
      try {
        persistPlanState();
        // Remove the consumed trip URL so clearing the itinerary stays cleared after reload.
        params.delete('trip');
        params.set('view',nextView);
        const otherQuery=params.toString();
        history.replaceState(null,'',location.pathname+(otherQuery?'?'+otherQuery:'')+
          (hasLongLink?'':location.hash));
      } catch { say('Reiseplan geöffnet, konnte aber nicht dauerhaft gespeichert werden.'); }
      renderPlanPicker();render();renderJourney();fitJourney();
      say('Reiseplan in „'+currentPlan().name+'“ geladen. Andere Abschnitte bleiben erhalten.');
    } catch (e) { say('Reiseplan ungültig: '+e.message); }
    return true;
  }
  $('remove-journey').onclick = () => {
    journey=null;
    planJourneys[activePlanId]=null;
    persistPlanState();
    renderJourney();renderPlanPicker();
    say('Nur der Reiseplan dieses Abschnitts wurde entfernt. Andere Abschnitte und Orte bleiben erhalten.');
  };
  $('fit').onclick = () => {
    pauseGPSFollow();
    if(journey) fitJourney();
    else if(currentPlaces().length) fit();
    else if(currentPlan().center) map.setView(currentPlan().center,currentPlan().kind==='city'?14:8);
  };
  const recenterGPS = $('recenter-gps');
  let automaticGPSView = false;
  function refreshGPSFollowControl() {
    // When the user moves the map, show a one-tap way to resume auto-follow.
    recenterGPS.hidden = watch === null || following || !position;
  }
  function pauseGPSFollow() {
    if (!following) return;
    following = false;
    refreshGPSFollowControl();
  }
  function centerOnGPS(ll,zoom) {
    automaticGPSView = true;
    try { map.setView(ll,zoom,{animate:false}); }
    finally { automaticGPSView = false; }
  }
  // Includes pinch/double-tap zoom, mouse wheel, +/- and keyboard zoom.
  // Only GPS-initiated zooms are exempt. GPS measurements keep updating.
  map.on('zoomstart', () => { if (!automaticGPSView) pauseGPSFollow(); });
  map.on('dragstart', pauseGPSFollow);
  recenterGPS.onclick = () => {
    if (!position || watch === null) return;
    following = true;
    refreshGPSFollowControl();
    centerOnGPS([position.lat,position.lng],Math.max(map.getZoom(),16));
  };
  function stopGPS(message = 'GPS ausgeschaltet. Standort wurde entfernt.') {
    if (watch !== null) navigator.geolocation.clearWatch(watch);
    clearWalkingRoute();
    stopTourNavigation();
    watch = null; position = null; positionUpdatedAt=0; positionAccuracy=null;
    following = false; stopCompass(); refreshGPSFollowControl();
    if (userDot) { map.removeLayer(userDot); userDot = null; }
    if (accuracy) { map.removeLayer(accuracy); accuracy = null; }
    $('gps').setAttribute('aria-pressed','false');
    $('gps').title='GPS einschalten';$('gps').setAttribute('aria-label','GPS einschalten');
    $('gps').lastElementChild.textContent = 'GPS einschalten'; refreshDistances(); say(message);
  }
  // GPS auto-start is enabled by default. Only the user can opt out using
  // "GPS ausschalten"; leaving/reopening the page does not reset that choice.
  // Store the preference, NEVER the position, heading or location history.
  const autoGPSAllowed=()=>{
    try{return localStorage.getItem('livekarte-gps-autostart-v1')!=='off';}
    catch{return true;}
  };
  function setAutoGPSAllowed(enabled){
    try{localStorage.setItem('livekarte-gps-autostart-v1',enabled?'on':'off');}
    catch{/* Browsing without persistent storage still works. */}
  }
  function startGPS(automatic=false) {
    if(watch!==null)return;
    if (!window.isSecureContext || !navigator.geolocation) {
      if(!automatic)say('GPS benötigt HTTPS und einen Browser mit Standortunterstützung.');
      return;
    }
    following = true; refreshGPSFollowControl();
    $('gps').setAttribute('aria-pressed','true');
    $('gps').lastElementChild.textContent = 'GPS ausschalten';
    say('Standort wird ermittelt …');
    try{
      watch = navigator.geolocation.watchPosition(result => {
        if (watch === null) return;
        position = {lat:result.coords.latitude,lng:result.coords.longitude};
        positionUpdatedAt=Date.now();
        positionAccuracy=result.coords.accuracy;
        updateWalkingNavigation(position,positionAccuracy);
        updateTourNavigation(position,positionAccuracy);
        const ll = [position.lat,position.lng];
        if (!userDot) {
          accuracy = L.circle(ll,{radius:result.coords.accuracy,color:'#60a5fa',weight:1,fillOpacity:.08}).addTo(map);
          userDot = L.marker(ll,{
            zIndexOffset: 1000,
            icon: L.divIcon({
              className: 'gps-location-icon',
              html: '<div class="gps-bearing" aria-hidden="true"></div><div class="gps-center-dot"></div>',
              iconSize: [64,64], iconAnchor: [32,32]
            })
          }).addTo(map);
          userDot.on('click', () => {
            following = true; refreshGPSFollowControl(); centerOnGPS(userDot.getLatLng(),16);
          });
          renderHeading();
        } else { userDot.setLatLng(ll); accuracy.setLatLng(ll).setRadius(result.coords.accuracy); }
        if (following) centerOnGPS(ll,Math.max(map.getZoom(),15));
        refreshGPSFollowControl();
        refreshDistances();
        say(`GPS aktiv · Genauigkeit ca. ${Math.round(result.coords.accuracy)} m${heading === null ? '' : ' · Richtungspfeil aktiv'}`);
      }, error => {
        if (watch === null) return;
        const messages = {1:'Standortzugriff verweigert. Du kannst GPS in den Website-Einstellungen des Browsers erlauben.',2:'Standort derzeit nicht verfügbar. Bitte erneut versuchen.',3:'Standortabfrage hat zu lange gedauert. Bitte erneut versuchen.'};
        stopGPS(messages[error.code] || 'GPS konnte nicht gestartet werden.');
      }, {enableHighAccuracy:true,maximumAge:5000,timeout:20000});
    }catch{stopGPS('GPS konnte nicht gestartet werden. Bitte Berechtigung prüfen.');return;}
    // iOS compass permission must be requested by a deliberate gesture.
    if(!automatic || typeof DeviceOrientationEvent==='undefined' ||
       typeof DeviceOrientationEvent.requestPermission!=='function')startCompass();
  }
  $('gps').onclick = () => {
    if(watch!==null){setAutoGPSAllowed(false);stopGPS();return;}
    setAutoGPSAllowed(true);
    startGPS(false);
  };
  async function autoStartGPS() {
    if(!autoGPSAllowed() || !window.isSecureContext || !navigator.geolocation)return;
    // Avoid prompting again when permission has already been denied.
    // With "prompt", the OS may show its normal one-time permission dialog.
    try{
      if(navigator.permissions?.query){
        const permission=await navigator.permissions.query({name:'geolocation'});
        if(permission.state==='denied')return;
      }
    }catch{/* Permissions API unavailable: geolocation itself handles consent. */}
    if(watch===null && autoGPSAllowed())startGPS(true);
  }
  document.querySelectorAll('[data-filter]').forEach(b => { b.onclick = () => {
    filter = b.dataset.filter; document.querySelectorAll('[data-filter]').forEach(e => e.setAttribute('aria-pressed', String(e === b))); render();
  }; });
  document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => b.closest('dialog').close(); });
  $('open-import').onclick = () => {
    $('import-error').textContent = '';
    $('import-target').textContent = 'Speichern in: '+currentPlan().name;
    $('import-dialog').showModal();
  };
  $('privacy').onclick = () => $('help-dialog').showModal();
  $('import-form').onsubmit = event => {
    event.preventDefault();
    try {
      const additions = C.parse($('import-text').value);
      const before = places.length;
      places = C.merge(places, additions); filter = 'all';
      document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.filter === 'all')));
      const saved = persist(); assignToCurrentPlan(additions);
      render(); following = false; fit(additions); $('import-dialog').close(); $('import-text').value = '';
      say(saved ? `${places.length - before} neue Orte hinzugefügt · ${places.length} insgesamt.` : 'Orte importiert, konnten aber nicht dauerhaft gespeichert werden.');
    } catch (e) { $('import-error').textContent = e.message; }
  };
  $('clear').onclick = () => {
    if (!confirm('Alle Empfehlungen von diesem Gerät entfernen?')) return;
    places = []; planAssignments=Object.create(null);
    clearWalkingRoute();
    clearTourRoute();
    tourDrafts=Object.create(null);
    dayPlans=Object.create(null);
    persistTourDrafts();
    persistDayPlans();
    persist();persistPlanState();render();say('Empfehlungen entfernt. Reiseabschnitte bleiben erhalten.');
  };
  $('demo').onclick = () => {
    const sample = [
      {name:'Brandenburger Tor',lat:52.516275,lng:13.377704,category:'sight',description:'Ein Berliner Wahrzeichen – und ein guter Ausgangspunkt für deinen Spaziergang.'},
      {name:'Markthalle Neun',lat:52.5021,lng:13.4318,category:'restaurant',description:'Kulinarischer Treffpunkt in Kreuzberg. Öffnungszeiten und Angebote bitte aktuell prüfen.'},
      {name:'Berlin Hauptbahnhof',lat:52.5251,lng:13.3694,category:'station',description:'Ankommen, aufbrechen und die Stadt entdecken.'}
    ];
    try {
      places = C.merge(places, sample); persist(); render(); fit(sample); say('Beispielroute Berlin ergänzt.');
    } catch (e) { say(e.message); }
  };
  $('share').onclick = () => {
    const url = new URL(location.href);
    url.search='';
    if(activePlanId!=='all'&&!activePlanId.startsWith('custom-')) url.searchParams.set('view',activePlanId);
    url.hash = C.encode(currentPlaces());
    if (url.href.length > 30000) { say('Zu viele Daten für einen Link. Bitte weniger oder kürzere Empfehlungen teilen.'); return; }
    $('share-url').value = url.href; $('share-dialog').showModal();
  };
  $('copy').onclick = async () => {
    try { await navigator.clipboard.writeText($('share-url').value); $('share-dialog').close(); say('Kartenlink kopiert.'); }
    catch { $('share-url').focus(); $('share-url').select(); say('Bitte den markierten Link manuell kopieren.'); }
  };
  const expand = $('expand-map');
  let expanded = false;
  function toggleExpanded(force) {
    expanded = typeof force === 'boolean' ? force : !expanded;
    document.querySelector('.workspace').classList.toggle('is-expanded', expanded);
    document.body.classList.toggle('map-fullscreen', expanded);
    expand.setAttribute('aria-pressed', String(expanded));
    expand.setAttribute('aria-label', expanded ? 'Vollbild schließen' : 'Karte im Vollbild anzeigen');
    expand.title = expanded ? 'Vollbild schließen' : 'Karte im Vollbild anzeigen';
    expand.textContent = expanded ? '✕' : '⛶';
    requestAnimationFrame(() => map.invalidateSize());
  }
  expand.onclick = () => toggleExpanded();
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && expanded) toggleExpanded(false); });
  window.addEventListener('resize', () => map.invalidateSize());
  window.addEventListener('hashchange',()=>{
    if(!readTicketUpdate() && !readJourneyLink()) readLink();
  });
  window.addEventListener('pagehide',() => { if (watch !== null) stopGPS(); });
  // Load saved recommendations and journey independently. A journey never replaces pins.
  try { places = C.parse(localStorage.getItem('livekarte-places-v1') || '[]'); }
  catch { say('Gespeicherte Orte konnten nicht gelesen werden. Bitte erneut importieren.'); }
  try {
    customPlans=C.validCustomPlans(JSON.parse(localStorage.getItem('livekarte-custom-plans-v1')||'[]'));
  } catch { customPlans=[]; say('Eigene Reiseabschnitte konnten nicht geladen werden.'); }
  try {
    const raw=JSON.parse(localStorage.getItem('livekarte-plan-assignments-v1')||'{}');
    if(raw && typeof raw==='object' && !Array.isArray(raw))
      for(const [key,value] of Object.entries(raw).slice(0,250))
        if(Array.isArray(value)) planAssignments[key]=value.filter(id=>allPlans().some(p=>p.id===id));
  } catch { say('Ortszuordnungen konnten nicht geladen werden.'); }
  function seedCuratedPlaces() {
    const version='takayama-2026-v4';
    try {
      if (localStorage.getItem('livekarte-curated-places-version')===version) return;
      const preset=C.presetPlaces('town-takayama');
      if (!preset.length) return;
      const presetByKey=new Map(preset.map(place=>[C.placePlanKey(place),place]));
      places=places.map(place=>{
        const curated=presetByKey.get(C.placePlanKey(place));
        return curated ? {...place,...curated} : place;
      });
      places=C.merge(places,preset);
      preset.forEach(place=>{
        const key=C.placePlanKey(place);
        const tags=Array.isArray(planAssignments[key])?planAssignments[key]:[];
        planAssignments[key]=[...new Set([...tags,'town-takayama'])];
      });
      localStorage.setItem('livekarte-curated-places-version',version);
      localStorage.setItem('livekarte-plan-assignments-v1',JSON.stringify(planAssignments));
      persist();
    } catch {
      say('Takayama-Empfehlungen konnten nicht automatisch ergänzt werden.');
    }
  }
  seedCuratedPlaces();
  // A one-off additive migration for a personally requested food marker.
  // Do not re-seed or overwrite the user's existing curated places, notes,
  // tour selection, routing data, or other travel-section assignments.
  function seedBondsBrewBookmark(){
    const version='livekarte-bonds-brew-takayama-20261031-v1';
    try{
      if(localStorage.getItem(version)==='1')return;
      const bookmark=C.presetPlaces('town-takayama').find(p=>
        p.name==='Bonds Brew beer craft');
      if(!bookmark)return;
      const key=C.placePlanKey(bookmark);
      const exists=places.some(p=>C.placePlanKey(p)===key);
      if(!exists)places=C.merge(places,[bookmark]);
      const tags=Array.isArray(planAssignments[key])?planAssignments[key]:[];
      planAssignments[key]=[...new Set([...tags,'town-takayama'])];
      // Only mark complete after both local stores are saved successfully.
      localStorage.setItem('livekarte-places-v1',JSON.stringify(places));
      localStorage.setItem('livekarte-plan-assignments-v1',JSON.stringify(planAssignments));
      localStorage.setItem(version,'1');
    }catch{
      say('Der neue Food-Tipp konnte nicht gespeichert werden. Bitte Speicherplatz prüfen.');
    }
  }
  seedBondsBrewBookmark();
  // Persist only chosen place identifiers, never the GPS start or a route.
  try{
    const raw=JSON.parse(localStorage.getItem('livekarte-tour-drafts-v1')||'{}');
    if(raw&&typeof raw==='object'&&!Array.isArray(raw)){
      for(const [planId,keys] of Object.entries(raw).slice(0,36)){
        if(!allPlans().some(p=>p.id===planId)||!Array.isArray(keys))continue;
        tourDrafts[planId]=[...new Set(keys.filter(k=>
          typeof k==='string'&&k.length<=300))].slice(0,6);
      }
    }
  }catch{say('Gespeicherte Rundgang-Auswahl konnte nicht geladen werden.');}
  try {
    const raw=JSON.parse(localStorage.getItem('livekarte-plan-journeys-v1')||'{}');
    if(raw && typeof raw==='object' && !Array.isArray(raw)) {
      for(const [key,value] of Object.entries(raw).slice(0,35)) {
        if(!allPlans().some(p=>p.id===key))continue;
        planJourneys[key]=value===null?null:C.normalizeJourney(value);
      }
    }
    const savedTrip=localStorage.getItem('livekarte-journey-v1');
    if(savedTrip && !Object.prototype.hasOwnProperty.call(planJourneys,'ride-takayama'))
      planJourneys['ride-takayama']=C.normalizeJourney(JSON.parse(savedTrip));
  } catch { say('Gespeicherter Reiseplan ist ungültig.'); }
  try {
    const raw=JSON.parse(localStorage.getItem('livekarte-ticket-status-v1')||'{}');
    if(raw && typeof raw==='object' && !Array.isArray(raw)){
      for(const [key,value] of Object.entries(raw).slice(0,120)){
        if(key.length<=300 && value && typeof value==='object' &&
            Object.hasOwn(C.ticketStates,value.status))
          ticketStatuses[key]={status:value.status,
            source:['chat-link','encrypted-sync'].includes(value.source)?value.source:'manual',
            updatedAt:Number.isSafeInteger(value.updatedAt)&&value.updatedAt>0?value.updatedAt:0};
      }
    }
  }catch{say('Ticketstatus konnte nicht geladen werden.');}
  // Restore only explicit local timing preferences, never GPS or route data.
  try{
    const raw=JSON.parse(localStorage.getItem('livekarte-day-plans-v1')||'{}');
    if(raw&&typeof raw==='object'&&!Array.isArray(raw)){
      for(const [planId,value] of Object.entries(raw).slice(0,36)){
        if(!allPlans().some(plan=>plan.id===planId)||
           !value||typeof value!=='object'||Array.isArray(value))continue;
        const settings={
          start:'10:30',buffer:10,lunch:45,stops:Object.create(null)
        };
        try{D.minuteOf(value.start);settings.start=value.start;}catch{}
        if([0,5,10,15,20,30].includes(value.buffer))settings.buffer=value.buffer;
        if([0,30,45,60].includes(value.lunch))settings.lunch=value.lunch;
        if(value.stops&&typeof value.stops==='object'&&!Array.isArray(value.stops)){
          for(const [key,entry] of Object.entries(value.stops).slice(0,120)){
            if(key.length>300||!entry||typeof entry!=='object'||Array.isArray(entry))continue;
            const clean=Object.create(null);
            if(Number.isInteger(entry.minutes)&&entry.minutes>=5&&entry.minutes<=480)
              clean.minutes=entry.minutes;
            for(const field of ['open','close']){
              if(typeof entry[field]==='string'&&entry[field].length<=5){
                try{D.minuteOf(entry[field]);clean[field]=entry[field];}catch{}
              }
            }
            settings.stops[key]=clean;
          }
        }
        dayPlans[planId]=settings;
      }
    }
  }catch{say('Tagesplan-Einstellungen konnten nicht gelesen werden.');}
  const queryView=new URLSearchParams(location.search).get('view');
  const savedView=(()=>{try{return localStorage.getItem('livekarte-active-plan-v1')}catch{return null}})();
  const requestedView=queryView||savedView||
    (Object.prototype.hasOwnProperty.call(planJourneys,'ride-takayama')?'ride-takayama':'all');
  activePlanId=allPlans().some(p=>p.id===requestedView)?requestedView:'all';
  journey=activeJourney();
  renderPlanPicker();renderJourney();render();
  if (!readTicketUpdate() && !readJourneyLink() && !readLink()) {
    selectPlan(activePlanId,{save:false,url:false,announce:false});
  }
  // Wait until the saved view is initialized so GPS centering wins on launch.
  void autoStartGPS();
})();