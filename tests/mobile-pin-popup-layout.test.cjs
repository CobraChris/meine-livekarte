'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const app=read('app.js'),css=read('style.css');

test('Nanzen-ji popup has a usable minimum width on narrow maps',()=>{
  const markerCode=app.slice(app.indexOf('const marker = L.marker([p.lat,p.lng]'),
    app.indexOf('const card = node(',app.indexOf('const marker = L.marker([p.lat,p.lng]')));
  assert.match(markerCode,/marker\.bindPopup\(popup,\{/);
  assert.match(markerCode,/minWidth:Math\.min\(286,Math\.max\(205,map\.getSize\(\)\.x-76\)\)/);
  assert.match(markerCode,/maxWidth:320,maxHeight:300/);
  // The layout stays inside the map even when screen width is < 320px.
  const width=mapWidth=>Math.min(286,Math.max(205,mapWidth-76));
  assert.equal(width(393),286);
  assert.equal(width(360),284);
  assert.equal(width(320),244);
  assert.ok(width(320)+76<=320);
});

test('popup uses two action columns and a full-width More row',()=>{
  assert.match(css,/\.leaflet-popup-content \.popup-compact-actions\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.leaflet-popup-content \.popup-compact-actions>\.popup-more\{\s*grid-column:1\/-1;/);
  assert.doesNotMatch(css,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\) 66px/);
  assert.match(css,/\.leaflet-popup-content \.popup-compact-actions>\.walk-start,[\s\S]*?width:100%;/);
  assert.match(css,/\.leaflet-popup-content \.popup-more-body\{\s*min-width:0;/);
  assert.match(css,/overflow-x:hidden!important/);
});

test('day selection and More actions remain real accessible controls',()=>{
  assert.match(app,/const popupDayPicker=makePlaceDayPicker\(p\)/);
  assert.match(app,/select\.onchange=\(\)=>setDayAssignment\(place,select\.value\)/);
  assert.match(app,/const popupMore=node\('details',undefined,'popup-more'\)/);
  assert.match(app,/const popupMoreSummary=node\('summary','⋯ Mehr'\)/);
  assert.match(app,/quickActions\.append\(popupWalk,popupTourButton,popupMore\)/);
  assert.match(app,/popupMoreBody\.append\(route\(p\),popupEditButton\)/);
  assert.match(css,/\.leaflet-popup-content \.place-day-picker\{\s*display:grid;\s*grid-template-columns:auto minmax\(0,1fr\)/);
});
