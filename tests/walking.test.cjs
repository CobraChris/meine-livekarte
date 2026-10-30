const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const R=require('../walking-core.js');
const root=path.join(__dirname,'..'),read=p=>readFileSync(path.join(root,p),'utf8');
const from={lat:36.1410,lng:137.2520};
const to={lat:36.1450,lng:137.2590};
const route={code:'Ok',routes:[{
  distance:890.25,duration:712.5,
  geometry:{type:'LineString',coordinates:[
    [137.2520,36.1410],[137.2526,36.1420],
    [137.2570,36.1440],[137.2590,36.1450]
  ]}
}]};

test('walking requests only use FOSSGIS OSRM FOOT profile, no tokens or third-party geocoding',()=>{
 const url=R.requestUrl(from,to);
 assert.match(url,/^https:\/\/routing\.openstreetmap\.de\/routed-foot\/route\/v1\/driving\//);
 assert.ok(url.includes('137.252000,36.141000;137.259000,36.145000'));
 assert.match(url,/overview=full&geometries=geojson&steps=false/);
 assert.doesNotMatch(url,/token|access_token|key=|maps\.google/i);
 assert.ok(R.metres(from,to)>600);
 assert.ok(R.metres(from,to)<1500);
 assert.throws(()=>R.requestUrl({lat:Infinity,lng:1},to),/Koordinaten/);
 assert.throws(()=>R.requestUrl({lat:100,lng:1},to),/Koordinaten/);
 assert.throws(()=>R.requestUrl(from,{lat:0,lng:0}),/30 km/);
 assert.throws(()=>R.requestUrl(null,to));
});

test('OSRM GeoJSON path and route metrics are validated before rendering any line',()=>{
 const path=R.parse(route,from,to);
 assert.equal(path.points.length,4);
 assert.deepEqual(path.points[0],[36.1410,137.2520]);
 assert.deepEqual(path.points.at(-1),[36.1450,137.2590]);
 assert.equal(path.distance,890.25);
 assert.equal(path.duration,712.5);
 assert.equal(R.distanceText(path.distance),'890 m');
 assert.equal(R.durationText(path.duration),'12 Min.');
 assert.equal(R.durationText(3670),'1 Std. 1 Min.');
 assert.throws(()=>R.parse({...route,code:'NoRoute'},from,to),/keinen Fußweg/);
 assert.throws(()=>R.parse({code:'Ok',routes:[]},from,to),/keinen Fußweg/);
 assert.throws(()=>R.parse({code:'Ok',routes:[{...route.routes[0],distance:-1}]},from,to),/ungültige/);
 assert.throws(()=>R.parse({code:'Ok',routes:[{...route.routes[0],geometry:{type:'LineString',coordinates:[[0,0],[0,0]]}}]},from,to),/zu weit/);
 assert.throws(()=>R.parse({code:'Ok',routes:[{...route.routes[0],geometry:{type:'Point',coordinates:[]}}]},from,to),/Geometrie/);
 assert.throws(()=>R.parse({code:'Ok',routes:[{...route.routes[0],geometry:{type:'LineString',coordinates:[[137,36],['NaN',36]]}}]},from,to),/Wegpunkt/);
});

test('walking user interface is explicit opt in and leaves external Google Maps navigation available',()=>{
 const html=read('index.html'),app=read('app.js'),css=read('style.css');
 for(const id of ['walk-route-panel','walk-route-title','walk-route-stats','walk-route-note',
   'walk-route-retry','walk-route-close','walk-route-google'])
   assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/src="walking-core\.js"/);
 assert.match(app,/const W=window\.LivekarteWalkingCore/);
 assert.match(app,/function walkingButton\(p\)/);
 assert.match(app,/🚶 Fußweg anzeigen/);
 assert.match(app,/actions\.append\(show,walkingButton\(p\),route\(p\),distance\)/);
 assert.match(app,/popup\.append\(node\('p',p\.description\), inPopup, walkingButton\(p\), route\(p\)\)/);
 assert.match(app,/function showWalkingRoute\(place\)/);
 const userBlock=app.slice(app.indexOf('async function showWalkingRoute('),app.indexOf('function placeMeta'));
 assert.match(userBlock,/if\(watch===null\|\|!position\|\|!positionUpdatedAt\)/);
 assert.match(userBlock,/Date\.now\(\)-positionUpdatedAt>60000/);
 assert.match(userBlock,/lastWalkingRequestAt/);
 assert.match(userBlock,/elapsed<1200/);
 assert.match(userBlock,/W\.requestUrl\(position,place\)/);
 assert.match(userBlock,/fetch\(url/);
 assert.match(userBlock,/credentials:'omit'/);
 assert.match(userBlock,/referrerPolicy:'origin'/);
 assert.match(userBlock,/W\.parse\(JSON\.parse\(raw\),startedAt,place\)/);
 assert.match(userBlock,/L\.polyline\(result\.points/);
 assert.match(userBlock,/dashArray:'2 13'/);
 assert.match(userBlock,/map\.fitBounds/);
 assert.match(userBlock,/Es wird keine Luftlinie als echter Fußweg angezeigt/);
 assert.match(app,/clearWalkingRoute\(\);\s*watch = null; position = null/);
 assert.match(app,/positionUpdatedAt=Date\.now\(\)/);
 assert.match(app,/if\(activePlanId!==id && walkDestination\)clearWalkingRoute\(\)/);
 assert.match(html,/Kartenfehler melden/);
 assert.match(html,/routing\.openstreetmap\.de/);
 assert.match(html,/www\.google\.com\/maps/);
 assert.match(css,/\.walk-route-panel/);
 assert.match(css,/\.place-actions\{flex-wrap:wrap\}/);
});

test('OSRM foot queries remain online only, never cached by installable app',()=>{
 const sw=read('sw.js'),workflow=read('.github/workflows/pages.yml');
 assert.match(sw,/'walking-core\.js'/);
 assert.doesNotMatch(sw,/routed-foot/);
 assert.doesNotMatch(sw,/routing\.openstreetmap\.de/);
 assert.match(sw,/url\.origin!==scope\.origin/);
 assert.match(workflow,/node --check walking-core\.js/);
 assert.match(workflow,/cp index\.html style\.css core\.js walking-core\.js app\.js/);
});
