const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('OSM Standard and OSM Deutsch remain first-class opt-in map styles',()=>{
 const html=read('index.html'),app=read('app.js'),demo=read('google-demo.js');
 for(const id of ['provider-osm','provider-osm-de','provider-google','provider-settings']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/id="provider-osm"[^>]*aria-pressed="true"/);
 assert.match(html,/id="provider-osm-de"[^>]*aria-pressed="false"/);
 assert.match(app,/const OSM_STYLE_STORE='livekarte-osm-style-v1'/);
 assert.match(app,/https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
 assert.match(app,/https:\/\/tile\.openstreetmap\.de\/\{z\}\/\{x\}\/\{y\}\.png/);
 assert.match(app,/map\.attributionControl\.removeAttribution\(previousAttribution\)/);
 assert.match(app,/map\.attributionControl\.addAttribution\(tiles\.options\.attribution\)/);
 assert.match(app,/tiles\.setUrl\(osmStyles\[osmStyle\]\.url\)/);
 assert.match(app,/localStorage\.setItem\(OSM_STYLE_STORE,osmStyle\)/);
 assert.match(demo,/osmDe\.addEventListener\('click',\(\)=>activateOSMStyle\('de'\)\)/);
 assert.match(demo,/osmStyle\(\)==='de'/);
 assert.match(demo,/resetToOSM\(style==='de'/);
});
test('German tile layer is not requested before previous opt-in and does not install a paid service',()=>{
 const app=read('app.js'),demo=read('google-demo.js');
 const init=app.slice(app.indexOf("const OSM_STYLE_STORE="),app.indexOf('const pins = L.layerGroup()'));
 assert.match(init,/let osmStyle='standard';/);
 assert.match(init,/localStorage\.getItem\(OSM_STYLE_STORE\)==='de'/);
 assert.match(init,/const tiles = L\.tileLayer\(osmStyles\[osmStyle\]\.url/);
 assert.doesNotMatch(init,/fetch\(|XMLHttpRequest|prefetch|Google Maps API key/);
 assert.doesNotMatch(demo,/document\.head\.appendChild\(osmDe\)/);
 const sw=read('sw.js');
 assert.doesNotMatch(sw,/tile\.openstreetmap\.de|tile\.openstreetmap\.org/);
});
test('provider strip stays one mobile row without a new overlay',()=>{
 const css=read('style.css'),html=read('index.html');
 assert.match(css,/workspace>\.map-provider-switch/);
 assert.match(css,/#provider-osm-de/);
 assert.match(css,/flex:1 1 0;min-width:0/);
 assert.match(css,/height:48px/);
 assert.match(html,/role="group" aria-label="Kartenanbieter und Kartensprache auswählen"/);
});
