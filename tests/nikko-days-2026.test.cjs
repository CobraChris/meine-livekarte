const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Core=require('../core.js'),MD=require('../multi-day-core.js'),NS=require('../next-step-core.js');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('07–10 Nov Nikko is one date-aware city itinerary with optional places',()=>{
  assert.deepEqual(MD.days('town-nikko'),[
    '2026-11-07','2026-11-08','2026-11-09','2026-11-10'
  ]);
  const places=Core.presetPlaces('town-nikko'),names=places.map(p=>p.name);
  for(const name of [
    'HaruNikko New Wing','Fairfield by Marriott Tochigi Nikko',
    'Shinkyō-Brücke (Light-up)','Shōyō-en (Lichtergarten)',
    'Futarasan-Schrein (Light-up)','Nikkō Tōshō-gū',
    'Taiyūin-Mausoleum','Kegon-Wasserfall','Chūzenji-See (Ufer)',
    'Ryūzu-Wasserfall (optional)','Tōbu-Nikkō Station'
  ]) assert.ok(names.includes(name),name);
  const assignments=Object.fromEntries(places.map(p=>[Core.placePlanKey(p),['town-nikko']]));
  const days=MD.seedDayAssignments(places,assignments,Core.placePlanKey,'town-nikko');
  const key=name=>Core.placePlanKey(places.find(p=>p.name===name));
  assert.equal(days[key('Shōyō-en (Lichtergarten)')],'2026-11-07');
  assert.equal(days[key('Nikkō Tōshō-gū')],'2026-11-08');
  assert.equal(days[key('Kegon-Wasserfall')],'2026-11-08');
  assert.equal(days[key('HaruNikko New Wing')],undefined,'hotels remain visible but unassigned');
  const day7=MD.selected(places,days,'2026-11-07',Core.placePlanKey);
  assert.ok(day7.some(p=>p.name==='Shōyō-en (Lichtergarten)'));
  assert.ok(day7.some(p=>p.name==='HaruNikko New Wing'));
  assert.ok(!day7.some(p=>p.name==='Kegon-Wasserfall'));
});

test('Nikko maps are real location markers, not invented direct bus or walking timetables',()=>{
  const places=Core.presetPlaces('town-nikko');
  for(const p of places){
    assert.ok(Number.isFinite(p.lat)&&Number.isFinite(p.lng),p.name);
    assert.ok(p.lat>36.65&&p.lat<36.85,p.name);
    assert.ok(p.lng>139.35&&p.lng<139.75,p.name);
  }
  const optional=places.filter(p=>p.name.includes('(optional)'));
  assert.equal(optional.length,2);
  assert.ok(optional.every(p=>p.note.includes('Optional')||p.note.includes('nur')));
  assert.match(places.find(p=>p.name==='Kegon-Wasserfall').note,/Bus/);
  assert.match(places.find(p=>p.name==='Ryūzu-Wasserfall (optional)').note,/Busfahrt/);
  assert.match(places.find(p=>p.name==='HaruNikko New Wing').note,/näherungsweise/);
});

test('current-day guidance moves from rail to light-up and does not assert ticket completion',()=>{
  const before=NS.todaySuggestion(new Date('2026-11-07T06:50:00Z'));
  const after=NS.todaySuggestion(new Date('2026-11-07T07:00:00Z'));
  assert.equal(before.planId,'ride-nikko');
  assert.equal(after.planId,'town-nikko');
  assert.equal(after.dayIndex,0);
  assert.match(after.summary,/Shōyō-en/);
  assert.equal(NS.todaySuggestion(new Date('2026-11-08T02:00:00Z')).dayIndex,1);
  assert.equal(NS.todaySuggestion(new Date('2026-11-09T02:00:00Z')).dayIndex,2);
});

test('return journey and hotel changes are modeled without public booking references',()=>{
  const journey=Core.presetJourney('nikko-tokyo-2026-11-10');
  assert.equal(journey.date,'10.11.2026');
  assert.equal(journey.stops[0].departure,'12:55');
  assert.equal(journey.stops[1].arrival,'14:40');
  assert.match(journey.stops[0].description,/Grundfahrkarte/);
  assert.ok(Core.planPresets.some(p=>p.id==='ride-tokyo'));
  const html=read('index.html'),app=read('app.js');
  for(const id of ['nikko-days','nikko-day-07','nikko-day-08','nikko-day-09','nikko-day-10','nikko-return-steps'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(html,/HaruNikko New Wing/);
  assert.match(html,/Fairfield by Marriott Tochigi Nikko/);
  assert.match(html,/20:30/);
  assert.match(html,/SPACIA X 6/);
  assert.match(app,/seedApprovedNikkoDays/);
  assert.match(app,/livekarte-nikko-days-2026-11-07-v2/);
  assert.match(app,/!Object\.hasOwn\(nextDays,key\)/);
  assert.doesNotMatch(app.slice(app.indexOf('function seedApprovedNikkoDays'),
    app.indexOf('seedApprovedNikkoDays();',app.indexOf('function seedApprovedNikkoDays'))),
    /localStorage\.clear|ticketStatuses\[|indexedDB\.deleteDatabase/);
  assert.ok(!html.includes('5592209030'),'No public booking number');
});

test('the Nov 8 Kegon bus departure is a separate, uniquely named map marker',()=>{
  const list=Core.presetPlaces('town-nikko');
  const stop=list.find(p=>p.name==='Nikkō Gyōsei Center-mae (Bushaltestelle)');
  const departure=list.find(p=>p.name==='🚌 START – Tōbu-Nikkō Bussteig 2A');
  const falls=list.filter(p=>p.name==='Kegon-Wasserfall');
  assert.equal(falls.length,1,'existing waterfall marker must not be duplicated');
  assert.ok(stop,'alternative stop must exist');
  assert.ok(departure,'actual bus departure stop 2A must be on the map');
  assert.equal(departure.category,'station');
  assert.match(departure.note,/2A/);
  assert.match(departure.schedule,/08.11./);
  assert.equal(stop.category,'station');
  assert.equal(falls[0].category,'nature');
  assert.match(stop.schedule,/08.11./);
  assert.match(stop.note,/Straßenseite/);
  assert.match(stop.note,/中禅寺温泉/);
  const assignments=Object.fromEntries(list.map(p=>[Core.placePlanKey(p),['town-nikko']]));
  const dateMap=MD.seedDayAssignments(list,assignments,Core.placePlanKey,'town-nikko');
  assert.equal(dateMap[Core.placePlanKey(stop)],'2026-11-08');
  assert.equal(dateMap[Core.placePlanKey(departure)],'2026-11-08');
  assert.equal(dateMap[Core.placePlanKey(falls[0])],'2026-11-08');
  const app=read('app.js');
  const from=app.indexOf('function seedNikkoKegonBusStops(){'),
    to=app.indexOf('seedNikkoKegonBusStops();',from);
  assert.ok(from>=0&&to>from,'additive one-time import is wired');
  const body=app.slice(from,to);
  assert.match(body,/const existingBus=places.find/);
  assert.match(body,/C.merge\(places,additions\)/);
  assert.match(body,/existingDeparture/);
  assert.match(app,/p.name.startsWith\('🚌 START'\)\?'🚌':symbols\[p.category\]/);
  assert.match(body,/nextDays\[key\]==='2026-11-09'/);
  assert.match(body,/localStorage.setItem\('livekarte-city-day-assignments-v1'/);
  assert.doesNotMatch(body,/ticketStatuses\[|localStorage.clear|indexedDB/);
});
