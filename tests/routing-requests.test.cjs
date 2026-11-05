const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Routing=require('../routing-requests.js');
const W=require('../walking-core.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const from={lat:35.011,lng:135.794},to={lat:35.018,lng:135.805};
const walkUrl=W.requestUrl(from,to);
const tourUrl=W.optimizedTourRequestUrl(from,[to,{lat:35.02,lng:135.809}]);
const reply=(status,body='{"code":"Ok"}')=>({ok:status===200,status,
 text:async()=>body});
test('only HTTPS FOSSGIS foot routes are accepted; credentials or foreign APIs never used',()=>{
 for(const u of [walkUrl,tourUrl])
   assert.equal(Routing.approvedUrl(u),true,u);
 for(const u of ['https://google.com/maps/api/directions/json',
   'https://routing.openstreetmap.de.evil.com/routed-foot/route/v1/driving/1,2;3,4',
   'http://routing.openstreetmap.de/routed-foot/route/v1/driving/1,2;3,4',
   'https://routing.openstreetmap.de/route/v1/driving/1,2;3,4',
   'https://user:pass@routing.openstreetmap.de/routed-foot/route/v1/driving/1,2;3,4',
   'https://routing.openstreetmap.de/routed-foot/route/v1/driving/1,2;3,4#token',
   'invalid',null])
   assert.equal(Routing.approvedUrl(u),false,String(u));
});
test('one shared 1.2-second gate covers walking, day optimization and tours',()=>{
 let now=1000;
 const calls=[];
 const service=Routing.create({fetcher:async url=>{calls.push(url);return reply(200);},
   clock:()=>now,setTimer:()=>1,clearTimer:()=>{}});
 assert.equal(service.claim(),true);
 assert.equal(service.claim(),false,'tour cannot start right after walking');
 now=2199;assert.equal(service.claim(),false);
 now=2200;assert.equal(service.claim(),true);
 now=2400;assert.equal(service.claim(),false);
 now=3900;assert.equal(service.claim(),true);
 // Calls remain explicit: simply claiming does not fetch or access GPS.
 assert.equal(calls.length,0);
});
test('requests preserve privacy flags, correct timeout and parsed JSON for three workloads',async()=>{
 const requests=[],durations=[],cleared=[];
 const service=Routing.create({
   fetcher:async(url,opts)=>{requests.push({url,opts});return reply(200,'{"code":"Ok","routes":[]}');},
   setTimer:(fn,ms)=>{durations.push(ms);return durations.length;},
   clearTimer:id=>cleared.push(id)
 });
 for(const [kind,url] of [['walk',walkUrl],['day',tourUrl],['tour',tourUrl]]){
   const parsed=await service.request({kind,url,controller:new AbortController()});
   assert.equal(parsed.code,'Ok');
 }
 assert.deepEqual(durations,[15000,18000,18000]);
 assert.deepEqual(cleared,[1,2,3]);
 assert.equal(requests.length,3);
 for(const r of requests){
   assert.equal(r.opts.method,'GET');
   assert.equal(r.opts.mode,'cors');
   assert.equal(r.opts.credentials,'omit');
   assert.equal(r.opts.referrerPolicy,'origin');
   assert.equal(r.opts.headers.Accept,'application/json');
   assert.ok(r.opts.signal);
 }
});
test('429 and HTTP failures show familiar German service errors, never leak coordinates',async()=>{
 for(const kind of ['walk','tour','day']){
   for(const status of [429,503]){
     const service=Routing.create({fetcher:async()=>reply(status),
       setTimer:()=>1,clearTimer:()=>{}});
     await assert.rejects(service.request({kind,url:walkUrl,controller:new AbortController()}),
       error=>{
         assert.match(error.message,status===429?/ausgelastet/:/HTTP 503/);
         assert.doesNotMatch(error.message,/135\.|35\./);
         return true;
       });
   }
 }
});
test('oversized reply and invalid JSON are rejected before route-model parsing',async()=>{
 for(const [kind,limit] of [['walk',2000000],['tour',2500000],['day',2500000]]){
   const service=Routing.create({fetcher:async()=>reply(200,'a'.repeat(limit+1)),
     setTimer:()=>1,clearTimer:()=>{}});
   await assert.rejects(service.request({kind,url:walkUrl,controller:new AbortController()}),
     /ungewöhnlich groß/i);
 }
 const service=Routing.create({fetcher:async()=>reply(200,'{not-json}'),
   setTimer:()=>1,clearTimer:()=>{}});
 await assert.rejects(service.request({kind:'tour',url:walkUrl,
   controller:new AbortController()}),SyntaxError);
});
test('deadline aborts only its specific request and always clears its timer',async()=>{
 let timerHandler=null,clearCount=0,called=false;
 const controller=new AbortController();
 const service=Routing.create({
   fetcher:async(_url,options)=>{
     called=true;
     return await new Promise((_resolve,reject)=>{
       options.signal.addEventListener('abort',()=>reject(
         Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
     });
   },
   setTimer:fn=>{timerHandler=fn;return 9;},
   clearTimer:id=>{assert.equal(id,9);clearCount++;}
 });
 const pending=service.request({kind:'tour',url:tourUrl,controller});
 assert.equal(called,true);
 assert.equal(typeof timerHandler,'function');
 timerHandler();
 await assert.rejects(pending,/aborted/);
 assert.equal(controller.signal.aborted,true);
 assert.equal(clearCount,1);
});
test('invalid provider/URL/controller is rejected BEFORE any request is sent',async()=>{
 let calls=0;
 const service=Routing.create({fetcher:async()=>{calls++;return reply(200);}});
 for(const args of [
   {kind:'wrong',url:walkUrl,controller:new AbortController()},
   {kind:'tour',url:'https://maps.googleapis.com/maps/api/js',controller:new AbortController()},
   {kind:'tour',url:walkUrl,controller:{}}
 ])await assert.rejects(service.request(args));
 assert.equal(calls,0);
 assert.throws(()=>Routing.create({fetcher:null}));
 assert.throws(()=>Routing.create({fetcher:async()=>{},minIntervalMs:900}));
});
test('all three app routing paths use same gate and same request transport',()=>{
 const app=read('app.js');
 assert.match(app,/const routeRequests=Routing\.create\(/);
 assert.equal((app.match(/routeRequests\.claim\(\)/g)||[]).length,3);
 for(const type of ['walk','tour','day'])
   assert.match(app,new RegExp("routeRequests\\.request\\(\\{kind:'"+type+"'"));
 assert.doesNotMatch(app,/lastTourRequestedAt|lastWalkingRequestAt/);
 const tour=app.slice(app.indexOf('  async function calculateTour('),
   app.indexOf('  // Editor edits only local recommendation data.'));
 const walking=app.slice(app.indexOf('  async function showWalkingRoute('),
   app.indexOf('  // Multi-stop tours are opt-in'));
 const day=app.slice(app.indexOf('  async function calculateDailyFootRoute('),
   app.indexOf("  $('day-route-foot').onclick="));
 for(const fragment of [tour,walking,day])
   assert.doesNotMatch(fragment,/fetch\(request,\{|fetch\(url,\{/);
 assert.match(app,/if\(generation!==tourRequestGeneration\|\|activePlanId!==startPlanId\)return/);
 assert.match(app,/if\(generation!==dayFootGeneration\|\|dailyRouteKey\(dailyStops\(\)\)!==key\)return/);
 const core=read('routing-requests.js');
 assert.doesNotMatch(core,/localStorage|sessionStorage|navigator\.geolocation|watchPosition|sendBeacon|googleapis/);
});
