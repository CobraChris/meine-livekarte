const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const p = {name:'Café 東京',lat:52.5,lng:13.4,category:'restaurant',description:'Kaffee & Kuchen'};
test('JSON, wrapper, individual object, code fence and text imports', () => {
 for (const input of [JSON.stringify([p]),JSON.stringify({places:[p]}),JSON.stringify(p),'```json\n'+JSON.stringify([p])+'\n```']) assert.deepEqual(C.parse(input),[p]);
 assert.deepEqual(C.parse('Café 東京;52.5;13.4;restaurant;Kaffee & Kuchen'),[p]);
 assert.equal(C.parse('Bahnhof;0;0;Bahnhof;Start')[0].category,'station');
});
test('reject malformed and oversized imports without accepting invalid coordinates', () => {
 for(const input of ['','{oops','Ort;;;sight','Ort;91;0;sight','Ort;0;181;sight','Ort;NaN;2;sight','Ort;1;2;unknown',JSON.stringify([{...p,lat:null}]),JSON.stringify([{...p,lng:true}]),'a'.repeat(100001)]) assert.throws(()=>C.parse(input));
 assert.throws(()=>C.normalize(Array(201).fill(p)));
 assert.equal(C.parse('Äquator;0;0;sight')[0].lat,0);
});
test('shared links roundtrip Unicode and exclude extra private fields',()=>{
 const hash=C.encode([{...p,gps:{lat:1,lng:2},accuracy:30}]);
 assert.deepEqual(C.decode(hash),[p]); assert.ok(!hash.includes('gps')); assert.ok(!hash.includes('accuracy'));
 assert.equal(C.decode('#other'),null); assert.throws(()=>C.decode('#places=%XX'));
 assert.throws(()=>C.decode('#places='+'x'.repeat(30001)));
});
test('distance uses great-circle meters including same point and antipodes',()=>{
 assert.equal(C.distance(p,p),0);
 assert.ok(Math.abs(C.distance({lat:0,lng:0},{lat:0,lng:1})-111195)<1);
 assert.ok(Number.isFinite(C.distance({lat:0,lng:0},{lat:0,lng:180})));
});

test('merging new recommendations preserves saved ones and removes duplicates', () => {
 const b = {name:'Gora Bahnhof',lat:35.25077,lng:139.04819,category:'station',description:'Bahnhof'};
 const c = {name:'Hakone-Schrein',lat:35.20396,lng:139.02557,category:'sight',description:'Schrein'};
 const saved = C.merge([b], [b, c]);
 assert.deepEqual(saved, [b, c]);
 assert.deepEqual(C.merge(saved, [c]), [b, c]);
 assert.deepEqual(C.merge([], [p]), [p]);
 const duplicate = {...b,description:'Neue Beschreibung'};
 assert.deepEqual(C.merge([b],[duplicate]),[b]); // Keep earlier saved metadata.
});
test('merging checks maximum unique place limit and does not mutate inputs', () => {
 const entries = Array.from({length:200}, (_,i)=>({...p,name:'Ort ' + i}));
 const original = JSON.stringify(entries);
 assert.equal(C.merge(entries,[entries[0]]).length,200);
 assert.throws(()=>C.merge(entries,[{...p,name:'Ort 200'}]),/200/);
 assert.equal(JSON.stringify(entries),original);
});

test('compass accepts absolute magnetic-north headings but not relative yaw', () => {
 assert.equal(C.compassHeading({absolute:true,alpha:0}),0);
 assert.equal(C.compassHeading({absolute:true,alpha:90}),270);
 assert.equal(C.compassHeading({absolute:true,alpha:270}),90);
 assert.equal(C.compassHeading({absolute:true,alpha:359}),1);
 assert.equal(C.compassHeading({absolute:false,alpha:45}),null);
 assert.equal(C.compassHeading({alpha:45}),null);
 assert.equal(C.compassHeading({absolute:true,alpha:null}),null);
 assert.equal(C.compassHeading({absolute:true,alpha:NaN}),null);
 assert.equal(C.compassHeading({absolute:true,alpha:Infinity}),null);
 assert.equal(C.compassHeading(null),null);
});
test('iOS compass heading takes precedence over relative alpha', () => {
 assert.equal(C.compassHeading({absolute:false,alpha:15,webkitCompassHeading:124}),124);
 assert.equal(C.compassHeading({absolute:true,alpha:40,webkitCompassHeading:200}),200);
 assert.equal(C.compassHeading({webkitCompassHeading:360}),0);
 assert.equal(C.compassHeading({webkitCompassHeading:-10}),350);
});

test('a timed travel itinerary survives its share link without losing stops or line waypoints', () => {
 const trip = {title:'Hakone nach Takayama',date:'2026-10-30',stops:[
  {name:'Gora',lat:35.25085,lng:139.04826,departure:'08:41',leg:'Tozan'},
  {name:'Nagoya',lat:35.17073,lng:136.88184,arrival:'11:19',departure:'11:43',via:[[35.40949,136.75698],[35.805851,137.239686]],leg:'Hida 9'},
  {name:'Takayama',lat:36.14113,lng:137.25129,arrival:'14:14'}
 ]};
 const link=C.encodeJourney(trip);
 assert.ok(link.startsWith('#trip='));
 const decoded=C.decodeJourney(link);
 assert.equal(decoded.stops.length,3);
 assert.equal(decoded.stops[1].leg,'Hida 9');
 assert.deepEqual(decoded.stops[1].via,trip.stops[1].via);
 assert.equal(decoded.stops[2].arrival,'14:14');
 assert.equal(C.decodeJourney('#places=%5B%5D'),null);
});
test('journey validation rejects invalid dates, station points, and huge line payloads', () => {
 const trip={title:'Test',stops:[{name:'A',lat:35,lng:139},{name:'B',lat:36,lng:137}]};
 for(const stops of [[],[trip.stops[0]],Array(16).fill(trip.stops[0])])
   assert.throws(()=>C.normalizeJourney({...trip,stops}));
 assert.throws(()=>C.normalizeJourney({...trip,stops:[{...trip.stops[0],departure:'33:99'},trip.stops[1]]}));
 assert.throws(()=>C.normalizeJourney({...trip,stops:[{...trip.stops[0],lat:Infinity},trip.stops[1]]}));
 assert.throws(()=>C.normalizeJourney({...trip,stops:[{...trip.stops[0],via:[[95,139]]},trip.stops[1]]}));
 assert.throws(()=>C.decodeJourney('#trip=%XX'));
 assert.throws(()=>C.decodeJourney('#trip='+'x'.repeat(30001)));
});

test('short-link preset for Hakone to Takayama has all stations, correct timings and no private coordinates', () => {
 const id='hakone-takayama-2026-10-30';
 const j=C.presetJourney(id);
 assert.equal(j.stops.length,5);
 assert.deepEqual(j.stops.map(s=>s.name),['Gōra','Hakone-Yumoto','Odawara','Nagoya','Takayama']);
 assert.equal(j.stops[0].departure,'08:41');
 assert.equal(j.stops[2].departure,'10:11');
 assert.equal(j.stops[3].arrival,'11:19');
 assert.equal(j.stops[3].departure,'11:43');
 assert.equal(j.stops[4].arrival,'14:14');
 assert.equal(j.stops[2].via.length,3);
 assert.equal(j.stops[3].via.length,3);
 assert.equal(C.presetJourney('unknown'),null);
 assert.equal(C.presetJourney('__proto__'),null);
 assert.equal(JSON.stringify(j).includes('gps'),false);
 const u=new URL('https://cobrachris.github.io/meine-livekarte/?trip='+id);
 assert.equal(C.presetJourney(u.searchParams.get('trip')).stops[4].name,'Takayama');
});

test('smooth zoom and Hakone-Yumoto transfer inset are wired into the map UI', () => {
 const {readFileSync} = require('node:fs');
 const {join} = require('node:path');
 const root = join(__dirname, '..');
 const app = readFileSync(join(root, 'app.js'), 'utf8');
 const html = readFileSync(join(root, 'index.html'), 'utf8');
 const css = readFileSync(join(root, 'style.css'), 'utf8');
 assert.match(app, /zoomSnap:\s*0,\s*zoomDelta:\s*0\.5/);
 assert.match(app, /map\.getZoom\(\)\s*>=\s*17/);
 assert.match(app, /map\.getBounds\(\)\.contains\(hakoneYumoto\)/);
 assert.match(app, /map\.on\('zoomend moveend', updateStationTransfer\)/);
 assert.match(html, /id="station-transfer"[^>]*hidden/);
 assert.match(html, /09:16 Ankunft/);
 assert.match(html, /09:24 Abfahrt/);
 assert.match(html, /www\.hakonenavi\.jp\/international\/en\/station\/yumoto/);
 assert.match(css, /\.station-transfer-inset\[hidden\]\{display:none\}/);
});

test('two close-zoom station markers are schematic, and arrival platform is not invented', () => {
 const {readFileSync} = require('node:fs');
 const {join} = require('node:path');
 const root=join(__dirname,'..');
 const app=readFileSync(join(root,'app.js'),'utf8');
 const html=readFileSync(join(root,'index.html'),'utf8');
 const css=readFileSync(join(root,'style.css'),'utf8');
 assert.match(app, /map\.getZoom\(\)\s*>=\s*18/);
 assert.match(app, /platformOverlay\s*=\s*L\.marker\(hakoneYumoto/);
 assert.match(app, /'Gleis vor Ort prüfen'/);
 assert.match(app, /'Gleis 2'/);
 assert.match(app, /'Gleis 3'/);
 assert.match(app, /'Richtung Gōra'/);
 assert.match(app, /rail-station-map/);
 assert.match(app, /rail-track-label-gora/);
 assert.match(app, /rail-track-label-odawara/);
 assert.match(app, /Gleis 2\/3: gleicher Bahnsteigbereich/);
 assert.match(app, /www\.hakonenavi\.jp\/international\/en\/station\/yumoto/);
 assert.match(app, /platformOverlayLayer\.removeLayer\(platformOverlay\)/);
 assert.match(app, /transferCard\.hidden\s*=\s*!visible \|\| transferDismissed \|\| showMapLabels/);
 assert.doesNotMatch(html, /class="station-transfer-number">3/);
 assert.match(html, /station-transfer-unknown/);
 assert.match(css, /\.rail-track-gora\{top:/);
 assert.match(css, /\.rail-track-odawara\{top:/);
 assert.match(css, /\.rail-map-official\{pointer-events:auto/);
});

test('station diagram does not invent exact rail geometry and keeps official information usable', () => {
 const {readFileSync} = require('node:fs');
 const {join} = require('node:path');
 const root=join(__dirname,'..');
 const app=readFileSync(join(root,'app.js'),'utf8');
 const css=readFileSync(join(root,'style.css'),'utf8');
 const start=app.indexOf('function buildPlatformOverlay()');
 const end=app.indexOf('function updateStationTransfer()',start);
 const overlay=app.slice(start,end);
 assert.ok(start>=0 && end>start);
 assert.doesNotMatch(overlay,/root\.append\(north,south\)/);
 assert.match(overlay,/Gleis vor Ort prüfen/);
 assert.match(overlay,/Gleis 2/);
 assert.match(overlay,/Gleis 3/);
 assert.match(overlay,/www\.hakonenavi\.jp\/international\/en\/station\/yumoto/);
 assert.match(overlay,/Gleis 2\/3: gleicher Bahnsteigbereich/);
 assert.match(app,/classList\.toggle\('show-station-detail', showMapLabels\)/);
 assert.match(css,/\.show-station-detail \.trip-hakone-yumoto \.trip-marker-name\{display:none\}/);
 assert.match(css,/\.rail-map-official\{color:#d0ffe2/);
});

test('German wayfinding helps without the Japanese operator station map', () => {
 const {readFileSync}=require('node:fs');
 const {join}=require('node:path');
 const root=join(__dirname,'..');
 const app=readFileSync(join(root,'app.js'),'utf8');
 const html=readFileSync(join(root,'index.html'),'utf8');
 const css=readFileSync(join(root,'style.css'),'utf8');
 assert.match(app,/Gleis 2 suchen/);
 assert.match(app,/ebenerdig/);
 assert.match(app,/Plan auf Englisch/);
 assert.match(html,/So gehst du vor/);
 assert.match(html,/auf dem Bahnsteig bleiben/);
 assert.match(html,/Ankunftsgleis ist nicht bestätigt/);
 assert.match(html,/Bahnhofsinformationen auf Englisch/);
 assert.match(css,/rail-crossing-main/);
});

test('manual zoom pauses GPS camera follow but keeps watchPosition and marker updates', () => {
 const {readFileSync}=require('node:fs');
 const {join}=require('node:path');
 const root=join(__dirname,'..');
 const app=readFileSync(join(root,'app.js'),'utf8');
 const html=readFileSync(join(root,'index.html'),'utf8');
 const css=readFileSync(join(root,'style.css'),'utf8');
 assert.match(app,/map\.on\('zoomstart',\s*\(\)\s*=>\s*\{\s*if\s*\(!automaticGPSView\)\s*pauseGPSFollow\(\)/);
 assert.match(app,/map\.on\('dragstart',\s*pauseGPSFollow\)/);
 assert.match(app,/function centerOnGPS\(ll,zoom\)\s*\{[\s\S]*?automaticGPSView = true/);
 assert.match(app,/if \(following\) centerOnGPS\(ll,Math\.max\(map\.getZoom\(\),15\)\)/);
 assert.match(app,/userDot\.setLatLng\(ll\); accuracy\.setLatLng\(ll\)/);
 assert.match(app,/function pauseGPSFollow\(\)[\s\S]*?following = false;[\s\S]*?refreshGPSFollowControl\(\)/);
 assert.match(app,/recenterGPS\.onclick = \(\) =>/);
 assert.match(html,/id="recenter-gps"[^>]*hidden/);
 assert.match(css,/#recenter-gps\[hidden\]\{display:none\}/);
 assert.match(html,/unterschiedliche Gleise hintereinander an einem durchgehenden Bahnsteig/);
});

test('multi-day presets separate journey days from city stays', () => {
 const expected=[
  ['all','all'],['ride-takayama','journey'],['town-takayama','city'],
  ['ride-kyoto','journey'],['town-kyoto','city']
 ];
 assert.deepEqual(C.planPresets.map(p=>[p.id,p.kind]),expected);
 assert.deepEqual(C.planPresets.find(p=>p.id==='town-takayama').center,[36.141062,137.251454]);
 assert.deepEqual(C.planPresets.find(p=>p.id==='town-kyoto').center,[34.98535,135.75877]);
 const names=C.planPresets.map(p=>p.name);
 assert.ok(names.some(n=>n.includes('Fahrt nach Takayama')));
 assert.ok(names.some(n=>n.includes('Fahrt nach Kyoto')));
});
test('saved destinations can be filtered into sections without changing the master list', () => {
 const places=C.normalize([
  {name:'Burg',lat:36.1,lng:137.2,category:'sight'},
  {name:'Tempel',lat:35,lng:135.8,category:'sight'}
 ]);
 const tags=Object.create(null);
 tags[C.placePlanKey(places[0])]=['town-takayama'];
 tags[C.placePlanKey(places[1])]=['town-kyoto'];
 assert.equal(C.placesForPlan(places,tags,'all').length,2);
 assert.deepEqual(C.placesForPlan(places,tags,'town-takayama').map(p=>p.name),['Burg']);
 assert.deepEqual(C.placesForPlan(places,tags,'town-kyoto').map(p=>p.name),['Tempel']);
 assert.deepEqual(C.placesForPlan(places,tags,'ride-kyoto'),[]);
 assert.equal(places.length,2);
});
test('custom section data is validated before showing it in the picker', () => {
 const good=C.validCustomPlans([{id:'custom-abcde1',name:'Nikko entdecken',kind:'city',center:[36.75,139.6]}]);
 assert.equal(good[0].name,'Nikko entdecken');
 assert.throws(()=>C.validCustomPlans([{id:'all',name:'Oops',kind:'city'}]));
 assert.throws(()=>C.validCustomPlans([{id:'custom-abcd',name:'Oops',kind:'drive'}]));
 assert.throws(()=>C.validCustomPlans([{id:'custom-abcd',name:'X',kind:'city'},{id:'custom-abcd',name:'Y',kind:'city'}]));
 assert.equal(C.validCustomPlans([{id:'custom-longname',name:'Ok',kind:'journey',center:[200,0]}])[0].center,null);
});
test('section picker and import flow do not erase existing places or GPS tracking', () => {
 const {readFileSync}=require('node:fs'),{join}=require('node:path');
 const root=join(__dirname,'..');
 const app=readFileSync(join(root,'app.js'),'utf8');
 const html=readFileSync(join(root,'index.html'),'utf8');
 assert.match(html,/id="plan-select"/);
 assert.match(html,/id="add-plan"/);
 assert.match(html,/id="plan-dialog"/);
 assert.match(app,/localStorage\.setItem\('livekarte-active-plan-v1'/);
 assert.match(app,/planPlaces=currentPlaces\(\)/);
 assert.match(app,/assignToCurrentPlan\(additions\)/);
 assert.match(app,/navigator\.geolocation\.watchPosition/);
 assert.match(app,/selectPlan\(activePlanId/);
 assert.match(app,/function activeJourney\(\)/);
});
