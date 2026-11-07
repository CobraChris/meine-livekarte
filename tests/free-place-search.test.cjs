const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const S=require('../place-search-core.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('Photon search requires intentional nonempty query and biases only to map center',()=>{
  assert.throws(()=>S.requestUrl(' '),/2 bis 120/);
  assert.throws(()=>S.requestUrl('x'),/2 bis 120/);
  assert.throws(()=>S.requestUrl('x'.repeat(121)),/2 bis 120/);
  const url=new URL(S.requestUrl('  Starbucks   Kyoto ',{lat:35.01,lng:135.76}));
  assert.equal(url.origin,'https://photon.komoot.io');
  assert.equal(url.pathname,'/api/');
  assert.equal(url.searchParams.get('q'),'Starbucks Kyoto');
  assert.equal(url.searchParams.get('limit'),'6');
  assert.equal(url.searchParams.get('lat'),'35.01');
  assert.equal(url.searchParams.get('lon'),'135.76');
  assert.equal(url.searchParams.get('zoom'),'12');
  const global=new URL(S.requestUrl('Kyoto',{lat:NaN,lng:999}));
  assert.equal(global.searchParams.has('lat'),false);
});

test('results validate geometry, skip malformed values and never treat provider text as markup',()=>{
  const good=(name,coords,osm_key='amenity',osm_value='cafe')=>({
    type:'Feature',geometry:{type:'Point',coordinates:coords},
    properties:{name,osm_key,osm_value,city:'Kyoto',country:'Japan'}
  });
  const payload={features:[
    good('Coffee & <script>evil</script>',[135.76,35.01]),
    good('Bad',[999,35.01]),
    good('NaN',[135.76,'35.01']),
    good('Kyoto Station',[135.759,34.986],'railway','station'),
    good('Hotel',[135.7,35],'tourism','hotel'),
    good('Shop',[135.71,35],'shop','bakery'),
    good('Coffee & <script>evil</script>',[135.76,35.01])
  ]};
  const found=S.parse(payload);
  assert.equal(found.length,4);
  assert.equal(found[0].name,'Coffee & <script>evil</script>');
  assert.equal(found[0].category,'restaurant');
  assert.equal(found[1].category,'station');
  assert.equal(found[2].category,'hotel');
  assert.equal(found[3].category,'restaurant');
  assert.equal(found[0].label,'Kyoto · Japan');
  assert.throws(()=>S.parse({}),/Ungültige Antwort/);
});

test('search UI is mobile-first with manual submit, location privacy and ephemeral preview',()=>{
 const html=read('index.html'),css=read('style.css'),app=read('app.js');
 for(const id of ['place-search','place-search-form','place-search-input','place-search-go',
   'place-search-status','place-search-results','place-search-picked',
   'place-search-picked-name','place-search-picked-info','place-search-walk','place-search-save'])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(html.includes('type="search" id="place-search-input"'));
 assert.ok(html.includes('id="place-search-form"'));
 assert.ok(html.includes('Gespeicherte Orte werden zuerst lokal'));
 assert.ok(css.includes('.place-search-results'));
 assert.ok(css.includes('.place-search[hidden]'));
 assert.ok(app.includes("searchForm.onsubmit=async event=>"));
 assert.ok(app.includes('S.requestUrl(query,googleDemo?.center()||map.getCenter())'));
 assert.ok(app.includes('S.parse(JSON.parse(raw))'));
 assert.ok(app.includes('searchPreview.clearLayers()'));
 assert.ok(app.includes('const destination=selectedSearchPlace;'));
 assert.match(app,/resetPlaceSearch\(false\);\s*void showWalkingRoute\(destination\)/);
 assert.ok(app.includes('openMapPlaceDialog(selectedSearchPlace)'));
 assert.ok(app.includes("$('map-place-name').value=selectedSearchPlace.name"));
 assert.ok(app.includes('searchGo.disabled=true'));
 assert.ok(app.includes('searchController.abort()'));
 assert.ok(!app.includes('window.addEventListener(\'input\',searchForm.onsubmit)'));
 const sw=read('sw.js'),workflow=read('.github/workflows/pages.yml'),
       stamp=read('scripts/stamp_pwa_version.py');
 assert.ok(html.includes('src="place-search-core.js"'));
 assert.ok(sw.includes("'place-search-core.js'"));
 assert.ok(workflow.includes('cp place-search-core.js public/'));
 assert.ok(stamp.includes('("src", "place-search-core.js")'));
 assert.ok(!sw.includes('photon.komoot.io'));
 assert.ok(!sw.includes('routing.openstreetmap.de'));
});

test('search row has only the input and Suchen; privacy remains in existing Hilfe',()=>{
 const html=read('index.html'),css=read('style.css'),app=read('app.js');
 const line=html.slice(html.indexOf('<div class="place-search-line">'),html.indexOf('</div>',html.indexOf('<div class="place-search-line">')));
 assert.match(line,/<input type="search" id="place-search-input"/);
 assert.match(line,/<button id="place-search-go" type="submit">Suchen<\/button>/);
 assert.equal((line.match(/<button\b/g)||[]).length,1);
 assert.doesNotMatch(line,/<details|place-search-close|place-search-privacy/);
 assert.doesNotMatch(html,/id="place-search-close"|id="place-search-privacy"/);
 assert.doesNotMatch(html,/OpenStreetMap-Suche · Datenschutzhinweis/);
 assert.match(html,/<button id="privacy" class="text-button">Datenschutz & Hilfe<\/button>/);
 assert.match(html,/Gespeicherte Orte werden zuerst lokal und ohne Internet gesucht/);
 assert.match(html,/Photon – Dienstinformationen/);
 assert.match(app,/searchInput\.oninput=\(\)=>resetPlaceSearch\(false\)/);
 assert.match(app,/searchInput\.onsearch=\(\)=>\{if\(!searchInput\.value\.trim\(\)\)resetPlaceSearch\(true\);\}/);
 assert.match(app,/if\(!searchInput\.value\.trim\(\)\)\{resetPlaceSearch\(true\);return;\}/);
 assert.doesNotMatch(app,/\$\('place-search-close'\)|searchPrivacy/);
 assert.match(css,/#place-search-go\{[^}]*min-width:90px/);
 // The required attribution remains separate and visible.
 assert.match(app,/map\.attributionControl\.setPrefix\(false\)/);
 assert.match(app,/tile\.openstreetmap\.org/);
 assert.match(css,/\.leaflet-control-attribution\{/);
});

test('hotel search prefers the stored Tomoya in the current Kyoto plan without a network call',()=>{
 const C=require('../core.js');
 const hotel=C.presetPlaces('town-kyoto').find(p=>p.name.startsWith('Tomoya Residence'));
 assert.ok(hotel);
 const stray={name:'Tomoya sushi',lat:35.70,lng:139.7,category:'restaurant'};
 const other={name:'My Tomoya hotel',lat:35.1,lng:135.8,category:'hotel'};
 const hits=S.savedMatches('tomoya',[stray,other,hotel],[hotel]);
 assert.equal(hits[0].name,hotel.name);
 assert.equal(hits[0].saved,true);
 assert.equal(hits[0].inSection,true);
 assert.match(hits[0].label,/In dieser Karte gespeichert · Hotel/);
 assert.equal(hits.length,3);
 assert.deepEqual(S.savedMatches('ReSiDence',[hotel],[hotel]).map(p=>p.name),[hotel.name]);
 assert.equal(S.savedMatches('unbekannt',[hotel],[hotel]).length,0);
});

test('Photon query is bounded to visible region, returns English names where possible',()=>{
 const url=new URL(S.requestUrl('Tomoya',{lat:35.01,lng:135.77}));
 assert.equal(url.searchParams.get('lang'),'en');
 assert.equal(url.searchParams.get('countrycode'),'JP');
 assert.equal(url.searchParams.get('location_bias_scale'),'0.1');
 const bbox=url.searchParams.get('bbox').split(',').map(Number);
 assert.equal(bbox.length,4);
 assert.ok(bbox[0]<135.77&&bbox[2]>135.77);
 assert.ok(bbox[1]<35.01&&bbox[3]>35.01);
 const outside=new URL(S.requestUrl('cafe',{lat:53.6,lng:10.0}));
 assert.equal(outside.searchParams.has('countrycode'),false);
});

test('results from distant countries are removed even if provider ignores bbox',()=>{
 const center={lat:35.01,lng:135.77};
 const candidates=[
 {name:'Tomoya California',lat:34.15,lng:-118.5},
 {name:'Kyoto hotel',lat:35.012,lng:135.758},
 {name:'Osaka hotel',lat:34.67,lng:135.50},
 {name:'Sydney hotel',lat:-33.9,lng:151.2}
 ];
 assert.deepEqual(S.nearby(candidates,center).map(p=>p.name),
  ['Kyoto hotel','Osaka hotel']);
});

test('search UI puts saved places first and allows online lookup only by user action',()=>{
 const app=read('app.js'),html=read('index.html'),css=read('style.css');
 assert.match(app,/const saved=S.savedMatches\(query,places,currentPlaces\(\)\)/);
 assert.match(app,/if\(saved.length\)\{/);
 assert.match(app,/searchOnline.onclick=\(\)=>\{void searchOnlinePlaces\(query,saved\);\}/);
 assert.match(app,/searchGo.disabled=true/);
 assert.match(app,/S.nearby\(S.parse\(JSON.parse\(raw\)\),center\)/);
 assert.match(html,/id="place-search-online"/);
 assert.match(css,/\.place-search-group-title/);
});
