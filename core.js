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
      const lat = number(p?.lat), lng = number(p?.lng);
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
  function encodeJourney(journey) { return '#trip=' + encodeURIComponent(JSON.stringify(normalizeJourney(journey))); }
  function decodeJourney(hash) {
    if (!hash.startsWith('#trip=')) return null;
    if (hash.length > 30000) throw new Error('Der Reiseplan-Link ist zu groß.');
    try { return normalizeJourney(JSON.parse(decodeURIComponent(hash.slice(6)))); }
    catch (e) { throw new Error('Reiseplan-Link ungültig: ' + e.message); }
  }
  function distance(a, b) {
    const r = Math.PI / 180, dlat = (b.lat-a.lat)*r, dlng = (b.lng-a.lng)*r;
    const h = Math.sin(dlat/2)**2 + Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlng/2)**2;
    return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1,h)));
  }
  const api = { categories, normalize, merge, parse, encode, decode, distance, compassHeading, normalizeJourney, encodeJourney, decodeJourney };
  if (typeof module !== 'undefined') module.exports = api;
  else root.MapCore = api;
})(globalThis);
