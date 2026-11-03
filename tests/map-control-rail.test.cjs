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
 assert.equal(nodes.gps.title,'GPS aktiv · Genauigkeit ca. 9 m');
 assert.match(nodes.gps.attributes['aria-label'],/9 m/);
 assert.equal(timers.size,0,'stale timer must be cleared');
 ctx.sayForTest('Standort derzeit nicht verfügbar. Bitte erneut versuchen.');
 assert.equal(nodes.status.hidden,false,'errors remain readable');
 assert.match(nodes.status.textContent,/nicht verfügbar/);
});

test('four related controls share a rail; recenter is conditional and zoom remains separate',()=>{
 const html=read('index.html'),css=read('style.css'),app=read('app.js');
 const group=html.slice(html.indexOf('class="map-actions"'),html.indexOf('</div>',html.indexOf('class="map-actions"')));
 assert.deepEqual([...group.matchAll(/id="(expand-map|recenter-gps|fit|gps)"/g)].map(x=>x[1]),
   ['expand-map','recenter-gps','fit','gps']);
 assert.match(group,/id="recenter-gps" type="button" hidden/);
 assert.match(group,/id="fit"[^>]*>📍 <span>Alle Orte<\/span><\/button>/);
 assert.match(app,/recenterGPS\.hidden = watch === null \|\| following \|\| !position/);
 assert.match(app,/expand\.onclick = \(\) => toggleExpanded\(\)/);
 assert.match(app,/\$\('gps'\)\.onclick = \(\) =>/);
 assert.match(css,/\.workspace \.map-actions #recenter-gps\[hidden\]\{display:none!important\}/);
 assert.match(app,/L\.control\.zoom\(\{ position:'topright' \}\)\.addTo\(map\)/);
 assert.match(app,/attribution:'&copy; <a href="https:\/\/www\.openstreetmap\.org\/copyright"/);
 assert.match(css,/\.leaflet-control-attribution\{/);
});
