'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const RM=require('../route-model-core.js');
const C=require('../core.js'),MD=require('../multi-day-core.js'),DC=require('../day-context-core.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const goals=[
 {name:'Nara-Park',lat:34.685,lng:135.843,category:'sight'},
 {name:'Tōdai-ji',lat:34.689,lng:135.839,category:'sight'},
 {name:'Kasuga-Taisha',lat:34.681,lng:135.848,category:'sight'},
 {name:'Naramachi',lat:34.675,lng:135.832,category:'sight'}
];

test('daily straight-line preview has ordered stops, explicit uncertain segments and no invented time',()=>{
 const route=RM.preview(goals,'2026-11-04|nara');
 assert.equal(route.kind,'preview');
 assert.equal(route.real,false);
 assert.equal(route.geometry,'straight');
 assert.equal(route.stops.length,4);
 assert.equal(route.points.length,4);
 assert.equal(route.segments.length,3);
 assert.equal(route.distance,null);
 assert.equal(route.duration,null);
 assert.equal(route.style.dashArray,'5 10');
 assert.equal(route.key,'2026-11-04|nara');
 assert.match(route.note,/Luftlinie/);
 assert.match(route.note,/kein begehbarer Weg/);
 assert.deepEqual(route.segments.map(s=>[s.from.name,s.to.name]),[
   ['Nara-Park','Tōdai-ji'],['Tōdai-ji','Kasuga-Taisha'],['Kasuga-Taisha','Naramachi']
 ]);
 assert.ok(route.segments.every(s=>s.geometry==='straight'&&s.distance===null));
 assert.equal(Object.isFrozen(route.stops),true);
 assert.equal(Object.isFrozen(route.segments),true);
 assert.equal(Object.isFrozen(route.points),true);
});

test('real walking route preserves OSRM path, distances, stop order and opt-in provenance',()=>{
 const routed={
  points:[[34.685,135.843],[34.687,135.842],[34.689,135.839],[34.681,135.848],[34.675,135.832]],
  distance:4200,duration:3900,
  legs:[{distance:800,duration:700},{distance:1700,duration:1500},{distance:1700,duration:1700}]
 };
 const day=RM.walking({start:goals[0],stops:goals.slice(1),route:routed,purpose:'day',key:'day'});
 assert.equal(day.kind,'walking');
 assert.equal(day.real,true);
 assert.equal(day.geometry,'routed-foot');
 assert.equal(day.stops.length,4);
 assert.equal(day.stops[0].name,'Nara-Park');
 assert.deepEqual(day.stops.map(p=>p.name),goals.map(p=>p.name));
 assert.deepEqual(day.points,routed.points);
 assert.equal(day.distance,4200);
 assert.equal(day.duration,3900);
 assert.equal(day.legs.length,3);
 assert.equal(day.legs[0].distance,800);
 assert.equal(day.style.dashArray,null);
 assert.equal(day.segments.length,1,
   'no fake per-leg street geometry when OSRM supplies only a whole-route polyline');
 assert.equal(day.segments[0].geometry,'routed-foot');
 assert.ok(day.note.includes('Berechnete Fußwege'));
 const gps={lat:34.68,lng:135.83};
 const tour=RM.walking({start:gps,stops:goals.slice(0,3),route:routed,purpose:'tour'});
 assert.equal(tour.stops.length,3,'GPS origin must never become a visible tour stop');
 assert.equal(tour.stops[0].name,'Nara-Park');
 const single=RM.walking({start:gps,stops:[goals[0]],route:{
   points:[[34.68,135.83],[34.685,135.843]],distance:1020,duration:800
 },purpose:'single'});
 assert.equal(single.legs.length,1);
 assert.equal(single.distance,1020);
 assert.equal(single.stops.length,1);
});

test('rail model preserves confirmed stops and schematic via points without claiming track or walk',()=>{
 for(const slug of ['hakone-takayama-2026-10-30',
   'takayama-kyoto-2026-11-01','kyoto-nikko-2026-11-07']){
  const trip=C.presetJourney(slug);
  assert.ok(trip,slug);
  const route=RM.rail(trip);
  assert.equal(route.kind,'rail');
  assert.equal(route.real,false);
  assert.equal(route.geometry,'schematic-rail');
  assert.equal(route.distance,null);
  assert.equal(route.duration,null);
  assert.equal(route.legs.length,0);
  assert.equal(route.stops.length,trip.stops.length);
  assert.equal(route.segments.length,trip.stops.length-1);
  assert.ok(route.segments.every(s=>s.mode==='rail'&&s.geometry==='schematic-rail'));
  assert.ok(route.segments.every(s=>s.distance===null&&s.duration===null));
  assert.equal(route.style.dashArray,'7 7');
  assert.match(route.note,/schematische Verbindung/);
  assert.match(route.note,/keine tatsächlichen Gleise/);
  route.segments.forEach((segment,i)=>{
   const stop=trip.stops[i],next=trip.stops[i+1];
   assert.deepEqual(segment.points,[[stop.lat,stop.lng],...stop.via,[next.lat,next.lng]]);
   assert.equal(segment.departure,stop.departure);
   assert.equal(segment.arrival,next.arrival);
   assert.equal(segment.label,stop.leg);
  });
 }
});

test('route model rejects invalid points, invented lengths and contradictory foot segments',()=>{
 assert.throws(()=>RM.preview([goals[0],{...goals[1],lat:123}]),/Ungültige Koordinaten/);
 assert.throws(()=>RM.preview([goals[0]]),/Ungültige Stoppreihenfolge/);
 assert.throws(()=>RM.rail({stops:[goals[0]]}),/Ungültige Stoppreihenfolge/);
 assert.throws(()=>RM.walking({start:goals[0],stops:[goals[1]],route:{
  points:[[34.68,135.8],[34.69,135.8]],distance:-2,duration:100
 },purpose:'single'}),/Ungültige echte Gehstrecke/);
 assert.throws(()=>RM.walking({start:goals[0],stops:[goals[1]],route:{
  points:[[34.68,135.8],[34.69,135.8]],distance:250,duration:160,
  legs:[{distance:100,duration:50},{distance:150,duration:110}]
 },purpose:'tour'}),/passen nicht/);
 assert.throws(()=>RM.walking({start:goals[0],stops:[goals[1]],route:{
  points:[[34.68,135.8],[Infinity,135.8]],distance:250,duration:160
 },purpose:'single'}),/Ungültige Koordinaten/);
 assert.throws(()=>RM.walking({start:goals[0],stops:[goals[1]],route:{
  points:[[34.68,135.8],[34.69,135.8]],distance:250,duration:160
 },purpose:'rail'}),/Unbekannter Fußwegtyp/);
});

test('Leaflet, Google, day visit, walking tour and railway all use this route contract',()=>{
 const app=read('app.js'),html=read('index.html'),sw=read('sw.js');
 const workflow=read('.github/workflows/pages.yml'),stamp=read('scripts/stamp_pwa_version.py');
 assert.match(app,/const RM=window\.LivekarteRouteModel/);
 assert.match(app,/function currentDayRoute\(\)\{/);
 assert.match(app,/RM\.preview\(ordered,key\)/);
 assert.match(app,/return actual\?RM\.walking\(\{/);
 assert.match(app,/stops:\(\)=>currentMapRoute\(\)\?\.stops\|\|\[\]/);
 assert.match(app,/const view=currentDayRoute\(\)/);
 assert.match(app,/return journey\?RM\.rail\(journey\):currentDayRoute\(\)/);
 assert.match(app,/L\.polyline\(view\.points,\{/);
 assert.match(app,/\.\.\.view\.style/);
 assert.match(app,/const walkingView=RM\.walking\(\{start:startedAt,stops:\[place\],route:result,purpose:'single'\}\)/);
 assert.match(app,/const tourView=RM\.walking\(\{start:from,stops:ordered,route:result,purpose:'tour'\}\)/);
 assert.match(app,/const railView=RM\.rail\(journey\)/);
 assert.match(app,/L\.polyline\(segment\.points,railView\.style\)/);
 assert.match(html,/src="route-model-core\.js"/);
 assert.ok(html.indexOf('route-model-core.js')<html.indexOf('app.js'));
 assert.match(sw,/'route-model-core\.js'/);
 assert.match(workflow,/node --check route-model-core\.js/);
 assert.match(workflow,/cp multi-day-core\.js day-context-core\.js day-selector-ui\.js place-ui\.js tour-ui\.js route-model-core\.js public\//);
 assert.match(stamp,/"src", "route-model-core\.js"/);
});

test('one Nara trip uses day-context selected stops and the common route in each map provider',()=>{
 const presets=C.presetPlaces('town-kyoto');
 const assignments=Object.fromEntries(presets.map(p=>[C.placePlanKey(p),['town-kyoto']]));
 const dayAssignments=MD.seedDayAssignments(presets,assignments,C.placePlanKey,'town-kyoto');
 const ctx=DC.resolve({planId:'town-kyoto',day:'2026-11-04',plan:C.planPresets.find(p=>p.id==='town-kyoto'),
  places:presets,assignments,dayAssignments,placeKey:C.placePlanKey,
  placesForPlan:C.placesForPlan,calendar:MD,distance:C.distance});
 const view=RM.preview(ctx.orderedStops,ctx.routeKey(ctx.orderedStops));
 assert.equal(view.stops.length,4);
 assert.deepEqual(view.stops.map(x=>x.name),ctx.orderedStops.map(x=>x.name));
 assert.equal(view.geometry,'straight');
 assert.equal(view.real,false);
 assert.ok(view.stops.every(x=>x.category!=='hotel'));
});
