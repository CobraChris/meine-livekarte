'use strict';
(() => {
  const $ = id => document.getElementById(id), C = MapCore;
  const symbols = { restaurant: '♨', sight: '◇', station: '▤' };
  let places = [], filter = 'all', position = null, watch = null, following = false, userDot, accuracy;
  let distanceDisplays = [];
  const say = text => { $('status').textContent = text; };
  if (!window.L) { say('Die Kartenbibliothek konnte nicht geladen werden. Bitte Seite neu laden.'); return; }
  // No hard-coded home city. Without saved places, show a neutral world view until GPS is enabled.
  const map = L.map('map', { zoomControl: false }).setView([25, 0], 2);
  L.control.zoom({ position:'topright' }).addTo(map);
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
  function fit(items = places) {
    const visible = items.filter(p => filter === 'all' || p.category === filter);
    if (visible.length) map.fitBounds(visible.map(p => [p.lat,p.lng]), { padding:[45,45], maxZoom:16 });
  }
  function render() {
    pins.clearLayers(); $('places').replaceChildren(); distanceDisplays = []; $('count').textContent = places.length;
    $('empty').hidden = places.length > 0; $('share').disabled = !places.length; $('clear').disabled = !places.length;
    let shown = 0;
    places.forEach(p => {
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
      actions.append(show,route(p),distance); card.append(top,node('p',p.description),actions); $('places').append(card);
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
      render();
      if (shared.length) fit(shared); // Focus on the newly received recommendations, even if older places are far away.
      const added = places.length - before;
      say(saved ? (added ? `${added} neue Orte gespeichert · ${places.length} insgesamt.` : 'Alle Orte aus dem Link sind bereits gespeichert.')
                : 'Orte übernommen, aber nicht dauerhaft gespeichert. Bitte den Kartenlink sichern.');
      return true;
    } catch (e) {
      say('Kartenlink konnte nicht geladen werden: ' + e.message);
      return false;
    }
  }
  $('fit').onclick = () => { following = false; fit(); };
  map.on('dragstart', () => { following = false; });
  function stopGPS(message = 'GPS ausgeschaltet. Standort wurde entfernt.') {
    if (watch !== null) navigator.geolocation.clearWatch(watch);
    watch = null; position = null; following = false;
    if (userDot) { map.removeLayer(userDot); userDot = null; }
    if (accuracy) { map.removeLayer(accuracy); accuracy = null; }
    $('gps').setAttribute('aria-pressed','false'); $('gps').lastElementChild.textContent = 'GPS einschalten'; refreshDistances(); say(message);
  }
  $('gps').onclick = () => {
    if (watch !== null) { stopGPS(); return; }
    if (!window.isSecureContext || !navigator.geolocation) { say('GPS benötigt HTTPS und einen Browser mit Standortunterstützung.'); return; }
    following = true; $('gps').setAttribute('aria-pressed','true'); $('gps').lastElementChild.textContent = 'GPS ausschalten'; say('Standort wird ermittelt …');
    watch = navigator.geolocation.watchPosition(result => {
      if (watch === null) return;
      position = {lat:result.coords.latitude,lng:result.coords.longitude};
      const ll = [position.lat,position.lng];
      if (!userDot) {
        accuracy = L.circle(ll,{radius:result.coords.accuracy,color:'#60a5fa',weight:1,fillOpacity:.08}).addTo(map);
        userDot = L.circleMarker(ll,{radius:8,color:'#fff',weight:3,fillColor:'#398bfa',fillOpacity:1}).addTo(map);
        userDot.on('click', () => { following = true; map.setView(userDot.getLatLng(),16); });
      } else { userDot.setLatLng(ll); accuracy.setLatLng(ll).setRadius(result.coords.accuracy); }
      if (following) map.setView(ll,Math.max(map.getZoom(),15));
      refreshDistances(); say(`GPS aktiv · Genauigkeit ca. ${Math.round(result.coords.accuracy)} m`);
    }, error => {
      if (watch === null) return;
      const messages = {1:'Standortzugriff verweigert. Du kannst GPS in den Website-Einstellungen des Browsers erlauben.',2:'Standort derzeit nicht verfügbar. Bitte erneut versuchen.',3:'Standortabfrage hat zu lange gedauert. Bitte erneut versuchen.'};
      stopGPS(messages[error.code] || 'GPS konnte nicht gestartet werden.');
    }, {enableHighAccuracy:true,maximumAge:5000,timeout:20000});
  };
  document.querySelectorAll('[data-filter]').forEach(b => { b.onclick = () => {
    filter = b.dataset.filter; document.querySelectorAll('[data-filter]').forEach(e => e.setAttribute('aria-pressed', String(e === b))); render();
  }; });
  document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => b.closest('dialog').close(); });
  $('open-import').onclick = () => { $('import-error').textContent = ''; $('import-dialog').showModal(); };
  $('privacy').onclick = () => $('help-dialog').showModal();
  $('import-form').onsubmit = event => {
    event.preventDefault();
    try {
      const additions = C.parse($('import-text').value);
      const before = places.length;
      places = C.merge(places, additions); filter = 'all';
      document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.filter === 'all')));
      const saved = persist(); render(); following = false; fit(additions); $('import-dialog').close(); $('import-text').value = '';
      say(saved ? `${places.length - before} neue Orte hinzugefügt · ${places.length} insgesamt.` : 'Orte importiert, konnten aber nicht dauerhaft gespeichert werden.');
    } catch (e) { $('import-error').textContent = e.message; }
  };
  $('clear').onclick = () => {
    if (!confirm('Alle Empfehlungen von diesem Gerät entfernen?')) return;
    places = []; persist(); render(); say('Empfehlungen entfernt.');
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
    const url = new URL(location.href); url.search = ''; url.hash = C.encode(places);
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
  window.addEventListener('hashchange',readLink);
  window.addEventListener('pagehide',() => { if (watch !== null) stopGPS(); });
  // Load saved places first, so recommendations received through a ChatGPT link
  // are added to them rather than replacing them.
  try { places = C.parse(localStorage.getItem('livekarte-places-v1') || '[]'); }
  catch { say('Gespeicherte Orte konnten nicht gelesen werden. Bitte erneut importieren.'); }
  render();
  if (!readLink()) fit();
})();
