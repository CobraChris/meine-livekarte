const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const C=require('../core.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const app=read('app.js'),html=read('index.html');

test('the latest plan sets Takayama → Kyoto on 01 Nov and city to 07 Nov',()=>{
 const plans=C.planPresets;
 assert.equal(plans.find(p=>p.id==='ride-kyoto').name,'01.11. · Fahrt nach Kyoto');
 assert.equal(plans.find(p=>p.id==='town-kyoto').name,'01.–07.11. · Kyoto');
 assert.match(plans.find(p=>p.id==='town-takayama').name,/30\.10\.–01\.11/);
 assert.doesNotMatch(plans.find(p=>p.id==='ride-kyoto').name,/02\.11/);
});
test('Kyoto rail itinerary keeps schematic geometry and includes user-confirmed booking details',()=>{
 const trip=C.presetJourney('takayama-kyoto-2026-11-01');
 assert.equal(trip.title,'Takayama → Kyoto · Hida 8 / Nozomi 71');
 assert.equal(trip.date,'01.11.2026');
 assert.deepEqual(trip.stops.map(p=>p.name),['Takayama','Nagoya','Kyoto Station']);
 assert.equal(trip.stops[0].departure,'11:35');
 assert.equal(trip.stops[1].arrival,'14:04');
 assert.equal(trip.stops[1].departure,'14:26');
 assert.equal(trip.stops[2].arrival,'15:00');
 assert.match(trip.stops[0].leg,/Hida 8/);
 assert.match(trip.stops[1].leg,/Nozomi 71/);
 assert.match(trip.stops[1].description,/22 Min/);
 assert.match(trip.stops[0].description,/Klook-Buchung bestätigt/);
 assert.match(trip.stops[0].description,/Wagen 2, Sitze 10C\/10D/);
 assert.match(trip.stops[1].description,/Gleis 4/);
 assert.match(trip.stops[1].description,/Gleis 17/);
 assert.match(trip.stops[1].description,/Wagen 4, Sitze 8D\/8E/);
 assert.match(trip.stops[2].description,/Gleis 13/);
 assert.match(trip.stops[2].description,/Karasuma Oike/);
 assert.match(app,/activePlanId === 'ride-kyoto' \? C\.presetJourney\('takayama-kyoto-2026-11-01'\)/);
 assert.doesNotMatch(app.slice(app.indexOf('  function activeJourney()'),app.indexOf('  let heading')),/ready|confirmed/);
 assert.match(app,/livekarte-ticket-confirmation-kyoto-2026-11-01-v1/);
 assert.match(app,/status:'booked',source:'chat-link'/);
});
test('Kyoto city presets provide actual mapped places for the arrival and following day',()=>{
 const places=C.presetPlaces('town-kyoto');
 const names=places.map(p=>p.name);
 assert.equal(places.length,9);
 for(const name of ['Tomoya Residence Hotel Kyoto Nijo Takakura',
  'Kyoto Station','Karasuma Oike Station','Gion Shirakawa / Shinbashi',
  'Tatsumi-Brücke (Gion)','Ponto-chō','Kiyomizu-dera',
  'Sannenzaka / Ninenzaka','Fushimi Inari-Taisha'])
   assert.ok(names.includes(name),name);
 assert.equal(places.find(p=>p.name.startsWith('Tomoya Residence')).category,'hotel');
 assert.match(places.find(p=>p.name==='Kiyomizu-dera').schedule,/02\.11.*09:45–11:15/);
 assert.match(places.find(p=>p.name==='Fushimi Inari-Taisha').schedule,/15:15–17:15/);
 assert.match(places.find(p=>p.name==='Ponto-chō').schedule,/01\.11/);
 assert.equal(new Set(places.map(C.placePlanKey)).size,9);
 assert.ok(places.every(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)));
});
test('Kyoto stops are seeded for existing users without modifying their current tours or tickets',()=>{
 const section=app.slice(app.indexOf('  function seedKyotoPlaces(){'),
    app.indexOf('  // Persist only chosen place identifiers',app.indexOf('  function seedKyotoPlaces(){')));
 assert.match(section,/livekarte-kyoto-2026-11-01-v1/);
 assert.match(section,/C\.presetPlaces\('town-kyoto'\)/);
 assert.match(section,/C\.merge\(places,additions\)/);
 assert.match(section,/const found=places\.find/);
 assert.match(section,/nextAssignments\[key\]=\[\.\.\.new Set\(\[\.\.\.old,'town-kyoto'/);
 assert.match(section,/onArrivalDay\?\['ride-kyoto'\]:\[\]/);
 assert.match(section,/localStorage\.setItem\(version,'1'\)/);
 assert.doesNotMatch(section,/tourDrafts|ticketStatuses|planJourneys|clearTourRoute\(|navigator\.geolocation|fetch\(/);
});
test('both rail trip and city view show the dated program, without invented reservations',()=>{
 for(const marker of [
  'id="kyoto-overview"','01.11. · Anreise','02.11. · Higashiyama',
  '11:35–14:04','14:26–15:00','ca. 15:15–15:35',
  'Papier-Tickets abholen','Gleis 4 → Gleis 17',
  'Kiyomizu-dera','Sannenzaka','Fushimi Inari','Zugtickets für 01.11. bestätigt'])
   assert.ok(html.includes(marker),'missing '+marker);
 assert.match(app,/kyotoOverview\.hidden=!\['ride-kyoto','town-kyoto'\]\.includes\(activePlanId\)/);
 assert.match(app,/renderPlanPicker\(\);renderJourney\(\);renderKyotoOverview\(\);render\(\)/);
 assert.match(read('style.css'),/\.kyoto-overview\[hidden\]/);
 assert.match(read('sw.js'),/livekarte-shell-pwa-v18/);
});
