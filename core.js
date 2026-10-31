/* Pure import and sharing helpers; also usable in Node tests. */
(function (root) {
  'use strict';
  const categories = { restaurant: 'Restaurant', sight: 'Sehenswürdigkeit', station: 'Bahnhof', hotel: 'Hotel' };
  function normalize(items) {
    if (!Array.isArray(items) || items.length > 200) throw new Error('Bitte eine Liste mit maximal 200 Orten verwenden.');
    return items.map((p, i) => {
      if (!p || typeof p !== 'object') throw new Error(`Ort ${i + 1} ist ungültig.`);
      const number = v => (typeof v === 'number' || (typeof v === 'string' && v.trim())) ? Number(v) : NaN;
      const lat = number(p.lat), lng = number(p.lng ?? p.lon);
      if (typeof p.name !== 'string' || !p.name.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error(`Ort ${i + 1}: Name oder Koordinaten fehlen bzw. sind ungültig.`);
      const aliases = { restaurant:'restaurant', restaurants:'restaurant', sight:'sight', sehenswürdigkeit:'sight', station:'station', bahnhof:'station', hotel:'hotel', hotels:'hotel' };
      const category = aliases[String(p.category || 'sight').toLowerCase()];
      if (!category) throw new Error(`Ort ${i + 1}: Unbekannte Kategorie.`);
      const priority = String(p.priority || '').trim().slice(0, 10);
      const duration = String(p.duration || '').trim().slice(0, 40);
      const schedule = String(p.schedule || '').trim().slice(0, 120);
      const note = String(p.note || '').trim().slice(0, 260);
      return {
        name: p.name.trim().slice(0, 120), lat, lng, category,
        description: String(p.description || '').slice(0, 1000),
        ...(priority ? {priority} : {}),
        ...(duration ? {duration} : {}),
        ...(schedule ? {schedule} : {}),
        ...(note ? {note} : {})
      };
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
    // Timetable plus user-confirmed booking details for the 01.11.2026 itinerary.
    // No booking codes, QR codes or ticket images are stored here.
    // Rail map geometry between these stations is schematic (not track geometry).
    'takayama-kyoto-2026-11-01': {
      title:'Takayama → Kyoto · Hida 8 / Nozomi 71',
      date:'01.11.2026',
      stops:[
        {name:'Takayama',lat:36.14113,lng:137.25129,departure:'11:35',
          description:'Klook-Buchung bestätigt. Vor Abfahrt QR-Code am Ticketautomaten scannen und Papier-Tickets abholen. Hida 8: Wagen 2, Sitze 10C/10D. Koffer <160 cm: keine Übergepäckreservierung nötig.',
          leg:'JR Limited Express Hida 8 · 11:35–14:04'},
        {name:'Nagoya',lat:35.17073,lng:136.88184,
          arrival:'14:04',departure:'14:26',
          description:'Hida 8 laut Buchung an Gleis 4. 22 Min. Umstieg zum Nozomi 71 ab Gleis 17. Nozomi: Wagen 4, Sitze 8D/8E. Bahnhofsanzeige vor Ort hat Vorrang.',
          leg:'Tokaido Shinkansen Nozomi 71 · 14:26–15:00'},
        {name:'Kyoto Station',lat:34.98535,lng:135.75877,arrival:'15:00',
          description:'Nozomi 71 laut Buchung an Gleis 13. Taxi zum Tomoya Residence ca. 15–20 Min. (Hotel ca. 15:15–15:20) oder Karasuma-Linie bis Karasuma Oike + ca. 7 Min. Fußweg (Hotel ca. 15:25–15:35).'}
      ]
    },
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
        || !/^\d{2}\.\d{2}\.\d{4}$/.test(String(raw.date||''))
        || !['unknown','missing','booked','ready'].includes(raw.status)
        || typeof raw.from!=='string'||!raw.from.trim()||raw.from.length>100
        || typeof raw.to!=='string'||!raw.to.trim()||raw.to.length>100
        || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(raw.departure||'')))
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
  // Curated city presets. They are ordinary place records and are only seeded
  // once into local browser storage, so users can still edit or clear them.
  const townPlacePresets = {
    'town-kyoto': [
      {name:'Tomoya Residence Hotel Kyoto Nijo Takakura',lat:35.0137,lng:135.76181,category:'hotel',
        schedule:'01.–07.11. · Unterkunft · Check-in ab 14:00 · Ankunft am 01.11. je nach Transfer ca. 15:15–15:35',
        note:'58 Matsuya-cho, Nakagyo-ku. Taxi ab Kyoto Station ca. 15–20 Min.; alternativ Karasuma-Linie bis Karasuma Oike, Ausgang 1, dann ca. 7 Min. zu Fuß.',
        description:'Euer Kyoto-Hotel und Basis für die Stadterkundung. Taxi: Hotel ca. 15:15–15:20. U-Bahn: Hotel ca. 15:25–15:35.'},
      {name:'Kyoto Station',lat:34.98535,lng:135.75877,category:'station',
        schedule:'01.11. · 15:00 Ankunft · Nozomi 71 · laut Buchung Gleis 13',
        note:'Klook-Buchung bestätigt. Weiterfahrt zum Hotel: Taxi ca. 15–20 Min. oder Karasuma-U-Bahn bis Karasuma Oike und ca. 7 Min. Fußweg.',
        description:'Zentraler JR- und Shinkansen-Bahnhof in Kyoto. Bahnhofsanzeige vor Ort hat Vorrang.'},
      {name:'Karasuma Oike Station',lat:35.01082,lng:135.75965,category:'station',
        schedule:'01.11. · Umstieg/Ausstieg zum Hotel nach der Zugankunft',
        note:'Karasuma-Linie ab Kyoto Station. Ausgang 1; von dort ca. 7 Minuten zum Tomoya Residence.',
        description:'Kyoto Municipal Subway, Karasuma- und Tozai-Linie.'},
      {name:'Gion Shirakawa / Shinbashi',lat:35.0054743,lng:135.7736461,category:'sight',
        priority:'1',duration:'30–45 Min.',
        schedule:'01.11. · nach Check-in · Abendspaziergang',
        note:'Historisches Gion am Shirakawa-Kanal; ruhiger Fotospaziergang, keine feste Reservierung. Private Wege und Fotografierregeln beachten.',
        description:'Stimmungsvolle Gassen, traditionelle Holzhäuser und Kanal im Gion-Viertel.'},
      {name:'Tatsumi-Brücke (Gion)',lat:35.005692,lng:135.774582,category:'sight',
        priority:'1',duration:'10–15 Min.',
        schedule:'01.11. · Abendspaziergang direkt bei Gion Shirakawa',
        note:'Kleiner Fotostopp an der Shirakawa-Gasse; kurzer Stopp, kein eigener großer Ausflug.',
        description:'Kleine Fußgängerbrücke im Gion-Viertel über den Shirakawa-Kanal.'},
      {name:'Ponto-chō',lat:35.00613,lng:135.77109,category:'restaurant',
        priority:'1',duration:'60–90 Min.',
        schedule:'01.11. · Abendessen nach Gion · Uhrzeit offen',
        note:'Restaurantgasse westlich des Kamo-Flusses, kein bestimmtes Lokal reserviert. Optional kurzer Spaziergang am Kamo-Fluss.',
        description:'Enge historische Gasse mit Restaurants und Izakayas. Abends besonders stimmungsvoll.'},
      {name:'Kiyomizu-dera',lat:34.994722,lng:135.783056,category:'sight',
        priority:'1',duration:'90 Min.',
        schedule:'02.11. · 09:45–11:15 (Planzeit)',
        note:'Frühstück und Anreise nach Higashiyama vorher einplanen. Tempel-Eintritt und aktuelle Regeln vor Ort prüfen.',
        description:'Berühmter Tempel mit Aussicht über Kyoto; zum Hauptzugang über Kiyomizu-zaka/Nio-mon.'},
      {name:'Sannenzaka / Ninenzaka',lat:34.9973,lng:135.781,category:'sight',
        priority:'1',duration:'1–2 Std.',
        schedule:'02.11. · 11:15–13:30 inkl. Mittagessen',
        note:'Historische Hang- und Gassenstraße unterhalb Kiyomizu-dera. Die Zeitspanne enthält Mittagessen.',
        description:'Traditionelle Straßen und Geschäfte in Higashiyama, direkt unterhalb des Tempels.'},
      {name:'Fushimi Inari-Taisha',lat:34.967125,lng:135.773108,category:'sight',
        priority:'1',duration:'2 Std.',
        schedule:'02.11. · 15:15–17:15 (Planzeit)',
        note:'Transfer von Higashiyama mit ÖPNV einplanen; die vielen Torii liegen am Berg. Laufzeit hängt davon ab, wie weit ihr hinaufgeht.',
        description:'Shinto-Schrein mit berühmten Reihen roter Torii-Tore am Inari-Berg.'}
    ],
    'town-takayama': [
      {name:'Sanmachi-Suji / historische Altstadt',lat:36.14088,lng:137.25966,category:'sight',priority:'1',duration:'1–2 Std.',
        schedule:'Tag 1 · 30.10. · ca. 15:30–17:15',
        note:'Direkt nach Check-in sinnvoll. Viele Läden und Verkostungen werden am späten Nachmittag ruhiger bzw. schließen.',
        description:'Historischer Kern Takayamas mit traditionellen Holzhäusern, kleinen Läden, Cafés und Sake-Brauereien. Für den ersten Rundgang in Takayama höchste Priorität.'},
      {name:'Shirakawa-go (Ogimachi)',lat:36.2573,lng:136.9068,category:'sight',priority:'1',duration:'5–7 Std. inkl. Bus',
        schedule:'Tag 3 · 01.11. · Bus 09:35 → 10:25 · Rückfahrt z. B. 15:10 → 16:05',
        note:'09:35 passt zu eurem Start nach 09:00. Diese Verbindung ist reservierungspflichtig; Sitzplätze vorher sichern.',
        description:'UNESCO-Bergdorf mit Gasshō-Zukuri-Häusern. Tagesausflug ab Takayama; deutlich weiter außerhalb als die übrigen Ziele.'},
      {name:'Hida-no-Sato / Hida Folk Village',lat:36.13167,lng:137.2357,category:'sight',priority:'1-',duration:'45–90 Min.',
        schedule:'Tag 2 · 31.10. · ideal ab 17:30',
        note:'WICHTIG: Herbstbeleuchtung 2026 nur Sa/So/Feiertage, 10.10.–08.11., jeweils 17:30–20:30. Der 31.10. ist Samstag.',
        description:'Freilichtmuseum mit über 30 historischen Häusern aus der Hida-Region. An eurem Wochenende besonders interessant bei der Herbstbeleuchtung.'},
      {name:'Takayama Jinya',lat:36.13964,lng:137.25764,category:'sight',priority:'2',duration:'30–60 Min.',
        schedule:'Tag 2 · 31.10. · ca. 10:15–11:00',
        note:'Am 31.10. geöffnet 08:45–17:00, letzter Einlass 16:30. Ab 01.11. nur bis 16:30, letzter Einlass 16:00.',
        description:'Erhaltener Verwaltungssitz aus der Edo-Zeit mit Tatami-Räumen, Gerichtsräumen und historischem Reisspeicher.'},
      {name:'Miyagawa Morning Market',lat:36.14469,lng:137.25785,category:'sight',priority:'2',duration:'30–60 Min.',
        schedule:'Tag 2 · 31.10. · ca. 09:00–10:00',
        note:'April–November täglich 07:00–12:00. Mit eurem Start um 09:00 bleibt genügend Zeit.',
        description:'Morgenmarkt entlang des Miyagawa mit lokalen Lebensmitteln, Snacks, Süßigkeiten, Handwerk und Souvenirs.'},
      {name:'Nakabashi Bridge',lat:36.14,lng:137.25922,category:'sight',priority:'2-',duration:'10–20 Min.',
        schedule:'Tag 1 · 30.10. · ab 17:30',
        note:'Herbstbeleuchtung 2026 täglich 17:30–21:00 vom 01.10.–30.11. Nach der Altstadt ideal als kurzer Abendstopp.',
        description:'Markante rote Brücke über den Miyagawa direkt bei Altstadt und Takayama Jinya. Eher kurzer Fotostopp als eigener Ausflug.'},
      {name:'Yoshijima Heritage House',lat:36.14664,lng:137.25843,category:'sight',priority:'3+',duration:'30–45 Min.',
        schedule:'Optional Tag 2 · ca. 13:30',
        note:'Nur einplanen, wenn nach Markt, Jinya und Mittagessen noch Lust auf traditionelle Architektur besteht.',
        description:'Traditionelles Kaufmannshaus und schönes Beispiel für Hida-Holzarchitektur. Optional, wenn euch Architektur besonders interessiert.'},
      {name:'Kusakabe Folk Museum',lat:36.14644,lng:137.25846,category:'sight',priority:'3',duration:'30–45 Min.',
        schedule:'Optional Tag 2 · alternativ zu Yoshijima',
        note:'Nicht beide Kaufmannshäuser nötig; eines reicht für euren Reiseplan.',
        description:'Historisches Kaufmannshaus mit traditioneller Architektur und Alltags-/Handwerksobjekten. Ähnliche Kategorie wie Yoshijima.'},
      {name:'Higashiyama Walking Course',lat:36.1507482,lng:137.2586221,category:'sight',priority:'3',duration:'1,5–2 Std.',
        schedule:'Optional Tag 2 · früher Nachmittag',
        note:'Nur sinnvoll, wenn ihr bewusst einen längeren Spaziergang wollt; vor Hida-no-Sato ausreichend Puffer lassen.',
        description:'Ruhiger Spazierweg durch Tempelviertel, Wald und ehemalige Burgbereiche. Rund vier Kilometer; eher Atmosphäre als einzelnes Highlight.'},
      {name:'Jinya-mae Morning Market',lat:36.13955,lng:137.2575,category:'sight',priority:'3',duration:'20–30 Min.',
        schedule:'Tag 2 · direkt vor/nach Takayama Jinya',
        note:'Ebenfalls bis ungefähr 12:00. Nur kurz mitnehmen; Miyagawa ist für euch der wichtigere Markt.',
        description:'Kleiner zweiter Morgenmarkt direkt vor Takayama Jinya. Sinnvoll nur, wenn ihr ihn ohnehin mit Jinya kombiniert.'},
      {name:'Takayama Matsuri Yatai Kaikan',lat:36.14842,lng:137.26016,category:'sight',priority:'1',duration:'30–45 Min.',
        schedule:'Tag 2 · 31.10. · am besten vor 16:15',
        note:'Pflichtziel für euch: Heute 09:00–17:00 geöffnet. Vier originale Festwagen sind gleichzeitig ausgestellt; Eintritt Erwachsene 1.000 ¥.',
        description:'Ausstellungshalle der originalen Festwagen des Takayama Matsuri am Sakurayama-Hachimangu-Schrein. Hier könnt ihr die aufwendig dekorierten Yatai aus nächster Nähe ansehen.'},
      {name:'Shiroyama Park',lat:36.13739,lng:137.26251,category:'sight',priority:'4',duration:'45–60 Min.',
        schedule:'Nur Reserveprogramm',
        note:'Bei eurem Zeitbudget würde ich ihn zugunsten der höher priorisierten Ziele streichen.',
        description:'Bewaldeter ehemaliger Burghügel mit Spazierwegen und wenigen erhaltenen Resten der Burg. Bei knapper Zeit verzichtbar.'},
      {name:'Bonds Brew beer craft',lat:36.1426055,lng:137.2601207,category:'restaurant',
        note:'31.10.2026 · Beim Spaziergang entdeckt – zum Merken. Adresse: Kamininomachi 67-1.',
        description:'Hida-Beef-Steak-Sandwiches und japanisches Craft-Bier im historischen Ortskern von Takayama. Offizieller Name: Bonds Brew beer craft (ボンズブリュービアークラフト).',
        schedule:'Vor Ort entdeckt · zum späteren Wiederfinden'},
      {name:'THE MACHIYA HOTEL TAKAYAMA',lat:36.13834,lng:137.25542,category:'hotel',
        schedule:'Basis · 30.10.–02.11. · Check-in ab 15:00',
        note:'Euer Hotel in Takayama. Für Tagespläne als Start-/Endpunkt verwenden; morgens nicht vor 09:00 starten.',
        description:'3-50 Hachikenmachi, Takayama. Zentrale Lage zwischen Takayama Station, Jinya und Altstadt.'},
      {name:'Takayama Station',lat:36.14113,lng:137.25129,category:'station',
        schedule:'Ankunft Tag 1 · 30.10. · 14:14',
        description:'JR-Bahnhof in Takayama; Ausgangspunkt für Busse, Altstadt und die Weiterreise.'}
    ]
  };
  function presetPlaces(planId) {
    return Object.prototype.hasOwnProperty.call(townPlacePresets,planId)
      ? normalize(townPlacePresets[planId]) : [];
  }

  // Each section is independent. Saved places are never deleted when changing sections.
  const planPresets = [
    {id:'all',name:'Alle gespeicherten Orte',kind:'all'},
    {id:'ride-takayama',name:'30.10. · Fahrt nach Takayama',kind:'journey'},
    {id:'town-takayama',name:'30.10.–01.11. · Takayama',kind:'city',center:[36.141062,137.251454]},
    {id:'ride-kyoto',name:'01.11. · Fahrt nach Kyoto',kind:'journey',center:[35.55,136.50]},
    {id:'town-kyoto',name:'01.–07.11. · Kyoto',kind:'city',center:[35.0100,135.7710]}
  ];
  function placePlanKey(place) {
    return JSON.stringify([place.name,place.lat,place.lng]);
  }
  // Edit/delete one locally saved place and migrate all references atomically
  // in memory. A name change changes the legacy name+coordinates place key.
  // Coordinates stay fixed here; relocating a marker is a separate operation.
  function changeSavedPlace(places,assignments,drafts,dayPlans,oldKey,changes){
    if(typeof oldKey!=='string'||!Array.isArray(places))
      throw new Error('Ungültiger gespeicherter Ort.');
    const index=places.findIndex(p=>placePlanKey(p)===oldKey);
    if(index<0)throw new Error('Der Ort ist nicht mehr gespeichert.');
    const previous=places[index];
    const next=changes===null?null:normalize([{
      ...previous,
      ...changes,
      lat:previous.lat,lng:previous.lng
    }])[0];
    const newKey=next===null?null:placePlanKey(next);
    if(newKey!==null&&newKey!==oldKey&&places.some((p,i)=>
      i!==index&&placePlanKey(p)===newKey))
      throw new Error('Ein Ort mit diesem Namen ist an dieser Position bereits vorhanden.');
    const updatedPlaces=places.slice();
    if(next===null)updatedPlaces.splice(index,1);
    else updatedPlaces[index]=next;
    const updatedAssignments=Object.assign(Object.create(null),assignments||{});
    if(newKey!==oldKey){
      const tags=updatedAssignments[oldKey];
      delete updatedAssignments[oldKey];
      if(newKey!==null&&Array.isArray(tags)){
        const existing=updatedAssignments[newKey];
        updatedAssignments[newKey]=[...new Set([
          ...(Array.isArray(existing)?existing:[]),...tags])];
      }
    }
    const updatedDrafts=Object.create(null);
    for(const [id,keys] of Object.entries(drafts||{})){
      if(!Array.isArray(keys))continue;
      updatedDrafts[id]=[...new Set(keys.flatMap(key=>
        key!==oldKey?[key]:newKey===null?[]:[newKey]))].slice(0,6);
    }
    const updatedDayPlans=Object.create(null);
    for(const [id,plan] of Object.entries(dayPlans||{})){
      if(!plan||typeof plan!=='object')continue;
      const copy={...plan,stops:Object.assign(Object.create(null),plan.stops||{})};
      if(newKey!==oldKey){
        const options=copy.stops[oldKey];
        delete copy.stops[oldKey];
        if(newKey!==null&&options&&!Object.hasOwn(copy.stops,newKey))
          copy.stops[newKey]=options;
      }
      updatedDayPlans[id]=copy;
    }
    return {places:updatedPlaces,assignments:updatedAssignments,
      drafts:updatedDrafts,dayPlans:updatedDayPlans,
      previous,updated:next,oldKey,newKey};
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
  const api = { categories, normalize, merge, changeSavedPlace, parse, encode, decode, distance, compassHeading, normalizeJourney, encodeJourney, decodeJourney, presetJourney, presetPlaces, planPresets, placePlanKey, placesForPlan, validCustomPlans, stationGuides, ticketStates, ticketLegKey, normalizeTicketUpdate, encodeTicketUpdate, decodeTicketUpdate };
  if (typeof module !== 'undefined') module.exports = api;
  else root.MapCore = api;
})(globalThis);