const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const app=read('app.js'),css=read('style.css'),ui=read('place-ui.js');

function markerPopup(){
  const start=ui.indexOf("const popup=node('div',undefined,'place-popup-pan-surface');");
  const end=ui.indexOf('return {popup,inPopup};',start);
  assert.ok(start>=0&&end>start);
  return ui.slice(start,end);
}
test('marker card has day selector above only two direct actions and collapsed More',()=>{
 const popup=markerPopup();
 assert.match(popup,/popupHeader\.append\(node\('strong',p\.name\)\)/);
 const day=popup.indexOf("const popupDayPicker=makePlaceDayPicker(p)");
 const buttons=popup.indexOf("const quickActions=node('div'");
 assert.ok(day>=0&&buttons>day);
 assert.match(popup,/const popupWalk=walkingButton\(p\)/);
 assert.match(popup,/popupWalk\.textContent='🚶 Fußweg'/);
 assert.match(popup,/popupTourButton\.onclick=\(\)=>toggleTourPlace\(p,true\)/);
 assert.match(popup,/quickActions\.append\(popupWalk,popupTourButton,popupMore\)/);
 assert.match(popup,/const popupMore=node\('details',undefined,'popup-more'\)/);
 assert.match(popup,/const popupMoreSummary=node\('summary','⋯ Mehr'\)/);
 assert.doesNotMatch(popup,/popupMore\.open=true|setAttribute\('open'/);
});
test('other actions and metadata are present but only under More; no data write on opening',()=>{
 const popup=markerPopup();
 assert.match(popup,/popupMoreBody\.append\(route\(p\),popupEditButton\)/);
 assert.match(popup,/popupEditButton\.onclick=\(\)=>openPlaceEditor\(p\)/);
 assert.match(popup,/if\(popupJapanese\)popupMoreBody\.append\(popupJapanese\)/);
 assert.match(popup,/appendPlaceTiming\(popupMoreBody,p\)/);
 assert.match(popup,/popupMoreBody\.append\(description,inPopup\)/);
 assert.match(popup,/popupMore\.append\(popupMoreSummary,popupMoreBody\)/);
 assert.doesNotMatch(popup,/localStorage|fetch\(|geolocation|clearTourRoute\(/);
});
test('native summary and buttons are shared map gestures with taps preserved',()=>{
 const drag=read('map-popup-core.js');
 assert.match(drag,/const NATIVE_INPUT='input,select,textarea,label/);
 assert.match(drag,/if\(Math\.hypot\(event\.clientX-startX,event\.clientY-startY\)<8\)return/);
 assert.match(drag,/if\(Date\.now\(\)>skipClickUntil\)return/);
 assert.match(drag,/map\.panBy\(\[-dx,-dy\]/);
 assert.match(app,/bindMapPopup\(marker,popup\)/);
 assert.match(app,/const btn=node\('button','🚶 Fußweg anzeigen','walk-start'\)/);
 assert.match(app,/void showWalkingRoute\(p\)/);
});

test('compact mobile layout limits height until detail expansion and keeps 40px targets',()=>{
 assert.match(css,/\.leaflet-popup-content \.popup-compact-actions\{/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.leaflet-popup-content \.popup-more\[open\]\{grid-column:1\/-1\}/);
 assert.match(css,/\.leaflet-popup-content \.popup-more-body\{/);
 assert.match(css,/\.leaflet-popup-content \.popup-more>summary\{/);
 assert.match(css,/min-height:40px/);
});
