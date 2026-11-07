const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../core.js');
const S=require('../place-search-core.js');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('Fuji summit is a real global Nature place, never a city-day assignment',()=>{
 const [fuji]=C.presetNaturePlaces();
 assert.ok(fuji);
 assert.match(fuji.name,/Mount Fuji/);
 assert.equal(fuji.category,'nature');
 assert.equal(fuji.lat,35.3606);
 assert.equal(fuji.lng,138.7274);
 assert.match(fuji.description,/Gipfel/);
 assert.equal(C.placesForPlan([fuji],{},'all').length,1);
 assert.equal(C.placesForPlan([fuji],{},'town-kyoto').length,0);
 assert.equal(C.placesForPlan([fuji],{},'ride-nikko').length,0);
 assert.equal(C.placesForPlan([fuji],{},'town-nikko').length,0);
 assert.equal(C.merge([fuji],[fuji]).length,1);
});

test('Natur is a first-class import, editing, sharing and search category',()=>{
 assert.equal(C.categories.nature,'Natur');
 for(const word of ['nature','natur','berg','mountain']){
  assert.equal(C.parse('Mein Gipfel;35.36;138.73;'+word+';Berg')[0].category,'nature');
 }
 const [fuji]=C.presetNaturePlaces();
 assert.deepEqual(C.decode(C.encode([fuji])),[fuji]);
 const matches=S.savedMatches('mount fuji',[fuji],[]);
 assert.equal(matches.length,1);
 assert.equal(matches[0].category,'nature');
 assert.match(matches[0].label,/Natur/);
 const osmpayload={features:[{geometry:{type:'Point',coordinates:[138.7274,35.3606]},
   properties:{name:'Mount Fuji',osm_key:'natural',osm_value:'peak'}}]};
 assert.equal(S.parse(osmpayload)[0].category,'nature');
 assert.equal(S.category({osm_key:'leisure',osm_value:'nature_reserve'}),'nature');
 assert.equal(S.category({osm_key:'amenity',osm_value:'restaurant'}),'restaurant');
});

test('Nature filter, personal add/edit and distinct mountain marker are all available',()=>{
 const html=read('index.html'),css=read('style.css'),app=read('app.js');
 assert.match(html,/data-filter="nature" aria-pressed="false">⛰ Natur/);
 const selects=['map-place-category','edit-place-category'];
 for(const id of selects){
  const start=html.indexOf('id="'+id+'"');
  const end=html.indexOf('</select>',start);
  assert.ok(start>=0&&end>start);
  assert.match(html.slice(start,end),/<option value="nature">⛰ Natur/);
 }
 assert.match(app,/nature: '⛰'/);
 assert.match(css,/\.pin-inner\.pin-nature\{/);
 assert.match(app,/seedMountFuji\(\)/);
 assert.match(app,/livekarte-nature-mount-fuji-20261107-v1/);
 assert.match(app,/C\.merge\(updated,existing\?\[\]:\[summit\]\)/);
 assert.doesNotMatch(app.slice(app.indexOf('function seedMountFuji()'),app.indexOf('seedMountFuji();',app.indexOf('function seedMountFuji()'))),
   /setView\(|fitBounds\(|camera\.mode|cityDayAssignments\s*=|ticketStatuses\s*=/);
});
