/* Pure import and sharing helpers; also usable in Node tests. */
(function (root) {
  'use strict';
  const categories = { restaurant: 'Restaurant', sight: 'Sehenswürdigkeit', station: 'Bahnhof' };
  function normalize(items) {
    if (!Array.isArray(items) || items.length > 200) throw new Error('Bitte eine Liste mit maximal 200 Orten verwenden.');
    return items.map((p, i) => {
      if (!p || typeof p !== 'object') throw new Error(`Ort ${i + 1} ist ungültig.`);
      const number = v => (typeof v === 'number' || (typeof v === 'string' && v.trim())) ? Number(v) : NaN;
      const lat = number(p.lat), lng = number(p.lng ?? p.lon);
      if (typeof p.name !== 'string' || !p.name.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error(`Ort ${i + 1}: Name oder Koordinaten fehlen bzw. sind ungültig.`);
      const aliases = { restaurant:'restaurant', restaurants:'restaurant', sight:'sight', sehenswürdigkeit:'sight', station:'station', bahnhof:'station' };
      const category = aliases[String(p.category || 'sight').toLowerCase()];
      if (!category) throw new Error(`Ort ${i + 1}: Unbekannte Kategorie.`);
      return { name: p.name.trim().slice(0, 120), lat, lng, category, description: String(p.description || '').slice(0, 1000) };
    });
  }
  function parse(text) {
    if (text.length > 100000) throw new Error('Der Import ist zu groß.');
    const clean = text.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, '').trim();
    if (!clean) throw new Error('Bitte Empfehlungen eingeben.');
    if (/^[\[{]/.test(clean)) {
      let data;
      try { data = JSON.parse(clean); } catch { throw new Error('Das JSON ist ungültig. Bitte Syntax prüfen.'); }
      return normalize(Array.isArray(data) ? data : data.places || [data]);
    }
    return normalize(clean.split(/\r?\n/).filter(l => l.trim()).map(line => {
      const [name, lat, lng, category, ...description] = line.split(';').map(s => s.trim());
      return { name, lat, lng, category, description: description.join('; ') };
    }));
  }
  // Merge recommendations without replacing saved places; keep existing metadata on duplicates.
  function merge(existing, incoming) {
    const combined = [];
    const seen = new Set();
    for (const place of [...normalize(existing), ...normalize(incoming)]) {
      const key = JSON.stringify([place.name, place.lat, place.lng]);
      if (seen.has(key)) continue;
      if (combined.length >= 200) throw new Error('Maximal 200 verschiedene Orte möglich. Bitte zunächst Orte entfernen.');
      seen.add(key);
      combined.push(place);
    }
    return combined;
  }
  function encode(places) { return '#places=' + encodeURIComponent(JSON.stringify(normalize(places))); }
  function decode(hash) {
    if (!hash.startsWith('#places=')) return null;
    if (hash.length > 30000) throw new Error('Dieser Kartenlink ist zu groß.');
    return parse(decodeURIComponent(hash.slice(8)));
  }
  // Only absolute, north-referenced compass data is suitable for a map arrow.
  // Relative deviceorientation alpha must never be treated as a compass heading.
  function compassHeading(event) {
    const raw = Number.isFinite(event?.webkitCompassHeading) ? event.webkitCompassHeading
      : (event?.absolute === true && Number.isFinite(event?.alpha) ? 360 - event.alpha : null);
    return raw === null ? null : ((raw % 360) + 360) % 360;
  }
  // Timed railway itinerary. Geographical legs are schematic and must never be
  // presented as actual rail tracks or live vehicle positions.
  function normalizeJourney(journey) {
    if (!journey || typeof journey !== 'object' || !Array.isArray(journey.stops)
        || journey.stops.length < 2 || journey.stops.length > 15) {
      throw new Error('Reiseplan muss 2 bis 15 Haltepunkte enthalten.');
    }
    const number = value => (typeof value === 'number' || (typeof value === 'string' && value.trim())) ? Number(value) : NaN;
    const coords = p => {
      const lat = number(Array.isArray(p) ? p[0] : p?.lat), lng = number(Array.isArray(p) ? p[1] : p?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
        throw new Error('Ungültige Koordinaten im Reiseplan.');
      return [lat, lng];
    };
    const trim = (value, max) => String(value ?? '').trim().slice(0, max);
    const time = value => {
      const t = trim(value, 5);
      if (t && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t))
        throw new Error('Ungültige Zeit im Reiseplan.');
      return t;
    };
    const stops = journey.stops.map(stop => {
      if (!stop || typeof stop.name !== 'string' || !stop.name.trim()) throw new Error('Bahnhofname fehlt.');
      const [lat, lng] = coords(stop);
      const via = stop.via ?? [];
      if (!Array.isArray(via) || via.length > 20) throw new Error('Zu viele Streckenpunkte.');
      return {name:trim(stop.name,100),lat,lng,arrival:time(stop.arrival),departure:time(stop.departure),
        description:trim(stop.description,250),leg:trim(stop.leg,140),via:via.map(coords)};
    });
    return {title:trim(journey.title,120) || 'Mein Reiseplan',date:trim(journey.date,10),stops};
  }
  // Indoor guide data: station topology is illustrative; no fabricated indoor coordinates.
  // Current platform assignments are not live feeds; always confirm on departure boards.
  const stationGuides = {
    nagoya: Object.freeze({
      station:'Nagoya',incoming:'Hikari 637',arrival:'11:19',
      arrivalPlatforms:'16 / 17 (genaues Gleis prüfen)',
      outbound:'Hida 9',departure:'11:43',departurePlatform:'11',
      destination:'Takayama',transferMinutes:24,
      mapUrl:'https://global.jr-central.co.jp/en/info/station/_img/nagoya.jpg',
      steps:[
        {short:'Aussteigen',title:'Am Shinkansen-Bahnsteig ankommen',
          action:'Hikari 637 verlassen. Prüfe auf der Anzeige, ob du an Gleis 16 oder 17 angekommen bist.',
          sign:'16 / 17 · Shinkansen',level:'2F · Bahnsteig',
          caution:'Die Gleisangabe 16/17 ist eine übliche Zuordnung, nicht die bestätigte Gleisnummer dieses Zuges.'},
        {short:'Eine Etage tiefer',title:'In die JR-Umsteigeebene hinuntergehen',
          action:'Folge den Schildern „JR Lines“ bzw. „Transfer“ und nimm Treppe, Rolltreppe oder Lift eine Ebene hinunter.',
          sign:'JR Lines / Transfer',level:'1F · Verbindungsebene',
          caution:'Nicht den Ausgang zur Straße wählen.'},
        {short:'Umsteigesperre',title:'Shinkansen-Umsteigesperre passieren',
          action:'Gehe durch die Shinkansen-Transfer-Gates zu den konventionellen JR-Linien (在来線). Mit deinem Ticket-/IC-Typ den Anweisungen an der Sperre folgen.',
          sign:'JR Lines / 乗換口',level:'1F · Umsteigesperre',
          caution:'Die Ticketabwicklung hängt von deinem gebuchten Fahrschein ab. Bei Unsicherheit am besetzten Schalter fragen.'},
        {short:'Gleis 11',title:'Zum Hida-Bahnsteig 11 gehen',
          action:'Folge auf der JR-Seite den Schildern „11“ beziehungsweise „Limited Express Hida“. Fahre oder gehe zum Bahnsteig hinauf.',
          sign:'11 / Hida / Takayama',level:'2F · JR-Bahnsteig',
          caution:'Gleis 11 ist die reguläre Zuordnung. Kontrolliere unmittelbar vor dem Einsteigen die Anzeigetafel.'},
        {short:'Einsteigen',title:'Hida 9 nach Takayama',
          action:'Am richtigen Wagen bzw. an der passenden Markierung warten und in den Hida 9 einsteigen. Geplante Abfahrt 11:43 Uhr.',
          sign:'Hida 9 · 11:43 · Takayama',level:'2F · Gleis 11',
          caution:'Das ist keine Live-Auskunft. Bei Änderungen gilt die Bahnhofsanzeige.'}
      ]
    })
  };
  // Small, non-sensitive trip presets allow short browser-friendly URLs.
  // Station-to-station waypoints are illustrative, not rail-grade geometry.
  const journeyPresets = {
    'hakone-takayama-2026-10-30': {
      title:'Hakone–Takayama',date:'30.10.2026',
      stops:[
        {name:'Gōra',lat:35.25085,lng:139.04826,departure:'08:41',
          description:'Hotel Suiun gegen 08:25 verlassen; ca. 5–10 Minuten zu Fuß.',
          leg:'Hakone-Tozan-Bahn 08:41–09:16'},
        {name:'Hakone-Yumoto',lat:35.23365,lng:139.10398,arrival:'09:16',departure:'09:24',
          description:'8 Minuten Umstieg',leg:'Regionalbahn 09:24–09:38'},
        {name:'Odawara',lat:35.25639,lng:139.155,arrival:'09:38',departure:'10:11',
          description:'33 Minuten Umstieg; Hikari 637 ab Gleis 13.',
          leg:'Shinkansen Hikari 637 10:11–11:19',
          via:[[34.9716,138.3886],[34.7037,137.7347],[34.7628,137.3822]]},
        {name:'Nagoya',lat:35.17073,lng:136.88184,arrival:'11:19',departure:'11:43',
          description:'24 Minuten Umstieg. Gleis des Hida 9 am Bahnhof prüfen.',
          leg:'Limited Express Hida 9 11:43–14:14',
          via:[[35.40949,136.75698],[35.445,137.018],[35.805851,137.239686]]},
        {name:'Takayama',lat:36.14113,lng:137.25129,arrival:'14:14',
          description:'Ankunft am Bahnhof Takayama.'}
      ]
    }
  };
  function presetJourney(slug) {
    return Object.prototype.hasOwnProperty.call(journeyPresets,slug)
      ? normalizeJourney(journeyPresets[slug]) : null;
  }
  function encodeJourney(journey) { return '#trip=' + encodeURIComponent(JSON.stringify(normalizeJourney(journey))); }
  function decodeJourney(hash) {
    if (!hash.startsWith('#trip=')) return null;
    if (hash.length > 30000) throw new Error('Der Reiseplan-Link ist zu groß.');
    try { return normalizeJourney(JSON.parse(decodeURIComponent(hash.slice(6)))); }
    catch (e) { throw new Error('Reiseplan-Link ungültig: ' + e.message); }
  }
  // Travel ticket readiness is separate from the route and never derived from
  // a timetable or a claimed booking. Incoming links are only proposals.
  const ticketStates=Object.freeze({
    unknown:'Ungeklärt',missing:'Noch kaufen',
    booked:'Gebucht · prüfen',ready:'Vorhanden'
  });
  function ticketLegKey(planId,journey,index) {
    if(typeof planId!=='string' || !planId || !journey?.stops || !Number.isInteger(index)
        || index<0 || index>=journey.stops.length-1)throw new Error('Fahrt nicht gefunden.');
    const from=journey.stops[index],to=journey.stops[index+1];
    return JSON.stringify([planId,journey.date,from.name,from.departure,to.name]);
  }
  function normalizeTicketUpdate(raw) {
    if(!raw || typeof raw!=='object' || Array.isArray(raw) || raw.v!==1
        || !/^[a-z0-9-]{2,70}$/.test(String(raw.plan||''))
        || !/^\\d{2}\\.\\d{2}\\.\\d{4}$/.test(String(raw.date||''))
        || !['unknown','missing','booked','ready'].includes(raw.status)
        || typeof raw.from!=='string'||!raw.from.trim()||raw.from.length>100
        || typeof raw.to!=='string'||!raw.to.trim()||raw.to.length>100
        || !/^(?:[01]\\d|2[0-3]):[0-5]\\d$/.test(String(raw.departure||'')))
      throw new Error('Ticket-Update ungültig.');
    return {v:1,plan:raw.plan,date:raw.date,from:raw.from,
      to:raw.to,departure:raw.departure,status:raw.status};
  }
  function encodeTicketUpdate(raw) {
    return '#ticket='+encodeURIComponent(JSON.stringify(normalizeTicketUpdate(raw)));
  }
  function decodeTicketUpdate(hash) {
    if(!hash.startsWith('#ticket='))return null;
    if(hash.length>1600)throw new Error('Ticket-Link ist zu lang.');
    try {return normalizeTicketUpdate(JSON.parse(decodeURIComponent(hash.slice(8))));}
    catch(e) {throw new Error('Ticket-Link ungültig: '+e.message);}
  }
  // Each section is independent. Saved places are never deleted when changing sections.
  const planPresets = [
    {id:'all',name:'Alle gespeicherten Orte',kind:'all'},
    {id:'ride-takayama',name:'30.10. · Fahrt nach Takayama',kind:'journey'},
    {id:'town-takayama',name:'30.10.–02.11. · Takayama',kind:'city',center:[36.141062,137.251454]},
    {id:'ride-kyoto',name:'02.11. · Fahrt nach Kyoto',kind:'journey',center:[35.55,136.50]},
    {id:'town-kyoto',name:'Ab 02.11. · Kyoto',kind:'city',center:[34.98535,135.75877]}
  ];
  function placePlanKey(place) {
    return JSON.stringify([place.name,place.lat,place.lng]);
  }
  function placesForPlan(places,assignments,planId) {
    if (planId === 'all') return places;
    return places.filter(place => {
      const tag=assignments?.[placePlanKey(place)];
      return Array.isArray(tag) && tag.includes(planId);
    });
  }
  function validCustomPlans(list) {
    if (!Array.isArray(list) || list.length>30) throw new Error('Zu viele Reiseabschnitte.');
    const seen = new Set(planPresets.map(p=>p.id));
    return list.map(p=>{
      if (!p || !/^custom-[0-9a-z-]{4,60}$/.test(String(p.id)) || seen.has(p.id)
          || !['journey','city'].includes(p.kind)
          || typeof p.name!=='string' || !p.name.trim()) throw new Error('Ungültiger Reiseabschnitt.');
      seen.add(p.id);
      const center=Array.isArray(p.center)&&p.center.length===2&&p.center.every(Number.isFinite)
        && Math.abs(p.center[0])<=90&&Math.abs(p.center[1])<=180 ? p.center : null;
      return {id:p.id,name:p.name.trim().slice(0,60),kind:p.kind,center};
    });
  }
  function distance(a, b) {
    const r = Math.PI / 180, dlat = (b.lat-a.lat)*r, dlng = (b.lng-a.lng)*r;
    const h = Math.sin(dlat/2)**2 + Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlng/2)**2;
    return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1,h)));
  }
  const api = { categories, normalize, merge, parse, encode, decode, distance, compassHeading, normalizeJourney, encodeJourney, decodeJourney, presetJourney, planPresets, placePlanKey, placesForPlan, validCustomPlans, stationGuides, ticketStates, ticketLegKey, normalizeTicketUpdate, encodeTicketUpdate, decodeTicketUpdate };
  if (typeof module !== 'undefined') module.exports = api;
  else root.MapCore = api;
})(globalThis);
