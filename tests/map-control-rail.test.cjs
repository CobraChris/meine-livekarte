const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('GPS first fix clears stale locating notice without losing precision accessible label',()=>{
 const app=read('app.js');
 const begin=app.indexOf('  let statusTimer = null;');
 const end=app.indexOf('  if (!window.L)',begin);
 assert.ok(begin>=0 && end>begin);
 const snippet=app.slice(begin,end);
 const nodes={
  status:{textContent:'',hidden:true},
  gps:{title:'',attributes:{},setAttribute(k,v){this.attributes[k]=v}}
 };
 const timers=new Map();let next=1;
 const ctx={
  $:id=>nodes[id],
  setTimeout:fn=>{const id=next++;timers.set(id,fn);return id;},
  clearTimeout:id=>timers.delete(id)
 };
 vm.runInNewContext(snippet+'\nthis.sayForTest=say;',ctx);
 ctx.sayForTest('Standort wird ermittelt …');
 assert.equal(nodes.status.hidden,false);
 assert.match(nodes.status.textContent,/wird ermittelt/);
 assert.equal(timers.size,1);
 ctx.sayForTest('GPS aktiv · Genauigkeit ca. 9 m');
 assert.equal(nodes.status.hidden,true,'successful fix must dismiss stale toast immediately');
 assert.equal(nodes.status.textContent,'');
 assert.equal(nodes.gps.title,'Mein Standort · GPS aktiv · Genauigkeit ca. 9 m');
 assert.match(nodes.gps.attributes['aria-label'],/9 m/);
 assert.equal(timers.size,0,'stale timer must be cleared');
 ctx.sayForTest('Standort derzeit nicht verfügbar. Bitte erneut versuchen.');
 assert.equal(nodes.status.hidden,false,'errors remain readable');
 assert.match(nodes.status.textContent,/nicht verfügbar/);
});

test('three map controls are distinct and GPS shutoff lives in privacy help',()=>{
 const html=read('index.html'),css=read('style.css'),app=read('app.js');
 const group=html.slice(html.indexOf('class="map-actions"'),html.indexOf('</div>',html.indexOf('class="map-actions"')));
 assert.deepEqual([...group.matchAll(/id="(expand-map|fit|gps)"/g)].map(x=>x[1]),
   ['expand-map','fit','gps']);
 assert.doesNotMatch(group,/recenter-gps|GPS ausschalten/);
 assert.match(group,/id="fit"[^>]*>📍 <span>Alle Orte<\/span><\/button>/);
 assert.match(group,/id="gps"[^>]*>◎ <span>Mein Standort<\/span><\/button>/);
 assert.match(html,/<button id="gps-privacy-toggle" type="button">GPS ausschalten<\/button>/);
 assert.match(html,/id="gps-privacy-state"/);
 assert.doesNotMatch(html,/id="recenter-gps"/);
 assert.match(app,/\$\('gps-privacy-toggle'\)\.onclick = \(\) =>/);
 assert.match(app,/\$\('gps'\)\.onclick = \(\) =>/);
 assert.match(css,/@media\(hover:hover\) and \(pointer:fine\)/);
 assert.match(css,/@media\(hover:none\)\{/);
 assert.match(css,/\.workspace \.map-actions #fit:hover\{background:transparent\}/);
 assert.match(app,/L\.control\.zoom\(\{ position:'topright' \}\)\.addTo\(map\)/);
 assert.match(app,/attribution:'&copy; <a href="https:\/\/www\.openstreetmap\.org\/copyright"/);
 assert.match(css,/\.leaflet-control-attribution\{/);
});

test('one map GPS button resumes following and privacy button alone stops GPS',()=>{
 const app=read('app.js');
 const controlBegin=app.indexOf('  let automaticGPSView = false;');
 const controlEnd=app.indexOf('  function pauseGPSFollow()',controlBegin);
 assert.ok(controlBegin>=0&&controlEnd>controlBegin);
 const node=(name)=>({
  textContent:'',title:'',attrs:{},
  setAttribute(key,value){this.attrs[key]=value}
 });
 const nodes={gps:node('gps'),'gps-privacy-toggle':node('gps-privacy-toggle'),
   'gps-privacy-state':node('gps-privacy-state')};
 const ctx={
  $:id=>nodes[id],
  watch:1,following:true,position:{lat:35.01,lng:135.77}
 };
 vm.runInNewContext(app.slice(controlBegin,controlEnd)+
   '\nthis.refresh=refreshGPSFollowControl;',ctx);
 ctx.refresh();
 assert.equal(nodes.gps.attrs['aria-pressed'],'true');
 assert.match(nodes.gps.attrs['aria-label'],/folgen/);
 ctx.following=false;ctx.refresh();
 assert.equal(nodes.gps.attrs['aria-pressed'],'false');
 assert.match(nodes.gps.attrs['aria-label'],/zentrieren/);
 assert.equal(nodes['gps-privacy-toggle'].textContent,'GPS ausschalten');
 ctx.watch=null;ctx.position=null;ctx.refresh();
 assert.equal(nodes.gps.attrs['aria-pressed'],'false');
 assert.equal(nodes['gps-privacy-toggle'].textContent,'GPS einschalten');

 const clickStart=app.indexOf("  $('gps').onclick = () => {");
 const clickEnd=app.indexOf('  async function autoStartGPS()',clickStart);
 assert.ok(clickStart>=0&&clickEnd>clickStart);
 const events=[],clickCtx={
  watch:null,following:false,position:null,
  $:id=>nodes[id],
  setAutoGPSAllowed:v=>events.push(['preference',v]),
  startGPS:v=>events.push(['start',v]),
  stopGPS:()=>events.push(['stop']),
  say:t=>events.push(['status',t]),
  refreshGPSFollowControl:()=>events.push(['refresh']),
  centerOnGPS:(p,z)=>events.push(['center',p,z]),
  map:{getZoom:()=>15}
 };
 vm.runInNewContext(app.slice(clickStart,clickEnd),clickCtx);
 nodes.gps.onclick();
 assert.deepEqual(events.slice(0,2),[['preference',true],['start',false]]);
 events.length=0;
 clickCtx.watch=1;clickCtx.position={lat:35,lng:135};
 nodes.gps.onclick();
 assert.equal(clickCtx.following,true);
 assert.equal(events.filter(e=>e[0]==='stop').length,0);
 assert.equal(events.some(e=>e[0]==='center'),true);
 events.length=0;
 nodes['gps-privacy-toggle'].onclick();
 assert.deepEqual(events.slice(0,2),[['preference',false],['stop']]);
});
