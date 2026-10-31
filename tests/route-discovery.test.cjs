const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const R=require('../route-discovery.js');
const read=p=>readFileSync(path.join(__dirname,'..',p),'utf8');
const walk=[[36.140000,137.250000],[36.140500,137.250500],[36.141000,137.251000]];
const el=(type,id,name,lat,lon,extra={})=>({
  type,id,lat,lon,tags:{name,tourism:'attraction',...extra}
});

test('single manually dispatched Overpass request is local and name-filtered',()=>{
 const sql=R.query(walk,150);
 assert.match(sql,/\[out:json\]\[timeout:15\]\[maxsize:10485760\]/);
 assert.match(sql,/nwr\["name"\]\["tourism"~/);
 assert.match(sql,/nwr\["name"\]\["historic"~/);
 assert.match(sql,/out center 500;/);
 assert.ok(sql.includes('36.13'));
 assert.match(R.ENDPOINT,/^https:\/\/overpass-api\.de\/api\/interpreter$/);
 assert.throws(()=>R.query([[35.0,135.0],[36.0,137.0]],150),/zu (?:groß|weitläufig)/);
 assert.throws(()=>R.query([[35,135]],150),/gültige lokale Fußroute/);
 assert.throws(()=>R.query(walk,999),/gültige lokale Fußroute/);
 assert.throws(()=>R.query([[91,136],[90,136]],150),/gültige lokale Fußroute/);
});

test('true polyline segment projection ranks nearby sights and rejects distant ones',()=>{
 const onLine={lat:36.14025,lng:137.25025};
 const nearby={lat:36.14025,lng:137.25035};
 const far={lat:36.148,lng:137.27};
 assert.ok(R.routeDistance(onLine,walk)<1);
 assert.ok(R.routeDistance(nearby,walk)<20);
 assert.ok(R.routeDistance(far,walk)>500);
});

test('OSM node/way/relation candidates parsed, sorted and deduplicated without changes to saved places',()=>{
 const saved=[{name:'Bekannter Schrein',lat:36.1405,lng:137.2505}];
 const data={elements:[
   el('node',101,'Garten',36.14030,137.25030),
   el('node',102,'Zu weit weg',36.15000,137.26000),
   el('node',103,'Bekannter Schrein',36.14050,137.25050),
   {...el('way',104,'Galerie',undefined,undefined,{tourism:'gallery'}),
     center:{lat:36.14010,lon:137.25010}},
   el('relation',105,'Garten',36.14031,137.25031),
   el('node',106,'Kein Kulturort',36.14032,137.25032,{tourism:'zoo'}),
   el('node',107,'',36.14033,137.25033),
   el('node',108,'Denkmal',36.14002,137.25002,{tourism:undefined,historic:'monument'})
 ]};
 const before=JSON.stringify(saved);
 const items=R.parse(data,walk,saved,150);
 assert.equal(JSON.stringify(saved),before,'Do not mutate saved spots');
 assert.deepEqual(new Set(items.map(x=>x.name)),
   new Set(['Garten','Galerie','Denkmal']));
 assert.equal(items.length,3);
 assert.ok(items.every(x=>x.distance<=150&&x.category==='sight'));
 assert.equal(items.find(x=>x.name==='Galerie').id,'way/104');
 assert.equal(items.find(x=>x.name==='Denkmal').type,'Denkmal');
 assert.ok(items[0].distance<=items[1].distance);
 assert.throws(()=>R.parse({remark:'timeout',elements:[]},walk),/gültigen/);
 assert.throws(()=>R.parse({},walk),/gültigen/);
});

test('no unexpected auto-search, unsafe server output or persistent GPS storage',()=>{
 const app=read('app.js'),html=read('index.html'),css=read('style.css');
 for(const id of ['route-discovery','route-discovery-count','route-discovery-radius',
   'route-discovery-search','route-discovery-status','route-discovery-results'])
   assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/src="route-discovery\.js"/);
 assert.match(app,/const R=window\.LivekarteRouteDiscovery/);
 assert.match(app,/discoverySearch\.onclick=async\(\)=>\{/);
 assert.match(app,/fetch\(R\.ENDPOINT,\{/);
 assert.match(app,/method:'POST',mode:'cors',credentials:'omit',referrerPolicy:'origin'/);
 assert.match(app,/body:new URLSearchParams\(\{data:query\}\)/);
 assert.match(app,/R\.parse\(JSON\.parse\(text\),route\.points,places,radius\)/);
 assert.match(app,/clearRouteDiscovery\(\);\s*stopTourNavigation\(\)/);
 assert.match(app,/renderRouteDiscoveryUI\(\);\s*L\.polyline/);
 assert.match(app,/C\.merge\(places,\[incoming\]\)/);
 assert.match(app,/setTourSelection\(\[\.\.\.current,stored\]\)/);
 assert.match(css,/\.route-discovery-marker span/);
 assert.match(css,/\.route-discovery-actions/);
 const gps=app.slice(app.indexOf('watch = navigator.geolocation.watchPosition('),
   app.indexOf('}, error => {',app.indexOf('watch = navigator.geolocation.watchPosition(')));
 assert.doesNotMatch(gps,/discoverySearch|R\.query|overpass-api|fetch\(/);
 const persistence=app.slice(app.indexOf('  function persistTourDrafts(){'),
   app.indexOf('  function clearTourRoute(){'));
 assert.doesNotMatch(persistence,/discoveries|discoveryController|route\.points/);
 assert.match(html,/Gefundene Orte werden zunächst nur angezeigt/);
 assert.match(html,/einschließlich der Umgebung deines GPS-Startpunkts/);
});

test('offline shell and deploy include only static search code, never cached OSM API replies',()=>{
 const sw=read('sw.js'),workflow=read('.github/workflows/pages.yml');
 const stamp=read('scripts/stamp_pwa_version.py');
 assert.match(sw,/livekarte-shell-pwa-v18/);
 assert.match(sw,/'route-discovery\.js'/);
 assert.doesNotMatch(sw,/overpass-api\.de|interpreter|routed-foot/);
 assert.match(workflow,/node --check route-discovery\.js/);
 assert.match(workflow,/cp index\.html style\.css core\.js walking-core\.js day-plan-core\.js route-discovery\.js app\.js/);
 assert.match(stamp,/\("src", "route-discovery\.js"\)/);
});
