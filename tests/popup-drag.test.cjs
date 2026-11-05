const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const app=read('app.js'),core=read('map-popup-core.js'),css=read('style.css'),sw=read('sw.js');

test('all marker popups share one binder; no destination-specific popup implementation',()=>{
 assert.match(app,/function bindMapPopup\(marker,content,options=\{\}\)/);
 assert.match(app,/window\.LivekarteMapPopup\.bind\(/);
 assert.doesNotMatch(app,/\.bindPopup\(/,'old direct popup handlers must not return');
 assert.doesNotMatch(app,/enablePopupMapDrag/);
 const markerBlocks=[
  /bindMapPopup\(marker,popup\)/g,
  /bindMapPopup\(marker,popup,\{maxWidth:260\}\)/g,
  /bindMapPopup\(marker,node\('strong','Stopp '/g
 ];
 assert.equal((app.match(markerBlocks[0])||[]).length,2,
   'ordinary places and journey stations share popup gestures');
 assert.equal((app.match(markerBlocks[1])||[]).length,1,'discovery results share popup gestures');
 assert.equal((app.match(markerBlocks[2])||[]).length,1,'tour stops share popup gestures');
});

test('shared popup contract supports swipes over actions without blocking taps',()=>{
 assert.match(core,/surface\.addEventListener\('pointerdown'/);
 assert.match(core,/surface\.addEventListener\('pointermove'/);
 assert.match(core,/Math\.hypot\(event\.clientX-startX,event\.clientY-startY\)<8/);
 assert.match(core,/surface\.addEventListener\('click'/);
 assert.match(core,/event\.preventDefault\(\);event\.stopImmediatePropagation\?\.\(\)/);
 assert.match(core,/map\.panBy\(\[-dx,-dy\],\{animate:false\}\)/);
 assert.match(core,/marker\.on\('popupclose'/);
 assert.match(core,/input,select,textarea,label/);
 assert.match(core,/scroll\.scrollTop=Math\.max\(0,Math\.min\(maxScroll,scroll\.scrollTop-dy\)\)/);
 assert.doesNotMatch(core,/localStorage|navigator\.geolocation|fetch\(/);
 assert.match(css,/\.leaflet-popup-content \.place-popup-pan-surface\{touch-action:none/);
 assert.doesNotMatch(css,/\.place-popup-drag/);
});

test('the same shared module loads online and is cached for offline PWA travel',()=>{
 const html=read('index.html');
 assert.match(html,/<script defer src="map-popup-core\.js"><\/script>/);
 assert.ok(html.indexOf('map-popup-core.js')<html.indexOf('app.js'));
 assert.match(sw,/'map-popup-core\.js'/);
 assert.match(sw,/livekarte-shell-pwa-v22/);
});

test('Nara day popup is ordinary place popup, including preserved compact actions',()=>{
 const ui=read('place-ui.js');
 const begin=ui.indexOf("const popup=node('div',undefined,'place-popup-pan-surface');");
 const until=ui.indexOf('return {popup,inPopup};',begin);
 const popup=ui.slice(begin,until);
 assert.ok(begin>=0&&until>begin);
 assert.match(popup,/popupHeader\.append\(node\('strong',p\.name\)\)/);
 assert.match(popup,/quickActions\.append\(popupWalk,popupTourButton,popupMore\)/);
 assert.match(popup,/popupMoreBody\.append\(route\(p\),popupEditButton\)/);
 assert.match(app,/bindMapPopup\(marker,popup\)/);
 assert.doesNotMatch(app,/dragHandle|place-popup-drag|⠿ Ziehen/);
});
