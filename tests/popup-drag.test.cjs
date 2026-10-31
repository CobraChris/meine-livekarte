const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const app=read('app.js'),css=read('style.css'),sw=read('sw.js');

test('popup retains its marker spacing and auto-pan clearance',()=>{
 assert.match(app,/marker\.bindPopup\(popup,\{\s*maxWidth:320,maxHeight:250,\s*offset:L\.point\(0,-24\)/);
 assert.match(app,/autoPan:true,\s*autoPanPaddingTopLeft:L\.point\(18,76\),\s*autoPanPaddingBottomRight:L\.point\(18,40\)/);
});
test('user can swipe popup surface without a redundant handle',()=>{
 const start=app.indexOf('  function enablePopupMapDrag(marker,surface){');
 const end=app.indexOf('  function render() {',start);
 assert.ok(start>=0&&end>start);
 const body=app.slice(start,end);
 assert.match(body,/surface\.addEventListener\('pointerdown'/);
 assert.match(body,/surface\.addEventListener\('pointermove'/);
 assert.match(body,/for\(const eventName of \['pointerup','pointercancel','lostpointercapture'\]\)/);
 assert.match(body,/surface\.addEventListener\(eventName,release\)/);
 assert.match(body,/captured\.setPointerCapture\?\.\(pointerId\)/);
 assert.match(body,/target\?\.hasPointerCapture\?\.\(id\)/);
 assert.match(body,/map\.panBy\(\[-dx,-dy\],\{animate:false\}\)/);
 assert.match(body,/pauseGPSFollow\(\)/);
 assert.match(body,/marker\.on\('popupclose'/);
 assert.doesNotMatch(body,/setLatLng\(|fetch\(|localStorage|navigator\.geolocation/);
});
test('action buttons, links and close stay clickable, with no visible drag button',()=>{
 const begin=app.indexOf("const popup = node('div',undefined,'place-popup-pan-surface');");
 const until=app.indexOf("const marker = L.marker(",begin);
 const popup=app.slice(begin,until);
 assert.ok(begin>=0&&until>begin);
 assert.match(app,/const ignore='button,a,input,select,textarea,label/);
 assert.match(app,/if\(event\.target\.closest\?\.\(ignore\)\)return/);
 assert.match(popup,/popupHeader\.append\(node\('strong',p\.name\)\)/);
 assert.match(popup,/quickActions\.append\(popupTourButton,walkingButton\(p\),route\(p\)\)/);
 assert.match(popup,/quickActions\.append\(popupEditButton\)/);
 assert.match(app,/enablePopupMapDrag\(marker,popup\)/);
 assert.doesNotMatch(app,/dragHandle|place-popup-drag|⠿ Ziehen/);
 assert.doesNotMatch(css,/\.place-popup-drag/);
 assert.match(css,/\.leaflet-popup-content \.place-popup-pan-surface\{/);
 assert.match(css,/touch-action:none/);
});
test('overflow description scrolls vertically while default swipes pan the map',()=>{
 const body=app.slice(app.indexOf('  function enablePopupMapDrag(marker,surface){'),
    app.indexOf('  function render() {'));
 assert.match(body,/fromText=!!event\.target\.closest\?\.\('\.place-popup-description'\)/);
 assert.match(body,/scroll\.scrollHeight>scroll\.clientHeight\+4/);
 assert.match(body,/scroll\.scrollTop-=dy/);
 assert.match(app,/const description=node\('p',p\.description,'place-popup-description'\)/);
 assert.match(sw,/livekarte-shell-pwa-v22/);
});
