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
  await page.locator('#journey-panel .journey-item').first().click();
  const stationPopup=page.locator('.leaflet-popup-content .place-popup-pan-surface').first();
  await stationPopup.waitFor({state:'visible'});
  assert.ok((await stationPopup.innerText()).length>8,
   'Rail station must open the same accessible popup surface as day places');
  console.log('PASS Nikkō station popup uses the shared map-popup contract');
  await page.locator('#plan-select').selectOption('town-kyoto');
  await testDay(page,'2026-11-04',4);
  await verifyCompassDiagnostics(page);
  await verifyUpdateGuardAndPersistence(page);
  await verifyCurrentPositionBookmark(page);
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
