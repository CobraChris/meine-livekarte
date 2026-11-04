const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

function appFixture(){
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
  const widget=module.init({map:leafletMap,places:()=>[
    {name:'Nanzen-ji',lat:35.011,lng:135.795}
  ]});
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
