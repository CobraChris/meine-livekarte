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
 const card=page.locator('#places article.place').filter({has:page.getByRole('heading',{name,exact:true})}).first();
 assert.equal(await card.count(),1,'Place card missing: '+name);
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
 assert.ok(bbox&&bbox.width>20&&bbox.height>20);
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
 assert.notEqual(after,before,'Swipe over popup button must pan map underneath popup');
 assert.equal(await popup.isVisible(),true,'Popup stays open after pan gesture');
 assert.equal(await page.locator('#walk-route-panel').isVisible(),false,
  'Swipe must NOT accidentally trigger the Fußweg button');
 console.log('PASS real touchscreen swipe over popup button pans map and does not activate button');
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
  page.on('pageerror',error=>uncaught.push(error.message));
  await page.goto(origin+'/?view=town-kyoto',{waitUntil:'domcontentloaded',timeout:15000});
  await page.locator('#city-days-list button[data-day-date="2026-11-04"]').waitFor({state:'visible',timeout:15000});
  assert.equal(await page.locator('#plan-select').inputValue(),'town-kyoto');
  await testDay(page,'2026-11-03',4);
  await testDay(page,'2026-11-04',4);
  const popup=await openPlacePopup(page,'Nara-Park');
  await popup.locator('details.popup-more summary').click();
  assert.equal(await popup.locator('details.popup-more').evaluate(el=>el.open),true,
   'More disclosure remains tappable');
  await swipeOverPopupAction(page);
  await verifyGPSOverview(page);
  await testDay(page,'2026-11-05',7);
  await page.locator('#plan-select').selectOption('ride-nikko');
  await page.waitForFunction(()=>document.getElementById('city-days').hidden);
  assert.equal(await page.locator('.map-actions button').count(),3);
  assert.ok(await page.locator('#journey-panel').isVisible(),
   'Nikkō rail section retains the shared toolbar and schematic route');
  await page.locator('#plan-select').selectOption('town-kyoto');
  await testDay(page,'2026-11-04',4);
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
