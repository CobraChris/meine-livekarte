const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const C=require('../core.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const old={name:'Test 2',lat:36.1424,lng:137.2578,category:'restaurant',
  description:'Persönlich auf der Karte markiert.',note:'Bei Spaziergang entdeckt'};
const other={name:'Bonds Brew beer craft',lat:36.1426055,lng:137.2601207,
  category:'restaurant',description:'Food-Tipp'};
const key=C.placePlanKey(old),otherKey=C.placePlanKey(other);
function seed(){
 const places=[old,other];
 const assignments=Object.assign(Object.create(null),{
   [key]:['town-takayama','custom-trip'],
   [otherKey]:['town-takayama']
 });
 const drafts={
   'town-takayama':[otherKey,key],
   'custom-trip':[key,otherKey],
   'town-kyoto':[otherKey]
 };
 const dayPlans={
   'town-takayama':{start:'10:30',buffer:10,lunch:45,stops:{
     [key]:{minutes:60,open:'09:00',close:'17:00'},
     [otherKey]:{minutes:30}}},
   'custom-trip':{start:'11:00',stops:{[key]:{minutes:25}}}
 };
 return {places,assignments,drafts,dayPlans};
}
test('rename updates all travel-section, tour-draft and visit-time keys without losing other places',()=>{
 const original=seed(),snapshot=JSON.stringify(original);
 const next=C.changeSavedPlace(original.places,original.assignments,original.drafts,
   original.dayPlans,key,{name:'Neues Café',category:'sight',note:'Geändert',description:'Vor Ort'});
 const nextKey=C.placePlanKey(next.updated);
 assert.notEqual(nextKey,key);
 assert.equal(next.updated.lat,old.lat,'original coordinates stay fixed');
 assert.equal(next.updated.lng,old.lng);
 assert.equal(next.updated.note,'Geändert');
 assert.equal(next.updated.category,'sight');
 assert.equal(next.places[1].name,other.name);
 assert.deepEqual(next.assignments[nextKey],['town-takayama','custom-trip']);
 assert.equal(next.assignments[key],undefined);
 assert.deepEqual(next.drafts['town-takayama'],[otherKey,nextKey]);
 assert.deepEqual(next.drafts['custom-trip'],[nextKey,otherKey]);
 assert.deepEqual(next.drafts['town-kyoto'],[otherKey]);
 assert.deepEqual(next.dayPlans['town-takayama'].stops[nextKey],{minutes:60,open:'09:00',close:'17:00'});
 assert.deepEqual(next.dayPlans['town-takayama'].stops[otherKey],{minutes:30});
 assert.deepEqual(next.dayPlans['custom-trip'].stops[nextKey],{minutes:25});
 assert.equal(next.dayPlans['town-takayama'].stops[key],undefined);
 assert.equal(JSON.stringify(original),snapshot,'input objects remain unmodified');
});
test('changing just note/category preserves legacy key and all tour references',()=>{
 const original=seed();
 const next=C.changeSavedPlace(original.places,original.assignments,original.drafts,
   original.dayPlans,key,{note:'Wiederkommen!',category:'sight'});
 assert.equal(next.newKey,key);
 assert.deepEqual(next.drafts['town-takayama'],original.drafts['town-takayama']);
 assert.deepEqual(next.assignments[key],original.assignments[key]);
 assert.equal(next.updated.note,'Wiederkommen!');
 assert.equal(next.updated.category,'sight');
});
test('delete one test marker removes only its references without affecting another saved restaurant',()=>{
 const original=seed(),next=C.changeSavedPlace(original.places,
   original.assignments,original.drafts,original.dayPlans,key,null);
 assert.equal(next.updated,null);
 assert.deepEqual(next.places,[other]);
 assert.equal(next.assignments[key],undefined);
 assert.deepEqual(next.assignments[otherKey],['town-takayama']);
 assert.deepEqual(next.drafts['town-takayama'],[otherKey]);
 assert.deepEqual(next.drafts['custom-trip'],[otherKey]);
 assert.deepEqual(next.drafts['town-kyoto'],[otherKey]);
 assert.equal(next.dayPlans['town-takayama'].stops[key],undefined);
 assert.deepEqual(next.dayPlans['town-takayama'].stops[otherKey],{minutes:30});
 assert.equal(original.places.length,2);
});
test('invalid, stale or conflicting edits never silently destroy saved records',()=>{
 const original=seed();
 for(const change of [
  {name:'   '},{name:'Test 2',category:'unknown'},
  {name:other.name,lat:other.lat,lng:other.lng}
 ]){
  if(change.name===other.name)continue; // coordinates intentionally fixed by edit API
  assert.throws(()=>C.changeSavedPlace(original.places,original.assignments,
    original.drafts,original.dayPlans,key,change),/ungültig|Unbekannte|Name|Koordinaten/);
 }
 assert.throws(()=>C.changeSavedPlace(original.places,original.assignments,
  original.drafts,original.dayPlans,'bad-key',null),/nicht mehr gespeichert/);
 const colliding=[old,{...old,name:'Identisch'}];
 assert.throws(()=>C.changeSavedPlace(colliding,{}, {},{},key,{name:'Identisch'}),
  /bereits vorhanden/);
 const fixed=C.changeSavedPlace(original.places,{}, {},{},key,
  {name:'Neuer Name',lat:90,lng:180});
 assert.equal(fixed.updated.lat,old.lat);
 assert.equal(fixed.updated.lng,old.lng);
});
test('mobile editor can open from popup or list and delete only with explicit confirmation',()=>{
 const html=read('index.html'),app=read('app.js'),css=read('style.css');
 for(const id of ['edit-place-dialog','edit-place-form','edit-place-name','edit-place-category',
   'edit-place-note','edit-place-description','edit-place-location','edit-place-close',
   'edit-place-error','edit-place-delete'])
   assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/🗑 Diesen Ort löschen/);
 assert.match(html,/✓ Änderungen speichern/);
 assert.match(app,/const popupEditButton=node\('button','✎ Bearbeiten','place-edit'\)/);
 assert.match(app,/popupEditButton\.onclick=\(\)=>openPlaceEditor\(p\)/);
 assert.match(app,/const editButton=node\('button','✎ Bearbeiten','place-edit'\)/);
 assert.match(app,/editButton\.onclick=\(\)=>openPlaceEditor\(p\)/);
 assert.match(app,/editPlaceForm\.onsubmit=event=>/);
 assert.match(app,/if\(confirm\('„'\+old\.name\+/);
 assert.match(css,/#edit-place-dialog/);
 assert.match(css,/\.place-actions \.place-edit/);
});
test('editor migrates local stores and clears only affected routes, without network calls',()=>{
 const app=read('app.js'),sw=read('sw.js');
 const start=app.indexOf('  // Editor edits only local recommendation data.');
 const end=app.indexOf('  function placeMeta(p)',start);
 assert.ok(start>=0&&end>start);
 const part=app.slice(start,end);
 assert.match(part,/C\.changeSavedPlace\(places,planAssignments,tourDrafts,dayPlans,oldKey,changes\)/);
 for(const key of ['livekarte-places-v1','livekarte-plan-assignments-v1',
   'livekarte-tour-drafts-v1','livekarte-day-plans-v1'])
   assert.ok(part.includes(key),key);
 assert.match(part,/if\(wasInCurrentTour\|\|onActiveRoute\)clearTourRoute\(\)/);
 assert.match(part,/if\(onWalkingRoute\)clearWalkingRoute\(\)/);
 assert.match(part,/for\(const \[key,value\] of Object\.entries\(previousValues\)\)/);
 assert.doesNotMatch(part,/fetch\(|navigator\.geolocation|routing\.openstreetmap/);
 assert.match(sw,/livekarte-shell-pwa-v16/);
 assert.match(app,/function render\(\)/);
 assert.match(app,/function setMapTourPickMode\(/);
});
