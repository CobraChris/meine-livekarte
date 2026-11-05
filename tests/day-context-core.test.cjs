'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const C=require('../core.js');
const MD=require('../multi-day-core.js');
const DC=require('../day-context-core.js');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const key=C.placePlanKey;
const kyoto=C.presetPlaces('town-kyoto');
const planPlaces=kyoto.map(p=>({...p}));
const assignments=Object.fromEntries(planPlaces.map(p=>[key(p),['town-kyoto']]));
const dayAssignments=MD.seedDayAssignments(planPlaces,assignments,key,'town-kyoto');
const kyotoPlan=C.planPresets.find(p=>p.id==='town-kyoto');
const resolve=(planId,day,more={})=>DC.resolve({
  planId,day,
  plan:planId==='town-kyoto'?kyotoPlan:{id:planId,kind:'city',name:planId},
  journey:null,places:planPlaces,assignments,
  dayAssignments,placeKey:key,placesForPlan:C.placesForPlan,
  calendar:MD,distance:C.distance,...more
});

test('one day context produces consistent goals, counts, route order and tour key across dates',()=>{
 for(const date of ['2026-11-03','2026-11-04','2026-11-05']){
   const ctx=resolve('town-kyoto',date);
   const expected=MD.selected(planPlaces,dayAssignments,date,key);
   assert.deepEqual(ctx.visiblePlaces,expected,date);
   assert.deepEqual(ctx.displayGoals,expected.filter(p=>p.category!=='hotel'),date);
   assert.deepEqual(ctx.mapFocusPlaces,ctx.displayGoals,date);
   assert.equal(ctx.counts[date],ctx.displayGoals.length,date);
   assert.deepEqual(ctx.orderedStops,MD.optimizeDayOrder(ctx.displayGoals,C.distance),date);
   assert.equal(ctx.routeType,'day-visit',date);
   assert.equal(ctx.tourKey,'town-kyoto@'+date,date);
   assert.equal(ctx.routeKey(ctx.orderedStops),date+'|'+ctx.orderedStops.map(key).join('|'),date);
 }
 const nara=resolve('town-kyoto','2026-11-04');
 assert.equal(nara.displayGoals.length,4,'four Nara goals');
 assert.equal(nara.orderedStops[0].name,'Nara-Park','keep scheduled first stop');
 const osaka=resolve('town-kyoto','2026-11-05');
 assert.equal(osaka.displayGoals.length,7,'seven Osaka day goals');
 assert.equal(osaka.orderedStops.length,7,'route preview and map share one order');
});

test('hotel remains in visible day markers but cannot stretch the day trip or count as a destination',()=>{
 const nara=resolve('town-kyoto','2026-11-04');
 assert.ok(nara.visiblePlaces.some(p=>p.category==='hotel'));
 assert.ok(nara.mapFocusPlaces.every(p=>p.category!=='hotel'));
 assert.ok(nara.orderedStops.every(p=>p.category!=='hotel'));
 assert.equal(nara.counts[MD.ALL],planPlaces.filter(p=>p.category!=='hotel').length);
 assert.equal(nara.dayLabel,'04.11.');
 assert.deepEqual(nara.days,MD.days('town-kyoto'));
 const all=resolve('town-kyoto',MD.ALL);
 assert.equal(all.isDated,false);
 assert.deepEqual(all.mapFocusPlaces,all.visiblePlaces,
   'all days retains hotel as useful context');
 assert.equal(all.orderedStops.length,0,'no invented multi-day walking route');
 const unassigned=resolve('town-kyoto',MD.UNASSIGNED);
 assert.equal(unassigned.counts[MD.UNASSIGNED],unassigned.displayGoals.length);
});

test('new assignments change all views at once without mutating original data or stale caches',()=>{
 const sourceSnapshot=JSON.stringify({planPlaces,assignments,dayAssignments});
 const old=resolve('town-kyoto','2026-11-04');
 const moved={...dayAssignments};
 const place=old.displayGoals[1];
 moved[key(place)]='2026-11-05';
 const nara=resolve('town-kyoto','2026-11-04',{dayAssignments:moved});
 const osaka=resolve('town-kyoto','2026-11-05',{dayAssignments:moved});
 assert.equal(nara.displayGoals.length,old.displayGoals.length-1);
 assert.equal(nara.counts['2026-11-04'],nara.displayGoals.length);
 assert.ok(!nara.orderedStops.some(p=>key(p)===key(place)));
 assert.ok(osaka.orderedStops.some(p=>key(p)===key(place))||osaka.orderedStops.length===0);
 assert.equal(osaka.counts['2026-11-05'],osaka.displayGoals.length);
 assert.equal(JSON.stringify({planPlaces,assignments,dayAssignments}),sourceSnapshot);
 assert.equal(Object.isFrozen(nara.visiblePlaces),true);
 assert.equal(Object.isFrozen(nara.orderedStops),true);
 assert.equal(Object.isFrozen(nara.counts),true);
});

test('other city, rail or user-created plans remain valid without invented calendar dates',()=>{
 const arbitrary=resolve('custom-japan','2026-11-04',{
   places:[{name:'Eigener Ort',lat:35,lng:135,category:'sight'}],
   assignments:{},plan:{id:'custom-japan',kind:'city',name:'Eigener Ort'}
 });
 assert.deepEqual(arbitrary.visiblePlaces,[]);
 assert.deepEqual(arbitrary.days,[]);
 assert.equal(arbitrary.day,MD.ALL);
 assert.equal(arbitrary.tourKey,'custom-japan');
 assert.equal(arbitrary.routeType,'places');
 assert.equal(arbitrary.orderedStops.length,0);
 const tagged={name:'Bahnhof',lat:35,lng:135,category:'station'};
 const rail=resolve('ride-nikko','2026-11-04',{
   places:[tagged],
   assignments:{[key(tagged)]:['ride-nikko']},
   plan:{id:'ride-nikko',kind:'journey',name:'Nikkō'},
   journey:{date:'07.11.2026',stops:[{name:'Kyoto'},{name:'Nikkō'}]}
 });
 assert.equal(rail.visiblePlaces.length,1);
 assert.equal(rail.routeType,'rail');
 assert.equal(rail.day,MD.ALL);
 assert.equal(rail.tourKey,'ride-nikko');
 const invalidDay=resolve('town-kyoto','2028-11-04');
 assert.equal(invalidDay.day,MD.ALL,'never invent new travel dates');
 assert.equal(invalidDay.isDated,false);
 assert.throws(()=>DC.resolve({planId:null,places:[],placeKey:key}),/Ungültiger/);
});

test('UI, daily route, maps and offline shell all use the shared day context',()=>{
 const app=read('app.js'),html=read('index.html'),sw=read('sw.js');
 const workflow=read('.github/workflows/pages.yml');
 const stamp=read('scripts/stamp_pwa_version.py');
 assert.match(app,/const DC=window\.LivekarteDayContext/);
 assert.match(app,/const currentDayContext=\(\)=>DC\.resolve\(/);
 assert.match(app,/const currentPlaces = \(\) => currentDayContext\(\)\.planPlaces/);
 assert.match(app,/const visiblePlaces = \(\) => currentDayContext\(\)\.visiblePlaces/);
 assert.match(app,/const mapFocusPlaces = \(\) => currentDayContext\(\)\.mapFocusPlaces/);
 assert.match(app,/const tourContextKey=\(\)=>currentDayContext\(\)\.tourKey/);
 assert.match(app,/return currentDayContext\(\)\.orderedStops/);
 assert.match(app,/return currentDayContext\(\)\.routeKey\(stops\)/);
 const ui=read('day-selector-ui.js');
 assert.match(app,/context:currentDayContext\(\),activeDay:activeCityDay/);
 assert.match(ui,/context\.counts\[day\]\|\|0/);
 assert.match(ui,/assigned=context\.displayGoals/);
 assert.match(html,/src="day-context-core\.js"/);
 assert.ok(html.indexOf('day-context-core.js')<html.indexOf('app.js'));
 assert.match(sw,/'day-context-core\.js'/);
 assert.match(workflow,/node --check day-context-core\.js/);
 assert.match(workflow,/cp multi-day-core\.js day-context-core\.js day-selector-ui\.js place-ui\.js tour-ui\.js route-model-core\.js public\//);
 assert.match(stamp,/"src", "day-context-core\.js"/);
});
