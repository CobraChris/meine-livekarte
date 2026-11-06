'use strict';
(() => {
  const $ = id => document.getElementById(id), C = MapCore;
  const symbols = { restaurant: '♨', sight: '◇', station: '▤', hotel: '⌂' };
  const JP=window.JapaneseDestination;
  const MD=window.LivekarteMultiDay;
  const DC=window.LivekarteDayContext;
  const DayUI=window.LivekarteDaySelectorUI;
  const PlaceUI=window.LivekartePlaceUI;
  const RM=window.LivekarteRouteModel;
  const RailDetails=window.LivekarteRailLegDetails;
  const railTicketUI=window.LivekarteRailTicketUI.create({onUpdated:()=>renderJourney()});
  const camera=window.LivekarteMapCamera.create();
  let cityDayAssignments=Object.create(null);
  let activeCityDay=MD.ALL;
  const tourContextKey=()=>currentDayContext().tourKey;
  let places = [], filter = 'all', position = null, watch = null, userDot, accuracy;
  let distanceDisplays = [];
  let customPlans = [], planAssignments = Object.create(null), planJourneys = Object.create(null);
  let activePlanId = 'all';
  let ticketStatuses=Object.create(null); // local-only; nothing is stored in the public repository.
  const tripStageDone=Object.create(null); // separate manually completed rides; never ticket proof.
  let kyotoPickupDone=false; // Explicitly confirmed paper ticket handover only.
  const allPlans = () => [...C.planPresets,...customPlans];
  const currentPlan = () => allPlans().find(p=>p.id===activePlanId) || C.planPresets[0];
  // One reactive, read-only day context for map markers, sidebar, route preview,
  // Google fallback and saved tour drafts. Always recompute from current data.
  const currentDayContext=()=>DC.resolve({
    planId:activePlanId,day:activeCityDay,plan:currentPlan(),
    journey:activeJourney(),places,assignments:planAssignments,
    dayAssignments:cityDayAssignments,placeKey:C.placePlanKey,
    placesForPlan:C.placesForPlan,calendar:MD,distance:C.distance
  });
  const currentPlaces = () => currentDayContext().planPlaces;
  const visiblePlaces = () => currentDayContext().visiblePlaces;
  const mapFocusPlaces = () => currentDayContext().mapFocusPlaces;
  function assignToCurrentPlan(items) {
    if (activePlanId === 'all') return;
    items.forEach(p => {
      const key=C.placePlanKey(p);
      const list=Array.isArray(planAssignments[key]) ? planAssignments[key] : [];
      planAssignments[key]=[...new Set([...list,activePlanId])];
    });
    persistPlanState();
    if(activePlanId==='town-kyoto'&&MD.days('town-kyoto').includes(activeCityDay)){
      const next=Object.assign(Object.create(null),cityDayAssignments);
      for(const p of items){
        const key=C.placePlanKey(p);
        if(!Object.hasOwn(next,key))next[key]=activeCityDay;
      }
      try{localStorage.setItem('livekarte-city-day-assignments-v1',JSON.stringify(next));
        cityDayAssignments=next;
      }catch{say('Tageszuordnung konnte nicht gespeichert werden.');}
    }
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
    return activePlanId === 'ride-takayama' ? C.presetJourney('hakone-takayama-2026-10-30')
      : activePlanId === 'ride-kyoto' ? C.presetJourney('takayama-kyoto-2026-11-01')
      : activePlanId === 'ride-nikko' ? C.presetJourney('kyoto-nikko-2026-11-07') : null;
  }

  let heading = null, visualHeading = null, compassGeneration = 0;
  let compassSourcePriority=0,compassSampleAt=0,compassProbeTimer=null;
  const compassDiagnostic=message=>{
    const element=$('compass-diagnostic');
    if(element)element.textContent=message;
  };
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
    const source=Number.isFinite(e.webkitCompassHeading)?2:
      (e.absolute===true?1:0);
    if(!source){
      if(!compassSampleAt)compassDiagnostic(
        'Nur relative Bewegungssensoren verfügbar. Keine verlässliche Nordrichtung.');
      return;
    }
    // Prefer the north-referenced iOS compass if both event families report.
    // A lower-priority source may take over if the preferred one falls silent.
    if(source<compassSourcePriority&&Date.now()-compassSampleAt<3500)return;
    const screenAngle=window.screen?.orientation?.angle??window.orientation??0;
    const next = C.compassHeading(e,screenAngle);
    if (next === null) return;
    compassSourcePriority=source;
    compassSampleAt=Date.now();
    heading = next;
    renderHeading();
    if($('help-dialog').open){
      const accuracy=Number.isFinite(e.webkitCompassAccuracy)&&e.webkitCompassAccuracy>30
        ?' · Sensor meldet geringe Genauigkeit':'';
      compassDiagnostic('Kompass liefert Nordrichtung: '+Math.round(heading)+'°'+accuracy+
        '. Die blaue Spitze zeigt die Oberkante deines Handys.');
    }
  }
  function stopCompass() {
    compassGeneration++;
    clearTimeout(compassProbeTimer);
    window.removeEventListener('deviceorientationabsolute', onOrientation);
    window.removeEventListener('deviceorientation', onOrientation);
    heading = null;
    visualHeading = null;
    compassSampleAt=0;
    compassSourcePriority=0;
    compassDiagnostic('Kompass aus · GPS ausgeschaltet.');
  }
  function startCompass(requestPermission=true) {
    const generation = ++compassGeneration;
    clearTimeout(compassProbeTimer);
    compassDiagnostic('Kompasssensor wird abgefragt …');
    const listen = () => {
      if (watch === null || generation !== compassGeneration) return;
      window.addEventListener('deviceorientationabsolute', onOrientation);
      // Safari may provide webkitCompassHeading on the standard event.
      window.addEventListener('deviceorientation', onOrientation);
      const startedAt=Date.now();
      compassProbeTimer=setTimeout(()=>{
        if(watch!==null&&generation===compassGeneration&&compassSampleAt<startedAt)
          compassDiagnostic('Keine absolute Kompassrichtung empfangen. Browser-Sensorfreigabe prüfen oder Kompass am Handy kalibrieren (Acht-Bewegung).');
      },3000);
    };
    if (typeof DeviceOrientationEvent === 'undefined') {
      compassDiagnostic('Dieser Browser stellt keine Geräteausrichtung bereit.');
      return;
    }
    if (requestPermission && typeof DeviceOrientationEvent.requestPermission === 'function') {
      // Request while the GPS / test button's user activation is still active.
      try {
        Promise.resolve(DeviceOrientationEvent.requestPermission(true))
          .then(result => {
            if(result==='granted')listen();
            else if(generation===compassGeneration)
              compassDiagnostic('Kompasszugriff abgelehnt. Sensorberechtigung im Browser prüfen.');
          })
          .catch(() => {
            if(generation===compassGeneration)
              compassDiagnostic('Kompassfreigabe nicht möglich. Sensorberechtigung prüfen.');
          });
      } catch {
        compassDiagnostic('Der Browser hat die Kompassfreigabe blockiert.');
      }
    } else listen();
  }
  let statusTimer = null;
  const say = message => {
    const status = $('status'), text = String(message || '');
    clearTimeout(statusTimer);
    // The GPS precision remains available on the GPS button without a
    // permanent full-width toast obscuring the map.
    if (/^GPS aktiv\b/.test(text)) {
      $('gps').title = 'Mein Standort · '+text;
      $('gps').setAttribute('aria-label','Mein Standort · '+text);
      // A GPS fix resolves the preceding "Standort wird ermittelt" notice.
      // The previous timeout was cleared above, so hide that text explicitly.
      status.textContent='';
      status.hidden=true;
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
  // Explicit opt-in only: OSM stays usable without a Demo Key.
  const googleDemo=window.LivekarteGoogleDemo?.init({
    map,places:()=>visiblePlaces(),placeKey:C.placePlanKey,
    // The same stop order used by renderDayRoutePreview() on Leaflet.
    // After a real foot-route optimization, preserve its displayed order.
    stops:()=>currentDayRoute()?.stops||[],
    route:()=>{
      const view=currentDayRoute();
      return view?{real:view.real,points:view.points}:null;
    },
    // Same day-goal set on both providers; no hotel stretching a Nara day trip.
    goals:()=>dailyStops(),
    fitOSM:()=>fit(mapFocusPlaces()),
    onWalk:place=>{void showWalkingRoute(place);},
    onToggleTour:place=>toggleTourPlace(place,true),
    tourSelected:place=>tourIsSelected(place)
  });
  let tileWarning = false;
  tiles.on('tileerror', () => { if (!tileWarning) { say('Kartenkacheln nicht erreichbar. Bitte Internetverbindung prüfen.'); tileWarning = true; } });
  const pins = L.layerGroup().addTo(map);
  const walkingLayers=L.layerGroup().addTo(map);
  const tourLayers=L.layerGroup().addTo(map);
  const dayRouteLayers=L.layerGroup().addTo(map);
  let dayFootRoute=null,dayFootController=null,dayFootGeneration=0;
  const discoveryLayers=L.layerGroup().addTo(map);
  const mapPlacePreview=L.layerGroup().addTo(map);
  const W=window.LivekarteWalkingCore;
  const Routing=window.LivekarteRoutingRequests;
  const TourNav=window.LivekarteTourNavigation;
  const routeRequests=Routing.create({fetcher:(url,options)=>fetch(url,options)});
  const D=window.LivekarteDayPlan;
  const R=window.LivekarteRouteDiscovery;
  let discoveryController=null,discoveryGeneration=0,discoveries=[],lastDiscoveryAt=0;
  let dayPlans=Object.create(null);
  let tourDrafts=Object.create(null),tourRoute=null,tourController=null,tourRequestGeneration=0;
  let tourNavigation=null; // In-memory only; never persist GPS, current step or route.
  let mapTourPickMode=false; // UI only. Tap selected POI markers to toggle tour membership.
  let mapPlacePicking=false,mapPlacePoint=null; // UI only; never store until user confirms.

  let walkDestination=null,walkController=null,walkRequestGeneration=0;
  let positionUpdatedAt=0,positionAccuracy=null;
  const node = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const placeUI=PlaceUI.create({
    document,categories:C.categories,symbols,placeKey:C.placePlanKey,
    handlers:{
      metric,makePlaceDayPicker,walkingButton,route,japaneseButton,
      placeMeta,appendPlaceTiming,tourIsSelected,toggleTourPlace,openPlaceEditor,
      getPlanAssignments:()=>planAssignments,allPlans,
      showOnMap:(p,marker)=>{
        googleDemo?.forceOSM();
        focusMapPoint([p.lat,p.lng],16);
        marker.openPopup();
        $('map').scrollIntoView({behavior:'smooth',block:'center'});
      },
      saveAssignment:(p,id)=>{
        const key=C.placePlanKey(p);
        if(id)planAssignments[key]=[id];else delete planAssignments[key];
        persistPlanState();render();
        say('Zuordnung gespeichert. Alle Orte bleiben erhalten.');
      }
    }
  });
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
      googleDemo?.forceOSM();
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
  // Save the CURRENT location without having to tap a location on the map.
  // Request one fresh fix only after a deliberate tap. The coordinates stay
  // in memory until the existing explicit "Ort dauerhaft speichern" submit.
  const mapGpsButton=$('map-save-gps');
  const mapGpsStatus=$('map-save-gps-status');
  const gpsBookmarkMessage=message=>{
    mapGpsStatus.textContent=message;
    mapGpsStatus.hidden=!message;
  };
  mapGpsButton.onclick=async()=>{
    if(mapGpsButton.disabled||mapPlaceDialog.open)return;
    gpsBookmarkMessage('📍 Standort wird ermittelt …');
    mapGpsButton.disabled=true;
    mapGpsButton.setAttribute('aria-busy','true');
    try{
      if(!window.isSecureContext||!navigator.geolocation)
        throw Error('GPS ist hier nicht verfügbar. Bitte HTTPS und Standortfreigabe prüfen.');
      // Fast path: the map already has a recent, accurate live position.
      // For stale, inaccurate or disabled map GPS, explicitly ask the device
      // for a ONE-TIME high-accuracy fix without changing the GPS-follow mode.
      let point;
      const recent=watch!==null&&position&&
        Number.isFinite(positionAccuracy)&&positionAccuracy<=35&&
        Date.now()-positionUpdatedAt<=15000;
      if(recent){
        point={...position};
      }else{
        const result=await new Promise((resolve,reject)=>
          navigator.geolocation.getCurrentPosition(resolve,reject,{
            enableHighAccuracy:true,maximumAge:5000,timeout:12000
          }));
        const lat=Number(result?.coords?.latitude),
          lng=Number(result?.coords?.longitude),
          accuracy=Number(result?.coords?.accuracy);
        if(!Number.isFinite(lat)||Math.abs(lat)>90||
           !Number.isFinite(lng)||Math.abs(lng)>180)
          throw Error('Der GPS-Standort ist ungültig. Bitte erneut versuchen.');
        if(!Number.isFinite(accuracy)||accuracy>60)
          throw Error('Standort noch zu ungenau ('+
            Math.round(accuracy)+' m). Bitte kurz warten und erneut versuchen oder einen Kartenpunkt wählen.');
        point={lat,lng};
      }
      gpsBookmarkMessage('');
      openMapPlaceDialog(point);
    }catch(e){
      const message=e?.code===1?'Standortzugriff abgelehnt. Bitte die Standortfreigabe für die App prüfen.'
        :e?.code===2?'Kein GPS-Signal. Bitte im Freien erneut versuchen.'
        :e?.code===3?'GPS-Zeitüberschreitung. Bitte erneut versuchen.'
        :e?.message||'Standort konnte nicht ermittelt werden.';
      gpsBookmarkMessage('⚠ '+message);
    }finally{
      mapGpsButton.disabled=false;
      mapGpsButton.removeAttribute('aria-busy');
    }
  };
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
      focusMapPoint([savedPoint.lat,savedPoint.lng],Math.max(map.getZoom(),16));
      say('📌 '+bookmark.name+' gespeichert · '+currentPlan().name+'.');
    }catch(e){
      mapPlaceError.textContent=e.message||'Der Ort konnte nicht gespeichert werden.';
    }
  };
  // The external Google walking link remains available as a full navigation fallback.
  // Explicit, lightweight place lookup. Never run a network request on typing,
  // GPS updates, map movements or application startup.
  const S=window.LivekartePlaceSearch;
  const searchForm=$('place-search-form');
  const searchInput=$('place-search-input');
  const searchGo=$('place-search-go');
  const searchStatus=$('place-search-status');
  const searchResults=$('place-search-results');
  const searchOnline=$('place-search-online');
  const searchPicked=$('place-search-picked');
  const searchPreview=L.layerGroup().addTo(map);
  let searchController=null,searchGeneration=0,lastSearchAt=0,selectedSearchPlace=null;
  const searchMessage=message=>{
    searchStatus.textContent=message;
    searchStatus.hidden=!message;
  };
  function resetPlaceSearch(clearInput=false){
    searchGeneration++;
    if(searchController){searchController.abort();searchController=null;}
    searchGo.disabled=false;
    searchGo.textContent='Suchen';
    searchResults.replaceChildren();
    searchResults.hidden=true;
    searchOnline.hidden=true;
    searchPicked.hidden=true;
    selectedSearchPlace=null;
    searchPreview.clearLayers();
    if(clearInput)searchInput.value='';
    searchMessage('');
  }
  // The native input[type=search] clear control and typing replace the redundant X.
  searchInput.oninput=()=>resetPlaceSearch(false);
  searchInput.onsearch=()=>{if(!searchInput.value.trim())resetPlaceSearch(true);};
  function pickSearchResult(place){
    selectedSearchPlace=place;
    searchResults.hidden=true;
    searchPreview.clearLayers();
    L.circleMarker([place.lat,place.lng],{
      radius:11,color:'#ffffff',weight:3,fillColor:'#6cddbb',
      fillOpacity:.94,interactive:false
    }).addTo(searchPreview);
    focusMapPoint([place.lat,place.lng],Math.max(15,Math.min(17,map.getZoom())));
    $('place-search-picked-name').textContent=place.name;
    $('place-search-picked-info').textContent=place.label;
    const saved=place.saved===true;
    const saveButton=$('place-search-save');
    saveButton.disabled=saved;
    saveButton.textContent=saved?'✓ Bereits gespeichert':'📌 Ort merken';
    searchPicked.hidden=false;
    searchMessage(saved?'✓ Dieser Ort ist bereits in deiner Live-Karte gespeichert.'
      :'📍 Vorschau auf der Karte · noch nicht gespeichert.');
    searchInput.blur();
  }
  function renderPlaceSearchResults(found,notice=''){
    searchResults.replaceChildren();
    searchResults.hidden=!found.length;
    searchPicked.hidden=true;
    let previousGroup='';
    for(const place of found){
      const group=place.saved?'✓ Gespeicherte Orte':'📍 Orte in der Kartenregion';
      if(previousGroup!==group){
        const heading=node('div',group,'place-search-group-title');
        searchResults.append(heading);
        previousGroup=group;
      }
      const button=node('button',undefined,'place-search-result');
      button.type='button';
      const symbol=({hotel:'⌂',restaurant:'♨',station:'▤',sight:'◇'})[place.category]||'◇';
      button.append(node('strong',symbol+' '+place.name),node('small',place.label));
      button.onclick=()=>pickSearchResult(place);
      searchResults.append(button);
    }
    searchMessage(notice||(found.length
      ?found.length+' Treffer in der Kartenregion · einen Ort auswählen.'
      :'Keine Treffer in der Kartenregion. Verschiebe die Karte zur gesuchten Stadt und versuche es erneut.'));
  }
  async function searchOnlinePlaces(query,localResults=[]){
    let url;
    const center=map.getCenter();
    try{url=S.requestUrl(query,center);}
    catch(error){searchMessage(error.message);return;}
    if(navigator.onLine===false){
      searchMessage(localResults.length
        ?'Gespeicherte Orte sind verfügbar. Für weitere Treffer bitte Internet einschalten.'
        :'Für die Online-Suche benötigst du Internet.');
      return;
    }
    if(Date.now()-lastSearchAt<1200){
      searchMessage('Bitte kurz warten, bevor du erneut suchst.');
      return;
    }
    if(searchController)searchController.abort();
    const controller=new AbortController();
    searchController=controller;
    const generation=++searchGeneration;
    lastSearchAt=Date.now();
    searchGo.disabled=true;
    searchOnline.disabled=true;
    searchGo.textContent='Suche …';
    searchMessage(localResults.length
      ?'Weitere Orte in der Kartenregion werden gesucht …'
      :'Suche in der Kartenregion (OpenStreetMap) …');
    let timeout;
    try{
      timeout=setTimeout(()=>controller.abort(),13000);
      const response=await fetch(url,{
        method:'GET',mode:'cors',credentials:'omit',referrerPolicy:'origin',
        headers:{'Accept':'application/json'},signal:controller.signal
      });
      if(!response.ok){
        if(response.status===429||response.status===503)
          throw new Error('Der öffentliche Suchdienst ist ausgelastet. Bitte später erneut versuchen.');
        throw new Error('Ortssuche nicht erreichbar (HTTP '+response.status+').');
      }
      const raw=await response.text();
      if(raw.length>500000)throw new Error('Die Suchantwort ist zu groß.');
      const found=S.nearby(S.parse(JSON.parse(raw)),center);
      if(generation!==searchGeneration)return;
      const unique=found.filter(place=>!localResults.some(saved=>
        C.distance(place,saved)<100));
      renderPlaceSearchResults([...localResults,...unique],
        unique.length
          ?(localResults.length?localResults.length+' gespeicherte + ':'')+
            unique.length+' Treffer in der Region.'
          :localResults.length?'Nur deine gespeicherten Orte gefunden.':
            'Keine passenden Orte in dieser Region. Karte verschieben oder den Suchbegriff präzisieren.');
      searchOnline.hidden=true;
    }catch(error){
      if(generation!==searchGeneration)return;
      searchMessage(controller.signal.aborted
        ?'Ortssuche hat zu lange gedauert. Bitte erneut versuchen.'
        :error instanceof SyntaxError?'Der Suchdienst hat eine ungültige Antwort geliefert.'
        :error.message||'Ortssuche derzeit nicht verfügbar. Bitte Internet prüfen.');
      searchOnline.hidden=!localResults.length;
    }finally{
      clearTimeout(timeout);
      if(generation===searchGeneration){
        searchController=null;
        searchGo.disabled=false;
        searchOnline.disabled=false;
        searchGo.textContent='Suchen';
      }
    }
  }
  searchForm.onsubmit=async event=>{
    event.preventDefault();
    if(!searchInput.value.trim()){resetPlaceSearch(true);return;}
    if(!S){searchMessage('Ortssuche nicht geladen. Bitte App aktualisieren.');return;}
    const query=searchInput.value;
    try{S.requestUrl(query,map.getCenter());}
    catch(error){searchMessage(error.message);return;}
    resetPlaceSearch(false);
    // Local results always win; no provider call for an already saved hotel.
    const saved=S.savedMatches(query,places,currentPlaces());
    if(saved.length){
      renderPlaceSearchResults(saved,
        saved.length+' bereits gespeicherte Orte gefunden · direkt auswählen.');
      searchOnline.hidden=false;
      searchOnline.onclick=()=>{void searchOnlinePlaces(query,saved);};
      return;
    }
    await searchOnlinePlaces(query,[]);
  };
  $('place-search-walk').onclick=()=>{
    if(selectedSearchPlace)void showWalkingRoute(selectedSearchPlace);
  };
  $('place-search-save').onclick=()=>{
    if(!selectedSearchPlace||selectedSearchPlace.saved)return;
    openMapPlaceDialog(selectedSearchPlace);
    $('map-place-name').value=selectedSearchPlace.name;
    $('map-place-category').value=selectedSearchPlace.category;
    $('map-place-note').value=('Gefunden über Photon/OpenStreetMap: '+selectedSearchPlace.label).slice(0,260);
  };

  function route(p) {
    const a = node('a', '↗ Google Maps', 'navigate');
    a.href = 'https://www.google.com/maps/dir/?api=1&destination='+
      p.lat+','+p.lng+'&travelmode=walking';
    a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
  }
  // Japanese taxi/driver card uses verified local data only. In particular,
  // the hotel name, postal address and phone come from its official JP site.
  // No geocoding or third-party requests happen until a user opens Maps.
  const driverDialog=$('japanese-driver-dialog');
  const driverFeedback=$('japanese-driver-feedback');
  let driverTarget=null;
  function showJapaneseDestination(place){
    const target=JP.get(place);
    if(!target)return;
    driverTarget=target;
    $('japanese-driver-title').textContent=target.name;
    const address=$('japanese-driver-address'),phone=$('japanese-driver-phone');
    address.hidden=!target.address;
    phone.hidden=!target.phone;
    address.textContent=target.address||'';
    phone.textContent=target.phone?'電話：'+target.phone:'';
    $('japanese-driver-info').textContent=target.address
      ?'Offizielle japanische Hoteladresse. Zum Vorzeigen einfach das Handy drehen oder näher halten.'
      :'Nur der japanische Ortsname ist hinterlegt, keine geprüfte Straßenadresse. Bei Bedarf den Punkt auf Google Maps zeigen.';
    driverFeedback.textContent='';
    $('japanese-driver-map').href=JP.googleMapsLink(target);
    if(!driverDialog.open)driverDialog.showModal();
  }
  $('japanese-driver-close').onclick=()=>driverDialog.close();
  driverDialog.addEventListener('close',()=>{driverTarget=null;driverFeedback.textContent='';});
  $('japanese-driver-copy').onclick=async()=>{
    if(!driverTarget)return;
    try{
      if(!navigator.clipboard?.writeText)throw new Error('copy unavailable');
      await navigator.clipboard.writeText(JP.driverText(driverTarget));
      driverFeedback.textContent='✓ Japanischer Zieltext kopiert.';
    }catch{
      driverFeedback.textContent='Automatisches Kopieren nicht möglich. Text lange gedrückt halten und markieren.';
    }
  };
  function japaneseButton(place){
    if(!JP.get(place))return null;
    const btn=node('button','🇯🇵 Dem Fahrer zeigen','place-japanese');
    btn.type='button';
    btn.title='Japanischen Ortsnamen und, falls bekannt, die verifizierte Adresse groß anzeigen';
    btn.onclick=()=>showJapaneseDestination(place);
    return btn;
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
      setCameraMode('manual');refreshGPSFollowControl();
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
    setCameraMode('gps-follow');refreshGPSFollowControl();
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
    googleDemo?.forceOSM();
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
    if(!routeRequests.claim()){
      say('Bitte kurz warten, bevor du einen weiteren Fußweg berechnen lässt.');
      return;
    }
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
    try{
      const data=await routeRequests.request({kind:'walk',url,controller});
      const result=W.parse(data,startedAt,place);
      if(generation!==walkRequestGeneration || watch===null)return;
      walkRouteData=result;
      walkingNavButton.disabled=false;
      const walkingView=RM.walking({start:startedAt,stops:[place],route:result,purpose:'single'});
      L.polyline(walkingView.points,{color:'#10364e',weight:11,opacity:.90,
        lineCap:'round',lineJoin:'round',interactive:false}).addTo(walkingLayers);
      L.polyline(walkingView.points,{color:'#f5fcff',weight:6,opacity:1,
        dashArray:'2 13',lineCap:'round',lineJoin:'round',interactive:false}).addTo(walkingLayers);
      L.polyline(walkingView.points,{color:'#4da4ff',weight:3,opacity:1,
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
        fitMapArea(L.latLngBounds(result.points),{padding:[55,55],maxZoom:17});
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
        });
        bindMapPopup(marker,popup,{maxWidth:260});
        marker.addTo(discoveryLayers);
        item._marker=marker;
      }
      const card=node('div',undefined,'route-discovery-card');
      card.append(node('strong',item.name));
      card.append(node('small',item.type+' · ca. '+item.distance+' m seitlich vom Fußweg'));
      const actions=node('div',undefined,'route-discovery-actions');
      const focus=node('button','Auf Karte');
      focus.type='button';
      focus.onclick=()=>{
        focusMapPoint([item.lat,item.lng],17);
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
  // One shared tour UI for every city, day and trip; the app retains all
  // map state, persistence and the only network/GPS routing code.
  const tourUI=window.LivekarteTourUI.create({document,dayPlanCore:D,walkingCore:W,handlers:{
    selectMapMode:()=>setMapTourPickMode(!mapTourPickMode),
    selectMapPick:()=>setMapTourPickMode(true,true),
    finishMapPick:()=>setMapTourPickMode(false),
    selectedCount:()=>tourSelection().length,
    setSelection:items=>setTourSelection(items),
    removeStop:place=>toggleTourPlace(place),
    calculate:optimized=>{void calculateTour(optimized);},
    dayStopMinutes:place=>dayVisitMinutes(place),
    setVisitMinutes:(place,raw)=>{
      const value=Number(raw);
      if(!Number.isInteger(value)||value<5||value>480){
        dayPlanAlert.textContent='Besuchsdauer bitte zwischen 5 und 480 Minuten eingeben.';
        return;
      }
      dayStopPrefs(place).minutes=value;
      persistDayPlans();renderDayPlanSummary();
    },
    setOpening:(place,value)=>{
      dayStopPrefs(place).open=value;
      persistDayPlans();renderDayPlanSummary();
    },
    setClosing:(place,value)=>{
      dayStopPrefs(place).close=value;
      persistDayPlans();renderDayPlanSummary();
    },
    setStart:time=>{
      try{D.minuteOf(time);}catch(e){dayPlanAlert.textContent=e.message;return;}
      dayPlanPrefs().start=time;
      persistDayPlans();renderDayPlanSummary();
    },
    setBuffer:raw=>{
      dayPlanPrefs().buffer=Number(raw);
      persistDayPlans();renderDayPlanSummary();
    },
    setLunch:raw=>{
      dayPlanPrefs().lunch=Number(raw);
      persistDayPlans();renderDayPlanSummary();
    },
    refreshDayPlan:()=>renderDayPlanSummary(),
    toggleLiveTour:()=>toggleTourNavigation(),
    nextLiveStop:()=>advanceTourNavigation(),
    retryLiveRoute:()=>{void calculateTour(false,true);}
  }});
  tourUI.bind();
  function updateMapTourControls(){
    tourUI.renderMapControls({picking:mapTourPickMode,count:tourSelection().length});
  }
  function setMapTourPickMode(enabled,focusMap=false){
    mapTourPickMode=!!enabled;
    if(mapTourPickMode)googleDemo?.forceOSM();
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
  function tourSelection(){
    const keys=Array.isArray(tourDrafts[tourContextKey()])?tourDrafts[tourContextKey()]:[];
    const byKey=new Map(visiblePlaces().map(p=>[C.placePlanKey(p),p]));
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
    renderNextAction();
  }
  function setTourSelection(items){
    clearTourRoute();
    tourDrafts[tourContextKey()]=items.map(p=>C.placePlanKey(p)).slice(0,6);
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
    tourUI.renderTourBuilder({selected,calculating:!!tourController,hasRoute:!!tourRoute});
    renderDayPlanControls();
    updateMapTourControls();
  }
  // Day schedule reuses only the already calculated OSRM route legs.
  // Store solely explicitly chosen settings, never GPS or route geometry.
  const dayPlanAlert=$('day-plan-alert');
  function dayPlanPrefs(){
    if(!dayPlans[tourContextKey()]){
      dayPlans[tourContextKey()]={
        start:'10:30',buffer:10,lunch:45,stops:Object.create(null)
      };
    }
    return dayPlans[tourContextKey()];
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
    if(!matching){tourUI.showDayPlanMissing();return;}
    const stops=tourRoute.stops;
    try{
      // Timetable math remains in the same verified day-plan core.
      // The shared tour UI only renders the already computed result.
      const schedule=D.build({
        start:pref.start,stops,legs:tourRoute.legs,
        visits:stops.map(p=>dayVisitMinutes(p)),
        windows:stops.map(p=>{
          const opts=dayStopPrefs(p);
          return {open:opts.open||'',close:opts.close||''};
        }),
        buffer:pref.buffer,lunch:pref.lunch
      });
      tourUI.renderDaySchedule({schedule,pref,stopsCount:stops.length});
    }catch(error){tourUI.showDayPlanError(error);}
  }
  function renderDayPlanControls(){
    if(!D)return;
    tourUI.renderDayControls({prefs:dayPlanPrefs(),stops:dayPlanStops(),
      stopPrefs:dayStopPrefs,visitMinutes:dayVisitMinutes});
    renderDayPlanSummary();
  }
  // Live tour uses only the existing full-route geometry and individual leg
  // metrics; live GPS updates NEVER contact a routing server or store a track.
  function stopTourNavigation(){
    const wasFollowing=!!tourNavigation&&!tourNavigation.paused;
    tourNavigation=null;
    tourUI.renderLiveNavigation({phase:'reset'});
    if(wasFollowing){setCameraMode('manual');refreshGPSFollowControl();}
    renderNextAction();
  }
  function updateTourNavigation(point,gpsAccuracy){
    if(!tourNavigation||tourNavigation.paused||!tourRoute)return;
    let progress;
    try{progress=tourNavigation.update(point,gpsAccuracy);}
    catch{tourUI.renderLiveNavigation({phase:'progress-error'});return;}
    if(progress)tourUI.renderLiveNavigation({phase:'progress',...progress});
  }
  function startTourNavigation(){
    if(!tourRoute||!W){say('Bitte zuerst einen Rundgang berechnen.');return;}
    if(watch===null||!position||Date.now()-positionUpdatedAt>60000){
      tourUI.renderLiveNavigation({phase:'gps-required'});return;
    }
    try{
      tourNavigation=TourNav.create(tourRoute,W);
    }catch(e){say('GPS-Rundgang nicht verfügbar: '+e.message);return;}
    tourUI.renderLiveNavigation({phase:'started'});
    setCameraMode('gps-follow');refreshGPSFollowControl();
    centerOnGPS([position.lat,position.lng],Math.max(16,map.getZoom()));
    updateTourNavigation(position,positionAccuracy);
    renderNextAction();
  }
  function toggleTourNavigation(){
    if(!tourNavigation){startTourNavigation();return;}
    if(tourNavigation.paused){
      if(watch===null||!position||Date.now()-positionUpdatedAt>60000){
        tourUI.renderLiveNavigation({phase:'resume-gps-required'});
        return;
      }
      tourNavigation.resume();
      tourUI.renderLiveNavigation({phase:'resumed'});
      setCameraMode('gps-follow');refreshGPSFollowControl();
      centerOnGPS([position.lat,position.lng],Math.max(16,map.getZoom()));
      updateTourNavigation(position,positionAccuracy);
    }else{
      tourNavigation.pause();
      tourUI.renderLiveNavigation({phase:'paused'});
      setCameraMode('manual');refreshGPSFollowControl();
    }
  }
  function advanceTourNavigation(){
    if(!tourNavigation||!tourRoute)return;
    if(tourNavigation.stage>=tourRoute.stops.length-1){
      stopTourNavigation();
      tourUI.renderLiveNavigation({phase:'complete'});
      renderNextAction();
      return;
    }
    tourNavigation.next();
    tourUI.renderLiveNavigation({phase:'next'});
    if(position&&Date.now()-positionUpdatedAt<60000)
      updateTourNavigation(position,positionAccuracy);
    else tourUI.renderLiveNavigation({
      phase:'next-gps-pending',stage:tourNavigation.stage+1,
      total:tourRoute.stops.length
    });
    renderNextAction();
  }
  $('tour-route-close').onclick=()=>{
    clearTourRoute();
    tourBuilderStatus.textContent='Rundgang von der Karte entfernt. Deine Zielauswahl bleibt erhalten.';
  };
  async function calculateTour(optimized=false,remaining=false){
    googleDemo?.forceOSM();
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
    if(!routeRequests.claim()){
      tourBuilderStatus.textContent='Bitte kurz warten und den Rundgang danach erneut berechnen.';
      return;
    }
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
    try{
      const data=await routeRequests.request({kind:'tour',url:request,controller});
      const result=selected.length===1
        ?(()=>{const single=W.parse(data,from,selected[0]);
          return {...single,legs:[{distance:single.distance,duration:single.duration}]};})()
        :optimized?W.parseOptimizedTour(data,from,selected):W.parseTour(data,from,selected);
      if(generation!==tourRequestGeneration||activePlanId!==startPlanId)return;
      const ordered=optimized?result.orderedStops:selected;
      if(optimized){
        // Persist only selected place IDs, never the GPS origin or geometry.
        tourDrafts[tourContextKey()]=ordered.map(p=>C.placePlanKey(p));
        persistTourDrafts();
        render();
      }
      tourRoute={...result,stops:ordered.map(p=>({...p})),start:from,planId:activePlanId};
      const tourView=RM.walking({start:from,stops:ordered,route:result,purpose:'tour'});
      renderRouteDiscoveryUI();
      L.polyline(tourView.points,{color:'#12313b',opacity:.9,weight:10,
        lineCap:'round',lineJoin:'round',interactive:false}).addTo(tourLayers);
      L.polyline(tourView.points,{color:'#ffdb74',opacity:1,weight:5,
        dashArray:'4 12',lineCap:'round',lineJoin:'round',interactive:false}).addTo(tourLayers);
      ordered.forEach((place,i)=>{
        const marker=L.marker([place.lat,place.lng],{
          title:'Stopp '+(i+1)+': '+place.name,
          icon:L.divIcon({className:'tour-stop-marker',
            html:'<span>'+(i+1)+'</span>',iconSize:[30,38],iconAnchor:[15,34]})
        });
        bindMapPopup(marker,node('strong','Stopp '+(i+1)+': '+place.name));
        marker.addTo(tourLayers);
      });
      tourUI.renderCalculatedTour({ordered,result});
      renderDayPlanControls();
      tourBuilderStatus.textContent=remaining
        ?'Restweg ab deiner aktuellen Position berechnet. GPS-Führung bei Bedarf erneut starten.'
        :optimized
        ?'Reihenfolge anhand echter Fußwege optimiert und gespeichert. Gelbe Ziffern zeigen die neuen Stopps.'
        :'Rundgang auf der Karte eingezeichnet. Gelbe Ziffern zeigen die Stopps.';
      renderNextAction();
      map.closePopup();
      fitMapArea(L.latLngBounds(result.points),{padding:[52,52],maxZoom:16});
      $('map').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){
      if(generation!==tourRequestGeneration)return;
      tourBuilderStatus.textContent=controller.signal.aborted
        ?'Der Routingdienst hat zu lange gebraucht. Bitte erneut versuchen.'
        :error instanceof SyntaxError?'Ungültige Routenantwort. Bitte später erneut versuchen.'
        :error.message||'Rundgang derzeit nicht verfügbar.';
    }finally{
      if(generation===tourRequestGeneration){
        tourController=null;
        $('tour-calculate').disabled=tourSelection().length<2;
        $('tour-optimize').disabled=tourSelection().length<2;
      }
    }
  }
  // Editor edits only local recommendation data. Legacy place keys include
  // the name, so rename/delete migrates per-plan drafts and day preferences.
  const editPlaceDialog=$('edit-place-dialog');
  const editPlaceForm=$('edit-place-form');
  let editedPlaceKey=null;
  function openPlaceEditor(place){
    if(editPlaceDialog.open)return;
    const key=C.placePlanKey(place);
    if(!places.some(item=>C.placePlanKey(item)===key)){
      say('Ort ist nicht mehr gespeichert.');return;
    }
    editedPlaceKey=key;
    $('edit-place-name').value=place.name;
    $('edit-place-category').value=place.category;
    $('edit-place-note').value=place.note||'';
    $('edit-place-description').value=place.description||'';
    $('edit-place-location').textContent='📍 '+place.lat.toFixed(6)+', '+
      place.lng.toFixed(6)+' · Position bleibt unverändert';
    $('edit-place-error').textContent='';
    map.closePopup();
    editPlaceDialog.showModal();
    $('edit-place-name').focus();
  }
  function commitPlaceEditor(changes){
    if(editedPlaceKey===null)return false;
    const oldKey=editedPlaceKey;
    let next;
    try{
      next=C.changeSavedPlace(places,planAssignments,tourDrafts,dayPlans,oldKey,changes);
    }catch(error){
      $('edit-place-error').textContent=error.message;
      return false;
    }
    const nextCityDays=Object.assign(Object.create(null),cityDayAssignments);
    const assignedDay=nextCityDays[oldKey];
    if(next.newKey!==oldKey){
      delete nextCityDays[oldKey];
      if(next.newKey!==null&&assignedDay&&!Object.hasOwn(nextCityDays,next.newKey))
        nextCityDays[next.newKey]=assignedDay;
    }
    const storageKeys={
      cityDays:'livekarte-city-day-assignments-v1',
      places:'livekarte-places-v1',
      assignments:'livekarte-plan-assignments-v1',
      drafts:'livekarte-tour-drafts-v1',
      days:'livekarte-day-plans-v1'
    };
    const previousValues=Object.create(null);
    try{
      for(const key of Object.values(storageKeys))
        previousValues[key]=localStorage.getItem(key);
      localStorage.setItem(storageKeys.places,JSON.stringify(next.places));
      localStorage.setItem(storageKeys.assignments,JSON.stringify(next.assignments));
      localStorage.setItem(storageKeys.drafts,JSON.stringify(next.drafts));
      localStorage.setItem(storageKeys.days,JSON.stringify(next.dayPlans));
      localStorage.setItem(storageKeys.cityDays,JSON.stringify(nextCityDays));
    }catch{
      // Best-effort rollback of any partially saved keys. Keep in-memory
      // data unchanged so a quota/security error never silently erases pins.
      for(const [key,value] of Object.entries(previousValues)){
        try{
          if(value===null)localStorage.removeItem(key);
          else localStorage.setItem(key,value);
        }catch{}
      }
      $('edit-place-error').textContent='Änderungen konnten nicht gespeichert werden. Bitte Speicherplatz prüfen.';
      return false;
    }
    const wasInCurrentTour=Array.isArray(tourDrafts[tourContextKey()])&&
      tourDrafts[tourContextKey()].includes(oldKey);
    const onActiveRoute=tourRoute?.stops.some(item=>C.placePlanKey(item)===oldKey);
    const onWalkingRoute=walkDestination&&C.placePlanKey(walkDestination)===oldKey;
    places=next.places;
    planAssignments=next.assignments;
    tourDrafts=next.drafts;
    dayPlans=next.dayPlans;
    cityDayAssignments=nextCityDays;
    if(onWalkingRoute)clearWalkingRoute();
    if(wasInCurrentTour||onActiveRoute)clearTourRoute();
    editPlaceDialog.close();
    // Selected category may have changed; display the edited marker on save.
    if(next.updated&&filter!=='all'&&filter!==next.updated.category){
      filter='all';
      document.querySelectorAll('[data-filter]').forEach(button=>
        button.setAttribute('aria-pressed',String(button.dataset.filter==='all')));
    }
    render();
    const name=next.updated?.name||next.previous.name;
    say(next.updated
      ?'✓ '+name+' aktualisiert.'
      :'🗑 '+name+' gelöscht. Andere Orte bleiben erhalten.');
    return true;
  }
  $('edit-place-close').onclick=()=>editPlaceDialog.close();
  editPlaceDialog.addEventListener('close',()=>{
    editedPlaceKey=null;
    $('edit-place-error').textContent='';
  });
  editPlaceForm.onsubmit=event=>{
    event.preventDefault();
    commitPlaceEditor({
      name:$('edit-place-name').value.trim(),
      category:$('edit-place-category').value,
      note:$('edit-place-note').value.trim(),
      description:$('edit-place-description').value.trim()
    });
  };
  $('edit-place-delete').onclick=()=>{
    if(editedPlaceKey===null)return;
    const old=places.find(p=>C.placePlanKey(p)===editedPlaceKey);
    if(!old)return;
    if(confirm('„'+old.name+'“ wirklich aus deiner Karte löschen?'+
      ' Der Ort wird auch aus gespeicherten Rundgängen entfernt.')){
      commitPlaceEditor(null);
    }
  };
  function placeMeta(p) {
    const parts = [];
    if (p.priority) parts.push('Schulnote ' + p.priority);
    if (p.duration) parts.push('Dauer ' + p.duration);
    return parts.join(' · ');
  }
  function appendPlaceTiming(target,p) {
    if(p.schedule){
      const assigned=activePlanId==='town-kyoto'
        ?cityDayAssignments[C.placePlanKey(p)]:null;
      const sourceDate=MD.fromSchedule(p.schedule);
      const changed=assigned&&sourceDate&&assigned!==sourceDate;
      const label=changed
        ?'🗓 Frühere Planung: '+p.schedule+' · jetzt für '+MD.dayLabel(assigned)+
          ' vorgemerkt (Uhrzeiten nicht automatisch übertragen)'
        :'🗓 '+p.schedule;
      target.append(node('p',label,'place-schedule'));
    }
    // Both visits on 02.11. were explicitly confirmed by the travellers.
    if(activePlanId==='town-kyoto'&&
      (p.name==='Kiyomizu-dera'||p.name==='Fushimi Inari-Taisha'))
      target.append(node('p','✓ Am 02.11. bereits besucht (bestätigt)','place-visit-confirmed'));
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
  function fit(items = mapFocusPlaces()) {
    const visible = items.filter(p => filter === 'all' || p.category === filter);
    // The old uniform 45px padding clipped outer day stops behind the
    // mobile picker and right-side controls, especially on Nara day trips.
    const day=activePlanId==='town-kyoto'&&MD.days('town-kyoto').includes(activeCityDay);
    const padding=day?mapOverviewPadding():{padding:[45,45]};
    if(visible.length)withCameraView('day-goals',()=>map.fitBounds(
      visible.map(p=>[p.lat,p.lng]), {...padding,maxZoom:16,animate:false}));
  }
  // Measure the visible overlays rather than guessing their height: phone
  // font sizes, search suggestions and installed-PWA viewport heights differ.
  // Never place the northernmost GPS marker behind the tour/search controls.
  function mapOverviewPadding() {
    const size=map.getSize();
    const frame=$('map').getBoundingClientRect();
    let occupiedTop=0;
    for(const selector of ['.plan-picker','#place-search','#tour-map-tools']) {
      const element=document.querySelector(selector);
      if(!element || element.hidden)continue;
      const rect=element.getBoundingClientRect();
      if(rect.width<=0 || rect.height<=0 || rect.bottom<=frame.top ||
         rect.top>=frame.bottom || rect.right<=frame.left ||
         rect.left>=frame.right)continue;
      occupiedTop=Math.max(occupiedTop,rect.bottom-frame.top);
    }
    // Leave room for the whole GPS icon, the marker pins and their shadows.
    // On short screens keep enough lower map surface to still show the goals.
    const top=Math.min(Math.round(size.y*0.62),
      Math.max(110,Math.ceil(occupiedTop)+42));
    const toolbar=document.querySelector('.map-actions');
    const controls=toolbar?.getBoundingClientRect();
    const occupiedRight=controls && controls.height>0
      ?Math.max(0,frame.right-controls.left):0;
    const right=Math.max(78,Math.ceil(occupiedRight)+22);
    return {paddingTopLeft:[32,top],
      paddingBottomRight:[right,68]};
  }
  // The pin is a combined day-trip overview, not an alternative to GPS.
  // Fit the selected goals and the last recent GPS fix together, while leaving
  // the actual location marker and all place markers untouched.
  function fitDayGoalsAndPosition() {
    const goals=mapFocusPlaces().filter(p=>filter==='all'||p.category===filter);
    if(!goals.length)return false;
    const bounds=goals.map(p=>[p.lat,p.lng]);
    const hasFix=watch!==null && position!==null && positionUpdatedAt>0 &&
      Date.now()-positionUpdatedAt<60000;
    if(hasFix)bounds.push([position.lat,position.lng]);
    withCameraView('overview',()=>map.fitBounds(bounds,
      {...mapOverviewPadding(),maxZoom:16}));
    return hasFix;
  }
  // City dates are an extra filter inside one city, never extra trip sections.
  const daySelector=DayUI.create({document,calendar:MD,placeKey:C.placePlanKey});
  const dayBriefOpen=$('city-day-brief-open');
  dayBriefOpen.onclick=()=>{
    const index=MD.days('town-kyoto').indexOf(activeCityDay);
    if(index<0)return;
    focusKyotoOverviewDay(index);
    kyotoOverview.scrollIntoView({behavior:'smooth',block:'start'});
  };
  // The first planned stop is kept fixed (e.g. Nara Park after the train).
  // Optimize the rest by straight-line distances on this device. Never pretend
  // the dashed line is a walking street or a railway connection from Kyoto.
  function dailyStops(){
    return currentDayContext().orderedStops;
  }
  function dailyRouteKey(stops){
    return currentDayContext().routeKey(stops);
  }
  // One route contract for day plan, map markers and optional Google view.
  // A dashed preview is never presented as calculated walking geometry.
  function currentDayRoute(){
    const ordered=dailyStops();
    if(ordered.length<2)return null;
    const key=dailyRouteKey(ordered);
    const actual=dayFootRoute?.key===key?dayFootRoute:null;
    return actual?RM.walking({
      start:actual.stops[0],stops:actual.stops.slice(1),
      route:actual,key,purpose:'day'
    }):RM.preview(ordered,key);
  }
  function renderDayRoutePreview(){
    const panel=$('day-route-preview'),view=currentDayRoute();
    dayRouteLayers.clearLayers();
    panel.hidden=!view;
    if(!view)return;
    const stops=view.stops;
    L.polyline(view.points,{
      ...view.style,lineCap:'round',lineJoin:'round',interactive:false
    }).addTo(dayRouteLayers);
    stops.forEach((p,i)=>{
      // Numbered labels are offset beside the existing tappable place pins.
      L.marker([p.lat,p.lng],{
        interactive:false,zIndexOffset:1100,
        icon:L.divIcon({
          className:'day-route-label',
          html:'<span class="day-route-number">'+(i+1)+'</span>',
          iconSize:[25,25],iconAnchor:[-13,39]
        })
      }).addTo(dayRouteLayers);
    });
    const list=$('day-route-stops');
    list.replaceChildren();
    stops.forEach((place,i)=>{
      const li=node('li');
      li.append(node('span',String(i+1),'day-route-index'),node('span',place.name));
      list.append(li);
    });
    $('day-route-heading').textContent=view.real
      ?'🚶 Fußweg · optimierte Reihenfolge'
      :'📍 Vorgeschlagene Reihenfolge';
    $('day-route-status').textContent=view.real
      ?W.distanceText(view.distance)+' · '+W.durationText(view.duration)+
        ' zu Fuß. '+view.note
      :view.note;
    $('day-route-foot').textContent=view.real?'↻ Fußroute erneut berechnen':
      '🚶 Echte Fußroute berechnen';
  }
  async function calculateDailyFootRoute(){
    if(dayFootController)return;
    const ordered=dailyStops();
    if(ordered.length<3||!W){
      $('day-route-status').textContent='Für die Fußweg-Optimierung werden mindestens drei Ziele benötigt.';
      return;
    }
    const from=ordered[0],remaining=ordered.slice(1),key=dailyRouteKey(ordered);
    let url;
    try{url=W.optimizedTourRequestUrl(from,remaining);}
    catch(error){$('day-route-status').textContent=error.message;return;}
    if(!routeRequests.claim()){
      $('day-route-status').textContent='Bitte kurz warten und die Berechnung erneut starten.';
      return;
    }
    const controller=new AbortController();
    dayFootController=controller;
    const generation=++dayFootGeneration;
    $('day-route-foot').disabled=true;
    $('day-route-status').textContent='Echte Fußwege und Stoppreihenfolge werden berechnet …';
    try{
      const data=await routeRequests.request({kind:'day',url,controller});
      const result=W.parseOptimizedTour(data,from,remaining);
      if(generation!==dayFootGeneration||dailyRouteKey(dailyStops())!==key)return;
      dayFootRoute={
        key,points:result.points,
        stops:[from,...result.orderedStops],
        distance:result.distance,duration:result.duration
      };
      renderDayRoutePreview();
      fitMapArea(result.points,{paddingTopLeft:[38,170],
        paddingBottomRight:[78,50],maxZoom:16});
      $('map').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){
      if(generation!==dayFootGeneration)return;
      $('day-route-status').textContent=controller.signal.aborted
        ?'Routingdienst hat zu lange gebraucht. Die Luftlinienvorschau bleibt sichtbar.'
        :error instanceof SyntaxError?'Ungültige Routenantwort. Bitte später erneut versuchen.'
        :error.message||'Fußroute gerade nicht verfügbar.';
    }finally{
      if(generation===dayFootGeneration){
        dayFootController=null;
        $('day-route-foot').disabled=false;
      }
    }
  }
  $('day-route-foot').onclick=()=>{
    googleDemo?.forceOSM();
    void calculateDailyFootRoute();
  };
  function renderCityDays(){
    daySelector.render({context:currentDayContext(),activeDay:activeCityDay,
      overview:kyotoOverview,onSelect:selectCityDay});
  }
  function selectCityDay(day){
    if(!MD.allowed('town-kyoto',day)||day===activeCityDay)return;
    ++dayFootGeneration;
    if(dayFootController)dayFootController.abort();
    dayFootController=null;dayFootRoute=null;
    $('day-route-foot').disabled=false;
    clearTourRoute();
    if(mapTourPickMode)mapTourPickMode=false;
    activeCityDay=day;
    pauseGPSFollow();
    try{localStorage.setItem('livekarte-active-city-day-v1',day);}
    catch{say('Tagesauswahl konnte nicht gespeichert werden.');}
    render();
    const p=mapFocusPlaces();
    if(p.length)fit(p);
    googleDemo?.syncFromOSM();
    say('Kyoto · '+MD.dayLabel(day)+' ausgewählt.');
  }
  function setDayAssignment(place,day){
    if(activePlanId!=='town-kyoto'||place.category==='hotel')return;
    const key=C.placePlanKey(place);
    let next;
    try{next=MD.change(cityDayAssignments,key,day);}
    catch(error){say(error.message);return;}
    try{localStorage.setItem('livekarte-city-day-assignments-v1',JSON.stringify(next));}
    catch{say('Tageszuordnung konnte nicht gespeichert werden.');return;}
    cityDayAssignments=next;
    clearTourRoute();
    render();
    say('📅 '+place.name+' → '+(day===MD.UNASSIGNED?'Merkliste':MD.dayLabel(day))+'.');
  }
  function makePlaceDayPicker(place){
    return daySelector.makePlaceDayPicker({place,context:currentDayContext(),
      dayAssignments:cityDayAssignments,onAssign:setDayAssignment});
  }

  // All marker types share the same popup behavior, regardless of destination.
  function bindMapPopup(marker,content,options={}){
    return window.LivekarteMapPopup.bind({
      marker,content,map,L,onPanStart:pauseGPSFollow,options
    });
  }
  function render() {
    googleDemo?.refresh();
    pins.clearLayers();distanceDisplays=[];
    renderCityDays();
    const planPlaces=visiblePlaces();
    placeUI.begin({planPlacesCount:planPlaces.length,
      placesCount:places.length,activePlanId});
    let shown=0;
    planPlaces.forEach(p=>{
      if(filter!=='all'&&p.category!==filter)return;
      shown++;
      const {popup,inPopup}=placeUI.buildPopup(p);
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
        bindMapPopup(marker,popup);
      }
      const {card,distance}=placeUI.buildCard(p,marker);
      placeUI.appendCard(card);
      distanceDisplays.push({place:p,inPopup,inList:distance});
    });
    if(places.length&&!shown)placeUI.showEmptyFilter();
    renderDayRoutePreview();
    renderTourBuilder();
    renderNextAction();
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
      setCameraMode('manual');
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
  const NS=window.NextStepCore;
  const nextActionSection=$('next-action');
  const nextActionComplete=$('next-action-complete');
  const nextActionDetails=$('next-action-details');
  const nextActionMap=$('next-action-map');
  const nextActionJapanese=$('next-action-japanese');
  const nextActionPlanB=$('next-action-planb');
  const nextActionFeedback=$('next-action-feedback');
  const nextActionList=$('next-action-list');
  const nextActionOpenList=$('next-action-open-list');
  let nextActionDone=Object.create(null);
  let nextActionCurrent=null;
  // Manual, per-device progress only. Never store GPS, QR, ticket codes or
  // inferred arrival data; ticket pickup and rail stages use canonical state.
  function storeNextAction(id,done){
    const next={...nextActionDone};
    if(done)next[id]=true;else delete next[id];
    try{
      localStorage.setItem('livekarte-next-actions-v1',JSON.stringify(next));
      nextActionDone=next;
      return true;
    }catch{
      nextActionFeedback.textContent='Aufgabe konnte nicht gespeichert werden. Browserspeicher prüfen.';
      return false;
    }
  }
  function travelTaskContext(){
    const trip=activeJourney()||C.presetJourney('takayama-kyoto-2026-11-01');
    const railDone={};
    if(trip?.stops?.length===3&&trip.stops[0].name==='Takayama'&&
      trip.stops[0].departure==='11:35'&&trip.stops[1].name==='Nagoya'&&
      trip.stops[1].departure==='14:26'&&trip.stops[2].name==='Kyoto Station'){
      for(let i=0;i<2;i++){
        railDone[i]=tripStageDone[C.ticketLegKey('ride-kyoto',trip,i)]===true;
      }
    }
    return {railDone,trip};
  }
  function showNextActionDetails(task){
    if(task.id==='kyoto:transfer'&&activePlanId==='ride-kyoto'&&
      C.isNagoyaKyotoTrip(journey)){
      openNagoyaKyotoGuide();
    }else if(task.details==='pickup'){
      revealKyotoPickupHistory();
      if(!['town-takayama','ride-kyoto'].includes(activePlanId))
        selectPlan('ride-kyoto');
      $('kyoto-pickup-steps-details').open=true;
      $('kyoto-pickup').scrollIntoView({behavior:'smooth',block:'start'});
    }else if(task.details==='rail'){
      if(activePlanId!=='ride-kyoto')selectPlan('ride-kyoto');
      $('kyoto-rail-infographic').scrollIntoView({behavior:'smooth',block:'start'});
    }else if(task.details==='tour'){
      const tourPanel=$('tour-builder');
      tourPanel.open=true;
      tourPanel.scrollIntoView({behavior:'smooth',block:'start'});
    }else{
      if(activePlanId!=='town-kyoto')selectPlan('town-kyoto');
      const overview=$('kyoto-overview');
      const sections=overview.querySelectorAll('details.kyoto-day');
      const day=NS.localDate()==='2026-11-02'?1:0;
      if(sections[day])sections[day].open=true;
      overview.scrollIntoView({behavior:'smooth',block:'start'});
    }
  }
  function setActionDone(task,done){
    if(!task)return;
    if(task.source==='pickup'){
      revealKyotoPickupHistory();
      $('kyoto-pickup').scrollIntoView({behavior:'smooth',block:'start'});
      $('kyoto-pickup-steps-details').open=true;
      nextActionFeedback.textContent='Abholung bitte nur über den Bestätigungsbutton im Ticketabschnitt als erledigt markieren.';
      return;
    }
    if(task.source.startsWith('rail:')){
      const {trip}=travelTaskContext();
      const index=Number(task.source.slice(5));
      if(!trip||trip.stops?.[index]?.name!== (index===0?'Takayama':'Nagoya') ||
        (index===0?trip.stops[index].departure!=='11:35':
          trip.stops[index].departure!=='14:26')){
        nextActionFeedback.textContent='Die Zugverbindung wurde verändert. Bitte zuerst den Reiseplan prüfen.';
        return;
      }
      // Only mark a ridden train done; undo returns to the prior booked state.
      if(setRailLegStage('ride-kyoto',trip,index,done?'done':'booked'))
        renderNextAction();
      return;
    }
    if(storeNextAction(task.id,done))renderNextAction();
  }
  let oldTravelExpanded=false;
  $('next-action-archive-toggle').onclick=()=>{
    oldTravelExpanded=!oldTravelExpanded;
    const reveal=$('next-action-archive-content');
    reveal.hidden=!oldTravelExpanded;
    const button=$('next-action-archive-toggle');
    button.setAttribute('aria-expanded',String(oldTravelExpanded));
    button.textContent=oldTravelExpanded
      ?'Vergangene Aufgaben wieder einklappen'
      :'Vergangene Aufgaben anzeigen · keine automatische Bestätigung';
  };
  function renderNextAction(){
    const today=NS.localDate();
    const view=activePlanId;
    let result=NS.choose(view,today,{
      pickupDone:kyotoPickupDone,
      manualDone:nextActionDone,
      railDone:travelTaskContext().railDone
    });
    // An uncollected train ticket always outranks an optional walking tour.
    const criticalPickup=result.next?.source==='pickup'&&!kyotoPickupDone;
    const tourIsActive=!criticalPickup&&!!(tourNavigation&&tourRoute&&tourRoute.planId===view);
    const selectedTour=!criticalPickup&&!tourIsActive&&tourRoute?.planId===view&&
      tourRoute?.stops?.length>=2;
    nextActionSection.hidden=!result.total&&!tourIsActive&&!selectedTour;
    nextActionPlanB.hidden=!canShowRailPlanB();
    if(nextActionSection.hidden)return;
    const count=$('next-action-count');
    const time=$('next-action-time'),name=$('next-action-name'),
      description=$('next-action-description'),date=$('next-action-date');
    const all=$('next-action-all');
    nextActionList.replaceChildren();
    if(tourIsActive||selectedTour){
      const current=tourIsActive
        ?tourRoute.stops[tourNavigation.stage]
        :tourRoute.stops[0];
      if(!current)return;
      result={entries:[],doneCount:tourIsActive?tourNavigation.stage:0,
        total:tourRoute.stops.length,
        next:{
          id:'tour:current',source:'tour',details:'tour',place:current,
          time:tourIsActive?'Stopp '+(tourNavigation.stage+1)+' von '+tourRoute.stops.length:'Bereit zum Start',
          title:tourIsActive?'Weiter zu: '+current.name:'Rundgang starten',
          note:tourIsActive
            ?'GPS-Navigation und „Nächster Stopp“ auf der Karte bedienen. Keine automatische Aufgabenbestätigung.'
            :'Deine berechnete Tour mit '+tourRoute.stops.length+' Stopps ist bereit.'
        },dateLabel:'🚶 AKTUELLER RUNDGANG'};
    }
    const buckets=NS.taskBuckets(result.entries);
    const isArchived=NS.isPastTravelView(view);
    nextActionSection.classList.toggle('is-archived-trip',isArchived);
    const archiveButton=$('next-action-archive-toggle');
    archiveButton.hidden=!isArchived;
    archiveButton.setAttribute('aria-expanded',String(isArchived&&oldTravelExpanded));
    archiveButton.textContent=oldTravelExpanded
      ?'Vergangene Aufgaben wieder einklappen'
      :'Vergangene Aufgaben anzeigen · keine automatische Bestätigung';
    $('next-action-archive-content').hidden=isArchived&&!oldTravelExpanded;
    count.textContent=isArchived
      ?'Archiv · '+buckets.openCount+' nicht bestätigt'
      :buckets.openCount+' offen · '+buckets.doneCount+' erledigt';
    date.textContent=result.dateLabel+
      (isArchived?' · Vergangener Reisetag, keine automatische Erledigung':'');
    const task=result.next;
    nextActionCurrent=task;
    $('next-action-open').hidden=!result.entries.length;
    $('next-action-open-count').textContent=buckets.openCount+' von '+result.total;
    nextActionOpenList.replaceChildren();
    // Unfinished steps are visible without expanding another menu.
    for(const item of buckets.open){
      const li=node('li',undefined,'next-action-list-item next-action-open-item');
      const left=node('div',undefined,'next-action-list-text');
      left.append(node('span',item.time,'next-action-list-time'));
      left.append(node('strong',item.title));
      if(item.timeState==='past'){
        li.classList.add('is-past');
        left.append(node('span','⚠ Planzeit vorbei · Status selbst prüfen','next-action-past'));
      }else if(item.timeState==='flexible'){
        left.append(node('span','Flexibel · keine feste Frist','next-action-flexible'));
      }
      if(item.note)left.append(node('span',item.note,'next-action-list-note'));
      li.append(left);
      const actions=node('div',undefined,'next-action-list-actions');
      const details=node('button','Details');
      details.type='button';
      details.setAttribute('aria-label','Details zu '+item.title);
      details.onclick=()=>showNextActionDetails(item);
      actions.append(details);
      const confirm=node('button',item.source==='pickup'?'Abholung prüfen':'✓ Erledigt');
      confirm.type='button';
      confirm.setAttribute('aria-label',item.title+(item.source==='pickup'?' kontrollieren':' als erledigt markieren'));
      confirm.onclick=()=>setActionDone(item,true);
      actions.append(confirm);
      li.append(actions);
      nextActionOpenList.append(li);
    }
    all.hidden=!buckets.doneCount;
    $('next-action-done-count').textContent=buckets.doneCount+' von '+result.total;
    nextActionList.replaceChildren();
    for(const item of buckets.done){
      const li=node('li',undefined,'next-action-list-item is-complete');
      const left=node('div',undefined,'next-action-list-text');
      left.append(node('span','✓ '+item.time,'next-action-list-time'));
      left.append(node('strong',item.title));
      li.append(left);
      if(item.source!=='pickup'){
        const undo=node('button','Wieder als offen markieren');
        undo.type='button';
        undo.setAttribute('aria-label',item.title+' wieder als offen markieren');
        undo.onclick=()=>setActionDone(item,false);
        li.append(undo);
      }else if(item.source==='pickup'&&item.done){
        li.append(node('span','Bestätigt','next-action-list-done'));
      }
      nextActionList.append(li);
    }
    if(!task){
      time.textContent='✓ Alle Schritte';
      name.textContent='Alle geplanten Aufgaben erledigt';
      description.textContent='Manuell bestätigt. Fahrpläne und Öffnungszeiten weiterhin vor Ort prüfen.';
      nextActionComplete.hidden=true;nextActionDetails.hidden=true;
      nextActionMap.hidden=true;nextActionJapanese.hidden=true;
      $('next-action-timing').hidden=true;
      nextActionFeedback.textContent='Alle notwendigen Schritte bestätigt. Zum Korrigieren unter „Erledigt“ auf „Wieder als offen markieren“ tippen.';
      return;
    }
    time.textContent=task.time;
    name.textContent=task.title;
    description.textContent=task.note;
    const currentTimeState=NS.taskTimeState(task);
    const timing=$('next-action-timing');
    timing.hidden=currentTimeState!=='past';
    timing.textContent=currentTimeState==='past'
      ?'⚠ Geplante Zeit bereits vorbei. Bitte selbst prüfen, ob erledigt; keine Live-Bestätigung.':'';
    nextActionComplete.hidden=task.source==='tour';
    nextActionComplete.textContent=task.source==='pickup'?'✓ Abholung bestätigen':'✓ Erledigt';
    nextActionComplete.onclick=()=>setActionDone(task,true);
    nextActionDetails.hidden=false;
    nextActionDetails.textContent=task.id==='kyoto:transfer'&&
      activePlanId==='ride-kyoto'&&C.isNagoyaKyotoTrip(journey)
        ?'🚄 Umstiegshilfe öffnen'
        :task.details==='tour'?'Zur Tour-Navigation':'Details ansehen';
    nextActionDetails.onclick=()=>showNextActionDetails(task);
    const target=task.place;
    nextActionMap.hidden=!(target&&Number.isFinite(target.lat)&&Number.isFinite(target.lng));
    nextActionJapanese.hidden=!JP.get(target);
    if(!nextActionJapanese.hidden)
      nextActionJapanese.onclick=()=>showJapaneseDestination(target);
    if(!nextActionMap.hidden){
      nextActionMap.href='https://www.google.com/maps/dir/?api=1&destination='+
        encodeURIComponent(target.lat+','+target.lng)+'&travelmode=walking';
      nextActionMap.setAttribute('aria-label','Weg zu '+target.name+' in Google Maps');
    }
    nextActionFeedback.textContent=task.source==='pickup'
      ?'Die QR-Abholung wird erst nach deiner ausdrücklichen Bestätigung als erledigt markiert.'
      :'Nichts wird aufgrund der Uhrzeit oder GPS-Position automatisch als erledigt markiert.';
  }
  // A resumed app recalculates local calendar context, without network traffic.
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')renderNextAction();
  });
  window.addEventListener('focus',renderNextAction);
  const kyotoOverview=$('kyoto-overview'),nikkoOverview=$('nikko-overview');
  function renderNikkoOverview(){
    const visiting=activePlanId==='town-nikko',travel=activePlanId==='ride-nikko';
    nikkoOverview.hidden=!visiting&&!travel;
    if(nikkoOverview.hidden)return;
    const label=nikkoOverview.querySelector('.kyoto-eyebrow');
    const title=nikkoOverview.querySelector('.kyoto-day-heading h2');
    label.textContent=visiting?'🏨 NIKKŌ · AUFENTHALT':'🚄 NÄCHSTE ETAPPE · 07.11.2026';
    title.textContent=visiting?'Nikkō · Hotel und Orientierung':'Kyoto → Tokio → Nikkō';
    $('nikko-tokyo-transfer').hidden=!travel;
    $('nikko-rail-steps').open=travel;
  }
  let lastOverviewDay=null;
  function focusKyotoOverviewDay(index){
    const sections=kyotoOverview.querySelectorAll('details.kyoto-day');
    sections.forEach((section,i)=>{section.open=index===i;});
  }
  function renderKyotoOverview(){
    kyotoOverview.hidden=!['ride-kyoto','town-kyoto'].includes(activePlanId);
    // Default day depends on Japan date. Don't close a day the user
    // explicitly opened unless the local calendar day actually changes.
    const today=NS.localDate();
    if(!kyotoOverview.hidden&&lastOverviewDay!==today){
      const suggested=NS.todaySuggestion();
      if(suggested?.planId==='town-kyoto'||suggested?.planId==='ride-kyoto')
        focusKyotoOverviewDay(suggested.dayIndex);
      lastOverviewDay=today;
    }
    const future=MD.days('town-kyoto').slice(2);
    const planned=Object.values(cityDayAssignments).some(day=>future.includes(day));
    kyotoOverview.querySelector('.kyoto-plan-note').textContent=planned
      ?'03.–06.11.: Der bestätigte wetteroptimierte Plan ist in der Tagesauswahl und den Tagesabläufen hinterlegt. Nara und Osaka sind Tagesausflüge per Bahn, nicht reine Fußrundgänge. 07.11.: Weiterreise im Abschnitt „Fahrt Kyoto → Nikkō“.'
      :'03.–06.11.: Noch keine verbindlichen Stadttage. In der Tagesauswahl unterhalb der Karte kannst du Ziele zuordnen. 07.11.: Weiterreise im Abschnitt „Fahrt Kyoto → Nikkō“.';
    renderNikkoOverview();
    renderTodayDashboard();
  }
  const todayPanel=$('today-panel');
  function renderTodayDashboard(){
    const suggestion=NS.todaySuggestion();
    todayPanel.hidden=activePlanId==='town-kyoto';
    const date=NS.localDate(),text=date.slice(8,10)+'.'+date.slice(5,7)+'.'+date.slice(0,4);
    $('today-date').textContent=text;
    $('today-title').textContent=suggestion?suggestion.title:'Kein fester Tagesplan hinterlegt';
    $('today-summary').textContent=suggestion?suggestion.summary:
      'Wähle deinen gewünschten Reiseabschnitt manuell aus.';
    $('today-hint').textContent=suggestion?suggestion.hint:
      'Für diesen Tag sind keine konkreten Reiseabschnitte bestätigt.';
    $('today-open').hidden=!suggestion;
    $('today-view-note').textContent=suggestion
      ?(suggestion.planId===activePlanId
        ?'Passender Reiseabschnitt ausgewählt · Tagesplan öffnen'
        :'Vorschlag · deine aktuelle Auswahl bleibt erhalten')
      :'Alle gespeicherten Reiseabschnitte sind weiterhin verfügbar.';
  }
  function openTodayPlan(){
    const suggestion=NS.todaySuggestion();
    if(!suggestion){todayPanel.scrollIntoView({behavior:'smooth',block:'start'});return;}
    if(activePlanId!==suggestion.planId)
      selectPlan(suggestion.planId,{focus:false});
    if(suggestion.planId==='town-kyoto'||suggestion.planId==='ride-kyoto'){
      const today=NS.localDate();
      if(suggestion.planId==='town-kyoto'&&MD.days('town-kyoto').includes(today))
        selectCityDay(today);
      focusKyotoOverviewDay(suggestion.dayIndex);
      kyotoOverview.scrollIntoView({behavior:'smooth',block:'start'});
    }else if(suggestion.planId==='ride-nikko'||suggestion.planId==='town-nikko'){
      renderNikkoOverview();
      nikkoOverview.scrollIntoView({behavior:'smooth',block:'start'});
    }else{
      $('map').scrollIntoView({behavior:'smooth',block:'start'});
    }
    renderTodayDashboard();
  }
  $('today-open').onclick=openTodayPlan;
  // The Kyoto recap offers a deliberate jump to the next journey, not an automatic redirect.
  $('open-nikko-next').onclick=()=>{
    if(!selectPlan('ride-nikko'))return;
    nikkoOverview.scrollIntoView({behavior:'smooth',block:'start'});
  };
  $('quick-today').onclick=openTodayPlan;
  $('quick-map').onclick=()=>{
    $('map').scrollIntoView({behavior:'smooth',block:'start'});
  };
  $('quick-tickets').onclick=()=>{
    const shelf=$('ticket-vault');
    shelf.open=true;
    shelf.scrollIntoView({behavior:'smooth',block:'start'});
  };
  // No automatic change of an explicitly selected view while using the app.
  // Resume merely refreshes the date suggestion and day headings.
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)renderKyotoOverview();
  });
  window.addEventListener('focus',renderKyotoOverview);
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
  const ngKyotoTrigger=$('nagoya-kyoto-guide-trigger');
  function updateNagoyaTrigger() {
    const nearNagoya=map.getZoom()>=15&&map.getBounds().contains(nagoya);
    const legacy=activePlanId==='ride-takayama'&&journey?.date==='30.10.2026'&&
      journey.stops.some(s=>s.name==='Nagoya'&&s.departure==='11:43');
    const kyoto=activePlanId==='ride-kyoto'&&C.isNagoyaKyotoTrip(journey);
    // Only one direction-specific guide may be offered on the map.
    ngTrigger.hidden=!legacy||!nearNagoya;
    ngKyotoTrigger.hidden=!kyoto||!nearNagoya;
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
      focusMapPoint(nagoya,16.75);
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
  // 01.11.2026: dedicated JR-to-Shinkansen guide, kept completely separate
  // from the historical Hikari-to-Hida guide and its stored progress.
  const ngKyoto=C.stationGuides.nagoyaKyoto;
  const ngKyotoDialog=$('nagoya-kyoto-dialog');
  let ngKyotoStep=0;
  function renderNagoyaKyotoStep(){
    const step=ngKyoto.steps[ngKyotoStep];
    $('nagoya-kyoto-progress').textContent='Schritt '+(ngKyotoStep+1)+' von '+ngKyoto.steps.length;
    $('nagoya-kyoto-floor').textContent=step.level;
    $('nagoya-kyoto-step-title').textContent=step.title;
    $('nagoya-kyoto-step-action').textContent=step.action;
    $('nagoya-kyoto-sign').textContent=step.sign;
    $('nagoya-kyoto-step-caution').textContent=step.caution;
    $('nagoya-kyoto-prev').disabled=ngKyotoStep===0;
    $('nagoya-kyoto-next').textContent=ngKyotoStep===ngKyoto.steps.length-1?'Fertig':'Nächster Schritt';
  }
  function openNagoyaKyotoGuide(){
    if(activePlanId!=='ride-kyoto'||!C.isNagoyaKyotoTrip(journey)){
      say('Der Zugplan wurde geändert. Bitte erst die aktuelle Verbindung prüfen.');
      return;
    }
    ngKyotoStep=0;
    renderNagoyaKyotoStep();
    if(!ngKyotoDialog.open)ngKyotoDialog.showModal();
  }
  ngKyotoTrigger.onclick=openNagoyaKyotoGuide;
  $('nagoya-kyoto-close').onclick=()=>ngKyotoDialog.close();
  $('nagoya-kyoto-prev').onclick=()=>{
    ngKyotoStep=Math.max(0,ngKyotoStep-1);
    renderNagoyaKyotoStep();
  };
  $('nagoya-kyoto-next').onclick=()=>{
    if(ngKyotoStep===ngKyoto.steps.length-1){ngKyotoDialog.close();return;}
    ngKyotoStep++;
    renderNagoyaKyotoStep();
  };
  map.on('moveend zoomend',updateNagoyaTrigger);
  function fitJourney() {
    if (!journey) return;
    const coords = journey.stops.flatMap(stop => [[stop.lat,stop.lng], ...stop.via]);
    if (coords.length) fitMapArea(coords,{padding:[38,38],maxZoom:13});
  }
  const ticketSymbols={unknown:'❗',missing:'⛔',booked:'◔',ready:'✓'};
  const kyotoRailInfographic=$('kyoto-rail-infographic');
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
          ?C.presetJourney('hakone-takayama-2026-10-30')
          :plan.id==='ride-kyoto'
            ?C.presetJourney('takayama-kyoto-2026-11-01'):null;
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
        :update.plan==='ride-takayama'?C.presetJourney('hakone-takayama-2026-10-30')
        :update.plan==='ride-kyoto'?C.presetJourney('takayama-kyoto-2026-11-01'):null;
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
        : update.plan==='ride-takayama' ? C.presetJourney('hakone-takayama-2026-10-30')
        : update.plan==='ride-kyoto' ? C.presetJourney('takayama-kyoto-2026-11-01') : null;
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
  // Infographic uses a simple travel-progress surface while preserving the
  // four existing ticket-readiness states and their encrypted-sync semantics.
  function railLegStage(planId,trip,index){
    const key=C.ticketLegKey(planId,trip,index);
    if(tripStageDone[key]===true)return 'done';
    return ['booked','ready'].includes(ticketStatusFor(planId,trip,index))?'booked':'planned';
  }
  function setRailLegStage(planId,trip,index,stage){
    if(!['planned','booked','done'].includes(stage))return false;
    const key=C.ticketLegKey(planId,trip,index);
    if(stage!=='done'){
      const ticketState=ticketStatusFor(planId,trip,index);
      // A confirmed Klook booking must never be erased by moving a travel
      // phase back to "Geplant". Ticket proof and journey progress are separate.
      if(stage==='planned'&&['booked','ready'].includes(ticketState)){
        say('Diese Fahrt ist bereits gebucht. „Geplant“ würde die bestätigte Buchung fälschlich zurücksetzen.');
        return false;
      }
      if(stage==='booked'&&!['booked','ready'].includes(ticketState)&&
         !saveTicketStatus(planId,trip,index,'booked'))return false;
    }
    const next={...tripStageDone};
    if(stage==='done')next[key]=true;
    else delete next[key];
    try{
      localStorage.setItem('livekarte-trip-progress-v1',JSON.stringify(next));
      // Never use the completed-trip indicator as evidence of a booked ticket.
      if(stage==='done')tripStageDone[key]=true;
      else delete tripStageDone[key];
      renderJourney();
      return true;
    }catch{
      say('Reisestatus konnte nicht gespeichert werden. Bitte Browserspeicher prüfen.');
      return false;
    }
  }
  function renderKyotoRailInfographic(){
    const visible=activePlanId==='ride-kyoto'&&!!journey;
    kyotoRailInfographic.hidden=!visible;
    kyotoRailInfographic.replaceChildren();
    if(!visible)return;
    const trip=journey,stops=trip.stops;
    const title=node('div',undefined,'kyoto-rail-heading');
    title.append(node('span','🚄 DEINE ZUGREISE · 01.11.2026','kyoto-eyebrow'));
    title.append(node('h2','Takayama → Kyoto'));
    title.append(node('p',kyotoPickupDone?'Klook-Buchung bestätigt · Papiertickets abgeholt.':'Klook-Buchung bestätigt · Papiertickets vor Abfahrt abholen.','kyoto-rail-subtitle'));
    kyotoRailInfographic.append(title);
    const booking=node('div',undefined,'kyoto-booking-card');
    booking.append(
      node('strong','✅ Buchung: beide Zugabschnitte bestätigt','kyoto-booking-title'),
      node('span',kyotoPickupDone
        ?'✅ Papiertickets: abgeholt (von dir bestätigt)'
        :'⚠ Papiertickets: noch am Bahnhof Takayama abholen','kyoto-booking-row kyoto-booking-pickup-state'),
      node('span',kyotoPickupDone?'✓ QR-Abholung abgeschlossen. Original-Papiertickets für beide Züge aufbewahren.':'🎟 Klook-QR-Code nach der Anleitung auf dem Voucher am geeigneten Automaten oder am JR-Ticketschalter verwenden.','kyoto-booking-row'),
      node('span','🚆 Hida 8 · Wagen 2 · Sitze 10C + 10D','kyoto-booking-row'),
      node('span','🚄 Nozomi 71 · Wagen 4 · Sitze 8D + 8E','kyoto-booking-row'),
      node('span','🧳 Koffer unter 160 cm Gesamtmaß · keine Übergepäckreservierung nötig','kyoto-booking-row')
    );
    const pickupLink=node('button',kyotoPickupDone?'✓ Abholbestätigung ansehen':'☑ Ticketabholung – Anleitung ansehen',
      'kyoto-booking-guide');
    pickupLink.type='button';
    pickupLink.onclick=()=>{
      const details=$('kyoto-pickup-steps-details');
      if(details&&!kyotoPickupDone)details.open=true;
      revealKyotoPickupHistory();
      $('kyoto-pickup').scrollIntoView({behavior:'smooth',block:'start'});
    };
    booking.append(pickupLink);
    if(C.isNagoyaKyotoTrip(trip)){
      const seatsButton=node('button','🧾 Beide Reisenden · Sitzplätze kontrollieren',
        'kyoto-booking-guide kyoto-seat-launch');
      seatsButton.type='button';
      seatsButton.onclick=()=>{
        const check=$('kyoto-seat-check');
        revealKyotoPickupHistory();
        check.open=true;
        check.scrollIntoView({behavior:'smooth',block:'start'});
      };
      booking.append(seatsButton);
    }
    if(canShowRailPlanB()){
      const planBButton=node('button','🆘 Plan B: Zugproblem oder Anschluss verpasst',
        'kyoto-booking-guide kyoto-planb-launch');
      planBButton.type='button';
      planBButton.onclick=()=>openTrainPlanB();
      booking.append(planBButton);
    }
    kyotoRailInfographic.append(booking);
    if(stops.length<2)return;
    const last=stops[stops.length-1],first=stops[0];
    const kpis=node('div',undefined,'kyoto-kpis');
    const minutes=t=>{
      if(!t)return null;
      const [hours,mins]=t.split(':').map(Number);
      return hours*60+mins;
    };
    const departure=minutes(first.departure),arrival=minutes(last.arrival);
    const total=departure!==null&&arrival!==null?(arrival-departure+1440)%1440:null;
    const stats=[
      [total===null?'–':Math.floor(total/60)+' h '+String(total%60).padStart(2,'0')+' m','Gesamtzeit'],
      [String(Math.max(0,stops.length-2)),'Umstieg'],
      [last.arrival||'–','Ankunft']
    ];
    for(const [value,label] of stats){
      const stat=node('div',undefined,'kyoto-kpi');
      stat.append(node('strong',value),node('small',label));
      kpis.append(stat);
    }
    kyotoRailInfographic.append(kpis);
    const line=node('div',undefined,'kyoto-rail-line');
    const origin=node('div',undefined,'kyoto-rail-station');
    origin.append(node('span',first.departure||'–','kyoto-rail-time'));
    const originBody=node('div',undefined,'kyoto-rail-stop-body');
    originBody.append(node('strong',first.name+' Station (Bahnhof)'),
      node('small','Abfahrt · vor dem Einstieg Papier-Tickets per Klook-QR-Code abholen'));
    origin.append(originBody);
    line.append(origin);
    for(let i=0;i<stops.length-1;i++){
      const from=stops[i],to=stops[i+1];
      const state=railLegStage(activePlanId,trip,i);
      const ticketState=ticketStatusFor(activePlanId,trip,i);
      const leg=node('div',undefined,'kyoto-rail-leg kyoto-rail-leg-'+state);
      const detail=node('div',undefined,'kyoto-rail-leg-header');
      detail.append(node('span',i===0?'🚆':'🚄','kyoto-train-icon'));
      const main=node('div',undefined,'kyoto-rail-leg-name');
      main.append(node('strong',i===0?'Limited Express Hida 8':'Shinkansen Nozomi 71'));
      main.append(node('small',(from.departure||'–')+'–'+(to.arrival||'–')+' · '+from.name+' → '+to.name));
      main.append(node('small',i===0
        ?'Wagen 2 · Sitze 10C + 10D · Ankunft Nagoya: Gleis 4'
        :'Ab Nagoya: Gleis 17 · Wagen 4 · Sitze 8D + 8E · Ankunft Kyoto: Gleis 13',
        'kyoto-booking-meta'));
      detail.append(main);
      const status=node('span',state==='done'?'✓ Erledigt':state==='booked'?'◔ Gebucht':'○ Geplant','kyoto-phase-badge');
      detail.append(status);
      leg.append(detail);
      const statusLabel=node('div','Reisephase selbst festlegen','kyoto-phase-caption');
      const stageButtons=node('div',undefined,'kyoto-stage-buttons');
      stageButtons.setAttribute('role','group');
      stageButtons.setAttribute('aria-label','Reisephase '+from.name+' nach '+to.name);
      const choices=[['planned','Geplant'],['booked','Gebucht'],['done','Erledigt']];
      for(const [value,label] of choices){
        const button=node('button',label,'kyoto-stage-button');
        button.type='button';
        button.setAttribute('aria-pressed',String(state===value));
        button.classList.toggle('is-active',state===value);
        button.onclick=()=>{
          if(value!==state){
            setRailLegStage(activePlanId,trip,i,value);
          }
        };
        stageButtons.append(button);
      }
      leg.append(statusLabel,stageButtons);
      if(state==='done'){
        leg.append(node('small','Fahrt manuell als abgeschlossen markiert – kein Ticketnachweis.','kyoto-ticket-caveat'));
      }
      const details=node('details',undefined,'kyoto-ticket-details');
      details.append(node('summary','🎟 Ticketdetails · '+C.ticketStates[ticketState]));
      const wrap=node('div',undefined,'kyoto-ticket-detail-body');
      const ticketLabel=node('label','Status der Fahrkarte: ','kyoto-ticket-label');
      const picker=node('select',undefined,'kyoto-ticket-picker');
      picker.setAttribute('aria-label','Ticketstatus '+from.name+' nach '+to.name);
      for(const [key,label] of Object.entries(C.ticketStates)){
        const option=node('option',ticketSymbols[key]+' '+label);
        option.value=key;picker.append(option);
      }
      picker.value=ticketState;
      picker.onchange=()=>{
        if(saveTicketStatus(activePlanId,trip,i,picker.value)){
          renderJourney();
          say('Ticketstatus aktualisiert: '+from.name+' → '+to.name);
        }else picker.value=ticketState;
      };
      ticketLabel.append(picker);
      wrap.append(ticketLabel,node('small','Diese Angabe stammt aus deiner Eingabe oder der optionalen Synchronisierung, nicht aus einer Buchungsprüfung.'));
      details.append(wrap);leg.append(details);
      line.append(leg);
      if(i<stops.length-2){
        const transfer=node('div',undefined,'kyoto-rail-transfer');
        const toNext=stops[i+1].departure;
        const arriving=to.arrival;
        const diff=minutes(toNext)!==null&&minutes(arriving)!==null
          ?(minutes(toNext)-minutes(arriving)+1440)%1440:null;
        transfer.append(node('span','🔄','kyoto-transfer-icon'));
        const transferText=node('div');
        transferText.append(node('strong','Umstieg in '+to.name+' Station (Bahnhof)'));
        transferText.append(node('small',(diff===null?'Zeit vor Ort prüfen':diff+' Min. Umsteigezeit')+
          ' · Gleis 4 → Gleis 17 · Bahnhofsanzeige vor Ort hat Vorrang'));
        if(C.isNagoyaKyotoTrip(trip)){
          const guide=node('button','🚄 Umstieg Schritt für Schritt','kyoto-transfer-guide');
          guide.type='button';
          guide.onclick=openNagoyaKyotoGuide;
          transferText.append(guide);
        }
        transfer.append(transferText);
        line.append(transfer);
      }
    }
    const final=node('div',undefined,'kyoto-rail-station kyoto-rail-destination');
    final.append(node('span',last.arrival||'–','kyoto-rail-time'));
    const lastBody=node('div',undefined,'kyoto-rail-stop-body');
    lastBody.append(node('strong',last.name+' (Bahnhof)'),
      node('small','Ankunft laut Buchung: Gleis 13 · danach Taxi oder Karasuma-Linie zum Hotel'));
    final.append(lastBody);line.append(final);
    kyotoRailInfographic.append(line);
    const hotelTransfer=node('div',undefined,'kyoto-booking-card');
    hotelTransfer.append(
      node('strong','🏨 Kyoto Station (Bahnhof) → Tomoya Residence','kyoto-booking-title'),
      node('span','🚕 Taxi · ca. 15–20 Min. · Hotel ca. 15:15–15:20','kyoto-booking-row'),
      node('span','🚇 Karasuma Line (U-Bahn-Linie) bis Karasuma Oike Station (U-Bahn-Station) · Fahrt ca. 5 Min. · danach ca. 7 Min. zu Fuß · Hotel ca. 15:25–15:35','kyoto-booking-row')
    );
    const hotelJapanese=japaneseButton({
      name:'Tomoya Residence Hotel Kyoto Nijo Takakura',
      lat:35.0137,lng:135.76181
    });
    if(hotelJapanese)hotelTransfer.append(hotelJapanese);
    kyotoRailInfographic.append(hotelTransfer);
    const unknown=stops.slice(0,-1).filter((_,i)=>!['booked','ready'].includes(ticketStatusFor(activePlanId,trip,i))).length;
    kyotoRailInfographic.append(node('p',kyotoPickupDone
      ?'✅ Papier-Tickets laut deiner eigenen Bestätigung abgeholt. Beide Zugtickets als „Vorhanden“ gespeichert.'
      :unknown
        ?'🎟 Für '+unknown+' von '+(stops.length-1)+' Strecken ist der bestätigte Buchungsstatus lokal noch nicht übernommen. Papiertickets bitte separat prüfen.'
        :'⚠ Buchung für beide Teilstrecken bestätigt, aber die Papiertickets noch nicht abgeholt. Bitte vor der Abfahrt in Takayama erledigen.',
      'kyoto-rail-footnote'));
    kyotoRailInfographic.append(node('small','„Erledigt“ beschreibt nur die durch dich bestätigte Fahrt. Die Ticketdetails bleiben separat und können über die verschlüsselte Synchronisierung aktualisiert werden.','kyoto-rail-disclaimer'));
  }
  // Explicit departure action shared by Takayama city and Kyoto travel views.
  // No QR/booking code is stored or transmitted; only a local boolean and
  // ticket-status readiness after the traveller confirms all paper tickets.
  const kyotoPickupPanel=$('kyoto-pickup');
  const kyotoPickupConfirm=$('kyoto-pickup-confirm');
  const kyotoPickupFeedback=$('kyoto-pickup-feedback');
  // Plan B is based on the existing, exact journey and never authorizes
  // a different train or new ticket. Separate from ticket-pickup confirmation.
  const trainPlanBDialog=$('train-planb-dialog');
  const trainPlanBButtons=[...trainPlanBDialog.querySelectorAll('[data-train-planb]')];
  const trainPlanBDelay=$('train-planb-delay-minutes');
  const trainPlanBFeedback=$('train-planb-feedback');
  let trainPlanBKind='delay';
  function canShowRailPlanB(){
    if(!['town-takayama','ride-kyoto'].includes(activePlanId)||
       NS.localDate()!=='2026-11-01')return false;
    const trip=Object.hasOwn(planJourneys,'ride-kyoto')
      ?planJourneys['ride-kyoto']
      :C.presetJourney('takayama-kyoto-2026-11-01');
    return C.isNagoyaKyotoTrip(trip);
  }
  function renderTrainPlanB(){
    const advice=NS.trainProblem(trainPlanBKind,trainPlanBDelay.value);
    trainPlanBButtons.forEach(button=>
      button.setAttribute('aria-pressed',String(button.dataset.trainPlanb===trainPlanBKind)));
    $('train-planb-delay').hidden=trainPlanBKind!=='delay';
    $('train-planb-margin').textContent=advice.marginText;
    $('train-planb-action-title').textContent='Was jetzt tun? · '+advice.title;
    const list=$('train-planb-steps');
    list.replaceChildren();
    advice.steps.forEach(instruction=>list.append(node('li',instruction)));
    $('train-planb-jp').textContent=advice.japanese;
  }
  function openTrainPlanB(kind='delay'){
    if(!canShowRailPlanB()){
      say('Plan B ist nur für die unveränderte Kyoto-Zugreise am 01.11. verfügbar.');
      return;
    }
    trainPlanBKind=kind;
    trainPlanBDelay.value='';
    trainPlanBFeedback.textContent='';
    renderTrainPlanB();
    if(!trainPlanBDialog.open)trainPlanBDialog.showModal();
  }
  trainPlanBButtons.forEach(button=>{
    button.onclick=()=>{
      trainPlanBKind=button.dataset.trainPlanb;
      trainPlanBFeedback.textContent='';
      renderTrainPlanB();
    };
  });
  trainPlanBDelay.addEventListener('input',renderTrainPlanB);
  $('train-planb-close').onclick=()=>trainPlanBDialog.close();
  trainPlanBDialog.addEventListener('close',()=>{
    trainPlanBFeedback.textContent='';
  });
  $('train-planb-copy').onclick=async()=>{
    const japanese=NS.trainProblem(trainPlanBKind,trainPlanBDelay.value).japanese;
    try{
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(japanese);
      trainPlanBFeedback.textContent='✓ Japanische Nachricht kopiert.';
    }catch{
      trainPlanBFeedback.textContent='Kopieren nicht möglich. Japanischen Text direkt dem Personal zeigen.';
    }
  };
  nextActionPlanB.onclick=()=>openTrainPlanB();
  $('kyoto-pickup-planb').onclick=()=>openTrainPlanB();
  const ticketHelpButton=$('kyoto-pickup-help');
  const ticketHelpDialog=$('ticket-help-dialog');
  const ticketHelpFeedback=$('ticket-help-feedback');
  // This static Japanese card must only describe the unchanged, confirmed
  // 01.11. train itinerary. Never cache or display any Klook QR or booking ID.
  function canShowTicketHelp(){
    const trip=Object.hasOwn(planJourneys,'ride-kyoto')
      ?planJourneys['ride-kyoto']
      :C.presetJourney('takayama-kyoto-2026-11-01');
    return C.isNagoyaKyotoTrip(trip);
  }
  ticketHelpButton.onclick=()=>{
    if(!canShowTicketHelp()){
      kyotoPickupFeedback.textContent='Reiseplan verändert. Bitte die Klook-Buchung zuerst abgleichen.';
      return;
    }
    ticketHelpFeedback.textContent='';
    if(!ticketHelpDialog.open)ticketHelpDialog.showModal();
  };
  $('ticket-help-close').onclick=()=>ticketHelpDialog.close();
  ticketHelpDialog.addEventListener('close',()=>{ticketHelpFeedback.textContent='';});
  $('ticket-help-copy').onclick=async()=>{
    const text=[...ticketHelpDialog.querySelectorAll('.ticket-help-jp p')]
      .map(p=>p.textContent.trim()).join('\n');
    try{
      if(!navigator.clipboard?.writeText)throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(text);
      ticketHelpFeedback.textContent='✓ Japanischer Text kopiert.';
    }catch{
      ticketHelpFeedback.textContent='Kopieren nicht verfügbar. Den japanischen Text lange drücken und markieren.';
    }
  };
  function renderKyotoDepartureClock(){
    // Updating only these text fields avoids rebuilding the journey/markers
    // each minute. No GPS read, booking lookup, network call or auto-complete.
    if(kyotoPickupPanel.hidden)return;
    const state=NS.kyotoDepartureClock();
    const panel=$('kyoto-departure-clock');
    const label=$('kyoto-clock-label'),value=$('kyoto-clock-value'),note=$('kyoto-clock-note');
    panel.classList.toggle('is-urgent',state.phase==='station-window'&&!kyotoPickupDone);
    if(state.phase==='future'){
      label.textContent='🕒 VOR DEM REISETAG';
      value.textContent='Hida 8 · 01.11.2026 · 11:35 Uhr';
      note.textContent='Bahnhof Takayama möglichst gegen 10:45 Uhr erreichen. Planzeiten, nicht live.';
    }else if(state.phase==='before-station'){
      label.textContent=kyotoPickupDone?'🕒 BIS ZUR ZUGABFAHRT':'🕒 BIS ZUR EMPFOHLENEN BAHNHOFSANKUNFT';
      value.textContent=kyotoPickupDone
        ?'Noch '+state.minutesToTrain+' Min. · Hida 8 um 11:35'
        :'Noch '+state.minutesToStation+' Min. · Ziel: 10:45 Uhr';
      note.textContent=kyotoPickupDone
        ?'Papiertickets bereithalten. Abfahrt um 11:35 Uhr laut Buchung.'
        :'Papiertickets für beide Personen abholen. Hida 8 fährt planmäßig 11:35 Uhr.';
    }else if(state.phase==='station-window'){
      label.textContent=kyotoPickupDone?'🕒 ABFAHRT NÄHERT SICH':'⚠ JETZT ZUM BAHNHOF / TICKETSCHALTER';
      value.textContent='Noch '+state.minutesToTrain+' Min. · Hida 8 um 11:35';
      note.textContent=kyotoPickupDone
        ?'Zum richtigen Gleis gehen; Bahnhofsanzeigen haben Vorrang.'
        :'Ticketabholung und Gleis prüfen. Die Abfahrt ist nur eine Planzeit.';
    }else if(state.phase==='departed'){
      label.textContent='⚠ PLANABFAHRT WAR UM 11:35';
      value.textContent='Die geplante Abfahrtszeit ist vorbei.';
      note.textContent='Keine Live-Auskunft: Falls du den Zug nicht genommen hast, JR-Personal fragen.';
    }else{
      label.textContent='🕒 REISETAG VOM 01.11.';
      value.textContent='Die geplante Fahrt liegt zurück.';
      note.textContent='Die Anzeige enthält keine aktuelle Zugverbindung.';
    }
  }
  // Recheck the Japan-local clock while the view is open; never mark tasks
  // done just because their planned time passes.
  setInterval(renderKyotoDepartureClock,60000);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)renderKyotoDepartureClock();
  });
  window.addEventListener('focus',renderKyotoDepartureClock);
  const kyotoSeatInputs=[...document.querySelectorAll('#kyoto-seat-check [data-kyoto-seat]')];
  function renderKyotoSeatCheck(){
    // Four explicit visual checks; never treat these as issued or valid tickets.
    const count=kyotoSeatInputs.filter(input=>input.checked).length;
    $('kyoto-seat-progress').textContent=count+'/4 geprüft';
    $('kyoto-seat-feedback').textContent=count===4
      ?'✓ Alle vier Sitzplatzangaben manuell kontrolliert. Die gesonderte Abholbestätigung bleibt erforderlich.'
      :count===0
        ?'Noch keine Angaben als kontrolliert markiert.'
        :count+'/4 Sitzplatzangaben kontrolliert. Die übrigen Unterlagen prüfen.';
    $('kyoto-seat-check').classList.toggle('is-checked',count===4);
  }
  kyotoSeatInputs.forEach(input=>input.addEventListener('change',renderKyotoSeatCheck));
  function renderKyotoPickup(){
    renderKyotoSeatCheck();
    kyotoPickupPanel.hidden=!['town-takayama','ride-kyoto'].includes(activePlanId);
    kyotoPickupPanel.classList.toggle('is-complete',kyotoPickupDone);
    const phase=NS.kyotoDepartureClock().phase;
    const archived=kyotoPickupDone&&(phase==='departed'||phase==='past');
    const toggle=$('kyoto-pickup-history-toggle');
    toggle.hidden=!archived;
    toggle.textContent=kyotoPickupHistoryExpanded?'✓ Details wieder einklappen':'✓ Abholung erledigt · Details anzeigen';
    toggle.setAttribute('aria-expanded',String(archived&&kyotoPickupHistoryExpanded));
    $('kyoto-pickup-body').hidden=archived&&!kyotoPickupHistoryExpanded;
    kyotoPickupPanel.classList.toggle('is-archived',archived);
    $('kyoto-pickup-title').textContent=archived
      ?'Papiertickets abgeholt · abgeschlossen'
      :'Klook-Tickets in Takayama abholen';
    const eyebrow=kyotoPickupPanel.querySelector('.kyoto-pickup-eyebrow');
    eyebrow.textContent=archived?'✓ ERLEDIGT · 01.11.2026':'⚠ VOR DER ABFAHRT · SO. 01.11.';
    ticketHelpButton.hidden=kyotoPickupDone||!canShowTicketHelp();
    renderKyotoDepartureClock();
    $('kyoto-pickup-planb').hidden=!canShowRailPlanB();
    $('kyoto-pickup-state').textContent=kyotoPickupDone
      ?'✅ Papiertickets: abgeholt (selbst bestätigt)'
      :'⚠ Papiertickets: noch abholen';
    kyotoPickupConfirm.disabled=kyotoPickupDone;
    kyotoPickupConfirm.textContent=kyotoPickupDone
      ?'✓ Papier-Tickets für beide Züge abgeholt'
      :'✓ Beide Teilstrecken: Tickets abgeholt';
    kyotoPickupFeedback.textContent=kyotoPickupDone
      ?'Abholung auf diesem Gerät als erledigt gespeichert. Beide Zugtickets als vorhanden markiert.'
      :'Noch offen: Abholung der Papier-Tickets vor der Abfahrt um 11:35.';
    $('kyoto-pickup-subtitle').textContent=kyotoPickupDone
      ?'Erledigt: Abholung bestätigt. Bitte die Tickets für beide Personen mitnehmen.'
      :'Klook-Buchung bestätigt · die Papiertickets müssen vor der Fahrt abgeholt werden.';
  }
  let kyotoPickupHistoryExpanded=false;
  function revealKyotoPickupHistory(){
    kyotoPickupHistoryExpanded=true;
    $('kyoto-pickup-body').hidden=false;
    $('kyoto-pickup-history-toggle').textContent='✓ Details wieder einklappen';
    $('kyoto-pickup-history-toggle').setAttribute('aria-expanded','true');
  }
  $('kyoto-pickup-history-toggle').onclick=()=>{
    kyotoPickupHistoryExpanded=!kyotoPickupHistoryExpanded;
    renderKyotoPickup();
  };
  kyotoPickupConfirm.onclick=()=>{
    if(kyotoPickupDone)return;
    if(!confirm('Sind alle Papiertickets für beide Personen UND für Hida 8 und Nozomi 71 tatsächlich abgeholt und kontrolliert?'))return;
    const trip=Object.hasOwn(planJourneys,'ride-kyoto')
      ?planJourneys['ride-kyoto']
      :C.presetJourney('takayama-kyoto-2026-11-01');
    const expected=[['Takayama','11:35','Nagoya'],['Nagoya','14:26','Kyoto Station']];
    const indices=expected.map(([from,departure,to])=>trip?.stops?.findIndex((stop,i)=>
      i<trip.stops.length-1&&stop.name===from&&stop.departure===departure&&
      trip.stops[i+1].name===to));
    if(indices.some(index=>index<0||!Number.isInteger(index))){
      kyotoPickupFeedback.textContent='Die Zugverbindung wurde verändert. Bitte erst die aktuelle Klook-Buchung abgleichen.';
      return;
    }
    const previousTicketData=localStorage.getItem('livekarte-ticket-status-v1');
    const nextTickets={...ticketStatuses};
    const now=Date.now();
    for(const index of indices){
      const key=C.ticketLegKey('ride-kyoto',trip,index);
      nextTickets[key]={status:'ready',source:'manual',updatedAt:now};
    }
    try{
      localStorage.setItem('livekarte-ticket-status-v1',JSON.stringify(nextTickets));
      localStorage.setItem('livekarte-kyoto-qr-pickedup-v1','1');
    }catch{
      try{
        if(previousTicketData===null)localStorage.removeItem('livekarte-ticket-status-v1');
        else localStorage.setItem('livekarte-ticket-status-v1',previousTicketData);
      }catch{}
      kyotoPickupFeedback.textContent='Konnte die Bestätigung nicht speichern. Bitte freien Browserspeicher prüfen.';
      return;
    }
    ticketStatuses=nextTickets;
    kyotoPickupDone=true;
    window.dispatchEvent(new Event('livekarte:ticket-updated'));
    renderJourney();
    say('✓ Beide Klook-Ticketstrecken als abgeholt und vorhanden markiert.');
  };
  function renderJourney() {
    renderKyotoPickup();
    renderNextAction();
    journeyLayer.clearLayers();
    const panel = $('journey-panel'), info = $('journey-info');
    info.replaceChildren();
    panel.hidden = !journey || activePlanId==='ride-kyoto';
    if (!journey) { renderKyotoRailInfographic();updateStationTransfer(); updateNagoyaTrigger(); return; }
    const railView=RM.rail(journey);
    info.append(node('h2',journey.title),node('p',journey.date + ' · Alle Zeiten Ortszeit Japan','journey-date'));
    const totalLegs=railView.segments.length;
    const unresolved=journey.stops.slice(0,-1).filter((_,i)=>ticketStatusFor(activePlanId,journey,i)!=='ready').length;
    const summary=node('div',unresolved
      ? '❗ '+unresolved+' von '+totalLegs+' Fahrtickets noch nicht als vollständig bestätigt'
      : '✓ Alle '+totalLegs+' Fahrtickets als vorhanden markiert',
      'ticket-summary'+(unresolved?' ticket-summary-warn':' ticket-summary-ready'));
    info.append(summary);
    journey.stops.forEach((stop,i) => {
      if (i < railView.segments.length) {
        const segment=railView.segments[i];
        L.polyline(segment.points,railView.style).addTo(journeyLayer);
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
        const addTicket=node('button',
          '📷 Ticket / Abholinfo'+railTicketUI.summary(activePlanId,journey,i),
          'rail-leg-ticket-button');
        addTicket.type='button';
        addTicket.setAttribute('aria-label','Ticket hinzufügen, fotografieren oder Abholhinweise bearbeiten für '+
          stop.name+' nach '+journey.stops[i+1].name);
        addTicket.onclick=e=>{
          e.stopPropagation();
          void railTicketUI.open(activePlanId,journey,i).catch(error=>
            say('Ticketfenster konnte nicht geöffnet werden: '+error.message));
        };
        item.append(addTicket);
      }
      info.append(item);
      const popup = node('div');
      popup.append(node('strong',(i+1)+'. '+stop.name),node('p',times),node('p',stop.description),node('p',stop.leg ? 'Weiter: '+stop.leg : 'Ankunft'));
      // Use DOM text nodes, not HTML interpolation, for untrusted station names.
      const label = node('div',undefined,'trip-marker'+(i===1?' trip-marker-alt trip-hakone-yumoto':''));
      label.append(node('span',String(i+1),'trip-number'),node('span',stop.name,'trip-marker-name'));
      const marker = L.marker([stop.lat,stop.lng],{zIndexOffset:500,icon:L.divIcon({
        className:'trip-pin',html:label,iconSize:[30,30],iconAnchor:[15,15]
      })});
      bindMapPopup(marker,popup);
      marker.addTo(journeyLayer);
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
          transferDismissed = false;
          marker.closePopup();
          focusMapPoint([stop.lat,stop.lng],18.25);
          updateStationTransfer();
        };
        popup.append(details);
      }
      item.addEventListener('click',()=>{
        if (stop.name === 'Hakone-Yumoto') {
          transferDismissed=false;
          focusMapPoint([stop.lat,stop.lng],18.25);
          updateStationTransfer();
        } else { focusMapPoint([stop.lat,stop.lng],14); marker.openPopup(); }
      });
    });
    info.append(node('p','Gestrichelte Linien verbinden Stationen nur schematisch – nicht entlang der tatsächlichen Gleise. Fahrpläne vor Abfahrt nochmals prüfen.','journey-warning'));
    renderKyotoRailInfographic();
    updateStationTransfer();
    updateNagoyaTrigger();
  }
  // Display verified travel-section dates already present in preset labels;
  // custom sections keep their user-entered names and never gain invented dates.
  function planPickerLabel(plan){
    if(!C.planPresets.some(p=>p.id===plan.id))return {name:plan.name,period:''};
    const match=/^((?:ab\s+)?\d{2}\.(?:\d{2}\.)?(?:[–-]\d{2}\.\d{2}\.)?)\s*·\s*(.+)$/.exec(plan.name);
    return match?{period:match[1],name:match[2]}:{name:plan.name,period:''};
  }
  function renderPlanPicker() {
    const pick=$('plan-select'), info=$('plan-summary');
    pick.replaceChildren();
    allPlans().forEach(plan=>{
      const opt=node('option',planPickerLabel(plan).name);
      opt.value=plan.id;pick.append(opt);
    });
    pick.value=activePlanId;
    const plan=currentPlan();
    const period=planPickerLabel(plan).period;
    $('plan-period').textContent=period?' · '+period:'';
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
    if(activePlanId!==id)oldTravelExpanded=false;
    activePlanId=id;
    journey=activeJourney();
    pauseGPSFollow();
    renderPlanPicker();renderJourney();renderKyotoOverview();render();
    if (options.focus!==false) {
      if(journey) fitJourney();
      else {
        const matching=mapFocusPlaces();
        if(matching.length) fit(matching);
        else if(plan.center) focusMapPoint(plan.center,plan.kind==='city'?14:8);
      }
    }
    googleDemo?.syncFromOSM();
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
    else if(currentPlaces().length){
      if(activePlanId==='town-kyoto'&&MD.days('town-kyoto').includes(activeCityDay)){
        if(!fitDayGoalsAndPosition()){
          say('Tagesziele angezeigt. GPS-Position noch nicht verfügbar – nach der Ortung erneut auf 📍 tippen.');
        }
      }else fit();
    }else if(currentPlan().center) focusMapPoint(currentPlan().center,currentPlan().kind==='city'?14:8);
  };
  function setCameraMode(mode){
    if(camera.transition(mode))refreshGPSFollowControl();
  }
  function withCameraView(mode,action){
    const output=camera.move(mode,action);
    refreshGPSFollowControl();
    return output;
  }
  // The ONLY adapters for deliberate marker focus and non-GPS route bounds.
  // All travel sections go through these functions; synchronous Leaflet moves
  // avoid a delayed zoom event turning a programmatic fit into "manual".
  function focusMapPoint(point,zoom,options={}){
    return withCameraView('manual',()=>map.setView(point,zoom,{...options,animate:false}));
  }
  function fitMapArea(bounds,options={}){
    return withCameraView('day-goals',()=>map.fitBounds(bounds,{...options,animate:false}));
  }
  function refreshGPSFollowControl() {
    // "Mein Standort" is a single control: enable GPS if off, or resume
    // following and center on the current fix. Green means FOLLOWING, not
    // merely that background GPS measurements continue.
    const active=watch!==null && camera.isFollowing() && !!position;
    const control=$('gps');
    control.setAttribute('aria-pressed',String(active));
    const label=watch===null?'Mein Standort · GPS einschalten'
      :!position?'Mein Standort · GPS wird ermittelt'
        :active?'Meinem Standort folgen':'Auf meinen Standort zentrieren';
    control.setAttribute('aria-label',label);
    control.title=label;
    $('gps-privacy-toggle').textContent=watch===null?'GPS einschalten':'GPS ausschalten';
    $('gps-privacy-state').textContent=watch===null?'GPS ist ausgeschaltet.'
      :position?'GPS erfasst deinen Standort.':'GPS ermittelt deinen Standort.';
  }
  function pauseGPSFollow() {
    // Manual swipes/zooms should never be overridden by a GPS update.
    // Also exit day-goals/overview modes when the user edits the viewport.
    setCameraMode('manual');
  }
  function centerOnGPS(ll,zoom) {
    withCameraView('gps-follow',()=>map.setView(ll,zoom,{animate:false}));
  }
  // A programmatic map fit/zoom is not an accidental manual gesture.
  // GPS samples keep updating without moving the camera unless following.
  map.on('zoomstart', () => { if (!camera.isProgrammatic()) pauseGPSFollow(); });
  map.on('dragstart', () => { if (!camera.isProgrammatic()) pauseGPSFollow(); });
  function stopGPS(message = 'GPS ausgeschaltet. Standort wurde entfernt.') {
    if (watch !== null) navigator.geolocation.clearWatch(watch);
    clearWalkingRoute();
    stopTourNavigation();
    watch = null; position = null; positionUpdatedAt=0; positionAccuracy=null;
    setCameraMode('manual'); stopCompass(); refreshGPSFollowControl();
    if (userDot) { map.removeLayer(userDot); userDot = null; }
    if (accuracy) { map.removeLayer(accuracy); accuracy = null; }
    refreshGPSFollowControl();
    refreshDistances(); say(message);
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
    setCameraMode('gps-follow'); refreshGPSFollowControl();
    say('Standort wird ermittelt …');
    try{
      watch = navigator.geolocation.watchPosition(result => {
        if (watch === null) return;
        const firstFix=position===null;
        position = {lat:result.coords.latitude,lng:result.coords.longitude};
        // The auto-start GPS fix must not pull the camera back to Kyoto
        // when the chosen day has goals far away (for example Nara).
        if(automatic && firstFix && camera.isFollowing() && activePlanId==='town-kyoto' &&
          MD.preferDistantDayView(visiblePlaces(),activeCityDay,position,C.distance)){
          setCameraMode('day-goals');
        }
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
            setCameraMode('gps-follow'); refreshGPSFollowControl(); centerOnGPS(userDot.getLatLng(),16);
          });
          renderHeading();
        } else { userDot.setLatLng(ll); accuracy.setLatLng(ll).setRadius(result.coords.accuracy); }
        if (camera.isFollowing()) centerOnGPS(ll,Math.max(map.getZoom(),15));
        refreshGPSFollowControl();
        refreshDistances();
        say(`GPS aktiv · Genauigkeit ca. ${Math.round(result.coords.accuracy)} m${heading === null ? '' : ' · Richtungspfeil aktiv'}`);
      }, error => {
        if (watch === null) return;
        const messages = {1:'Standortzugriff verweigert. Du kannst GPS in den Website-Einstellungen des Browsers erlauben.',2:'Standort derzeit nicht verfügbar. Bitte erneut versuchen.',3:'Standortabfrage hat zu lange gedauert. Bitte erneut versuchen.'};
        stopGPS(messages[error.code] || 'GPS konnte nicht gestartet werden.');
      }, {enableHighAccuracy:true,maximumAge:5000,timeout:20000});
      refreshGPSFollowControl();
    }catch{stopGPS('GPS konnte nicht gestartet werden. Bitte Berechtigung prüfen.');return;}
    // Listen passively after auto-GPS (when permissions were already granted).
    // Request new iOS-style sensor permission only inside a user gesture.
    startCompass(!automatic);
  }
  $('gps').onclick = () => {
    if(watch===null){
      setAutoGPSAllowed(true);
      startGPS(false);
      return;
    }
    if(!position){say('Standort wird ermittelt …');return;}
    setCameraMode('gps-follow');
    refreshGPSFollowControl();
    centerOnGPS([position.lat,position.lng],Math.max(map.getZoom(),16));
  };
  // Full GPS shutdown is an explicit privacy setting, not a map-navigation step.
  $('compass-test').onclick=()=>{
    if(watch===null){
      compassDiagnostic('GPS ist ausgeschaltet. Zuerst GPS einschalten.');
      return;
    }
    startCompass(); // Explicit user gesture for browsers requiring sensor permission.
  };
  $('gps-privacy-toggle').onclick = () => {
    if(watch!==null){
      setAutoGPSAllowed(false);
      stopGPS();
    }else{
      setAutoGPSAllowed(true);
      startGPS(false);
    }
    refreshGPSFollowControl();
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
  $('privacy').onclick = () => {
    refreshGPSFollowControl();
    $('help-dialog').showModal();
  };
  $('import-form').onsubmit = event => {
    event.preventDefault();
    try {
      const additions = C.parse($('import-text').value);
      const before = places.length;
      places = C.merge(places, additions); filter = 'all';
      document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.filter === 'all')));
      const saved = persist(); assignToCurrentPlan(additions);
      render(); setCameraMode('manual'); fit(additions); $('import-dialog').close(); $('import-text').value = '';
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
    cityDayAssignments=Object.create(null);
    try{localStorage.setItem('livekarte-city-day-assignments-v1','{}');}catch{}
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
  // Add Kyoto plans to already installed apps once, WITHOUT replacing personal
  // markers, user-edited travel itineraries, tour drafts or ticket statuses.
  function seedKyotoPlaces(){
    const version='livekarte-kyoto-2026-11-01-v1';
    try{
      if(localStorage.getItem(version)==='1')return;
      const preset=C.presetPlaces('town-kyoto');
      if(!preset.length)return;
      const additions=[];
      const matching=[];
      for(const suggested of preset){
        const found=places.find(existing=>
          C.placePlanKey(existing)===C.placePlanKey(suggested)||
          (existing.name.toLocaleLowerCase('de-DE')===
           suggested.name.toLocaleLowerCase('de-DE')&&C.distance(existing,suggested)<75));
        if(found)matching.push({suggested,place:found});
        else{additions.push(suggested);matching.push({suggested,place:suggested});}
      }
      const merged=C.merge(places,additions);
      const nextAssignments=Object.assign(Object.create(null),planAssignments);
      for(const {suggested,place} of matching){
        const key=C.placePlanKey(place);
        const old=Array.isArray(nextAssignments[key])?nextAssignments[key]:[];
        // Arrival-day places appear in both the rail itinerary view and
        // the city view. 02.11. sights remain in city view only.
        const onArrivalDay=suggested.category==='hotel'||suggested.category==='station'||
          suggested.schedule?.startsWith('01.11.');
        nextAssignments[key]=[...new Set([...old,'town-kyoto',
          ...(onArrivalDay?['ride-kyoto']:[])])];
      }
      // Write before the version marker; no selected route or GPS saved here.
      localStorage.setItem('livekarte-places-v1',JSON.stringify(merged));
      localStorage.setItem('livekarte-plan-assignments-v1',JSON.stringify(nextAssignments));
      localStorage.setItem(version,'1');
      places=merged;planAssignments=nextAssignments;
    }catch{
      say('Kyoto-Orte konnten nicht automatisch ergänzt werden. Bitte Speicherplatz prüfen.');
    }
  }
  seedKyotoPlaces();
  // Add the Nikko hotel and both distinct train stations exactly once.
  // Never overwrite an existing marker or manually edited descriptions.
  function seedNikkoPlaces(){
    const marker='livekarte-nikko-2026-11-07-v1';
    try{
      if(localStorage.getItem(marker)==='1')return;
      const preset=C.presetPlaces('town-nikko');
      if(!preset.length)return;
      const additions=[],mapped=[];
      for(const candidate of preset){
        const existing=places.find(p=>
          C.placePlanKey(p)===C.placePlanKey(candidate)||
          (p.name.toLocaleLowerCase('de-DE')===candidate.name.toLocaleLowerCase('de-DE')&&
            C.distance(p,candidate)<75));
        const effective=existing||candidate;
        mapped.push(effective);
        if(!existing)additions.push(candidate);
      }
      const merged=C.merge(places,additions);
      const next=Object.assign(Object.create(null),planAssignments);
      for(const place of mapped){
        const key=C.placePlanKey(place);
        const tags=Array.isArray(next[key])?next[key]:[];
        next[key]=[...new Set([...tags,'town-nikko',
          ...(place.category==='hotel'||place.name==='Nikkō Station (JR)'?['ride-nikko']:[])])];
      }
      localStorage.setItem('livekarte-places-v1',JSON.stringify(merged));
      localStorage.setItem('livekarte-plan-assignments-v1',JSON.stringify(next));
      localStorage.setItem(marker,'1');
      places=merged;planAssignments=next;
    }catch{
      say('Nikkō-Orte konnten nicht automatisch ergänzt werden. Bestehende Orte bleiben erhalten.');
    }
  }
  seedNikkoPlaces();
  // Adopt existing Kyoto dates once. Never replace a manually curated assignment.
  try{
    const marker='livekarte-city-day-assignments-v1';
    const saved=localStorage.getItem(marker);
    if(saved!==null){
      cityDayAssignments=MD.cleanAssignments(JSON.parse(saved),places,C.placePlanKey);
    }else{
      cityDayAssignments=MD.seedDayAssignments(places,planAssignments,C.placePlanKey,'town-kyoto');
      localStorage.setItem(marker,JSON.stringify(cityDayAssignments));
    }
    const chosen=localStorage.getItem('livekarte-active-city-day-v1');
    activeCityDay=chosen&&MD.allowed('town-kyoto',chosen)?chosen:
      MD.defaultDay('town-kyoto',NS.localDate());
  }catch{
    cityDayAssignments=Object.create(null);
    activeCityDay=MD.defaultDay('town-kyoto',NS.localDate());
    say('Tageszuordnung konnte nicht geladen werden; die ursprünglichen Ortsdaten bleiben erhalten.');
  }

  // User-approved weather itinerary 03.–06.11.2026. Import the new public
  // recommendation pins additively; preserve every edited private place,
  // existing manual day assignment, tour draft, ticket and booking status.
  function seedApprovedKyotoDays(){
    const marker='livekarte-kyoto-approved-2026-11-03-v1';
    try{
      if(localStorage.getItem(marker)==='1')return;
      const approved=C.presetPlaces('town-kyoto').filter(place=>{
        const day=MD.fromSchedule(place.schedule);
        return day>='2026-11-03'&&day<='2026-11-06'&&
          !place.schedule.includes('Osaka Souvenir-Einkauf');
      });
      if(approved.length!==18)return;
      const additions=[],matches=[];
      for(const suggested of approved){
        const found=places.find(existing=>
          C.placePlanKey(existing)===C.placePlanKey(suggested)||
          (existing.name.toLocaleLowerCase('de-DE')===
            suggested.name.toLocaleLowerCase('de-DE')&&C.distance(existing,suggested)<75));
        const effective=found||suggested;
        matches.push({suggested,place:effective});
        if(!found)additions.push(suggested);
      }
      const nextPlaces=C.merge(places,additions);
      const nextPlanAssignments=Object.assign(Object.create(null),planAssignments);
      const nextDays=Object.assign(Object.create(null),cityDayAssignments);
      for(const {suggested,place} of matches){
        const key=C.placePlanKey(place);
        const tags=Array.isArray(nextPlanAssignments[key])?nextPlanAssignments[key]:[];
        nextPlanAssignments[key]=[...new Set([...tags,'town-kyoto'])];
        // The user's pre-existing choice is authoritative, even if it
        // differs from the approved default itinerary.
        if(!Object.hasOwn(nextDays,key))
          nextDays[key]=MD.fromSchedule(suggested.schedule);
      }
      localStorage.setItem('livekarte-places-v1',JSON.stringify(nextPlaces));
      localStorage.setItem('livekarte-plan-assignments-v1',JSON.stringify(nextPlanAssignments));
      localStorage.setItem('livekarte-city-day-assignments-v1',JSON.stringify(nextDays));
      localStorage.setItem(marker,'1');
      places=nextPlaces;
      planAssignments=nextPlanAssignments;
      cityDayAssignments=nextDays;
    }catch{
      say('Der bestätigte Kyoto-Tagesplan konnte nicht ergänzt werden. Bestehende Daten bleiben erhalten.');
    }
  }
  seedApprovedKyotoDays();
  // Add the three personally requested Osaka shops on 05.11., without
  // replacing saved place notes, past visits, custom days, drafts or tickets.
  function seedOsakaSouvenirPlaces(){
    const marker='livekarte-osaka-shopping-2026-11-05-v1';
    try{
      if(localStorage.getItem(marker)==='1')return;
      const recommended=C.presetPlaces('town-kyoto').filter(place=>
        place.schedule?.startsWith('05.11.')&&
        place.schedule.includes('Osaka Souvenir-Einkauf'));
      if(recommended.length!==3)return;
      const additions=[],mapped=[];
      for(const suggested of recommended){
        const existing=places.find(place=>
          C.placePlanKey(place)===C.placePlanKey(suggested)||
          (place.name.toLocaleLowerCase('de-DE')===
            suggested.name.toLocaleLowerCase('de-DE')&&C.distance(place,suggested)<75));
        mapped.push(existing||suggested);
        if(!existing)additions.push(suggested);
      }
      const nextPlaces=C.merge(places,additions);
      const nextPlans=Object.assign(Object.create(null),planAssignments);
      const nextDays=Object.assign(Object.create(null),cityDayAssignments);
      for(const place of mapped){
        const key=C.placePlanKey(place);
        const tags=Array.isArray(nextPlans[key])?nextPlans[key]:[];
        nextPlans[key]=[...new Set([...tags,'town-kyoto'])];
        if(!Object.hasOwn(nextDays,key))
          nextDays[key]='2026-11-05';
      }
      localStorage.setItem('livekarte-places-v1',JSON.stringify(nextPlaces));
      localStorage.setItem('livekarte-plan-assignments-v1',JSON.stringify(nextPlans));
      localStorage.setItem('livekarte-city-day-assignments-v1',JSON.stringify(nextDays));
      localStorage.setItem(marker,'1');
      places=nextPlaces;planAssignments=nextPlans;cityDayAssignments=nextDays;
    }catch{
      say('Die Osaka-Einkaufsstopps konnten nicht ergänzt werden; persönliche Daten bleiben erhalten.');
    }
  }
  seedOsakaSouvenirPlaces();
  // One-time additive migration for the requested 06.11. Arashiyama bridge.
  // A previously installed PWA already passed the Kyoto import marker: the
  // preset alone cannot make this new point appear in local saved day plans.
  function seedTogetsukyoBridge(){
    const marker='livekarte-kyoto-togetsukyo-2026-11-06-v1';
    try{
      if(localStorage.getItem(marker)==='1')return;
      const todayPresets=C.presetPlaces('town-kyoto');
      const bridge=todayPresets.find(p=>p.name==='Togetsukyō-Brücke (渡月橋)');
      if(!bridge)return;
      // Adjust only untouched default schedules; user edits stay authoritative.
      const formerSchedules={
        'Kinkaku-ji (Goldener Pavillon)':'06.11. · 11:00 · westliches Kyoto',
        'Ryōan-ji (Steingarten)':'06.11. · 13:30 · westliches Kyoto',
        'Tenryū-ji':'06.11. · 15:00 · Arashiyama',
        'Arashiyama Bambuswald':'06.11. · ab 15:45 · Bambuswald'
      };
      const updated=places.map(place=>{
        if(!Object.hasOwn(formerSchedules,place.name)||
           place.schedule!==formerSchedules[place.name])return place;
        const preset=todayPresets.find(p=>p.name===place.name);
        if(!preset)return place;
        return {...place,schedule:preset.schedule};
      });
      const existing=updated.find(place=>
        C.placePlanKey(place)===C.placePlanKey(bridge)||
        (/togetsuk|渡月橋/i.test(place.name)&&C.distance(place,bridge)<90));
      const selected=existing||bridge;
      const nextPlaces=existing?updated:C.merge(updated,[bridge]);
      const nextPlans=Object.assign(Object.create(null),planAssignments);
      const nextDays=Object.assign(Object.create(null),cityDayAssignments);
      const key=C.placePlanKey(selected);
      nextPlans[key]=[...new Set([...(nextPlans[key]||[]),'town-kyoto'])];
      if(!Object.hasOwn(nextDays,key))nextDays[key]='2026-11-06';
      localStorage.setItem('livekarte-places-v1',JSON.stringify(nextPlaces));
      localStorage.setItem('livekarte-plan-assignments-v1',JSON.stringify(nextPlans));
      localStorage.setItem('livekarte-city-day-assignments-v1',JSON.stringify(nextDays));
      localStorage.setItem(marker,'1');
      places=nextPlaces;planAssignments=nextPlans;cityDayAssignments=nextDays;
    }catch{
      say('Die Togetsukyō-Brücke konnte nicht automatisch ergänzt werden. Eigene Daten bleiben erhalten.');
    }
  }
  seedTogetsukyoBridge();

  // Persist only chosen place identifiers, never the GPS start or a route.
  try{
    const raw=JSON.parse(localStorage.getItem('livekarte-tour-drafts-v1')||'{}');
    if(raw&&typeof raw==='object'&&!Array.isArray(raw)){
      for(const [planId,keys] of Object.entries(raw).slice(0,36)){
        if(!(allPlans().some(p=>p.id===planId)||
          /^town-kyoto@2026-11-0[1-6]$/.test(planId))||!Array.isArray(keys))continue;
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
  // Explicit booking confirmation supplied by the user on 31.10.2026.
  // Seed only this exact itinerary and never downgrade a later/ready status.
  try{
    const confirmedAt=Date.parse('2026-10-31T18:37:00+09:00');
    const marker='livekarte-ticket-confirmation-kyoto-2026-11-01-v1';
    if(localStorage.getItem(marker)!=='1'){
      const trip=Object.prototype.hasOwnProperty.call(planJourneys,'ride-kyoto')
        ?C.normalizeJourney(planJourneys['ride-kyoto'])
        :C.presetJourney('takayama-kyoto-2026-11-01');
      const expected=[
        ['Takayama','11:35','Nagoya'],
        ['Nagoya','14:26','Kyoto Station']
      ];
      let seeded=0;
      for(const [from,departure,to] of expected){
        const index=trip?.stops?.findIndex((stop,i)=>i<trip.stops.length-1 &&
          stop.name===from&&stop.departure===departure&&trip.stops[i+1].name===to);
        if(index<0)continue;
        const key=C.ticketLegKey('ride-kyoto',trip,index);
        const current=ticketStatuses[key];
        if(current?.status!=='ready'&&(current?.updatedAt||0)<=confirmedAt){
          ticketStatuses[key]={status:'booked',source:'chat-link',updatedAt:confirmedAt};
          seeded++;
        }
      }
      if(seeded){
        localStorage.setItem('livekarte-ticket-status-v1',JSON.stringify(ticketStatuses));
        localStorage.setItem(marker,'1');
      }
    }
  }catch{say('Bestätigter Kyoto-Ticketstatus konnte nicht vorbelegt werden.');}
  // Never mark the pickup done without a real explicit confirmation.
  try{
    kyotoPickupDone=localStorage.getItem('livekarte-kyoto-qr-pickedup-v1')==='1';
  }catch{}
  // Travel progress is explicit and separate from ticket readiness/proof.
  try{
    const saved=JSON.parse(localStorage.getItem('livekarte-trip-progress-v1')||'{}');
    if(saved&&typeof saved==='object'&&!Array.isArray(saved)){
      for(const [key,done] of Object.entries(saved).slice(0,120))
        if(key.length<=300&&done===true)tripStageDone[key]=true;
    }
  }catch{say('Gespeicherte Reisefortschritte konnten nicht geladen werden.');}
  // Explicit, optional on-device acknowledgements for itinerary and visits.
  try{
    const saved=JSON.parse(localStorage.getItem('livekarte-next-actions-v1')||'{}');
    if(saved&&typeof saved==='object'&&!Array.isArray(saved)){
      for(const [key,done] of Object.entries(saved).slice(0,100))
        if(/^kyoto:(?:prepare|transfer|hotel|gion|ponto|kiyomizu|sannenzaka|fushimi)$/.test(key)&&done===true)
          nextActionDone[key]=true;
    }
  }catch{say('Gespeicherte Reiseaufgaben konnten nicht geladen werden.');}
  // Restore only explicit local timing preferences, never GPS or route data.
  try{
    const raw=JSON.parse(localStorage.getItem('livekarte-day-plans-v1')||'{}');
    if(raw&&typeof raw==='object'&&!Array.isArray(raw)){
      for(const [planId,value] of Object.entries(raw).slice(0,36)){
        if(!(allPlans().some(plan=>plan.id===planId)||
           /^town-kyoto@2026-11-0[1-6]$/.test(planId))||
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
  const dailyDefault=NS.todaySuggestion()?.planId;
  // An explicit deep link or manually saved selection always wins.
  // Only first visits without either use today's approved preset.
  const requestedView=queryView||savedView||dailyDefault||
    (Object.prototype.hasOwnProperty.call(planJourneys,'ride-takayama')?'ride-takayama':'all');
  activePlanId=allPlans().some(p=>p.id===requestedView)?requestedView:'all';
  journey=activeJourney();
  renderPlanPicker();renderJourney();renderKyotoOverview();render();
  if (!readTicketUpdate() && !readJourneyLink() && !readLink()) {
    selectPlan(activePlanId,{save:false,url:false,announce:false});
  }
  // Preserve the selected day-trip view on launch; the GPS startup helper
  // already checks distance before enabling map follow.
  refreshGPSFollowControl();
  void autoStartGPS();
})();