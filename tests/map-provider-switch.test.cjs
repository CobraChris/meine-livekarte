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
      dataset:{},attributes:{},children:[],focused:false,scrolled:false,events:listeners,
      addEventListener(name,fn){(listeners[name]||=[]).push(fn);},
      setAttribute(name,value){this.attributes[name]=value;},
      focus(){this.focused=true;},
      scrollIntoView(){this.scrolled=true;},
      closest(selector){return selector==='.workspace'?get('workspace'):null;},
      click(){for(const fn of listeners.click||[])fn();},
      setMap(){},addListener(){},append(...nodes){this.children.push(...nodes);},
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
    route:typeof options.route==='function'?options.route:()=>options.route||null,
    goals:typeof options.goals==='function'?options.goals:()=>options.goals||[],
    fitOSM:options.fitOSM||(()=>{}),
    onWalk:options.onWalk||(()=>{}),
    onToggleTour:options.onToggleTour||(()=>{}),
    tourSelected:options.tourSelected||(()=>false),
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
 assert.match(css,/\.workspace #status\{bottom:76px\}/);
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
 assert.match(app,/stops:\(\)=>currentMapRoute\(\)\?\.stops\|\|\[\]/);
 assert.match(app,/return actual\?RM\.walking\(\{/);
 assert.match(app,/\}\):RM\.preview\(ordered,key\)/);
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
 assert.deepEqual(Array.from(t.leafletMap.setViews.at(-1).center),[35.11,135.91]);
 t.widget.syncFromOSM();
 assert.equal(t.get('workspace').dataset.provider,'osm');
});


test('Google preview displays the same two+ day goals as honest dashed air-line segments',()=>{
 const G=require('../google-demo.js');
 assert.equal(G.normalizedDayRoute(null),null);
 assert.equal(G.normalizedDayRoute({real:false,points:[[35,135]]}),null);
 assert.equal(G.normalizedDayRoute({real:true,points:[[120,135],[36,135]]}),null);
 assert.equal(G.normalizedDayRoute({real:true,points:[[35,135],[36,Infinity]]}),null);
 const point1={name:'Start',lat:35.01,lng:135.79},
   point2={name:'Ziel',lat:35.03,lng:135.82};
 let current={real:false,points:[[point1.lat,point1.lng],[point2.lat,point2.lng]]};
 const t=appFixture({places:[point1,point2],stops:[point1,point2],route:()=>current});
 const lines=[];
 const gm={setCenter(){},setZoom(){}};
 t.context.google={maps:{
   Map:class{constructor(){return gm;}},
   Marker:class{addListener(){}setMap(){}},
   InfoWindow:class{},
   Polyline:class{
     constructor(o){this.options=o;this.removed=false;lines.push(this);}
     setMap(x){this.removed=x===null;}
   }
 }};
 t.get('google-demo-key').value='AIza'+'x'.repeat(35);
 t.get('google-demo-start').click();
 assert.equal(lines.length,1);
 assert.equal(lines[0].options.strokeOpacity,0);
 assert.equal(lines[0].options.geodesic,false);
 assert.equal(lines[0].options.clickable,false);
 assert.equal(lines[0].options.icons[0].repeat,'26px');
 assert.equal(lines[0].options.icons.length,2);
 assert.equal(lines[0].options.icons[0].icon.strokeColor,'#203F3C');
 assert.equal(lines[0].options.icons[1].icon.strokeColor,'#FFC13E');
 assert.ok(lines[0].options.icons[0].icon.strokeWeight>
   lines[0].options.icons[1].icon.strokeWeight);
 assert.equal(lines[0].options.icons[0].icon.path,'M 0,-1 0,1');
 assert.equal(lines[0].options.path.length,2);
 assert.deepEqual(Array.from(lines[0].options.path,p=>[p.lat,p.lng]),current.points);
 assert.equal(t.get('google-demo-route-legend').hidden,false);
 assert.match(t.get('google-demo-route-meaning').textContent,/Luftlinie/);
 assert.equal(t.get('google-demo-route-legend').open,false);
 // A verified OSRM route replaces, rather than adds over, the preview.
 current={real:true,points:[[35.01,135.79],[35.012,135.8],[35.03,135.82]]};
 t.widget.refreshRoute();
 assert.equal(lines.length,2);
 assert.equal(lines[0].removed,true);
 assert.equal(lines[1].options.strokeOpacity,.99);
 assert.equal(lines[1].options.strokeWeight,6);
 assert.equal(lines[1].options.icons,undefined);
 assert.equal(lines[1].options.path.length,3);
 assert.match(t.get('google-demo-route-meaning').textContent,/Berechneter Fußweg/);
 // When a different day is selected, the old route must vanish entirely.
 current=null;
 t.widget.refresh();
 assert.equal(lines[1].removed,true);
 assert.equal(t.get('google-demo-route-legend').hidden,true);
 t.get('provider-osm').click();
 assert.equal(t.get('google-demo-route-legend').hidden,true);
 assert.equal(lines.length,2,'switching to OSM never creates an extra overlay');
});
test('no Google routing/search/billing requests are introduced for day line',()=>{
 const source=read('google-demo.js'),app=read('app.js'),html=read('index.html'),css=read('style.css');
 assert.match(source,/function normalizedDayRoute\(source\)/);
 assert.match(source,/new google\.maps\.Polyline\(options\)/);
 assert.match(source,/if\(!real\)options\.icons=/);
 assert.match(source,/routeLegend\.hidden=false/);
 assert.match(source,/function clearRoute\(\)/);
 assert.match(app,/route:\(\)=>currentMapRoute\(\)/);
 assert.match(app,/return journey\?RM\.rail\(journey\):currentDayRoute\(\)/);
 assert.match(app,/const actual=dayFootRoute\?\.key===key\?dayFootRoute:null/);
 assert.match(html,/<details id="google-demo-route-legend"[^>]*hidden/);
 assert.match(html,/id="google-demo-route-meaning"/);
 assert.match(css,/\.google-demo-route-legend>summary\{/);
 assert.match(css,/\.google-demo-route-legend\[hidden\]\{display:none!important\}/);
 assert.doesNotMatch(source,/fetch\(|computeRoutes|DirectionsService|PlacesService/);
});


test('Google camera fits all daily goals with edge-safe padding, then OSM fits too',()=>{
 const start={name:'Start',lat:34.679,lng:135.823};
 const middle={name:'Mitte',lat:34.683,lng:135.835};
 const end={name:'Ende',lat:34.665,lng:135.808};
 let osmFits=0;
 const t=appFixture({places:[start,middle,end],goals:[start,middle,end],
   fitOSM:()=>{osmFits++;}});
 const recorded=[];
 const gm={
   center:{lat:34.68,lng:135.82},zoom:14,
   fitBounds(bounds,padding){recorded.push({points:bounds.points,padding});},
   setCenter(v){this.center=v;},setZoom(z){this.zoom=z;},
   getCenter(){return {lat:()=>this.center.lat,lng:()=>this.center.lng};},
   getZoom(){return this.zoom;}
 };
 t.context.google={maps:{
   Map:class{constructor(){return gm;}},
   Marker:class{addListener(){}setMap(){}},
   InfoWindow:class{},
   LatLngBounds:class{
     constructor(){this.points=[];}
     extend(point){this.points.push(point);}
   }
 }};
 t.get('google-demo-key').value='AIza'+'x'.repeat(35);
 t.get('google-demo-start').click();
 assert.equal(recorded.length,1);
 assert.equal(recorded[0].points.length,3);
 assert.deepEqual(Array.from(recorded[0].points,p=>p.lat),
   [start.lat,middle.lat,end.lat]);
 assert.ok(recorded[0].padding.top>=150);
 assert.ok(recorded[0].padding.bottom>=50);
 assert.ok(recorded[0].padding.right>=50);
 assert.ok(recorded[0].padding.left>=35);
 // The day map recenters only on deliberate map-provider switching.
 t.get('provider-osm').click();
 assert.equal(osmFits,1);
 t.get('provider-google').click();
 assert.equal(recorded.length,2);
 t.widget.syncFromOSM();
 assert.equal(recorded.length,3);
 // Non-day views must retain their user-selected camera, without forced fit.
 const withoutGoals=appFixture();
 assert.equal(withoutGoals.widget.isGoogle(),false);
 const app=read('app.js');
 assert.match(app,/const padding=day\?mapOverviewPadding\(\):\{padding:\[45,45\]\}/);
 assert.match(app,/goals:\(\)=>dailyStops\(\)/);
 assert.match(app,/fitOSM:\(\)=>fit\(mapFocusPlaces\(\)\)/);
});
test('Google chip stays tiny until tapped and route contrast does not mimic footpath',()=>{
 const css=read('style.css'),g=read('google-demo.js');
 assert.match(css,/\.google-demo-route-legend\{\s*left:10px;bottom:76px;/);
 assert.match(css,/\.google-demo-route-legend>summary\{/);
 assert.match(css,/\.google-demo-route-legend\[open\]>span\{display:block\}/);
 assert.match(g,/routeLegend\.open=false/);
 assert.match(g,/Luftlinie zwischen Tageszielen/);
 assert.match(g,/strokeColor:'#203F3C'/);
 assert.match(g,/strokeColor:'#FFC13E'/);
 assert.doesNotMatch(g,/DirectionsService|PlacesService|fetch\(/);
});


test('official Google Maps URL opens location details without any billable Places API',()=>{
 const G=require('../google-demo.js');
 const restaurant={name:'Hida Beef Omakase',address:'Takayama, Gifu, Japan',
  lat:36.14,lng:137.25,category:'restaurant'};
 const u=new URL(G.placeDetailsUrl(restaurant));
 assert.equal(u.origin,'https://www.google.com');
 assert.equal(u.pathname,'/maps/search/');
 assert.equal(u.searchParams.get('api'),'1');
 assert.equal(u.searchParams.get('query'),'Hida Beef Omakase, Takayama, Gifu, Japan');
 assert.equal(u.searchParams.get('key'),null);
 assert.equal(u.searchParams.get('query_place_id'),null);
 const id='ChIJ'+'A'.repeat(25);
 const withPlace=new URL(G.placeDetailsUrl({...restaurant,googlePlaceId:id}));
 assert.equal(withPlace.searchParams.get('query_place_id'),id);
 assert.equal(G.placeDetailsUrl({name:''}),null);
 const hostile=new URL(G.placeDetailsUrl({name:'Sushi & Friends?x=1',
   address:'Tokyo&key=NEVER'}));
 assert.equal(hostile.searchParams.get('query'),'Sushi & Friends?x=1, Tokyo&key=NEVER');
 assert.equal(hostile.searchParams.get('key'),null);
 const source=read('google-demo.js');
 assert.doesNotMatch(source,/new google\.maps\.places\.|PlacesService|places\.googleapis|fetch\(/);
});
test('tapping Google restaurant marker offers real Google reviews link and OSM actions',()=>{
 const point={name:'Restaurant Nanzen',address:'Kyoto Japan',lat:35.01,lng:135.81,
   category:'restaurant'};
 const walks=[],tours=[],created=[];
 const t=appFixture({places:[point],onWalk:p=>walks.push(p),
   onToggleTour:p=>tours.push(p),tourSelected:()=>true});
 let latestInfo;
 t.context.google={maps:{
   Map:class{setCenter(){}setZoom(){}},
   Marker:class{
     constructor(o){this.options=o;this.callbacks={};created.push(this);}
     addListener(name,fn){this.callbacks[name]=fn;}
     setMap(){}
   },
   InfoWindow:class{
     constructor(){latestInfo=this;}
     setContent(content){this.content=content;}
     open(){this.opened=true;}
     close(){this.closed=true;}
   }
 }};
 t.get('google-demo-key').value='AIza'+'x'.repeat(35);
 t.get('google-demo-start').click();
 assert.equal(created.length,1);
 created[0].callbacks.click();
 assert.equal(latestInfo.opened,true);
 const [title,note,actions]=latestInfo.content.children;
 assert.equal(title.textContent,'Restaurant Nanzen');
 assert.match(note.textContent,/noch keine Sterne/);
 const [reviews,walk,tour]=actions.children;
 assert.equal(reviews.textContent,'⭐ Bewertungen in Google Maps');
 assert.equal(reviews.target,'_blank');
 assert.equal(reviews.rel,'noopener noreferrer');
 const maps=new URL(reviews.href);
 assert.equal(maps.origin,'https://www.google.com');
 assert.equal(maps.searchParams.get('query'),'Restaurant Nanzen, Kyoto Japan');
 assert.equal(maps.searchParams.get('api'),'1');
 assert.equal(tour.textContent,'✓ In Tour');
 walk.click();tour.click();
 assert.deepEqual(walks,[point]);
 assert.deepEqual(tours,[point]);
 assert.equal(t.scripts.length,0,'existing provider SDK requires no additional call');
 t.widget.refresh();
 assert.equal(latestInfo.closed,true,'stale popups close after rendering new markers');
});
test('non-restaurant marker is correctly labelled as external place details',()=>{
 const place={name:'Nara Park',lat:34.68,lng:135.84,category:'sight'};
 const t=appFixture({places:[place]});
 const created=[];
 let win;
 t.context.google={maps:{
   Map:class{},
   Marker:class{constructor(){created.push(this);}addListener(_,fn){this.click=fn;}setMap(){}},
   InfoWindow:class{constructor(){win=this;}setContent(x){this.content=x;}open(){}}
 }};
 t.get('google-demo-key').value='AIza'+'x'.repeat(35);
 t.get('google-demo-start').click();
 created[0].click();
 const external=win.content.children[2].children[0];
 assert.match(external.textContent,/Details in Google Maps/);
 assert.doesNotMatch(external.textContent,/Bewertungen/);
});


test('Kyoto–Nikko schematic railway and numbered stations survive OSM-to-Google switching',()=>{
 const Core=require('../core.js'),RM=require('../route-model-core.js');
 const rail=RM.rail(Core.presetJourney('kyoto-nikko-2026-11-07'));
 const G=require('../google-demo.js');
 const normalized=G.normalizedDayRoute(rail);
 assert.equal(normalized.kind,'rail');
 assert.equal(normalized.real,false);
 assert.equal(normalized.path.length,rail.points.length);
 let current=rail;
 const t=appFixture({places:[],route:()=>current,
   stops:()=>current?.stops||[],goals:()=>[]});
 const markers=[],lines=[];
 let fits=0;
 const googleMap={
   fitBounds(){fits++;},setCenter(){},setZoom(){},
   getCenter(){return {lat:()=>36.55,lng:()=>139.9};},getZoom(){return 12;}
 };
 t.context.google={maps:{
   Map:class{constructor(){return googleMap;}},
   Marker:class{
     constructor(config){this.config=config;this.removed=false;markers.push(this);}
     addListener(){}setMap(value){if(value===null)this.removed=true;}
   },
   InfoWindow:class{},
   Polyline:class{
     constructor(config){this.config=config;this.removed=false;lines.push(this);}
     setMap(value){if(value===null)this.removed=true;}
   }
 }};
 t.get('google-demo-key').value='AIza'+'x'.repeat(35);
 t.get('google-demo-start').click();
 assert.equal(lines.length,1,'rail line is drawn immediately when Google opens');
 assert.deepEqual(Array.from(lines[0].config.path,p=>[p.lat,p.lng]),rail.points);
 assert.equal(lines[0].config.geodesic,false);
 assert.equal(lines[0].config.strokeOpacity,0,'schematic train path stays dashed');
 assert.equal(lines[0].config.icons.length,2);
 assert.match(t.get('google-demo-route-meaning').textContent,/Bahnverbindung/);
 assert.doesNotMatch(t.get('google-demo-route-meaning').textContent,/Fußweg/);
 assert.deepEqual(markers.map(m=>m.config.title),
   rail.stops.map((stop,i)=>(i+1)+'. '+stop.name));
 assert.equal(fits,0,'provider switch must preserve the Nikko viewport');
 current=null;
 t.widget.refresh();
 assert.equal(lines.length,1);
 assert.equal(lines[0].removed,true);
 assert.equal(t.get('google-demo-route-legend').hidden,true);
 assert.ok(markers.every(marker=>marker.removed));
 t.get('provider-osm').click();
 assert.equal(t.get('workspace').dataset.provider,'osm');
});
