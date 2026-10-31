const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../core.js');
const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');

test('Bonds Brew marker has verified position, category and personal note',()=>{
 const preset=C.presetPlaces('town-takayama');
 const item=preset.find(p=>p.name==='Bonds Brew beer craft');
 assert.ok(item,'Bookmark should appear in Takayama presets');
 assert.equal(item.category,'restaurant');
 assert.equal(item.lat,36.1426055);
 assert.equal(item.lng,137.2601207);
 assert.match(item.note,/31\.10\.2026/);
 assert.match(item.description,/Hida-Beef-Steak-Sandwiches/);
 assert.equal(preset.filter(p=>p.name===item.name).length,1);
 assert.equal(C.normalize([item])[0].name,item.name);
});

test('existing installed app adds only the bookmark, once, locally',()=>{
 const start=app.indexOf('  function seedBondsBrewBookmark(){');
 const end=app.indexOf('  // Persist only chosen place identifiers',start);
 assert.ok(start>=0&&end>start,'Expected one-off additive local migration');
 const block=app.slice(start,end);
 assert.match(block,/livekarte-bonds-brew-takayama-20261031-v1/);
 assert.match(block,/if\(localStorage\.getItem\(version\)===\x271\x27\)return/);
 assert.match(block,/const exists=places\.some\(p=>C\.placePlanKey\(p\)===key\)/);
 assert.match(block,/if\(!exists\)places=C\.merge\(places,\[bookmark\]\)/);
 assert.match(block,/planAssignments\[key\]=\[\.\.\.new Set\(\[\.\.\.tags,\x27town-takayama\x27\]\)\]/);
 assert.match(block,/seedBondsBrewBookmark\(\)/);
 assert.doesNotMatch(block,/tourDrafts|tourRoute|fetch\(|geolocation|GPS/);
 const item=C.presetPlaces('town-takayama').find(p=>p.name==='Bonds Brew beer craft');
 const old={name:'Ein gespeichertes Restaurant',lat:36.14,lng:137.25,category:'restaurant',description:''};
 assert.deepEqual(C.merge([old],[item])[0],old);
 assert.equal(C.merge([old,item],[item]).length,2);
});
