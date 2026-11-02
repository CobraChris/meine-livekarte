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
   'place-search-close','place-search-status','place-search-results','place-search-picked',
   'place-search-picked-name','place-search-picked-info','place-search-walk','place-search-save'])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(html.includes('type="search" id="place-search-input"'));
 assert.ok(html.includes('id="place-search-form"'));
 assert.ok(html.includes('Die Suchanfrage und der Kartenausschnitt'));
 assert.ok(css.includes('.place-search-results'));
 assert.ok(css.includes('.place-search[hidden]'));
 assert.ok(app.includes("searchForm.onsubmit=async event=>"));
 assert.ok(app.includes('S.requestUrl(query,map.getCenter())'));
 assert.ok(app.includes('S.parse(JSON.parse(raw))'));
 assert.ok(app.includes('searchPreview.clearLayers()'));
 assert.ok(app.includes('showWalkingRoute(selectedSearchPlace)'));
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
