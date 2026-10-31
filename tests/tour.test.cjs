const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const W=require('../walking-core.js');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const at=(lat,lng,name)=>({lat,lng,name});
const start=at(36.14,137.25,'GPS');
const stops=[
  at(36.141,137.252,'Morning Market'),
  at(36.142,137.254,'Old Town'),
  at(36.143,137.256,'Bridge')
];
const lngLat=p=>[p.lng,p.lat];
const route={
 code:'Ok',
 waypoints:[start,...stops].map(p=>({location:lngLat(p),distance:0})),
 routes:[{
  distance:940,duration:720,
  legs:[
   {distance:240,duration:190},
   {distance:330,duration:245},
   {distance:370,duration:285}
  ],
  geometry:{type:'LineString',coordinates:[start,...stops].map(lngLat)}
 }]
};

test('a single FOSSGIS foot request joins current GPS with 2-6 chosen POIs in the supplied order',()=>{
 const url=W.tourRequestUrl(start,stops);
 assert.match(url,/^https:\/\/routing\.openstreetmap\.de\/routed-foot\/route\/v1\/driving\//);
 assert.match(url,/137\.250000,36\.140000;137\.252000,36\.141000;137\.254000,36\.142000;137\.256000,36\.143000/);
 assert.match(url,/overview=full&geometries=geojson&steps=false&alternatives=false/);
 assert.doesNotMatch(url,/access_token|key=|ghp_|github_pat_/);
 assert.equal(url.split('?')[0].split(';').length,4);
 assert.throws(()=>W.tourRequestUrl(start,[stops[0]]),/2 bis 6/);
 assert.throws(()=>W.tourRequestUrl(start,Array(7).fill(stops[0])),/2 bis 6/);
 assert.throws(()=>W.tourRequestUrl(null,stops),/2 bis 6/);
 assert.throws(()=>W.tourRequestUrl(start,[at(NaN,10),stops[0]]),/ungültig/);
 assert.throws(()=>W.tourRequestUrl(start,[at(36.8,138.1),stops[0]]),/12 km/);
});

test('real OSRM leg lengths and geometry are verified before showing tour or visit order',()=>{
 const result=W.parseTour(route,start,stops);
 assert.equal(result.points.length,4);
 assert.equal(result.distance,940);
 assert.equal(result.duration,720);
 assert.deepEqual(result.legs,[{distance:240,duration:190},{distance:330,duration:245},{distance:370,duration:285}]);
 assert.equal(W.distanceText(result.distance),'940 m');
 assert.equal(W.durationText(result.duration),'12 Min.');
 assert.throws(()=>W.parseTour({...route,code:'NoRoute'},start,stops),/keinen durchgehenden/);
 assert.throws(()=>W.parseTour({...route,waypoints:route.waypoints.slice(0,-1)},start,stops),/nicht alle/);
 assert.throws(()=>W.parseTour({...route,routes:[{...route.routes[0],legs:[]}]},start,stops),/nicht alle/);
 assert.throws(()=>W.parseTour({...route,waypoints:route.waypoints.map((p,i)=>
   i===2?{location:[139,37]}:p)},start,stops),/zu weit/);
 assert.throws(()=>W.parseTour({...route,routes:[{...route.routes[0],legs:[
   {distance:240,duration:190},{distance:330,duration:-1},{distance:370,duration:285}
 ]}]},start,stops),/ungültige Etappen/);
 assert.throws(()=>W.parseTour({...route,routes:[{...route.routes[0],legs:[
   {distance:240,duration:190},{distance:330,duration:245},{distance:10000,duration:285}
 ]}]},start,stops),/passen nicht/);
 assert.throws(()=>W.parseTour({...route,routes:[{...route.routes[0],geometry:
   {type:'LineString',coordinates:[[0,0],[0,0]]}}]},start,stops),/zu weit/);
});

test('the nearest-first option is a stable, offline direct-distance heuristic, not a fake optimal route',()=>{
 const shuffled=[stops[2],stops[0],stops[1]];
 const input=shuffled.slice();
 const ordered=W.nearestTourOrder(start,shuffled);
 assert.deepEqual(ordered.map(p=>p.name),stops.map(p=>p.name));
 assert.deepEqual(shuffled,input,'the original stop sequence is not mutated');
 assert.equal(W.nearestTourOrder(start,[stops[0],stops[0]])[0],stops[0]);
});


test('one FOSSGIS Trip request optimizes walking order from GPS, leaving final stop free',()=>{
 const unordered=[stops[2],stops[0],stops[1]];
 const url=W.optimizedTourRequestUrl(start,unordered);
 assert.match(url,/^https:\/\/routing\.openstreetmap\.de\/routed-foot\/trip\/v1\/driving\//);
 assert.match(url,/roundtrip=false&source=first&destination=any/);
 assert.match(url,/overview=full&geometries=geojson&steps=false/);
 assert.equal(url.split('?')[0].split(';').length,4);
 assert.doesNotMatch(url,/access_token|key=|ghp_/);
 // This manual input order would violate the 12 km bound; sorted local
 // candidate can still succeed when all points belong to one compact area.
 const nearby=[stops[0],stops[1],stops[2]];
 assert.equal(W.optimizedTourRequestUrl(start,nearby).split(';').length,4);
 assert.throws(()=>W.optimizedTourRequestUrl(start,[at(36.8,138.1),stops[0]]),/12 km/);
});

test('Trip waypoint indices reorder stops and route legs consistently',()=>{
 const permutation=[0,2,1,3]; // GPS, original second, original first, original third
 const source=[start,...stops];
 const optimized={
   code:'Ok',
   waypoints:source.map((p,original)=>({
     location:lngLat(p),distance:0,trips_index:0,
     waypoint_index:permutation.indexOf(original)
   })),
   trips:[{
     distance:940,duration:720,
     legs:[{distance:240,duration:190},{distance:330,duration:245},{distance:370,duration:285}],
     geometry:{type:'LineString',coordinates:permutation.map(i=>lngLat(source[i]))}
   }]
 };
 const input=stops.slice();
 const result=W.parseOptimizedTour(optimized,start,stops);
 assert.deepEqual(result.orderedStops,[stops[1],stops[0],stops[2]]);
 assert.deepEqual(stops,input,'input places are untouched');
 assert.equal(result.distance,940);
 assert.equal(result.legs.length,3);
 assert.throws(()=>W.parseOptimizedTour({...optimized,code:'NoTrips'},start,stops),/nicht optimieren/);
 assert.throws(()=>W.parseOptimizedTour({...optimized,waypoints:optimized.waypoints.slice(1)},start,stops),/nicht optimieren/);
 assert.throws(()=>W.parseOptimizedTour({...optimized,waypoints:optimized.waypoints.map((p,i)=>
   i===2?{...p,waypoint_index:2}:p)},start,stops),/ungültig/);
 assert.throws(()=>W.parseOptimizedTour({...optimized,waypoints:optimized.waypoints.map((p,i)=>
   i===0?{...p,waypoint_index:3}:p)},start,stops),/ungültig|GPS/);
 assert.throws(()=>W.parseOptimizedTour({...optimized,waypoints:optimized.waypoints.map((p,i)=>
   i===2?{...p,location:[139,37]}:p)},start,stops),/zu weit/);
 assert.throws(()=>W.parseOptimizedTour({...optimized,trips:[{...optimized.trips[0],legs:[]}]},start,stops),/nicht alle/);
});

test('optimization is explicit, persists stop IDs only, and keeps existing manual calculation',()=>{
 const app=read('app.js'),html=read('index.html');
 assert.match(html,/id="tour-optimize"/);
 assert.match(html,/Route durch KI optimieren/);
 assert.match(app,/\$\('tour-optimize'\)\.onclick=\(\)=>\{void calculateTour\(true\);\}/);
 assert.match(app,/\$\('tour-calculate'\)\.onclick=\(\)=>\{void calculateTour\(\);\}/);
 assert.match(app,/tourDrafts\[activePlanId\]=ordered\.map\(p=>C\.placePlanKey\(p\)\)/);
 assert.match(app,/const ordered=optimized\?result\.orderedStops:selected/);
 assert.match(app,/ordered\.forEach\(\(place,i\)=>/);
 assert.match(app,/tourController\)return/);
 assert.doesNotMatch(app.slice(app.indexOf('function persistTourDrafts()'),
   app.indexOf('function clearTourRoute()')),/position|geometry|tourRoute/);
});

test('multistop builder is optional, compact and has reorder/removal/accessibility actions',()=>{
 const html=read('index.html'),app=read('app.js'),css=read('style.css');
 for(const id of ['tour-builder','tour-count','tour-stops','tour-optimize','tour-clear',
   'tour-calculate','tour-builder-status','tour-result','tour-result-summary',
   'tour-result-legs','tour-route-hud','tour-route-title','tour-route-metrics',
   'tour-route-note','tour-route-close'])
   assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/<details id="tour-builder"/);
 assert.match(html,/Rundgang planen/);
 assert.match(html,/„＋ Tour“/);
 assert.match(html,/Rundgang berechnen/);
 assert.match(html,/Reine Gehzeit ohne Besichtigungen/);
 assert.match(app,/function toggleTourPlace\(place,fromMap=false\)/);
 assert.match(app,/function renderTourBuilder\(\)/);
 assert.match(app,/function setTourSelection\(items\)/);
 assert.match(app,/C\.placePlanKey\(p\)/);
 assert.match(app,/new Set\(keys\)/);
 assert.match(app,/aria-pressed/);
 assert.match(app,/W\.optimizedTourRequestUrl\(from,selected\)/);
 assert.match(app,/W\.tourRequestUrl\(from,selected\)/);
 assert.match(app,/W\.parseOptimizedTour\(data,from,selected\)/);
 assert.match(app,/W\.parseTour\(data,from,selected\)/);
 assert.match(app,/result\.legs\.forEach/);
 assert.match(app,/L\.polyline\(result\.points/);
 assert.match(app,/L\.divIcon\(\{className:'tour-stop-marker'/);
 assert.match(app,/tourHud\.hidden=false/);
 assert.match(css,/\.tour-builder>summary/);
 assert.match(css,/\.tour-route-hud\[hidden\]\{display:none!important\}/);
 assert.match(css,/\.tour-stop-marker span/);
});

test('tour sends GPS only on explicit calculation and does not save routes or location history',()=>{
 const app=read('app.js');
 const start=app.indexOf('  async function calculateTour(optimized=false,remaining=false){');
 const end=app.indexOf('  function placeMeta(p)',start);
 assert.ok(start>=0 && end>start);
 const block=app.slice(start,end);
 assert.match(block,/if\(watch===null\|\|!position\|\|Date\.now\(\)-positionUpdatedAt>60000\)/);
 assert.match(block,/Date\.now\(\)-Math\.max\(lastTourRequestedAt,lastWalkingRequestAt\)<1200/);
 assert.match(block,/fetch\(request,\{/);
 assert.match(block,/credentials:'omit'/);
 assert.match(block,/referrerPolicy:'origin'/);
 assert.match(block,/controller\.abort\(\)/);
 assert.match(block,/tourRequestGeneration/);
 assert.match(block,/map\.fitBounds/);
 assert.match(app,/livekarte-tour-drafts-v1/);
 const saveStart=app.indexOf('  function persistTourDrafts(){');
 const saveEnd=app.indexOf('  function clearTourRoute(){',saveStart);
 const saveBlock=app.slice(saveStart,saveEnd);
 assert.match(saveBlock,/JSON\.stringify\(tourDrafts\)/);
 assert.doesNotMatch(saveBlock,/position|walkRouteData|tourRoute|result\.points/);
 const progress=app.slice(app.indexOf('function updateWalkingNavigation('),
   app.indexOf('function startWalkingNavigation('));
 assert.doesNotMatch(progress,/fetch\(/);
});

test('tour keeps normal routes and railway views safe; updated PWA shell is offline without caching OSRM',()=>{
 const app=read('app.js'),sw=read('sw.js'),html=read('index.html');
 assert.match(app,/if\(activePlanId!==id\)clearTourRoute\(\)/);
 assert.match(app,/if\(tourRoute \|\| tourController\)clearTourRoute\(\)/);
 assert.match(app,/if\(activePlanId!==id && walkDestination\)clearWalkingRoute\(\)/);
 assert.match(app,/clearTourRoute\(\);\s*tourDrafts=Object\.create\(null\)/);
 assert.match(app,/clearWalkingRoute\(\);\s*clearTourRoute\(\);/);
 assert.match(sw,/livekarte-shell-pwa-v18/);
 assert.doesNotMatch(sw,/routed-foot|routing\.openstreetmap\.de/);
 assert.match(html,/src="walking-core\.js"/);
 assert.match(html,/id="walk-route-nav"/);
 assert.match(html,/id="sync-panel"/);
});
