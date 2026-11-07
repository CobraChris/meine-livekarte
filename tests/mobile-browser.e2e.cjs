'use strict';
// Real headless Chrome mobile-viewport E2E tests.
// No paid services, no third-party network, no GPS data persisted:
// the site is served from localhost; mocked coordinates live only in memory.
const {strict:assert}=require('node:assert');
const {chromium}=require('playwright-core');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'..');
const results=path.join(root,'test-results','mobile');
fs.mkdirSync(results,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
 '.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8',
 '.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function server(){
 return http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');
   const requested=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);
   const file=path.resolve(root,'.'+requested);
   if(!file.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
   const buffer=await fs.promises.readFile(file);
   res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream',
    'cache-control':'no-store'});
   res.end(buffer);
  }catch{res.writeHead(404);res.end('Not found');}
 });
}
function chromeExecutable(){
 const candidates=[
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
  '/opt/google/chrome/chrome','/usr/bin/chromium','/usr/bin/chromium-browser'
 ];
 const found=candidates.find(v=>v&&fs.existsSync(v));
 if(!found)throw Error('System-Chrome fehlt im CI-Runner – Test darf nicht still übersprungen werden.');
 return found;
}
async function testDay(page,day,expectedCount){
 const selector='#city-days-list button[data-day-date="'+day+'"]';
 await page.locator(selector).click();
 await page.waitForFunction(({date,count})=>
  document.querySelector('#plan-day-summary')?.textContent.includes(date.slice(8,10)+'.11.') &&
  document.querySelectorAll('#day-route-stops li').length===count,
  {date:day,count:expectedCount},{timeout:10000});
 const names=await page.locator('#day-route-stops li').allTextContents();
 assert.equal(names.length,expectedCount,day+' has correct route goals');
 assert.equal(await page.locator('.map-actions button').count(),3,
  'All days retain exactly the same fullscreen / goals / GPS toolbar');
 assert.equal(await page.locator('#day-route-preview').isVisible(),true);
 assert.equal(await page.locator('#day-route-foot').isEnabled(),true);
 console.log('PASS '+day+' '+expectedCount+' goals, one common toolbar and route preview');
}
async function openPlacePopup(page,name){
 const card=page.locator('#places article.place').filter({hasText:name}).first();
 const known=await page.locator('#places article.place h3').allTextContents();
 const state=await page.evaluate(()=>({
  count:document.querySelector('#count')?.textContent,
  placesChildCount:document.querySelector('#places')?.children.length,
  placesSample:document.querySelector('#places')?.innerHTML.slice(0,450),
  daySummary:document.querySelector('#plan-day-summary')?.textContent,
  activeFilter:[...document.querySelectorAll('[data-filter][aria-pressed="true"]')].map(el=>el.dataset.filter)
 }));
 assert.equal(await card.count(),1,'Place card missing: '+name+'; visible cards: '+JSON.stringify(known)+'; state: '+JSON.stringify(state));
 await card.getByRole('button',{name:'Auf Karte'}).click();
 const popup=page.locator('.leaflet-popup-content .place-popup-pan-surface').first();
 await popup.waitFor({state:'visible',timeout:10000});
 assert.match(await popup.innerText(),new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 return popup;
}
async function swipeOverPopupAction(page){
 const pane=page.locator('.leaflet-map-pane');
 const popup=page.locator('.leaflet-popup-content .place-popup-pan-surface').first();
 const button=popup.locator('button.walk-start');
 await button.waitFor({state:'visible'});
 const bbox=await button.boundingBox();
 const mapBox=await page.locator('#map').boundingBox();
 assert.ok(bbox&&bbox.width>20&&bbox.height>20,'Popup action has a usable touch target');
 assert.ok(mapBox&&bbox.y>=mapBox.y+8&&bbox.y+bbox.height<=mapBox.y+mapBox.height-8,
   'Expanded popup action must stay inside the visible map, not behind page header');
 const x=bbox.x+Math.min(40,bbox.width/2), y=bbox.y+bbox.height/2;
 const before=await pane.evaluate(el=>el.style.transform);
 const cdp=await page.context().newCDPSession(page);
 const finger=(px)=>[{x:px,y,id:1,radiusX:2,radiusY:2,force:1}];
 try{
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:finger(x)});
  for(const step of [8,18,30,44,56]){
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:finger(x+step)});
   await delay(18);
  }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }finally{await cdp.detach();}
 await delay(120);
 const after=await pane.evaluate(el=>el.style.transform);
 const offset=value=>Number(value.slice(value.indexOf('(')+1).split('px')[0]);
 const hit=await page.evaluate(({x,y})=>{
  const info=(px,py)=>{
   const elem=document.elementFromPoint(px,py);
   return {tag:elem?.tagName,id:elem?.id,className:String(elem?.className||'').slice(0,120),
     text:elem?.textContent?.trim().slice(0,80)};
  };
  const toolbar=document.querySelector('.tour-map-tools');
  const t=toolbar?.getBoundingClientRect();
  return {start:info(x,y),end:info(x+56,y),
   toolbar:t?{x:t.x,y:t.y,width:t.width,height:t.height}:null,
   popup:document.querySelector('.leaflet-popup')?.getBoundingClientRect()?.toJSON()};
 },{x,y});
 assert.ok(Math.abs(offset(after)-offset(before))>=40,
  'A 56px finger gesture must move the map by at least 40px, not just the first 8px. '+
  JSON.stringify({before,after,hit}));
 assert.equal(await popup.isVisible(),true,'Popup stays open after pan gesture');
 assert.equal(await page.locator('#walk-route-panel').isVisible(),false,
  'Swipe must NOT accidentally trigger the Fußweg button');
 console.log('PASS full touchscreen swipe over expanded popup button; map moves without activating button');
}
async function verifyGPSOverview(page){
 await page.waitForFunction(()=>document.querySelector('.gps-location-icon')!==null,
  null,{timeout:12000});
 await page.locator('#fit').click();
 await delay(250);
 const result=await page.evaluate(()=>{
  const el=document.querySelector('.gps-location-icon');
  const map=document.getElementById('map').getBoundingClientRect();
  const gps=el.getBoundingClientRect();
  const center={x:gps.left+gps.width/2,y:gps.top+gps.height/2};
  const overlays=['.plan-picker','#place-search','#tour-map-tools','.map-actions']
   .map(selector=>document.querySelector(selector))
   .filter(Boolean).map(e=>({rect:e.getBoundingClientRect(),hidden:e.hidden}));
  return {center,within:center.x>map.left&&center.x<map.right&&
    center.y>map.top&&center.y<map.bottom,
   blocked:overlays.some(({rect,hidden})=>!hidden&&center.x>=rect.left&&
    center.x<=rect.right&&center.y>=rect.top&&center.y<=rect.bottom)};
 });
 assert.ok(result.within,'GPS marker must be in shared day-goal overview');
 assert.equal(result.blocked,false,'GPS marker must not be obscured by map controls');
 console.log('PASS GPS and Nara goals overview: position visible, free of controls');
}

async function verifyLocalSearchAndTourBuilder(page){
 // Saved recommendations are searchable even when all third-party traffic is blocked.
 await page.locator('#place-search-input').fill('Nara-Park');
 await page.locator('#place-search-go').click();
 const first=page.locator('#place-search-results button.place-search-result').first();
 await first.waitFor({state:'visible'});
 await first.click();
 assert.equal(await page.locator('#place-search-picked').isVisible(),true);
 assert.equal(await page.locator('#place-search-save').isDisabled(),true,
  'Saved place must never create an accidental duplicate');
 await page.locator('#place-search-input').fill('');
 assert.equal(await page.locator('#place-search-picked').isVisible(),false,
  'Clearing search removes the selection and map preview');
 console.log('PASS offline local search, saved-place preview and safe reset');

 const cards=page.locator('#places article.place');
 assert.ok(await cards.count()>=2,'There must be two selectable destinations');
 await cards.nth(0).locator('button.tour-pick').click();
 await cards.nth(1).locator('button.tour-pick').click();
 assert.equal(await page.locator('#tour-stops li').count(),2);
 assert.ok((await page.locator('#tour-count').innerText()).includes('2/6'),'The tour counter shows two of six stops');
 assert.equal(await page.locator('#tour-calculate').isEnabled(),true);
 await page.locator('#tour-clear').click();
 assert.equal(await page.locator('#tour-stops li.tour-stop').count(),0);
 assert.equal(await page.locator('#tour-stops li.tour-empty').count(),1,
  'The empty-state hint must replace previous stops');
 assert.equal(await page.locator('#tour-calculate').isDisabled(),true);
 console.log('PASS two-stop tour selection, shared counter and full reset');
}
async function verifyManualTouchPan(page){
 // The GPS button explicitly resumes following, a true finger drag cancels it.
 await page.locator('#gps').click();
 await page.waitForFunction(()=>document.querySelector('#gps')?.getAttribute('aria-pressed')==='true',
  null,{timeout:10000});
 await page.evaluate(()=>document.getElementById('map').scrollIntoView({block:'center'}));
 await delay(150);
 const box=await page.locator('#map').boundingBox();
 assert.ok(box&&box.width>180&&box.height>180);
 const x=box.x+box.width*.70,y=box.y+box.height*.62;
 const pane=page.locator('.leaflet-map-pane');
 const before=await pane.evaluate(el=>el.style.transform);
 const cdp=await page.context().newCDPSession(page);
 const finger=(px)=>[{x:px,y,id:2,radiusX:2,radiusY:2,force:1}];
 try{
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:finger(x)});
  for(const offset of [14,30,48,68]){
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:finger(x+offset)});
   await delay(28);
  }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }finally{await cdp.detach();}
 await delay(200);
 assert.notEqual(await pane.evaluate(el=>el.style.transform),before,
  'Finger drag on map background must move the actual map');
 assert.equal(await page.locator('#gps').getAttribute('aria-pressed'),'false',
  'Manual map gesture must stop GPS auto-recentering');
 console.log('PASS background touch pan cancels GPS follow without switching off GPS');
}

async function verifyCompassDiagnostics(page){
 await page.locator('#privacy').click();
 await page.locator('#compass-test').waitFor({state:'visible'});
 // This scenario tests our app's sensor math, not Chrome/OS permission prompts.
 // An explicit user click with a granted permission enables the listener.
 await page.evaluate(()=>{
  if(typeof DeviceOrientationEvent!=='undefined')
   Object.defineProperty(DeviceOrientationEvent,'requestPermission',{
    configurable:true,value:()=>Promise.resolve('granted')});
 });
 await page.locator('#compass-test').click();
 await delay(150);
 await page.waitForFunction(()=>document.querySelector('.gps-location-icon')!==null,
  null,{timeout:10000});
 await page.evaluate(()=>{
  const event=new Event('deviceorientationabsolute');
  Object.defineProperties(event,{
   absolute:{value:true},alpha:{value:0},beta:{value:90},gamma:{value:45}
  });
  window.dispatchEvent(event);
 });
 await page.waitForFunction(()=>document.getElementById('compass-diagnostic')?.textContent.includes('315°'),
  null,{timeout:5000});
 assert.equal(await page.locator('.gps-location-icon.has-heading').count(),1,
  'Tilted absolute heading displays a direction cone, not only a blue dot');
 const before=await page.locator('.gps-bearing').first().evaluate(el=>el.style.transform);
 await page.evaluate(()=>{
  const relative=new Event('deviceorientation');
  Object.defineProperties(relative,{
   absolute:{value:false},alpha:{value:100},beta:{value:30},gamma:{value:15}
  });
  window.dispatchEvent(relative);
 });
 assert.equal(await page.locator('.gps-bearing').first().evaluate(el=>el.style.transform),before,
  'Relative orientation never overwrites a trusted absolute compass bearing');
 await page.locator('#help-dialog [data-close]').click();
 console.log('PASS simulated tilted compass direction, diagnostics and relative-yaw rejection');
}


async function verifyUpdateGuardAndPersistence(page){
 // A user-edited import form must survive a declined update prompt.
 const guard=await page.evaluate(()=>{
  const dialog=document.getElementById('import-dialog');
  const input=document.getElementById('import-text');
  if(!dialog||!input||!document.getElementById('app-update-now'))
    return {error:'update/import controls missing'};
  dialog.showModal();
  input.value='Nur lokaler Test, niemals importieren';
  input.dispatchEvent(new Event('input',{bubbles:true}));
  const originalConfirm=window.confirm;
  let confirms=0;
  window.confirm=()=>{confirms++;return false;};
  document.getElementById('app-update-now').click();
  window.confirm=originalConfirm;
  const value=input.value,stillOpen=dialog.open;
  dialog.close();
  input.value='';
  return {confirms,value,stillOpen};
 });
 assert.equal(guard.error,undefined);
 assert.equal(guard.confirms,1,'A modified open dialog requires consent before update');
 assert.equal(guard.stillOpen,true,'Declining must not reload or close the editor');
 assert.match(guard.value,/Nur lokaler Test/);
 console.log('PASS updating cannot erase an unsaved form without confirmation');

 // The data on a user's actual phone is never touched. Here the independent
 // temporary browser context must retain plans and places over page reload.
 const before=await page.evaluate(()=>{
  const keys=['livekarte-places-v1','livekarte-ticket-status-v1',
   'livekarte-city-day-assignments-v1','livekarte-plan-assignments-v1',
   'livekarte-custom-plans-v1','livekarte-active-plan-v1'];
  return {storage:keys.map(key=>[key,localStorage.getItem(key)]),
   plan:document.getElementById('plan-select').value};
 });
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#plan-select').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.getElementById('plan-select')?.value==='town-kyoto',
  null,{timeout:12000});
 const after=await page.evaluate((keys)=>({
  storage:keys.map(key=>[key,localStorage.getItem(key)]),
  plan:document.getElementById('plan-select').value
 }),before.storage.map(([key])=>key));
 assert.deepEqual(after,before,
  'An ordinary app update/reload must preserve local places, tickets and plans');
 console.log('PASS same-origin app reload preserves all trip and ticket storage');
}

async function verifyCurrentPositionBookmark(page){
 const name='CI GPS Restaurant (keine echte Buchung)';
 const before=await page.evaluate(()=>JSON.parse(
  localStorage.getItem('livekarte-places-v1')||'[]').length);
 // No map tapping is necessary. No place is saved until form submit.
 const shortcut=page.locator('#map-save-gps');
 assert.ok(await shortcut.isVisible(),'The current-position shortcut is exposed');
 const toolbar=await page.locator('.tour-map-tools').boundingBox();
 assert.ok(toolbar.height<=48,'GPS shortcut must not create a second overlay row: '+toolbar.height);
 await shortcut.click();
 await page.locator('#map-place-dialog').waitFor({state:'visible'});
 const coord=await page.locator('#map-place-coordinates').innerText();
 assert.ok(coord.includes('35.012000, 135.763000'),
  'Bookmark uses real mock GPS position, not the map center: '+coord);
 assert.equal(await page.locator('#map-place-name').inputValue(),'');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('livekarte-places-v1')||'[]').length),
  before,'Opening GPS bookmark must not write to localStorage');
 await page.locator('#map-place-name').fill(name);
 await page.locator('#map-place-note').fill('Nur automatischer mobiler Test');
 await page.locator('#map-place-form button[type="submit"]').click();
 await page.locator('#map-place-dialog').waitFor({state:'hidden'});
 const saved=await page.evaluate(name=>{
  const places=JSON.parse(localStorage.getItem('livekarte-places-v1')||'[]');
  return places.filter(p=>p.name===name);
 },name);
 assert.equal(saved.length,1,'The new GPS restaurant is only saved once');
 assert.ok(Math.abs(saved[0].lat-35.012)<0.00002);
 assert.ok(Math.abs(saved[0].lng-135.763)<0.00002);
 assert.equal(saved[0].category,'restaurant');
 // Current section assigned normally; existing day plans and other places stay.
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#map-save-gps').waitFor({state:'visible'});
 assert.equal(await page.evaluate(name=>JSON.parse(
  localStorage.getItem('livekarte-places-v1')||'[]').filter(p=>p.name===name).length,name),1,
  'The GPS location survives a normal installed-PWA update/reload');
 console.log('PASS one-tap GPS current location saved as named restaurant with no map tap and reload-safe');
}

async function verifyJourneyTicketAttachment(page){
 const first=page.locator('#journey-info .journey-item').first();
 const original=await first.locator('select.ticket-choice').inputValue();
 await first.locator('.rail-leg-ticket-button').click();
 await page.locator('#rail-ticket-dialog').waitFor({state:'visible'});
 assert.match(await page.locator('#rail-ticket-route').innerText(),/Kyoto.*Tokyo/);
 await page.waitForFunction(()=>document.getElementById('rail-ticket-file-status')?.textContent.includes('Noch kein Ticketfoto oder PDF'),
  null,{timeout:10000});
 assert.match(await page.locator('#rail-ticket-file-status').innerText(),/Noch kein Ticketfoto oder PDF/,
  'The empty state must explicitly say nothing is stored yet');
 assert.equal(await page.locator('#rail-camera-input').getAttribute('capture'),'environment');
 await page.locator('#rail-reference').fill('TEST-REF-987');
 await page.locator('#rail-note').fill('Papierfahrkarte am Schalter abholen');
 await page.locator('#rail-pickup').check();
 await page.locator('#rail-details-save').click();
 const afterSave=await page.evaluate(()=>{
  const all=JSON.parse(localStorage.getItem('livekarte-rail-leg-details-v1')||'{}');
  return Object.values(all).find(x=>x.reference==='TEST-REF-987');
 });
 assert.equal(afterSave.pickupRequired,true);
 assert.match(afterSave.note,/Schalter/);
 assert.equal(await page.locator('#journey-info .journey-item').first()
  .locator('select.ticket-choice').inputValue(),original,
  'Saving pickup notes cannot change ticket readiness');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lQAAAABJRU5ErkJggg==','base64');
 await page.locator('#rail-camera-input').setInputFiles({
  name:'nikko-test-ticket.png',mimeType:'image/png',buffer:png
 });
 await page.waitForFunction(()=>document.querySelector('#rail-ticket-files')?.textContent.includes('nikko-test-ticket.png'),
  null,{timeout:15000});
 assert.match(await page.locator('#rail-ticket-file-status').innerText(),/1 Ticketfoto\(s\)\/Datei\(en\) lokal gespeichert und dieser Fahrt zugeordnet/,
  'The attached photo must have a persistent saved-and-linked confirmation');
 assert.match(await page.locator('#rail-ticket-files .rail-ticket-file-label strong').first().innerText(),
  /Foto gespeichert & zugeordnet/);
 const afterPhoto=await page.evaluate(async()=>{
  const all=JSON.parse(localStorage.getItem('livekarte-rail-leg-details-v1')||'{}');
  const shelf=new window.LivekarteTicketLibrary.Library();
  const files=await shelf.list();
  return {ids:Object.values(all).find(x=>x.reference==='TEST-REF-987')?.ticketIds||[],
    files:files.map(x=>x.id),statuses:localStorage.getItem('livekarte-ticket-status-v1')};
 });
 assert.equal(afterPhoto.ids.length,1);
 assert.ok(afterPhoto.files.includes(afterPhoto.ids[0]));
 await page.locator('#rail-ticket-close').click();
 const second=page.locator('#journey-info .journey-item').nth(1);
 await second.locator('.rail-leg-ticket-button').click();
 await page.locator('#rail-existing-select').selectOption(afterPhoto.ids[0]);
 await page.locator('#rail-existing-add').click();
 await page.waitForFunction(()=>document.querySelector('#rail-ticket-files')?.textContent.includes('nikko-test-ticket.png'));
 const afterLink=await page.evaluate(async()=>{
  const shelf=new window.LivekarteTicketLibrary.Library();
  return {count:(await shelf.list()).length,
    vals:Object.values(JSON.parse(localStorage.getItem('livekarte-rail-leg-details-v1')||'{}'))};
 });
 assert.equal(afterLink.count,afterPhoto.files.length,
  'A document attached to two legs must not be duplicated');
 assert.equal(afterLink.vals.filter(x=>x.ticketIds.includes(afterPhoto.ids[0])).length,2);
 await page.locator('#rail-ticket-close').click();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#plan-select').selectOption('ride-nikko');
 await page.locator('#journey-info .journey-item').first().locator('.rail-leg-ticket-button').click();
 assert.equal(await page.locator('#rail-reference').inputValue(),'TEST-REF-987');
 assert.equal(await page.locator('#rail-pickup').isChecked(),true);
 await page.waitForFunction(()=>document.getElementById('rail-ticket-file-status')?.textContent.includes('gespeichert und dieser Fahrt zugeordnet'),
  null,{timeout:10000});
 assert.match(await page.locator('#rail-ticket-file-status').innerText(),/gespeichert und dieser Fahrt zugeordnet/,
  'Saved photo proof must remain visible after closing and reopening the dialog');
 await page.locator('#rail-ticket-close').click();
 console.log('PASS camera-photo ticket, clear saved status, notes, pickup flag and reload persistence');
}
async function verifyFujiNatureCategory(page){
 // The summit belongs to global saved places, not any Kyoto itinerary day.
 assert.equal(await page.locator('#plan-select').inputValue(),'town-kyoto');
 const dayBefore=await page.evaluate(()=>localStorage.getItem('livekarte-city-day-assignments-v1'));
 const ticketBefore=await page.evaluate(()=>localStorage.getItem('livekarte-ticket-status-v1'));
 await page.locator('#place-search-input').fill('Mount Fuji');
 await page.locator('#place-search-go').click();
 const searchItem=page.locator('#place-search-results button.place-search-result').first();
 await searchItem.waitFor({state:'visible'});
 assert.match(await searchItem.innerText(),/Mount Fuji/);
 assert.match(await searchItem.innerText(),/Natur/);
 await page.locator('#place-search-input').fill('');
 await page.locator('#plan-select').selectOption('all');
 const nature=page.locator('[data-filter="nature"]');
 await nature.click();
 assert.equal(await nature.getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#places .place').count(),1,
  'Mount Fuji is the sole initial global nature landmark');
 assert.match(await page.locator('#places .place h3').innerText(),/Mount Fuji/);
 assert.equal(await page.locator('.leaflet-marker-icon .pin-nature').count(),1,
  'Nature pin must use the distinct mountain icon');
 await page.locator('#places .place .place-actions button').first().click();
 const center=await page.evaluate(()=>({lat:window.__livekarteMap?.getCenter()?.lat,
  lng:window.__livekarteMap?.getCenter()?.lng}));
 // App does not expose Leaflet globally: the selected popup and card must
 // still display the correct known landmark without changing today's plan.
 assert.match(await page.locator('.leaflet-popup-content').first().innerText(),/Mount Fuji/);
 const data=await page.evaluate(()=>({
  fuji:JSON.parse(localStorage.getItem('livekarte-places-v1')||'[]')
   .filter(p=>p.name==='Mount Fuji (富士山)'),
  days:localStorage.getItem('livekarte-city-day-assignments-v1'),
  tickets:localStorage.getItem('livekarte-ticket-status-v1')
 }));
 assert.equal(data.fuji.length,1);
 assert.equal(data.fuji[0].category,'nature');
 assert.equal(data.fuji[0].lat,35.3606);
 assert.equal(data.fuji[0].lng,138.7274);
 assert.equal(data.days,dayBefore,'Adding Fuji does not alter Kyoto day schedules');
 assert.equal(data.tickets,ticketBefore,'Adding Fuji does not alter tickets');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#plan-select').waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('livekarte-places-v1')||'[]')
  .filter(p=>p.name==='Mount Fuji (富士山)').length),1,
  'Fuji landmark is only seeded once and survives updates');
 console.log('PASS Fuji summit global Nature pin, local search and unchanged trip/tickets');
}
async function verifyOSMGermanStyle(page){
 await page.locator('#plan-select').selectOption('ride-nikko');
 await page.waitForFunction(()=>document.querySelector('.journey-nature-marker')!==null);
 const snapshot=()=>page.evaluate(()=>({
  plan:document.getElementById('plan-select')?.value,
  markers:document.querySelectorAll('.leaflet-marker-icon').length,
  mapTransform:document.querySelector('.leaflet-map-pane')?.style.transform,
  tickets:localStorage.getItem('livekarte-ticket-status-v1'),
  places:localStorage.getItem('livekarte-places-v1')
 }));
 const before=await snapshot();
 const standard=page.locator('#provider-osm'),german=page.locator('#provider-osm-de');
 assert.equal(await standard.getAttribute('aria-pressed'),'true');
 const dock=await page.locator('#map-provider-switch').boundingBox();
 const button=await german.boundingBox();
 assert.ok(dock&&button&&button.y>=dock.y&&button.y+button.height<=dock.y+dock.height+2,
  'Three styles must fit the existing single-row mobile provider strip');
 await german.click();
 await page.waitForFunction(()=>[...document.querySelectorAll('.leaflet-tile-pane img')]
  .some(img=>img.src.includes('tile.openstreetmap.de/')));
 assert.equal(await german.getAttribute('aria-pressed'),'true');
 assert.equal(await standard.getAttribute('aria-pressed'),'false');
 assert.match(await page.locator('.leaflet-control-attribution').innerText(),/OSM Deutschland/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('livekarte-osm-style-v1')),'de');
 assert.deepEqual(await snapshot(),before,
  'Changing tile style must preserve selected journey, markers, map camera, tickets and places');
 await page.reload({waitUntil:'domcontentloaded'});
 await german.waitFor({state:'visible'});
 assert.equal(await german.getAttribute('aria-pressed'),'true');
 await page.waitForFunction(()=>[...document.querySelectorAll('.leaflet-tile-pane img')]
  .some(img=>img.src.includes('tile.openstreetmap.de/')));
 await standard.click();
 await page.waitForFunction(()=>[...document.querySelectorAll('.leaflet-tile-pane img')]
  .some(img=>img.src.includes('tile.openstreetmap.org/')));
 assert.equal(await standard.getAttribute('aria-pressed'),'true');
 assert.equal(await german.getAttribute('aria-pressed'),'false');
 assert.equal(await page.evaluate(()=>localStorage.getItem('livekarte-osm-style-v1')),'standard');
 assert.doesNotMatch(await page.locator('.leaflet-control-attribution').innerText(),/OSM Deutschland/);
 assert.equal(await page.locator('#provider-google').getAttribute('aria-pressed'),'false');
 console.log('PASS OSM Deutsch/Standard labels, choice persistence, map and ticket preservation');
}

async function verifyProviderParityMatrix(page){
 // Exercise the real PWA UI in Chrome, with the paid Google SDK replaced
 // by a fully local in-memory drawing adapter. No Google key or API request.
 // This intentionally tests our integration, NOT Google's own map renderer.
 await page.evaluate(()=>{
  const telemetry={maps:[],markers:[],polylines:[],circles:[]};
  class MapFake{
   constructor(el,opts){
    this.el=el;this.center={...opts.center};this.zoom=opts.zoom;
    this.callbacks={};telemetry.maps.push(this);
   }
   setCenter(point){this.center={lat:point.lat,lng:point.lng};}
   setZoom(zoom){this.zoom=zoom;}
   getCenter(){return {lat:()=>this.center.lat,lng:()=>this.center.lng};}
   getZoom(){return this.zoom;}
   addListener(event,fn){this.callbacks[event]=fn;}
   emit(event,data){this.callbacks[event]?.(data);}
   fitBounds(bounds){
    if(!bounds.points.length)return;
    this.center={lat:bounds.points.reduce((sum,p)=>sum+p.lat,0)/bounds.points.length,
      lng:bounds.points.reduce((sum,p)=>sum+p.lng,0)/bounds.points.length};
   }
  }
  class Overlay{
   constructor(opts){this.options=opts;this.active=!!opts.map;this.callbacks={};}
   setMap(map){this.active=!!map;}
   addListener(event,fn){this.callbacks[event]=fn;}
   emit(event,data){this.callbacks[event]?.(data);}
  }
  class MarkerFake extends Overlay{
   constructor(opts){super(opts);telemetry.markers.push(this);}
  }
  class PolylineFake extends Overlay{
   constructor(opts){super(opts);telemetry.polylines.push(this);}
  }
  class CircleFake extends Overlay{
   constructor(opts){super(opts);telemetry.circles.push(this);}
  }
  class InfoWindowFake{
   setContent(content){this.content=content;}
   open(){this.isOpen=true;}
   close(){this.isOpen=false;}
  }
  class BoundsFake{
   constructor(){this.points=[];}
   extend(point){this.points.push(point);}
  }
  window.google={maps:{
   Map:MapFake,Marker:MarkerFake,Polyline:PolylineFake,
   Circle:CircleFake,InfoWindow:InfoWindowFake,LatLngBounds:BoundsFake,
   Size:class{constructor(width,height){this.width=width;this.height=height;}},
   Point:class{constructor(x,y){this.x=x;this.y=y;}}
  }};
  window.__providerParity=telemetry;
  localStorage.setItem('livekarte-google-demo-key-v1','AIza'+'x'.repeat(35));
 });
 const storage=()=>page.evaluate(()=>({
  places:localStorage.getItem('livekarte-places-v1'),
  tickets:localStorage.getItem('livekarte-ticket-status-v1'),
  legs:localStorage.getItem('livekarte-rail-leg-details-v1')
 }));
 const initial=await storage();
 const provider=page.locator('.workspace');
 await page.locator('#plan-select').selectOption('ride-nikko');
 await page.locator('#provider-google').click();
 await page.waitForFunction(()=>document.querySelector('.workspace')?.dataset.provider==='google');
 for(const control of ['#place-search','#tour-map-tools','#map-save-place',
   '#map-save-gps','#fit','#gps','#expand-map','#plan-select']){
  assert.equal(await page.locator(control).isVisible(),true,
   'Google provider must retain the common mobile control: '+control);
 }
 assert.equal(await page.locator('#provider-google').getAttribute('aria-pressed'),'true');

 async function checkRail(planId,slug){
  await page.locator('#plan-select').selectOption(planId);
  const snapshot=await page.evaluate(slug=>{
   const route=window.LivekarteRouteModel.rail(window.MapCore.presetJourney(slug));
   const drawn=window.__providerParity.polylines.filter(line=>line.active);
   const active=window.__providerParity.markers.filter(marker=>marker.active);
   return {
    expected:route.points,
    drawn:drawn.map(line=>line.options.path.map(p=>[p.lat,p.lng])),
    expectedStops:route.stops.map((p,i)=>(i+1)+'. '+p.name),
    displayedStops:active.map(m=>m.options.title),
    routeNote:document.getElementById('google-demo-route-meaning').textContent,
    workspace:document.querySelector('.workspace').dataset.provider
   };
  },slug);
  assert.equal(snapshot.workspace,'google',planId+' changed provider unexpectedly');
  assert.equal(snapshot.drawn.length,1,planId+' must draw exactly one rail route');
  assert.deepEqual(snapshot.drawn[0],snapshot.expected,
   planId+' must show the exact common OSM railway route geometry');
  for(const stop of snapshot.expectedStops)
   assert.ok(snapshot.displayedStops.includes(stop),planId+' is missing '+stop);
  assert.match(snapshot.routeNote,/Schematische Bahnverbindung/);
  assert.equal(await page.locator('#place-search').isVisible(),true);
  assert.equal(await page.locator('#gps').isVisible(),true);
  console.log('PASS provider journey parity '+planId+' ('+snapshot.expectedStops.length+' stops)');
 }
 await checkRail('ride-nikko','kyoto-nikko-2026-11-07');
 await checkRail('ride-kyoto','takayama-kyoto-2026-11-01');
 await checkRail('ride-takayama','hakone-takayama-2026-10-30');
 await page.locator('#plan-select').selectOption('town-kyoto');
 await page.locator('#city-days-list button[data-day-date="2026-11-04"]').click();
 const city=await page.evaluate(()=>({
  provider:document.querySelector('.workspace').dataset.provider,
  previewLines:window.__providerParity.polylines.filter(p=>p.active).length,
  places:window.__providerParity.markers.filter(m=>m.active).map(m=>m.options.title)
 }));
 assert.equal(city.provider,'google','changing day must not force OSM');
 assert.equal(city.previewLines,1,'Nara day should retain a route preview in Google');
 assert.ok(city.places.some(name=>name.includes('Nara-Park')));
 assert.equal(await page.locator('#tour-map-mode').isVisible(),true);
 await page.locator('#tour-map-mode').click();
 const picked=await page.evaluate(()=>{
  const marker=window.__providerParity.markers.filter(
   m=>m.active&&m.options.title.includes('Nara-Park')).at(-1);
  if(!marker)throw Error('Nara-Park marker unavailable in Google');
  marker.emit('click');
  return document.querySelector('.workspace').dataset.provider;
 });
 assert.equal(picked,'google','tapping a tour stop must not change the provider');
 assert.ok((await page.locator('#tour-count').innerText()).includes('1/6'),
  'Google marker tap must use the same tour draft');
 await page.locator('#map-save-place').click();
 await page.evaluate(()=>{
  const map=window.__providerParity.maps[0];
  map.emit('click',{latLng:{lat:()=>34.682,lng:()=>135.834}});
 });
 await page.locator('#map-place-dialog').waitFor({state:'visible'});
 assert.match(await page.locator('#map-place-coordinates').innerText(),/34\.682000, 135\.834000/);
 await page.locator('#map-place-cancel').click();
 assert.equal(await page.locator('#map-place-dialog').isVisible(),false);
 assert.equal(await provider.getAttribute('data-provider'),'google',
  'cancelling a bookmark must not switch providers');

 await page.locator('#place-search-input').fill('Nara-Park');
 await page.locator('#place-search-go').click();
 const localHit=page.locator('#place-search-results button.place-search-result').first();
 await localHit.waitFor({state:'visible'});
 await localHit.click();
 assert.equal(await page.locator('#place-search-picked').isVisible(),true,
  'search results must be usable on Google');
 assert.equal(await provider.getAttribute('data-provider'),'google');
 const preview=await page.evaluate(()=>window.__providerParity.markers
  .filter(m=>m.active&&m.options.title==='Gesuchter Ort').length);
 assert.equal(preview,1,'shared search selection must be marked on Google');
 await page.locator('#place-search-input').fill('');

 // A fresh mocked location uses the existing app GPS watcher and its
 // provider-independent coordinate update; no simulated movement history is saved.
 await page.context().setGeolocation({latitude:35.016,longitude:135.779,accuracy:11});
 await page.waitForFunction(()=>window.__providerParity.markers
  .some(m=>m.active&&m.options.title==='Mein GPS-Standort'),null,{timeout:12000});
 assert.equal(await page.locator('#gps').isVisible(),true);
 await page.locator('#gps').click();
 assert.equal(await provider.getAttribute('data-provider'),'google');
 await page.locator('#fit').click();
 assert.equal(await provider.getAttribute('data-provider'),'google');
 assert.equal(await page.locator('#provider-osm').isVisible(),true);

 // Small Android screens: control toolbars cannot silently vanish.
 await page.setViewportSize({width:360,height:780});
 for(const selector of ['#place-search','#tour-map-tools','#gps','#provider-google']){
  const control=page.locator(selector);
  assert.ok(await control.isVisible(),selector+' disappears on a narrow phone');
  const bounds=await control.boundingBox();
  assert.ok(bounds&&bounds.width>15&&bounds.height>15,
   selector+' has no usable touch target on 360px viewport');
 }
 await page.setViewportSize({width:393,height:852});

 await page.locator('#provider-osm-de').click();
 assert.equal(await provider.getAttribute('data-provider'),'osm');
 assert.equal(await page.locator('#place-search').isVisible(),true);
 assert.equal(await page.locator('#tour-map-tools').isVisible(),true);
 await page.locator('#provider-google').click();
 assert.equal(await provider.getAttribute('data-provider'),'google');
 const after=await storage();
 assert.deepEqual(after,initial,
  'Switching providers and using unsaved search/tour/bookmark must not mutate trips or tickets');
 await page.locator('#provider-osm').click();
 assert.equal(await provider.getAttribute('data-provider'),'osm');
 console.log('PASS full OSM ↔ Google provider parity, trip matrix, route, GPS, search, tour, bookmark, 360px layout and persistence');
}


async function verifyVisualLayouts(page){
 // 16 deterministic Android views: 2 providers × 2 journeys ×
 // 2 handset widths × normal/fullscreen. No live tiles or GPS tracks.
 const dir=path.join(root,'test-results','visual','current');
 fs.mkdirSync(dir,{recursive:true});
 const manifest={version:1,scenes:[]};
 const selectors={
  plan:'.plan-picker',search:'#place-search',
  tour:'#tour-map-tools',actions:'.map-actions',
  workspace:'.workspace'
 };
 // Test-only map masking avoids false positives from changing third-party tiles.
 // The actual overlays still render in Chrome at their real dimensions.
 const style=await page.addStyleTag({content:[
  '#map .leaflet-pane,#map .leaflet-control-container,',
  '#google-demo-map > * {visibility:hidden!important;}',
  '#map,#google-demo-map{background:#122e34!important;}',
  '.plan-picker,.place-search,.tour-map-tools button,.map-actions,',
  '.map-provider-switch{backdrop-filter:none!important;box-shadow:none!important;}',
  '*,*::before,*::after{transition:none!important;animation:none!important;',
  'caret-color:transparent!important;}'
 ].join('')});
 const measure=async()=>page.evaluate(selectors=>{
  const workspace=document.querySelector('.workspace').getBoundingClientRect();
  function get(selector){
   const element=document.querySelector(selector);
   if(!element)return {visible:false};
   const rect=element.getBoundingClientRect();
   const cs=getComputedStyle(element);
   const visible=rect.width>0&&rect.height>0&&cs.display!=='none'&&
    cs.visibility!=='hidden'&&!element.hidden;
   return {
    visible,
    left:+(rect.left-workspace.left).toFixed(1),
    right:+(rect.right-workspace.left).toFixed(1),
    top:+(rect.top-workspace.top).toFixed(1),
    bottom:+(rect.bottom-workspace.top).toFixed(1),
    width:+rect.width.toFixed(1),height:+rect.height.toFixed(1)
   };
  }
  return {
   workspace:{width:workspace.width,height:workspace.height},
   elements:Object.fromEntries([
    '.plan-picker','#place-search','#tour-map-tools',
    '.map-actions','#map-provider-switch'
   ].map(selector=>[selector,get(selector)])),
   providerButtons:[...document.querySelectorAll('#map-provider-switch button')]
    .map(button=>({id:button.id,...get('#'+button.id)}))
  };
 },selectors);
 try{
  for(const viewport of [{width:393,height:852},{width:360,height:780}]){
   await page.setViewportSize(viewport);
   for(const plan of [
    {key:'nikko-rail',id:'ride-nikko'},
    {key:'nara-day',id:'town-kyoto',day:'2026-11-04'}
   ]){
    for(const expanded of [false,true]){
     for(const provider of ['osm','google']){
     if(provider==='osm'){
      await page.locator('#provider-osm').click();
     }else{
      await page.locator('#provider-google').click();
      await page.waitForFunction(()=>document.querySelector('.workspace')?.dataset.provider==='google');
     }
     await page.locator('#plan-select').selectOption(plan.id);
     if(plan.day){
      // Only day selection for the actual Kyoto day; never fake routing.
      await page.locator('#city-days-list button[data-day-date="'+plan.day+'"]').click().catch(async()=>{
       // Already selected: clicking the active day is harmless but may be
       // intercepted by a long scroll. The chosen day must still be active.
       const active=await page.locator('#city-days-list button[data-day-date="'+plan.day+'"]').getAttribute('aria-pressed');
       assert.equal(active,'true');
      });
     }
     const expand=page.locator('#expand-map');
     if((await expand.getAttribute('aria-pressed'))!==String(expanded))
       await expand.click();
     assert.equal(await expand.getAttribute('aria-pressed'),String(expanded),
       'Fullscreen state must remain switchable on both providers');
     const state=await measure();
     const mode=expanded?'fullscreen':'standard';
     const sceneKey=expanded?plan.key+'-fullscreen':plan.key;
     // Keep existing standard IDs stable for comparison with #136 baseline.
     const id=sceneKey+'-'+viewport.width+'-'+provider;
     const screenshots={};
     for(const [name,selector] of Object.entries(selectors)){
      const filename=id+'-'+name+'.png';
      await page.locator(selector).screenshot({
       path:path.join(dir,filename),animations:'disabled',caret:'hide'
      });
      screenshots[name]=filename;
     }
     manifest.scenes.push({id,key:sceneKey,mode,width:viewport.width,
      provider,...state,screenshots});
     }
    }
   }
  }
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  assert.equal(manifest.scenes.length,16,'Visual matrix must include all required layouts');
  console.log('PASS captured 16 offline Android snapshots: providers × journeys × widths × fullscreen');
 }finally{
  await page.setViewportSize({width:393,height:852});
  if(await page.locator('#expand-map').getAttribute('aria-pressed')==='true')
    await page.locator('#expand-map').click();
  await style.evaluate(el=>el.remove());
 }
}

async function main(){
 const s=server();let browser,page;
 await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
 try{
  const origin='http://127.0.0.1:'+s.address().port;
  browser=await chromium.launch({headless:true,executablePath:chromeExecutable(),
   args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({
   viewport:{width:393,height:852},deviceScaleFactor:2,
   isMobile:true,hasTouch:true,locale:'de-DE',timezoneId:'Asia/Tokyo',
   serviceWorkers:'block',permissions:['geolocation'],
   geolocation:{latitude:35.012,longitude:135.763,accuracy:12}
  });
  await context.route('**/*',route=>
   route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  page=await context.newPage();
  page.setDefaultTimeout(10000);
  const uncaught=[];
  page.on('pageerror',error=>{uncaught.push(error.message);console.error('BROWSER PAGEERROR',error.stack||error.message);});
  await page.goto(origin+'/?view=town-kyoto',{waitUntil:'domcontentloaded',timeout:15000});
  await page.locator('#city-days-list button[data-day-date="2026-11-04"]').waitFor({state:'visible',timeout:15000});
  assert.equal(await page.locator('#plan-select').inputValue(),'town-kyoto');
  await testDay(page,'2026-11-03',4);
  await testDay(page,'2026-11-04',4);
  const popup=await openPlacePopup(page,'Nara-Park');
  await popup.locator('details.popup-more summary').click();
  assert.equal(await popup.locator('details.popup-more').evaluate(el=>el.open),true,
   'More disclosure remains tappable');
  await delay(300);
  await swipeOverPopupAction(page);
  await verifyGPSOverview(page);
  await verifyManualTouchPan(page);
  await verifyLocalSearchAndTourBuilder(page);
  await testDay(page,'2026-11-05',7);
  await page.locator('#plan-select').selectOption('ride-nikko');
  await page.waitForFunction(()=>document.getElementById('city-days').hidden);
  assert.equal(await page.locator('.map-actions button').count(),3);
  assert.ok(await page.locator('#journey-panel').isVisible(),
   'Nikkō rail section retains the shared toolbar and schematic route');
  const naturePins=page.locator('.journey-nature-marker');
  assert.equal(await naturePins.count(),1,
   'Mount Fuji must be visible in the current Kyoto → Nikkō train overview');
  assert.match(await naturePins.first().getAttribute('title'),/Mount Fuji/);
  assert.equal(await page.locator('#plan-select').inputValue(),'ride-nikko',
   'The nature landmark must not switch the active journey');
  // Open Fuji while the route is still fitted across Japan; clicking a
  // station afterward intentionally zooms in and moves Fuji off-screen.
  await naturePins.first().click();
  const fujiPopup=page.locator('.leaflet-popup-content .journey-nature-popup');
  await fujiPopup.waitFor({state:'visible'});
  assert.match(await fujiPopup.innerText(),/Mount Fuji/);
  assert.match(await fujiPopup.innerText(),/Gipfel/);
  assert.equal(await page.locator('#plan-select').inputValue(),'ride-nikko');
  console.log('PASS Mount Fuji Nature pin visible and tappable on Nikkō train overview');
  await page.locator('#journey-panel .journey-item').first().click();
  const stationPopup=page.locator('.leaflet-popup-content .place-popup-pan-surface').first();
  await stationPopup.waitFor({state:'visible'});
  assert.ok((await stationPopup.innerText()).length>8,
   'Rail station must open the same accessible popup surface as day places');
  console.log('PASS Nikkō station popup uses the shared map-popup contract');
  await verifyJourneyTicketAttachment(page);
  await page.locator('#plan-select').selectOption('town-kyoto');
  await testDay(page,'2026-11-04',4);
  await verifyCompassDiagnostics(page);
  await verifyUpdateGuardAndPersistence(page);
  await verifyCurrentPositionBookmark(page);
  await verifyFujiNatureCategory(page);
  await verifyOSMGermanStyle(page);
  await verifyProviderParityMatrix(page);
  await verifyVisualLayouts(page);
  assert.deepEqual(uncaught,[],'No uncaught runtime errors during real mobile interactions');
  console.log('PASS complete Android-size Chrome regression: Kyoto, Nara, Osaka, Nikkō');
 }catch(error){
  console.error('MOBILE E2E FAILED:',error.stack||error);
  if(page)try{await page.screenshot({path:path.join(results,'failure.png'),fullPage:true});}
    catch(snapshotError){console.error('Screenshot failed',snapshotError.message);}
  process.exitCode=1;
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>s.close(resolve));
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
