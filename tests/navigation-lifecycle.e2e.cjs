'use strict';
// End-to-end navigation lifecycle on a real mobile-size Chrome viewport.
// Routes and Google SDK are simulated locally. No GPS log is stored and
// external routing/Google requests never leave the CI runner.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
const resultDir=path.join(root,'test-results','mobile');
fs.mkdirSync(resultDir,{recursive:true});
function server(){
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.svg':'image/svg+xml',
  '.woff2':'font/woff2'};
 return http.createServer(async(req,res)=>{
  try{
   const raw=new URL(req.url,'http://localhost').pathname;
   const target=path.resolve(root,'.'+(raw==='/'?'/index.html':decodeURIComponent(raw)));
   if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
   const data=await fs.promises.readFile(target);
   res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream',
    'Cache-Control':'no-store'});
   res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
 });
}
function chromeExecutable(){
 const paths=[process.env.CHROME_PATH,'/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'];
 const found=paths.find(p=>p&&fs.existsSync(p));
 if(!found)throw Error('Chromium required for navigation lifecycle test');
 return found;
}
function mockOSRM(url){
 const parsed=new URL(url);
 const pathMatch=parsed.pathname.match(/\/routed-foot\/(route|trip)\/v1\/driving\/([^/?]+)/);
 if(!pathMatch)throw Error('Unexpected routing endpoint: '+parsed.pathname);
 const points=decodeURIComponent(pathMatch[2]).split(';').map(s=>{
  const [lng,lat]=s.split(',').map(Number);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))throw Error('Invalid test coordinates');
  return [lng,lat];
 });
 if(points.length<2||points.length>7)throw Error('Unexpected routing points');
 const legs=points.slice(1).map((p,i)=>{
  const before=points[i],latDiff=(p[1]-before[1])*111200;
  const lngDiff=(p[0]-before[0])*90900;
  const distance=Math.max(75,Math.round(Math.hypot(latDiff,lngDiff)*1.3));
  return {distance,duration:Math.round(distance/1.3)};
 });
 const distance=legs.reduce((n,p)=>n+p.distance,0);
 const duration=legs.reduce((n,p)=>n+p.duration,0);
 const result={geometry:{type:'LineString',coordinates:points},distance,duration,legs};
 const waypoints=points.map((p,index)=>({location:p,waypoint_index:index,trips_index:0}));
 return pathMatch[1]==='trip'
  ?{code:'Ok',trips:[result],waypoints}
  :{code:'Ok',routes:[result],waypoints};
}
async function fakeGoogle(page){
 await page.evaluate(()=>{
  const state={lines:[],markers:[],maps:[]};
  class MapFake{
   constructor(element,config){
    this.center=config.center;this.zoom=config.zoom;this.events={};
    state.maps.push(this);
   }
   getCenter(){return {lat:()=>this.center.lat,lng:()=>this.center.lng};}
   getZoom(){return this.zoom;}
   setCenter(p){this.center={lat:p.lat,lng:p.lng};}
   setZoom(z){this.zoom=z;}
   addListener(name,fn){this.events[name]=fn;}
   fitBounds(bounds){if(bounds.points.length)this.center=bounds.points[0];}
  }
  class Shape{
   constructor(options){this.config=options;this.active=!!options.map;}
   setMap(map){this.active=!!map;}
   addListener(name,fn){this[name]=fn;}
  }
  class Marker extends Shape{constructor(config){super(config);state.markers.push(this);}}
  class Polyline extends Shape{constructor(config){super(config);state.lines.push(this);}}
  class Circle extends Shape{}
  class InfoWindow{setContent(content){this.content=content;}open(){}close(){}}
  class LatLngBounds{constructor(){this.points=[];}extend(point){this.points.push(point);}}
  window.google={maps:{Map:MapFake,Marker,Polyline,Circle,InfoWindow,LatLngBounds}};
  window.__navMockGoogle=state;
  localStorage.setItem('livekarte-google-demo-key-v1','AIza'+'x'.repeat(35));
 });
}
async function main(){
 const srv=server();let browser,context,page;
 await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+srv.address().port;
 const requests=[];
 try{
  browser=await chromium.launch({headless:true,executablePath:chromeExecutable(),
   args:['--no-sandbox','--disable-dev-shm-usage']});
  context=await browser.newContext({
   viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true,
   locale:'de-DE',timezoneId:'Asia/Tokyo',serviceWorkers:'block',
   permissions:['geolocation'],geolocation:{latitude:34.6838,longitude:135.8430,accuracy:8}
  });
  await context.route('**/*',route=>{
   const url=route.request().url();
   if(url.startsWith(origin+'/'))return route.continue();
   if(url.startsWith('https://routing.openstreetmap.de/routed-foot/')){
    requests.push(url);
    return route.fulfill({status:200,contentType:'application/json',
     body:JSON.stringify(mockOSRM(url))});
   }
   return route.abort();
  });
  page=await context.newPage();
  page.setDefaultTimeout(12000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/?view=town-kyoto',{waitUntil:'domcontentloaded'});
  await page.locator('#plan-select').selectOption('town-kyoto');
  await page.locator('#city-days-list button[data-day-date="2026-11-04"]').click();
  await page.waitForFunction(()=>document.querySelector('.gps-location-icon')!==null,
   null,{timeout:16000});
  const important=()=>page.evaluate(()=>({
   places:localStorage.getItem('livekarte-places-v1'),
   tickets:localStorage.getItem('livekarte-ticket-status-v1'),
   legs:localStorage.getItem('livekarte-rail-leg-details-v1')
  }));
  const snapshot=await important();
  assert.equal(requests.length,0,'Opening app or enabling GPS must not contact routing service');
  await page.locator('#place-search-input').fill('Nara-Park');
  await page.locator('#place-search-go').click();
  const result=page.locator('#place-search-results .place-search-result').first();
  await result.waitFor({state:'visible'});
  await result.click();
  assert.equal(requests.length,0,'Selecting a search result must not send GPS');
  await page.locator('#place-search-walk').click();
  await page.waitForFunction(()=>!document.getElementById('walk-route-nav').disabled);
  assert.equal(requests.length,1,'Only explicit walking calculation may contact routing service');
  assert.match(requests[0],/\/routed-foot\/route\/v1\/driving\//);
  assert.equal(await page.locator('#walk-route-panel').isVisible(),true);
  assert.match(await page.locator('#walk-route-stats').innerText(),/m|km/);
  assert.equal(await page.locator('#walk-route-nav').getAttribute('aria-pressed'),'false');
  await page.locator('#walk-route-close').click();
  assert.equal(await page.locator('#walk-route-panel').isVisible(),false);
  assert.equal(await page.locator('#walk-route-mini').isVisible(),true,
   'Closing route details must preserve the real route');
  await page.locator('#walk-route-mini').click();
  await page.locator('#walk-route-nav').click();
  assert.equal(await page.locator('#walk-route-nav').getAttribute('aria-pressed'),'true',
   'Starting GPS guidance must not require an extra routing request');
  assert.equal(requests.length,1);
  await fakeGoogle(page);
  await page.locator('#provider-google').click();
  await page.waitForFunction(()=>document.querySelector('.workspace')?.dataset.provider==='google');
  const googleWalk=await page.evaluate(()=>{
   const lines=window.__navMockGoogle.lines.filter(l=>l.active);
   return {lines:lines.length,real:lines[0]?.config.strokeOpacity,
    coords:lines[0]?.config.path,meaning:document.getElementById('google-demo-route-meaning').textContent};
  });
  assert.equal(googleWalk.lines,1,'Calculated walking route must remain visible on Google');
  assert.equal(googleWalk.real,.99,'Google must draw the actual routed footpath, not a straight line');
  assert.ok(googleWalk.coords?.length>=2);
  assert.match(googleWalk.meaning,/Berechneter Fußweg/);
  assert.equal(requests.length,1,'Map switching must not silently recalculate route');
  await page.locator('#walk-route-mini').click();
  await page.locator('#walk-route-nav').click();
  assert.equal(await page.locator('#walk-route-nav').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#walk-route-panel').isVisible(),true,
   'Stopping GPS guidance preserves route details and route geometry');
  await page.locator('#walk-route-stop').click();
  assert.equal(await page.locator('#walk-route-panel').isVisible(),false);
  assert.equal(await page.locator('#walk-route-mini').isVisible(),false);
  const afterStop=await page.evaluate(()=>({
   provider:document.querySelector('.workspace').dataset.provider,
   lines:window.__navMockGoogle.lines.filter(l=>l.active),
   legend:document.getElementById('google-demo-route-meaning').textContent
  }));
  assert.equal(afterStop.provider,'google');
  assert.ok(!afterStop.lines.some(line=>line.config.strokeOpacity===.99),
   'Stopping a route must remove Google footpath overlay');
  assert.match(afterStop.legend,/Luftlinie|^$/);
  assert.equal(requests.length,1);

  await page.locator('#provider-osm').click();
  assert.equal(await page.locator('.workspace').getAttribute('data-provider'),'osm');
  const cards=page.locator('#places article.place');
  await cards.filter({hasText:'Nara-Park'}).first().locator('button.tour-pick').click();
  await cards.filter({hasText:'Tōdai-ji'}).first().locator('button.tour-pick').click();
  assert.match(await page.locator('#tour-count').innerText(),/2\/6/);
  await page.waitForTimeout(1300); // Respect the public service's 1.2 s fair-use gate.
  await page.locator('#provider-google').click();
  assert.equal(await page.locator('.workspace').getAttribute('data-provider'),'google');
  await page.locator('#tour-calculate').click();
  await page.waitForFunction(()=>!document.getElementById('tour-route-hud').hidden,
   null,{timeout:15000});
  assert.equal(requests.length,2,'Only explicit tour calculation makes one OSRM request');
  assert.match(await page.locator('#tour-route-metrics').innerText(),/m|km/);
  const googleTour=await page.evaluate(()=>{
   const lines=window.__navMockGoogle.lines.filter(l=>l.active);
   return {count:lines.length,opacity:lines[0]?.config.strokeOpacity,
    length:lines[0]?.config.path.length};
  });
  assert.equal(googleTour.count,1,'Calculated multi-stop tour also appears in Google');
  assert.equal(googleTour.opacity,.99);
  assert.ok(googleTour.length>=3,'Tour must preserve all path segments');
  await page.locator('#tour-live-toggle').click();
  assert.equal(requests.length,2,'Starting live tour navigation must be offline only');
  const saved=await important();
  assert.deepEqual(saved,snapshot,'Navigation must not mutate saved places or tickets');
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>
   /gps-track|walk-geometry|live-route-history/.test(k)),false);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#plan-select').waitFor({state:'visible'});
  assert.equal(await page.locator('#walk-route-panel').isVisible(),false);
  assert.equal(await page.locator('#walk-route-mini').isVisible(),false);
  assert.equal(await page.locator('#tour-route-hud').isVisible(),false,
   'Private GPS guidance must not resume after restart without user action');
  assert.match(await page.locator('#tour-count').innerText(),/2\/6/,
   'Chosen destinations, unlike live GPS and route geometry, persist after restart');
  assert.deepEqual(await important(),snapshot);
  assert.equal(requests.length,2,'Restart never contacts route service on its own');
  assert.deepEqual(errors,[],'No uncaught errors in end-to-end navigation transitions');
  console.log('PASS navigation: destination → footpath → guidance → Google switch → stop → tour → restart');
  console.log('PASS 2 opt-in mocked OSRM requests, 0 paid provider requests, persisted stops, private transient GPS');
 }catch(error){
  console.error('NAVIGATION LIFECYCLE FAILED:',error.stack||String(error));
  if(page)try{await page.screenshot({path:path.join(resultDir,'navigation-failure.png'),
   fullPage:true});}catch{}
  process.exitCode=1;
 }finally{
  if(context)await context.close();
  if(browser)await browser.close();
  await new Promise(resolve=>srv.close(resolve));
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
