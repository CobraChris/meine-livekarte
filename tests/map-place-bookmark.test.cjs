const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const C=require('../core.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const app=read('app.js'),html=read('index.html'),css=read('style.css');

test('map has a visible bookmark button and compact accessible name/category/note form',()=>{
  for(const id of ['map-save-place','map-save-place-hint','map-place-dialog',
     'map-place-form','map-place-name','map-place-category','map-place-note',
     'map-place-target','map-place-coordinates','map-place-use-gps',
     'map-place-cancel','map-place-error'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/id="map-save-place"[^>]*aria-pressed="false"/);
  assert.match(html,/id="map-place-name"[^>]*maxlength="120"/);
  assert.match(html,/id="map-place-note"[^>]*maxlength="260"/);
  for(const cat of ['restaurant','sight','station','hotel'])
    assert.match(html,new RegExp('<option value="'+cat+'">'));
  assert.match(html,/📌 Ort dauerhaft speichern/);
  assert.match(css,/#map-place-dialog\{/);
  assert.match(css,/\.tour-map-tools #map-save-place\[aria-pressed="true"\]/);
});

test('explicit map tap and long press use a preview rather than saving immediately',()=>{
 const marker=app.slice(app.indexOf('  const mapPlaceDialog='),app.indexOf('  // The external Google walking link'));
 assert.match(marker,/function setMapPlacePicking\(value\)/);
 assert.match(marker,/function showMapPlacePreview\(point\)/);
 assert.match(marker,/mapPlacePreview\.clearLayers\(\)/);
 assert.match(marker,/L\.circleMarker\(\[lat,lng\]/);
 assert.match(marker,/mapPlaceDialog\.showModal\(\)/);
 assert.match(marker,/mapPlaceButton\.onclick=\(\)=>setMapPlacePicking\(!mapPlacePicking\)/);
 assert.match(marker,/map\.on\('click',event=>\{/);
 assert.match(marker,/if\(!mapPlacePicking\)return/);
 assert.match(marker,/map\.on\('contextmenu',event=>\{/);
 assert.match(marker,/if\(mapTourPickMode\|\|mapPlaceDialog\.open\)return/);
 assert.match(marker,/if\(target\?\.closest\?\.\('\.leaflet-marker-icon,\.leaflet-control'\)\)return/);
 assert.match(marker,/mapPlaceDialog\.addEventListener\('close'/);
 assert.match(marker,/mapPlacePoint=null/);
 assert.match(marker,/setMapPlacePicking\(false\)/);
 assert.doesNotMatch(marker.slice(0,marker.indexOf('mapPlaceForm.onsubmit=')),/localStorage\.setItem\(|C\.merge\(/);
});

test('GPS position is only used after explicit choice and accuracy checks',()=>{
 const marker=app.slice(app.indexOf("  $('map-place-use-gps').onclick="),app.indexOf('  mapPlaceForm.onsubmit='));
 assert.match(marker,/watch===null\|\|!position\|\|Date\.now\(\)-positionUpdatedAt>60000/);
 assert.match(marker,/positionAccuracy>60/);
 assert.match(marker,/showMapPlacePreview\(position\)/);
 assert.doesNotMatch(marker,/fetch\(|navigator\.geolocation|localStorage/);
});

test('saving new marker is validated, local, idempotent near same name and scoped to current plan',()=>{
 const marker=app.slice(app.indexOf('  mapPlaceForm.onsubmit='),app.indexOf('  // The external Google walking link'));
 assert.match(marker,/C\.normalize\(\[\{name,lat:mapPlacePoint\.lat,lng:mapPlacePoint\.lng,/);
 assert.match(marker,/C\.distance\(item,bookmark\)<45/);
 assert.match(marker,/C\.merge\(places,\[bookmark\]\)/);
 assert.match(marker,/if\(!persist\(\)\)/);
 assert.match(marker,/places=previousPlaces/);
 assert.match(marker,/if\(activePlanId!=='all'\)assignToCurrentPlan\(\[bookmark\]\)/);
 assert.match(marker,/mapPlaceDialog\.close\(\)/);
 assert.match(marker,/render\(\)/);
 assert.doesNotMatch(marker,/clearTourRoute\(|setTourSelection\(|fetch\(|routing\.openstreetmap/);
 const place=C.normalize([{
  name:'Kleine Kaffeebar',lat:36.1426055,lng:137.2601207,
  category:'restaurant',note:'Später besuchen',description:'Persönlich auf der Karte markiert.'
 }])[0];
 assert.equal(place.note,'Später besuchen');
 const old={name:'Mein Hotel',lat:36.14,lng:137.25,category:'hotel'};
 assert.equal(C.merge([old],[place]).length,2);
 assert.equal(C.merge(C.merge([old],[place]),[place]).length,2);
});

test('feature stays outside tour-picker and uses offline shell without new network services',()=>{
 assert.match(app,/let mapPlacePicking=false,mapPlacePoint=null/);
 assert.match(app,/if\(mapTourPickMode&&mapPlacePicking\)setMapPlacePicking\(false\)/);
 assert.match(app,/if\(activePlanId!==id\)setMapPlacePicking\(false\)/);
 assert.match(app,/function persist\(\)/);
 assert.match(app,/function render\(\)/);
 assert.match(html,/id="tour-map-mode"/);
 assert.match(html,/id="tour-optimize"/);
 const sw=read('sw.js');
 assert.match(sw,/livekarte-shell-pwa-v16/);
 assert.doesNotMatch(sw,/gps|overpass-api\.de|routed-foot/);
});
