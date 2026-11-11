const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Core=require('../core.js'),MD=require('../multi-day-core.js'),NS=require('../next-step-core.js');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('Tokyo 11–12 Nov appear as dated choices with additive, localized pins',()=>{
  assert.deepEqual(MD.days('town-tokyo'),['2026-11-11','2026-11-12']);
  const places=Core.presetPlaces('town-tokyo');
  assert.equal(places.length,7);
  assert.ok(places.every(p=>p.lat>35.65&&p.lat<35.78&&p.lng>139.67&&p.lng<139.85));
  for(const name of ['THE skM TOKYO HOTEL & DINING','Shinjuku Gyoen National Garden (新宿御苑)',
    'Yoshioka-Ramen Mejiro (自家製熟成麺 吉岡)','Rikugien-Garten (六義園)',
    'Akihabara Electric Town (秋葉原)','Kinshichō PARCO (optionale Einkäufe)',
    'Kinshichō Station (錦糸町)'])
    assert.ok(places.some(p=>p.name===name),name);
  const tags=Object.fromEntries(places.map(p=>[Core.placePlanKey(p),['town-tokyo']]));
  const assigned=MD.seedDayAssignments(places,tags,Core.placePlanKey,'town-tokyo');
  const key=name=>Core.placePlanKey(places.find(p=>p.name.includes(name)));
  assert.equal(assigned[key('Shinjuku')],'2026-11-11');
  assert.equal(assigned[key('Yoshioka')],'2026-11-11');
  assert.equal(assigned[key('Rikugien')],'2026-11-11');
  assert.equal(assigned[key('Akihabara')],'2026-11-11');
  assert.equal(assigned[key('PARCO')],'2026-11-12');
  assert.equal(assigned[key('Kinshichō Station')],'2026-11-12');
  assert.equal(assigned[key('THE skM')],undefined);
  assert.equal(MD.selected(places,assigned,'2026-11-11',Core.placePlanKey).length,5);
  assert.equal(MD.selected(places,assigned,'2026-11-12',Core.placePlanKey).length,3);
  assert.match(places.find(p=>p.name.includes('Yoshioka')).note,/14:00/);
});

test('Japan local date opens correct Tokyo day and past travel logic stays intact',()=>{
  const today=NS.todaySuggestion(new Date('2026-11-11T01:30:00Z'));
  const tomorrow=NS.todaySuggestion(new Date('2026-11-12T01:30:00Z'));
  assert.equal(today.planId,'town-tokyo');
  assert.equal(today.dayIndex,0);
  assert.match(today.summary,/Yoshioka/);
  assert.equal(tomorrow.planId,'town-tokyo');
  assert.equal(tomorrow.dayIndex,1);
  assert.match(tomorrow.summary,/21:55/);
  assert.equal(NS.isPastTravelView('town-tokyo',new Date('2026-11-12T01:30:00Z')),false);
  assert.equal(NS.isPastTravelView('town-tokyo',new Date('2026-11-13T01:30:00Z')),true);
});

test('Tokyo overview has transport caveats, clickable maps, flight without invented airport',()=>{
  const app=read('app.js'),html=read('index.html'),calendar=read('multi-day-core.js');
  for(const id of ['tokyo-overview','tokyo-days','tokyo-day-11','tokyo-day-12'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(html,/21:55/);
  assert.match(html,/Shinjuku Gyoen/);
  assert.match(html,/Rikugien/);
  assert.match(html,/Akihabara/);
  assert.match(html,/Yoshioka/);
  assert.match(html,/Flughafen und Terminal/);
  assert.match(html,/google\.com\/maps/);
  assert.match(html,/Bahn/);
  assert.match(app,/function seedTokyoFinalDays/);
  assert.match(app,/livekarte-tokyo-final-days-2026-11-11-v1/);
  assert.match(app,/!Object\.hasOwn\(nextDays,key\)/);
  assert.match(app,/town-tokyo/);
  assert.match(calendar,/town-tokyo/);
  const seed=app.slice(app.indexOf('function seedTokyoFinalDays'),app.indexOf('seedTokyoFinalDays();'));
  assert.doesNotMatch(seed,/localStorage\.clear|removeItem\(|deleteDatabase|ticketStatuses\[/);
});
