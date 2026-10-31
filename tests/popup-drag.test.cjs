const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const app=read('app.js'),css=read('style.css'),sw=read('sw.js');

test('normal place popup sits above marker and auto-pans away from map controls',()=>{
 assert.match(app,/marker\.bindPopup\(popup,\{\s*maxWidth:320,maxHeight:250,\s*offset:L\.point\(0,-24\)/);
 assert.match(app,/autoPan:true,\s*autoPanPaddingTopLeft:L\.point\(18,76\),\s*autoPanPaddingBottomRight:L\.point\(18,40\)/);
 assert.match(app,/marker\.on\('popupopen', \(\) => \{ following = false; \}\)/);
});

test('popup drag pans map with anchored marker rather than floating tooltip',()=>{
 const start=app.indexOf('  function enablePopupMapDrag(handle,marker){');
 const end=app.indexOf('  function render() {',start);
 assert.ok(start>=0&&end>start,'Expected explicit drag handler');
 const body=app.slice(start,end);
 for(const pattern of [
  /handle\.addEventListener\('pointerdown'/,
  /handle\.addEventListener\('pointermove'/,
  /handle\.addEventListener\('pointerup'/,
  /handle\.addEventListener\('pointercancel'/,
  /handle\.addEventListener\('lostpointercapture'/,
  /handle\.setPointerCapture\?\.\(pointerId\)/,
  /handle\.hasPointerCapture\?\.\(id\)/,
  /marker\.isPopupOpen\(\)/,
  /map\.panBy\(\[-dx,-dy\],\{animate:false\}\)/,
  /pauseGPSFollow\(\)/,
  /marker\.on\('popupclose'/
 ])assert.match(body,pattern);
 assert.doesNotMatch(body,/setLatLng\(|transform:|fetch\(|localStorage|navigator\.geolocation|W\.requestUrl/);
});
test('only dedicated grab-handle drags; ordinary popup controls and marker tap remain unchanged',()=>{
 const start=app.indexOf("      const popup = node('div');",app.indexOf('  function render()'));
 const end=app.indexOf("      const chosenIndex=tourSelection().findIndex",start);
 const body=app.slice(start,end);
 assert.match(body,/popupHeader=node\('div',undefined,'place-popup-header'\)/);
 assert.match(body,/popupHeader\.append\(node\('strong',p\.name\)\)/);
 assert.match(body,/dragHandle=node\('button','⠿ Ziehen','place-popup-drag'\)/);
 assert.match(body,/dragHandle\.setAttribute\('aria-label','Popup verschieben: ziehen oder Pfeiltasten verwenden'\)/);
 assert.match(body,/quickActions\.append\(popupTourButton,walkingButton\(p\),route\(p\)\)/);
 assert.match(body,/quickActions\.append\(popupEditButton\)/);
 assert.match(app,/enablePopupMapDrag\(dragHandle,marker\)/);
 assert.match(app,/marker\.bindPopup\(popup,\{/);
 assert.match(css,/\.leaflet-popup-content \.place-popup-drag/);
 assert.match(css,/touch-action:none/);
 assert.match(css,/\.place-popup-drag:focus-visible/);
});
test('keyboard arrows pan the same anchored popup, with no accidental normal map click interception',()=>{
 const body=app.slice(app.indexOf('  function enablePopupMapDrag(handle,marker){'),app.indexOf('  function render() {'));
 assert.match(body,/ArrowLeft:\[36,0\],ArrowRight:\[-36,0\]/);
 assert.match(body,/ArrowUp:\[0,36\],ArrowDown:\[0,-36\]/);
 assert.match(body,/handle\.addEventListener\('keydown',event=>/);
 assert.match(body,/map\.panBy\(shift,\{animate:false\}\)/);
 const ordinary=app.slice(app.indexOf('  function render() {'),app.indexOf("      const card = node('article'",app.indexOf('  function render() {')));
 assert.match(ordinary,/if\(mapTourPickMode\)\{/);
 assert.match(ordinary,/marker\.on\('click',\(\)=>\{pauseGPSFollow\(\);toggleTourPlace\(p,true\);\}\)/);
 assert.match(ordinary,/marker\.on\('popupopen'/);
 assert.match(sw,/livekarte-shell-pwa-v14/);
});
