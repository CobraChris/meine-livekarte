const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const W=require('../walking-core.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const start={lat:36.1400,lng:137.2500};
const a={lat:36.1410,lng:137.2510,name:'Markt'};
const b={lat:36.1420,lng:137.2520,name:'Altstadt'};
const c={lat:36.1430,lng:137.2530,name:'Museum'};
const points=[start,a,b,c];
const sample={
  points:points.map(p=>[p.lat,p.lng]),
  distance:600,duration:480,
  legs:[
    {distance:200,duration:160},
    {distance:200,duration:160},
    {distance:200,duration:160}
  ]
};

test('tour GPS progress uses route legs to target the next stop, not the final endpoint',()=>{
 const nav=W.prepareNavigation(sample);
 const initial=W.tourLegProgress(nav,sample.legs,0,a,start,7);
 assert.equal(initial.status,'on-route');
 assert.ok(initial.remainingMeters>150);
 assert.ok(initial.remainingMeters<=200);
 assert.equal(initial.remainingSeconds,initial.remainingMeters/200*160);
 const arrived=W.tourLegProgress(nav,sample.legs,0,a,a,7);
 assert.equal(arrived.status,'near-goal');
 assert.ok(arrived.destinationMeters<1);
 const second=W.tourLegProgress(nav,sample.legs,1,b,b,7);
 assert.equal(second.status,'near-goal');
 assert.ok(second.remainingMeters<10);
 assert.ok(W.tourLegProgress(nav,sample.legs,0,a,a,75).status==='poor-gps');
 assert.throws(()=>W.tourLegProgress(nav,sample.legs,-1,a,a,7),/ungültig/);
 assert.throws(()=>W.tourLegProgress(nav,sample.legs,4,a,a,7),/ungültig/);
});

test('GPS location outside the pedestrian corridor warns but does not request routes',()=>{
 const nav=W.prepareNavigation(sample);
 const wrong={lat:36.1500,lng:137.2640};
 const progress=W.tourLegProgress(nav,sample.legs,0,a,wrong,5);
 assert.equal(progress.status,'off-route');
 assert.ok(progress.offRouteMeters>40);
 const nearNoisy=W.tourLegProgress(nav,sample.legs,0,a,a,31);
 assert.notEqual(nearNoisy.status,'near-goal','a noisy GPS fix must not claim arrival');
});

test('tour HUD supports manual stages, pause, arrival confirmation and explicit recalculation',()=>{
 const app=read('app.js'),html=read('index.html'),css=read('style.css');
 for(const id of ['tour-live-state','tour-live-step','tour-live-progress','tour-live-message',
    'tour-live-toggle','tour-live-next','tour-live-retry'])
   assert.match(html,new RegExp('id="'+id+'"'));
 for(const fragment of ['function stopTourNavigation()', 'function updateTourNavigation(point,gpsAccuracy)',
   'function startTourNavigation()','W.prepareNavigation(tourRoute)',
   'W.tourLegProgress(state.nav,tourRoute.legs','state.nearReadings>=2',
   'state.offReadings>=2','tourNavigation.stage++',
   'tourNavigation.paused=true','tourNavigation.paused=false',
   'Nächster Stopp','Rundgang abgeschlossen',
   "tourLiveRetry.onclick=()=>{void calculateTour(false,true);}",
   "updateTourNavigation(position,positionAccuracy);",
   "stopTourNavigation();"])
   assert.ok(app.includes(fragment),'Missing '+fragment);
 assert.match(app,/const selected=remaining&&tourNavigation&&tourRoute/);
 assert.match(app,/selected.length===1\?W.requestUrl\(from,selected\[0\]\)/);
 assert.match(app,/selected.length===1\s*\?\(\(\)=>\{const single=W.parse\(data,from,selected\[0\]\)/);
 assert.match(css,/\.tour-live-state/);
 assert.match(css,/\.tour-live-actions/);
 assert.match(html,/Keine automatischen Routinganfragen/);
});

test('GPS watch callbacks are offline-only and the tour state is not persisted',()=>{
 const app=read('app.js');
 const updating=app.slice(app.indexOf('  function updateTourNavigation('),app.indexOf('  function startTourNavigation('));
 assert.doesNotMatch(updating,/fetch\(|localStorage|sessionStorage|routing\.openstreetmap/);
 const watch=app.slice(app.indexOf('watch = navigator.geolocation.watchPosition('),
  app.indexOf('}, error => {',app.indexOf('watch = navigator.geolocation.watchPosition(')));
 assert.match(watch,/updateTourNavigation\(position,positionAccuracy\)/);
 assert.doesNotMatch(watch,/fetch\(|localStorage|sessionStorage/);
 const stored=app.slice(app.indexOf('  function persistTourDrafts(){'),
   app.indexOf('  function clearTourRoute(){'));
 assert.match(stored,/tourDrafts/);
 assert.doesNotMatch(stored,/tourNavigation|position|tourRoute/);
 assert.match(app,/if\(activePlanId!==id\)clearTourRoute\(\)/);
 assert.match(app,/clearWalkingRoute\(\);\s*stopTourNavigation\(\);\s*watch = null/);
 const sw=read('sw.js');
 assert.match(sw,/livekarte-shell-pwa-v10/);
 assert.doesNotMatch(sw,/routed-foot|routing\.openstreetmap/);
});
