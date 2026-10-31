const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const app=read('app.js'),css=read('style.css'),sw=read('sw.js');

test('popup maintains adequate gap and auto-pan around marker',()=>{
 assert.match(app,/marker\.bindPopup\(popup,\{\s*maxWidth:320,maxHeight:250,\s*offset:L\.point\(0,-24\)/);
 assert.match(app,/autoPan:true,\s*autoPanPaddingTopLeft:L\.point\(18,76\),\s*autoPanPaddingBottomRight:L\.point\(18,40\)/);
});
test('a swipe on any non-interactive popup surface moves map and anchored popup',()=>{
 const start=app.indexOf('  function enablePopupMapDrag(handle,marker,surface){');
 const end=app.indexOf('  function render() {',start);
 assert.ok(start>=0&&end>start);
 const body=app.slice(start,end);
 assert.match(body,/for\(const target of \[handle,surface\]\)/);
 assert.match(body,/target\.addEventListener\('pointerdown',down\)/);
 assert.match(body,/target\.addEventListener\('pointermove',move\)/);
 assert.match(body,/target\.addEventListener\('pointerup',release\)/);
 assert.match(body,/target\.addEventListener\('pointercancel',release\)/);
 assert.match(body,/target\.addEventListener\('lostpointercapture',release\)/);
 assert.match(body,/captured\.setPointerCapture\?\.\(pointerId\)/);
 assert.match(body,/target\?\.hasPointerCapture\?\.\(id\)/);
 assert.match(body,/map\.panBy\(\[-dx,-dy\],\{animate:false\}\)/);
 assert.match(body,/pauseGPSFollow\(\)/);
 assert.match(body,/marker\.on\('popupclose'/);
 assert.doesNotMatch(body,/setLatLng\(|fetch\(|localStorage|navigator\.geolocation/);
});
test('buttons, links, inputs, labels and close control stay clickable while swiping empty areas',()=>{
 const body=app.slice(app.indexOf('  function enablePopupMapDrag(handle,marker,surface){'),
   app.indexOf('  function render() {'));
 assert.match(body,/const ignore='button,a,input,select,textarea,label/);
 assert.match(body,/\.leaflet-popup-close-button/);
 assert.match(body,/if\(event\.currentTarget===surface&&event\.target\.closest\?\.\(ignore\)\)return/);
 assert.match(body,/event\.currentTarget===surface/);
 assert.match(app,/const popup = node\('div',undefined,'place-popup-pan-surface'\)/);
 assert.match(app,/enablePopupMapDrag\(dragHandle,marker,popup\)/);
 assert.match(app,/popupHeader\.append\(dragHandle\)/);
 assert.match(app,/quickActions\.append\(popupTourButton,walkingButton\(p\),route\(p\)\)/);
 assert.match(app,/quickActions\.append\(popupEditButton\)/);
 assert.match(css,/\.leaflet-popup-content \.place-popup-pan-surface\{/);
 assert.match(css,/touch-action:none/);
});
test('long descriptions can scroll when necessary; keyboard arrows still move map',()=>{
 const body=app.slice(app.indexOf('  function enablePopupMapDrag(handle,marker,surface){'),
    app.indexOf('  function render() {'));
 assert.match(body,/fromText=!!event\.target\.closest\?\.\('\.place-popup-description'\)/);
 assert.match(body,/scroll\.scrollHeight>scroll\.clientHeight\+4/);
 assert.match(body,/scroll\.scrollTop-=dy/);
 assert.match(body,/ArrowLeft:\[36,0\],ArrowRight:\[-36,0\]/);
 assert.match(body,/ArrowUp:\[0,36\],ArrowDown:\[0,-36\]/);
 assert.match(body,/map\.panBy\(shift,\{animate:false\}\)/);
 assert.match(app,/const description=node\('p',p\.description,'place-popup-description'\)/);
 assert.match(sw,/livekarte-shell-pwa-v15/);
});
