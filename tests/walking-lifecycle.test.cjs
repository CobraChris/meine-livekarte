const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('closing walking info keeps rendered route while separate End route removes it',()=>{
 const app=read('app.js');
 const from=app.indexOf("  const walkingLink=$('walk-route-google');");
 const to=app.indexOf('  function walkingButton(p){',from);
 assert.ok(from>=0 && to>from);
 const lifecycle=app.slice(from,to);
 const elements={};
 const $=id=>elements[id]||(elements[id]={hidden:false,textContent:'',onclick:null});
 const walkingPanel={hidden:false};
 const walkingRetry=$('walk-route-retry');
 const walkingLayers={clears:0,clearLayers(){this.clears++;}};
 const destination={name:'Jinya-mae Morning Market',lat:36.14,lng:137.25};
 const walkController={aborts:0,abort(){this.aborts++;}};
 const context={
   $,walkingPanel,walkingRetry,walkingLayers,walkDestination:destination,
   walkController,walkRequestGeneration:0,showWalkingRoute(){}
 };
 vm.runInNewContext(lifecycle,context,{filename:'walking-lifecycle.js'});
 assert.equal(typeof $('walk-route-close').onclick,'function');
 assert.equal(typeof $('walk-route-stop').onclick,'function');
 assert.equal(typeof $('walk-route-mini').onclick,'function');

 // The reported bug: x previously also called walkingLayers.clearLayers().
 $('walk-route-close').onclick();
 assert.equal(walkingPanel.hidden,true);
 assert.equal($('walk-route-mini').hidden,false);
 assert.equal(walkingLayers.clears,0,'X must preserve dotted route geometry');
 assert.equal(walkController.aborts,0,'X must not cancel an in-flight route');
 assert.equal(context.walkDestination,destination);

 // The small floating chip should restore the informational panel.
 $('walk-route-mini').onclick();
 assert.equal(walkingPanel.hidden,false);
 assert.equal($('walk-route-mini').hidden,true);
 assert.equal(walkingLayers.clears,0);

 // Explicitly ending a route clears geometry, destination and ongoing request.
 $('walk-route-stop').onclick();
 assert.equal(walkingLayers.clears,1);
 assert.equal(walkController.aborts,1);
 assert.equal(context.walkDestination,null);
 assert.equal(context.walkController,null);
 assert.equal(walkingPanel.hidden,true);
 assert.equal($('walk-route-mini').hidden,true);
 assert.equal($('walk-route-mini-text').textContent,'');
 $('walk-route-mini').onclick();
 assert.equal(walkingPanel.hidden,true,'closed routes cannot reopen details');
});

test('full route panel and minimized route chip remain separately accessible',()=>{
 const html=read('index.html'),css=read('style.css'),app=read('app.js');
 for(const id of ['walk-route-close','walk-route-stop','walk-route-mini','walk-route-mini-text']){
   assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/Fußweg-Information ausblenden, Route behalten/);
 assert.match(html,/Fußweg beenden und Linien von der Karte entfernen/);
 assert.match(html,/>✕ Route beenden</);
 assert.match(css,/\.walk-route-mini\[hidden\]\{display:none!important\}/);
 assert.match(css,/\.walk-route-stop\{/);
 assert.match(app,/walkingMiniText\.textContent='🚶 '\+W\.distanceText\(result\.distance\)/);
 assert.match(app,/walkingMiniText\.textContent='🚶 Fußweg nicht verfügbar'/);
 assert.match(app,/showWalkingDetails\(\);\s*walkingMini\.setAttribute/);
 assert.match(app,/\$\('walk-route-close'\)\.onclick=hideWalkingDetails/);
 assert.match(app,/walkingStop\.onclick=clearWalkingRoute/);
});

test('other route lifecycle safeguards and privacy remain intact',()=>{
 const app=read('app.js'),sw=read('sw.js'),core=read('walking-core.js');
 assert.match(app,/clearWalkingRoute\(\);\s*watch = null; position = null/);
 assert.match(app,/if\(activePlanId!==id && walkDestination\)clearWalkingRoute\(\)/);
 assert.match(app,/if\(generation!==walkRequestGeneration \|\| watch===null\)return/);
 assert.match(app,/walkingLayers\.clearLayers\(\)/);
 assert.match(app,/fetch\(url,\{/);
 assert.match(app,/credentials:'omit'/);
 assert.match(core,/routed-foot\/route\/v1\/driving/);
 assert.doesNotMatch(sw,/routing\.openstreetmap\.de/);
});
