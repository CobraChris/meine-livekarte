const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const W=require('../walking-core.js');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');

const points=[[36.14,137.25],[36.14,137.253],[36.14,137.256]];
const route={points,distance:600,duration:600};
const pos=(lat,lng)=>({lat,lng});

test('navigation projection follows real routed geometry without GPS networking',()=>{
 const model=W.prepareNavigation(route);
 assert.ok(model.length>450);
 const beginning=W.navigationProgress(model,pos(36.14,137.25),7);
 const halfway=W.navigationProgress(model,pos(36.14,137.253),7);
 const near=W.navigationProgress(model,pos(36.14,137.255),7);
 assert.equal(beginning.status,'on-route');
 assert.equal(halfway.status,'on-route');
 assert.ok(beginning.remainingMeters>590);
 assert.ok(halfway.remainingMeters>275 && halfway.remainingMeters<325);
 assert.ok(halfway.remainingSeconds>275 && halfway.remainingSeconds<325);
 assert.ok(near.remainingMeters<halfway.remainingMeters);
 assert.ok(near.progressFraction>halfway.progressFraction);
 assert.ok(halfway.offRouteMeters<1);
 assert.equal(W.navigationProgress(model,pos(36.1409,137.253),7).status,'off-route');
 assert.equal(W.navigationProgress(model,pos(36.1409,137.253),130).status,'poor-gps');
 assert.equal(W.navigationProgress(model,pos(36.14,137.25594),8).status,'near-goal');
 assert.equal(W.navigationProgress(model,pos(36.14,137.25594),45).status,'on-route');
 assert.ok(Number.isFinite(model.routeDuration));
 assert.deepEqual(points,route.points);
});

test('navigation refuses fabricated or degenerate routes',()=>{
 for(const invalid of [
  null,{points:[],distance:600,duration:600},
  {points:[[36.14,137.25],[36.14,137.25]],distance:400,duration:400},
  {points:[[36.14,137.25],[NaN,137.26]],distance:400,duration:400},
  {points,distance:Infinity,duration:400},
  {points,distance:400,duration:-5}
 ])assert.throws(()=>W.prepareNavigation(invalid));
 const model=W.prepareNavigation(route);
 assert.throws(()=>W.navigationProgress(model,null,10));
 assert.throws(()=>W.navigationProgress(model,{lat:91,lng:0},10));
});

function navigationHarness(){
 const app=read('app.js');
 const start=app.indexOf("  const walkingLink=$('walk-route-google');");
 const end=app.indexOf('  function walkingButton(p){',start);
 assert.ok(start>=0 && end>start);
 const fragment=app.slice(start,end);
 const elements={};
 const cls=()=>({
  toggles:new Map(),toggle(name,on){this.toggles.set(name,on)},
  remove(...names){names.forEach(name=>this.toggles.delete(name))}
 });
 const $=id=>elements[id]||(elements[id]={
  hidden:false,textContent:'',onclick:null,disabled:false,
  classList:cls(),attributes:{},
  setAttribute(k,v){this.attributes[k]=v}
 });
 const walkingPanel={hidden:false};
 const walkingRetry=$('walk-route-retry');
 const walkingStats=$('walk-route-stats');
 const walkingNavState=$('walk-route-nav-state');
 const walkingLayers={clears:0,clearLayers(){this.clears++}};
 const destination=pos(36.14,137.256);
 destination.name='Walking target';
 const centerCalls=[];
 const ctx={
  $,walkingPanel,walkingRetry,walkingStats,walkingNavState,
  walkingLayers,walkDestination:destination,
  walkController:null,walkRequestGeneration:0,
  watch:1,position:pos(36.14,137.25),positionAccuracy:9,
  positionUpdatedAt:Date.now(),following:false,
  W,Date,say(){},
  centerCalls,centerOnGPS(ll,zoom){centerCalls.push({ll,zoom})},
  refreshGPSFollowControl(){},
  map:{getZoom(){return 16}}
 };
 vm.runInNewContext(fragment+
   '\nthis.testNavigation={setRoute(value){walkRouteData=value},'+
   'isRunning(){return !!walkingNavigation},'+
   'update(point,accuracy){updateWalkingNavigation(point,accuracy)},'+
   'stop(){stopWalkingNavigation()}};',ctx,{filename:'navigation-lifecycle.js'});
 ctx.testNavigation.setRoute(route);
 return {ctx,elements,$,walkingPanel,walkingLayers,destination};
}

test('navigation starts only after deliberate click and keeps dotted route on navigation stop',()=>{
 const h=navigationHarness();
 const {ctx,$,walkingPanel,walkingLayers}=h;
 const button=$('walk-route-nav');
 assert.equal(ctx.testNavigation.isRunning(),false);
 assert.equal(ctx.following,false);
 button.onclick();
 assert.equal(ctx.testNavigation.isRunning(),true);
 assert.equal(ctx.following,true);
 assert.equal(walkingPanel.hidden,true,'start should collapse oversized info card');
 assert.equal($('walk-route-mini').hidden,false);
 assert.match($('walk-route-mini-text').textContent,/Noch/);
 assert.equal(button.attributes['aria-pressed'],'true');
 assert.ok(ctx.centerCalls.length>0,'navigation should focus GPS');
 assert.equal(walkingLayers.clears,0);
 button.onclick();
 assert.equal(ctx.testNavigation.isRunning(),false);
 assert.equal(ctx.following,false);
 assert.equal(walkingLayers.clears,0,'stopping navigation should leave footpath on map');
 assert.equal(button.attributes['aria-pressed'],'false');
 assert.match($('walk-route-mini-text').textContent,/600 m/);
});

test('two accurate off-route fixes warn; poor GPS never triggers false warning',()=>{
 const h=navigationHarness();
 const {ctx,$}=h;
 $('walk-route-nav').onclick();
 const off=pos(36.1409,137.253);
 ctx.testNavigation.update(off,8);
 assert.doesNotMatch($('walk-route-mini-text').textContent,/verlassen/i);
 ctx.testNavigation.update(off,8);
 assert.match($('walk-route-mini-text').textContent,/Weg verlassen/);
 assert.equal($('walk-route-mini').classList.toggles.get('walk-off-route'),true);
 assert.match($('walk-route-nav-state').textContent,/Neu berechnen/);
 ctx.testNavigation.update(off,120);
 assert.match($('walk-route-mini-text').textContent,/GPS ungenau/);
 assert.equal($('walk-route-mini').classList.toggles.get('walk-off-route'),false);
 ctx.testNavigation.update(pos(36.14,137.254),9);
 assert.match($('walk-route-mini-text').textContent,/Noch/);
});

test('goal arrival requires two accurate position samples, never automatically ends or uploads',()=>{
 const h=navigationHarness();
 const {ctx,$,walkingLayers}=h;
 $('walk-route-nav').onclick();
 const near=pos(36.14,137.25598);
 ctx.testNavigation.update(near,7);
 assert.doesNotMatch($('walk-route-mini-text').textContent,/Ziel erreicht/);
 ctx.testNavigation.update(near,7);
 assert.match($('walk-route-mini-text').textContent,/Ziel erreicht/);
 assert.equal(walkingLayers.clears,0);
 assert.equal(ctx.testNavigation.isRunning(),true);
 ctx.testNavigation.update(pos(36.14,137.254),7);
 assert.match($('walk-route-mini-text').textContent,/Noch/);
});

test('routing privacy, existing GPS follow controls and PWA deployment remain intact',()=>{
 const html=read('index.html'),app=read('app.js'),css=read('style.css'),sw=read('sw.js');
 for(const id of ['walk-route-nav','walk-route-nav-state','walk-route-mini','recenter-gps'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(app,/walkingNavButton\.onclick=/);
 assert.match(app,/updateWalkingNavigation\(position,positionAccuracy\);/);
 assert.match(app,/function startWalkingNavigation\(\)/);
 assert.match(app,/function stopWalkingNavigation\(\)/);
 assert.match(app,/if\s*\(following\)\s*centerOnGPS/);
 assert.match(app,/map\.on\('dragstart',pauseGPSFollow\)/);
 assert.match(app,/GPS-Navigation aktiv/);
 assert.doesNotMatch(app.slice(app.indexOf('function updateWalkingNavigation('),
   app.indexOf('function startWalkingNavigation(')),/fetch\(|localStorage|indexedDB|routing\.openstreetmap\.de/);
 assert.match(css,/\.walk-route-panel \.walk-route-nav\{/);
 assert.doesNotMatch(sw,/routed-foot|routing\.openstreetmap\.de/);
});
