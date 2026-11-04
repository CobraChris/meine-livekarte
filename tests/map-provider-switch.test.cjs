const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

function appFixture(options={}){
  const els=Object.create(null),scripts=[],storage=new Map(),providerEvents=[];
  function element(id){
    const listeners=Object.create(null);
    const el={
      id,hidden:false,disabled:false,open:false,value:'',textContent:'',
      dataset:{},attributes:{},focused:false,scrolled:false,events:listeners,
      addEventListener(name,fn){(listeners[name]||=[]).push(fn);},
      setAttribute(name,value){this.attributes[name]=value;},
      focus(){this.focused=true;},
      scrollIntoView(){this.scrolled=true;},
      closest(selector){return selector==='.workspace'?get('workspace'):null;},
      click(){for(const fn of listeners.click||[])fn();},
      setMap(){},addListener(){},append(){},
    };
    return el;
  }
  function get(id){return els[id]||(els[id]=element(id));}
  const document={
    getElementById:get,
    head:{append(script){scripts.push(script);}},
    createElement:element
  };
  const localStorage={
    getItem:k=>storage.get(k)??null,
    setItem:(k,v)=>storage.set(k,v),
    removeItem:k=>storage.delete(k)
  };
  const leafletMap={
    setViews:[],invalidations:0,
    getCenter:()=>({lat:35.02,lng:135.78}),
    getZoom:()=>14,
    invalidateSize(){this.invalidations++;},
    setView(center,zoom){this.setViews.push({center,zoom});}
  };
  const context={document,localStorage,URLSearchParams,
    setTimeout:()=>1,clearTimeout:()=>{},module:{exports:{}},console};
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(read('google-demo.js'),context);
  const module=context.module.exports;
  const fallback=[{name:'Nanzen-ji',lat:35.011,lng:135.795}];
  const widget=module.init({
    map:leafletMap,places:()=>options.places||fallback,
    stops:typeof options.stops==='function'?options.stops:()=>options.stops||[],
    placeKey:options.placeKey
  });
  assert.ok(widget);
  return {get,scripts,storage,context,leafletMap,widget};
}
test('switch starts with OSM, hides settings and makes no Google request on startup',()=>{
  const t=appFixture();
  assert.equal(t.get('provider-osm').attributes['aria-pressed'],'true');
  assert.equal(t.get('provider-google').attributes['aria-pressed'],'false');
  assert.equal(t.get('workspace').dataset.provider,'osm');
  assert.equal(t.get('google-demo-map').hidden,true);
  assert.equal(t.scripts.length,0);
  assert.equal(t.get('google-demo-control').open,false);
});
test('without saved key Google button only exposes hidden settings, not Google SDK',()=>{
  const t=appFixture();
  t.get('provider-google').click();
  assert.equal(t.scripts.length,0);
  assert.equal(t.get('google-demo-control').open,true);
  assert.equal(t.get('google-demo-key').focused,true);
  assert.equal(t.get('provider-settings').attributes['aria-expanded'],'true');
  assert.equal(t.get('workspace').dataset.provider,'osm');
});
test('saved key survives mode switching; SDK is loaded only once on explicit tap',()=>{
  const t=appFixture();
  t.get('google-demo-key').value='AIza'+'x'.repeat(35);
  t.get('google-demo-start').click();
  assert.equal(t.scripts.length,1);
  assert.match(t.scripts[0].src,/^https:\/\/maps\.googleapis\.com\/maps\/api\/js\?/);
  assert.equal(t.storage.get('livekarte-google-demo-key-v1'),'AIza'+'x'.repeat(35));
  assert.equal(t.get('workspace').dataset.provider,'osm');
  const googleInstance={
    center:{lat:35.03,lng:135.76},zoom:15, setCenter(p){this.center=p;},
    setZoom(z){this.zoom=z;},getCenter(){return {lat:()=>this.center.lat,lng:()=>this.center.lng};},
    getZoom(){return this.zoom}
  };
  t.context.google={maps:{
    Map:class{constructor(){return googleInstance;}},
    Marker:class{setMap(){}addListener(){}},
    InfoWindow:class{}
  }};
  t.context.__livekarteDemoReady();
  assert.equal(t.get('workspace').dataset.provider,'google');
  assert.equal(t.get('provider-google').attributes['aria-pressed'],'true');
  assert.equal(t.get('google-demo-control').open,false,'settings collapse after success');
  t.get('provider-osm').click();
  assert.equal(t.get('workspace').dataset.provider,'osm');
  assert.equal(t.get('google-demo-map').hidden,true);
  assert.equal(t.storage.size,1,'switching providers does not remove the saved key');
  assert.equal(t.leafletMap.invalidations,1);
  t.get('provider-google').click();
  assert.equal(t.get('workspace').dataset.provider,'google');
  assert.equal(t.scripts.length,1,'reusing loaded SDK does not request a new loader');
  t.widget.syncFromOSM();
  assert.equal(googleInstance.zoom,14);
  assert.equal(googleInstance.center.lat,35.02);
  t.get('google-demo-forget').click();
  assert.equal(t.storage.size,0);
  assert.equal(t.get('workspace').dataset.provider,'osm');
  t.get('provider-google').click();
  assert.equal(t.get('google-demo-control').open,true);
  assert.equal(t.scripts.length,1,'key deletion prevents automatic Google restart');
});
test('Google error switches to OSM and visibly reports why',()=>{
  const t=appFixture();
  t.get('google-demo-key').value='AIza'+'x'.repeat(35);
  t.get('google-demo-start').click();
  t.scripts[0].onerror();
  assert.equal(t.get('workspace').dataset.provider,'osm');
  assert.equal(t.get('provider-notice').hidden,false);
  assert.match(t.get('provider-notice').textContent,/OpenStreetMap bleibt verfügbar/);
});
test('Google mode hides Leaflet-only map controls but preserves day picker/fullscreen',()=>{
  const css=read('style.css'),html=read('index.html'),app=read('app.js');
  assert.match(html,/id="map-provider-switch"[^>]*role="group"/);
  assert.match(html,/id="provider-settings"[^>]*aria-controls="google-demo-control"/);
  assert.match(html,/<details id="google-demo-control" class="google-demo-control">/);
  for(const sel of ['#tour-map-tools','#place-search','#fit','#gps']){
    assert.ok(css.includes('.workspace[data-provider="google"] '+sel),sel);
  }
  assert.ok(!css.includes('.workspace[data-provider="google"] #expand-map'));
  assert.ok(!css.includes('.workspace[data-provider="google"] .plan-picker'));
  assert.match(app,/googleDemo\?\.forceOSM\(\)/);
  assert.match(app,/googleDemo\?\.syncFromOSM\(\)/);
  assert.match(app,/\$\('day-route-foot'\)\.onclick=\(\)=>\{\s*googleDemo\?\.forceOSM\(\)/);
  assert.doesNotMatch(read('sw.js'),/maps\.googleapis\.com/);
});


test('provider dock sits inside workspace but outside Google/Leaflet canvas and copyright',()=>{
 const html=read('index.html'),css=read('style.css');
 const workspace=html.indexOf('<section class="workspace"');
 const switchAt=html.indexOf('id="map-provider-switch"');
 const dayPlan=html.indexOf('id="day-planning"');
 assert.ok(workspace>=0&&switchAt>workspace&&dayPlan>switchAt);
 assert.match(html,/<div id="map-provider-switch"[\s\S]*?<\/div><\/section>\s*<section id="day-planning"/);
 assert.match(css,/\.workspace\{padding-bottom:48px\}/);
 assert.match(css,/\.workspace>\.google-demo-map\{bottom:48px\}/);
 assert.match(css,/\.workspace>\.map-provider-switch\{[\s\S]*?bottom:0/);
 assert.match(css,/#google-demo-control:not\(\[open\]\)\{display:none!important\}/);
 assert.equal(html.match(/id="provider-settings"/g)?.length,1);
 assert.equal(html.match(/id="google-demo-control"/g)?.length,1);
});
test('same local day-stop ordering produces numbered Google marker artwork',()=>{
 const G=require('../google-demo.js');
 const svg4=decodeURIComponent(G.markerSvg(4));
 assert.match(svg4,/<svg /);
 assert.match(svg4,/a4ecc9/i);
 assert.match(svg4,/>4<\/text>/);
 assert.doesNotMatch(decodeURIComponent(G.markerSvg(null)),/<text /);
 const p1={id:'a',name:'First',lat:35.01,lng:135.79};
 const p2={id:'b',name:'Second',lat:35.02,lng:135.80};
 const p3={id:'c',name:'Third',lat:35.03,lng:135.81};
 let order=[p3,p1,p2];
 const t=appFixture({places:[p1,p2,p3],stops:()=>order,placeKey:p=>p.id});
 const added=[];
 const googleMap={
  center:{lat:35.02,lng:135.78},zoom:14,
  getCenter(){return {lat:()=>this.center.lat,lng:()=>this.center.lng};},
  getZoom(){return this.zoom;},
  setCenter(pos){this.center=pos;},setZoom(z){this.zoom=z;}
 };
 t.context.google={maps:{
   Map:class{constructor(){return googleMap;}},
   Marker:class{constructor(config){added.push(config);}addListener(){}setMap(){}},
   InfoWindow:class{},
   Size:class{constructor(width,height){this.width=width;this.height=height;}},
   Point:class{constructor(x,y){this.x=x;this.y=y;}}
 }};
 t.get('google-demo-key').value='AIza'+'x'.repeat(35);
 t.get('google-demo-start').click();
 assert.deepEqual(added.map(x=>x.title),['2. First','3. Second','1. Third']);
 assert.ok(added.every(x=>x.icon.url.startsWith('data:image/svg+xml')));
 for(const config of added)assert.match(decodeURIComponent(config.icon.url),
   new RegExp('>'+config.title[0]+'<\\/text>'));
 order=[p2,p3,p1];
 t.widget.refresh();
 assert.deepEqual(added.slice(-3).map(x=>x.title),['3. First','1. Second','2. Third']);
 const app=read('app.js');
 assert.match(app,/stops:\(\)=>\{\s*const ordered=dailyStops\(\)/);
 assert.match(app,/dayFootRoute\?\.key===dailyRouteKey\(ordered\)\?dayFootRoute\.stops:ordered/);
});
test('camera handoff preserves fractional zoom where Google map supports it',()=>{
 const t=appFixture();
 t.leafletMap.getZoom=()=>14.5;
 let googleMapConfig=null;
 const googleMap={
  center:{lat:35.02,lng:135.78},zoom:14.5,
  setCenter(x){this.center=x;},setZoom(z){this.zoom=z;},
  getCenter(){return {lat:()=>this.center.lat,lng:()=>this.center.lng};},
  getZoom(){return this.zoom;}
 };
 t.context.google={maps:{
   Map:class{constructor(_el,opts){googleMapConfig=opts;return googleMap;}},
   Marker:class{addListener(){}setMap(){}},
   InfoWindow:class{}
 }};
 t.get('google-demo-key').value='AIza'+'x'.repeat(35);
 t.get('google-demo-start').click();
 assert.equal(googleMapConfig.zoom,14.5);
 googleMap.center={lat:35.11,lng:135.91};
 googleMap.zoom=15.25;
 t.get('provider-osm').click();
 assert.equal(t.leafletMap.setViews.at(-1).zoom,15.25);
 assert.deepEqual(t.leafletMap.setViews.at(-1).center,[35.11,135.91]);
 t.widget.syncFromOSM();
 assert.equal(t.get('workspace').dataset.provider,'osm');
});
