const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=filename=>fs.readFileSync(path.join(__dirname,'..',filename),'utf8');

test('map exposes a compact direct-pin selection switch with accessible count and finish action',()=>{
 const html=read('index.html'),css=read('style.css');
 for(const id of ['tour-map-tools','tour-map-mode','tour-map-counter','tour-map-done',
   'tour-pick-on-map'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/id="tour-map-mode"[^>]*aria-pressed="false"/);
 assert.match(html,/id="tour-map-counter"[^>]*role="status" aria-live="polite"/);
 assert.match(html,/id="tour-map-done" type="button" hidden/);
 assert.match(html,/id="tour-pick-on-map"[^>]*>📍 Orte direkt auf Karte auswählen<\/button>/);
 assert.match(css,/\.tour-map-tools\{position:absolute;z-index:855;top:116px/);
 assert.match(css,/@media\(max-width:760px\)\{\s*\.tour-map-tools\{top:58px/);
 assert.match(css,/\.pin-tour-index\{/);
 assert.match(css,/\.pin-tour-selected \.pin-inner/);
 assert.match(css,/\.tour-map-tools \[hidden\]\{display:none!important\}/);
});

test('single tap on each normal place marker toggles selection rather than opening popup in pick mode',()=>{
 const app=read('app.js');
 const start=app.indexOf('      const chosenIndex=tourSelection().findIndex(item=>');
 const end=app.indexOf("      const card = node('article'",start);
 assert.ok(start>=0&&end>start,'expected place-marker creation');
 const marker=app.slice(start,end);
 assert.match(marker,/chosenIndex\+1/);
 assert.match(marker,/pin-tour-index/);
 assert.match(marker,/className:'pin'\+\(chosenIndex>=0\?' pin-tour-selected'/);
 assert.match(marker,/if\(mapTourPickMode\)\{/);
 assert.match(marker,/marker\.on\('click',\(\)=>\{pauseGPSFollow\(\);toggleTourPlace\(p,true\);\}\)/);
 assert.match(marker,/else\{\s*marker\.bindPopup\(popup/);
 assert.doesNotMatch(marker,/fetch\(|navigator\.geolocation|localStorage/);
 const pick=app.slice(app.indexOf('  function toggleTourPlace('),app.indexOf('  function renderTourBuilder('));
 assert.match(pick,/if\(at<0 && selected\.length>=6\)/);
 assert.match(pick,/if\(at>=0\)selected\.splice\(at,1\)/);
 assert.match(pick,/else selected\.push\(place\)/);
 assert.match(pick,/setTourSelection\(selected\)/);
 assert.match(pick,/if\(!fromMap&&at<0&&selected\.length===1\)/);
 const update=app.slice(app.indexOf('  function setTourSelection('),app.indexOf('  function toggleTourPlace('));
 assert.match(update,/clearTourRoute\(\)/);
 assert.match(update,/persistTourDrafts\(\)/);
 assert.match(update,/render\(\)/);
});

test('selection overlay keeps the map in place, and finish returns to route planning',()=>{
 const app=read('app.js');
 const start=app.indexOf('  const mapTourModeButton=');
 const end=app.indexOf('  function tourSelection(){',start);
 assert.ok(start>=0&&end>start);
 const block=app.slice(start,end);
 assert.match(block,/function updateMapTourControls\(\)/);
 assert.match(block,/mapTourCounter\.textContent=number\+'\/6 Ziele/);
 assert.match(block,/mapTourModeButton\.setAttribute\('aria-pressed',String\(mapTourPickMode\)\)/);
 assert.match(block,/function setMapTourPickMode\(enabled,focusMap=false\)/);
 assert.match(block,/if\(mapTourPickMode\)pauseGPSFollow\(\)/);
 assert.match(block,/filter='all'/);
 assert.match(block,/map\.closePopup\(\)/);
 assert.match(block,/render\(\)/);
 assert.match(block,/if\(focusMap\)\$\('map'\)\.scrollIntoView/);
 assert.match(block,/mapTourModeButton\.onclick=\(\)=>setMapTourPickMode\(!mapTourPickMode\)/);
 assert.match(block,/planMapPickButton\.onclick=\(\)=>setMapTourPickMode\(true,true\)/);
 assert.match(block,/mapTourDone\.onclick=\(\)=>\{/);
 assert.match(block,/tourBuilder\.scrollIntoView/);
 assert.doesNotMatch(block,/fetch\(|localStorage|navigator\.geolocation/);
 const renderBuilder=app.slice(app.indexOf('  function renderTourBuilder()'),
     app.indexOf('  // Day schedule reuses'));
 assert.match(renderBuilder,/updateMapTourControls\(\)/);
 assert.match(app,/if\(activePlanId!==id\)mapTourPickMode=false/);
 assert.doesNotMatch(app,/localStorage\.setItem\(['"]mapTourPickMode/);
});

test('normal map popups still support directions and also have a nearby tour button',()=>{
 const app=read('app.js');
 const begin=app.indexOf("      const popup = node('div');",app.indexOf('  function render()'));
 const end=app.indexOf('      const chosenIndex=',begin);
 const popup=app.slice(begin,end);
 assert.match(popup,/popupTourButton=node\('button',tourIsSelected\(p\)\?'✓ In Tour':'＋ Tour','tour-pick'\)/);
 assert.match(popup,/popupTourButton\.onclick=\(\)=>toggleTourPlace\(p,true\)/);
 assert.match(popup,/quickActions\.append\(popupTourButton,walkingButton\(p\),route\(p\)\)/);
 assert.match(popup,/appendPlaceTiming\(popup,p\)/);
 assert.match(app,/marker\.bindPopup\(popup,\{maxWidth:320,maxHeight:250,autoPan:true\}\)/);
});

test('map picking is local-only and preserves previously deployed tour and offline shell',()=>{
 const app=read('app.js'),sw=read('sw.js'),html=read('index.html');
 assert.match(sw,/livekarte-shell-pwa-v13/);
 assert.doesNotMatch(sw,/routed-foot|overpass-api\.de/);
 assert.match(app,/const badge=chosenIndex<0/);
 assert.match(app,/function toggleTourPlace\(place,fromMap=false\)/);
 assert.match(app,/function clearTourRoute\(\)/);
 assert.match(app,/function renderTourBuilder\(\)/);
 assert.match(app,/tourDrafts\[activePlanId\]=items\.map\(p=>C\.placePlanKey\(p\)\)/);
 assert.match(html,/id="tour-optimize"/);
 assert.match(html,/id="tour-calculate"/);
 assert.match(html,/id="day-planner"/);
 assert.match(html,/id="route-discovery"/);
});
