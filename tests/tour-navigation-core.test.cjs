const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Nav=require('../tour-navigation-core.js'),W=require('../walking-core.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const start={lat:36.14,lng:137.25},a={lat:36.141,lng:137.251,name:'Markt'},
 b={lat:36.142,lng:137.252,name:'Altstadt'},
 c={lat:36.143,lng:137.253,name:'Museum'};
const route={
 points:[start,a,b,c].map(p=>[p.lat,p.lng]),
 distance:600,duration:480,stops:[a,b,c],
 legs:Array.from({length:3},()=>({distance:200,duration:160}))
};
test('navigation starts with an already calculated route, no location watch',()=>{
 const nav=Nav.create(route,W);
 assert.equal(nav.stage,0);
 assert.equal(nav.paused,false);
 assert.equal(nav.arrived,false);
 const progress=nav.update(start,7);
 assert.equal(progress.stage,1);
 assert.equal(progress.total,3);
 assert.equal(progress.name,'Markt');
 assert.equal(progress.status,'on-route');
 assert.ok(progress.remainingMeters>100);
 assert.ok(progress.remainingSeconds>50);
 assert.equal(progress.arrived,false);
 assert.equal(progress.offRoute,false);
});
test('arrival requires two consecutive accurate fixes; noisy accuracy resets counter',()=>{
 const nav=Nav.create(route,W);
 const one=nav.update(a,7);
 assert.equal(one.status,'near-goal');assert.equal(one.arrived,false);
 const noisy=nav.update(a,85);
 assert.equal(noisy.status,'poor-gps');assert.equal(noisy.arrived,false);
 assert.equal(nav.update(a,7).arrived,false);
 assert.equal(nav.update(a,7).arrived,true);
 assert.equal(nav.arrived,true);
 assert.equal(nav.update(start,7).arrived,true,
   'confirmed arrival remains until explicit next stop');
 assert.equal(nav.next(),true);
 assert.equal(nav.stage,1);
 assert.equal(nav.arrived,false);
 assert.equal(nav.update(b,7).arrived,false);
 assert.equal(nav.update(b,7).arrived,true);
});
test('off-route warning requires two reliable fixes, resets after GPS recovery',()=>{
 const nav=Nav.create(route,W);
 const wrong={lat:36.150,lng:137.264};
 assert.equal(nav.update(wrong,5).offRoute,false);
 assert.equal(nav.update(wrong,5).offRoute,true);
 const noisy=nav.update(wrong,100);
 assert.equal(noisy.status,'poor-gps');assert.equal(noisy.offRoute,false);
 assert.equal(nav.update(wrong,5).offRoute,false);
 assert.equal(nav.update(wrong,5).offRoute,true);
 assert.equal(nav.update(start,7).offRoute,false);
});
test('pause/resume and advancing reset counts without losing the valid stop order',()=>{
 const nav=Nav.create(route,W);
 nav.update(a,7);
 nav.pause();
 assert.equal(nav.paused,true);
 assert.equal(nav.update(a,7),null);
 nav.resume();
 assert.equal(nav.paused,false);
 assert.equal(nav.update(a,7).arrived,false);
 assert.equal(nav.next(),true);
 assert.equal(nav.stage,1);
 assert.equal(nav.update(b,7).arrived,false);
 assert.equal(nav.next(),true);
 assert.equal(nav.stage,2);
 assert.equal(nav.next(),false);
 assert.equal(nav.stage,2);
 const final=nav.update(c,7);
 assert.equal(final.name,'Museum');
 assert.equal(final.stage,3);
 assert.equal(final.total,3);
});
test('invalid routes cannot start; all state is in-memory and never networked',()=>{
 for(const routeData of [null,{}, {...route,stops:[]},
   {...route,legs:route.legs.slice(1)},
   {...route,points:[[36,137],[36,137]]}])
   assert.throws(()=>Nav.create(routeData,W));
 assert.throws(()=>Nav.create(route,null));
 const code=read('tour-navigation-core.js'),app=read('app.js');
 assert.doesNotMatch(code,/fetch\(|localStorage|sessionStorage|indexedDB|navigator\.geolocation|watchPosition|setInterval/);
 assert.match(app,/tourNavigation=TourNav\.create\(tourRoute,W\)/);
 assert.match(app,/progress=tourNavigation\.update\(point,gpsAccuracy\)/);
 assert.match(app,/tourNavigation\.resume\(\)/);
 assert.match(app,/tourNavigation\.pause\(\)/);
 assert.match(app,/tourNavigation\.next\(\)/);
 assert.match(app,/const selected=remaining&&tourNavigation&&tourRoute/);
 assert.match(app,/tourRoute\.stops\.slice\(tourNavigation\.stage\)/);
});
