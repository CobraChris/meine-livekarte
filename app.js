'use strict';
(() => {
  const $ = id => document.getElementById(id), C = MapCore;
  const symbols = { restaurant: '♨', sight: '◇', station: '▤' };
  let places = [], filter = 'all', position = null, watch = null, following = false, userDot, accuracy;
  const say = text => { $('status').textContent = text; };
  if (!window.L) { say('Die Kartenbibliothek konnte nicht geladen werden. Bitte Seite neu laden.'); return; }
  const map = L.map('map', { zoomControl: false }).setView([52.52, 13.405], 12);
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
  function fit() {
    const visible = places.filter(p => filter === 'all' || p.category === filter);
    if (visible.length) map.fitBounds(visible.map(p => [p.lat,p.lng]), { padding:[45,45], maxZoom:16 });
  }
  function render() {
    pins.clearLayers(); $('places').replaceChildren(); $('count').textContent = places.length;
    $('empty').hidden = places.length > 0; $('share').disabled = !places.length; $('clear').disabled = !places.length;
    let shown = 0;
    places.forEach(p => {
      if (filter !== 'all' && p.category !== filter) return;
      shown++;
      const popup = node('div'); popup.append(node('strong',p.name), node('p',p.description), node('p',metric(p)), route(p));
      const marker = L.marker([p.lat,p.lng], { title:p.name, icon:L.divIcon({className:'pin',html:`<div class="pin-inner pin-${p.category}"><span>${symbols[p.category]}</span></div>`,iconSize:[36,36],iconAnchor:[18,36]}) }).bindPopup(popup).addTo(pins);
      const card = node('article',undefined,'place'), top = node('div',undefined,'place-top'), title = node('div');
      title.append(node('div',C.categories[p.category], 'category'),node('h3',p.name)); top.append(node('span',symbols[p.category],'place-icon'), title);
      const actions = node('div',undefined,'place-actions'), show = node('button','Auf Karte');
      show.onclick = () => { following = false; map.setView([p.lat,p.lng],16); marker.openPopup(); $('map').scrollIntoView({behavior:'smooth',block:'center'}); };
      const distance = node('span',metric(p),'distance');
      actions.append(show,route(p),distance); card.append(top,node('p',p.description),actions); $('places').append(card);
    });
    if (places.length && !shown) $('places').append(node('p','Keine Orte in dieser Kategorie.'));
  }
  function persist() {
    try { localStorage.setItem('livekarte-places-v1',JSON.stringify(places)); } catch { say('Browserspeicher nicht verfügbar. Nutze Teilen, um deine Orte zu sichern.'); }
    // Remove an old shared payload so reload never restores deleted recommendations.
    if (location.hash) history.replaceState(null,'',location.pathname + location.search);
  }
  function readLink() {
    try { const shared = C.decode(location.hash); if (shared !== null) { places = shared; render(); fit(); return true; } }
    catch (e) { say('Kartenlink konnte nicht geladen werden: ' + e.message); }
    return false;
  }
  $('fit').onclick = () => { following = false; fit(); };
  map.on('dragstart', () => { following = false; });
  function stopGPS(message = 'GPS ausgeschaltet. Standort wurde entfernt.') {
    if (watch !== null) navigator.geolocation.clearWatch(watch);
    watch = null; position = null; following = false;
    if (userDot) { map.removeLayer(userDot); userDot = null; }
    if (accuracy) { map.removeLayer(accuracy); accuracy = null; }
    $('gps').setAttribute('aria-pressed','false'); $('gps').lastElementChild.textContent = 'GPS einschalten'; render(); say(message);
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
      render(); say(`GPS aktiv · Genauigkeit ca. ${Math.round(result.coords.accuracy)} m`);
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
      const merged = [...places];
      additions.forEach(p => { if (!merged.some(q => q.name === p.name && q.lat === p.lat && q.lng === p.lng)) merged.push(p); });
      places = C.normalize(merged); filter = 'all';
      document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.filter === 'all')));
      persist(); render(); following = false; fit(); $('import-dialog').close(); $('import-text').value = ''; say(`${additions.length} Orte importiert.`);
    } catch (e) { $('import-error').textContent = e.message; }
  };
  $('clear').onclick = () => {
    if (!confirm('Alle Empfehlungen von diesem Gerät entfernen?')) return;
    places = []; persist(); render(); say('Empfehlungen entfernt.');
  };
  $('demo').onclick = () => {
    places = C.normalize([
      {name:'Brandenburger Tor',lat:52.516275,lng:13.377704,category:'sight',description:'Ein Berliner Wahrzeichen – und ein guter Ausgangspunkt für deinen Spaziergang.'},
      {name:'Markthalle Neun',lat:52.5021,lng:13.4318,category:'restaurant',description:'Kulinarischer Treffpunkt in Kreuzberg. Öffnungszeiten und Angebote bitte aktuell prüfen.'},
      {name:'Berlin Hauptbahnhof',lat:52.5251,lng:13.3694,category:'station',description:'Ankommen, aufbrechen und die Stadt entdecken.'}
    ]); persist(); render(); fit(); say('Beispielroute Berlin geladen.');
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
  window.addEventListener('hashchange',readLink);
  window.addEventListener('pagehide',() => { if (watch !== null) stopGPS(); });
  if (!readLink()) {
    try { places = C.parse(localStorage.getItem('livekarte-places-v1') || '[]'); } catch { say('Gespeicherte Orte konnten nicht gelesen werden. Bitte erneut importieren.'); }
    render(); fit();
  }
})();
