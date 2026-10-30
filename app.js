'use strict';
(() => {
  const $ = id => document.getElementById(id), C = MapCore;
  const symbols = { restaurant: '♨', sight: '◇', station: '▤' };
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
  const node = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  function route(p) {
    const a = node('a', '↗ Zu Fuß', 'navigate');
    a.href = `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`;
    a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
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
      const popup = node('div'); popup.append(node('strong',p.name), node('p',p.description), inPopup, route(p));
      const marker = L.marker([p.lat,p.lng], { title:p.name, icon:L.divIcon({className:'pin',html:`<div class="pin-inner pin-${p.category}"><span>${symbols[p.category]}</span></div>`,iconSize:[36,36],iconAnchor:[18,36]}) }).bindPopup(popup).addTo(pins);
      marker.on('popupopen', () => { following = false; });
      const card = node('article',undefined,'place'), top = node('div',undefined,'place-top'), title = node('div');
      title.append(node('div',C.categories[p.category], 'category'),node('h3',p.name)); top.append(node('span',symbols[p.category],'place-icon'), title);
      const actions = node('div',undefined,'place-actions'), show = node('button','Auf Karte');
      show.onclick = () => { following = false; map.setView([p.lat,p.lng],16); marker.openPopup(); $('map').scrollIntoView({behavior:'smooth',block:'center'}); };
      const distance = node('span',metric(p),'distance');
      actions.append(show,route(p),distance);
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
      card.append(top,node('p',p.description),actions,assignRow); $('places').append(card);
      distanceDisplays.push({ place:p, inPopup, inList:distance });
    });
    if (places.length && !shown) $('places').append(node('p','Keine Orte in dieser Kategorie.'));
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
      return true;
    }catch{
      say('Ticketstatus konnte nicht dauerhaft gespeichert werden. Browserspeicher prüfen.');
      return false;
    }
  }
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
    watch = null; position = null; following = false; stopCompass(); refreshGPSFollowControl();
    if (userDot) { map.removeLayer(userDot); userDot = null; }
    if (accuracy) { map.removeLayer(accuracy); accuracy = null; }
    $('gps').setAttribute('aria-pressed','false');
    $('gps').title='GPS einschalten';$('gps').setAttribute('aria-label','GPS einschalten');
    $('gps').lastElementChild.textContent = 'GPS einschalten'; refreshDistances(); say(message);
  }
  $('gps').onclick = () => {
    if (watch !== null) { stopGPS(); return; }
    if (!window.isSecureContext || !navigator.geolocation) { say('GPS benötigt HTTPS und einen Browser mit Standortunterstützung.'); return; }
    following = true; refreshGPSFollowControl();
    $('gps').setAttribute('aria-pressed','true'); $('gps').lastElementChild.textContent = 'GPS ausschalten'; say('Standort wird ermittelt …');
    watch = navigator.geolocation.watchPosition(result => {
      if (watch === null) return;
      position = {lat:result.coords.latitude,lng:result.coords.longitude};
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
    startCompass();
  };
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
})();
