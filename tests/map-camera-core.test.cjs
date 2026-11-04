'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Camera=require('../map-camera-core.js');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('one camera state machine serves Kyoto, Nara, Osaka, Nikkō and custom days',()=>{
 const dates=['Kyoto 03.11','Nara 04.11','Osaka 05.11','Nikkō','eigene Tagesplanung'];
 for(const day of dates){
   const camera=Camera.create();
   assert.equal(camera.mode,'manual',day);
   assert.equal(camera.isFollowing(),false,day);
   assert.equal(camera.transition('gps-follow'),true,day);
   assert.equal(camera.isFollowing(),true,day);
   assert.equal(camera.transition('gps-follow'),false,day);
   assert.equal(camera.transition('day-goals'),true,day);
   assert.equal(camera.isFollowing(),false,day);
   assert.equal(camera.transition('overview'),true,day);
   assert.equal(camera.mode,'overview',day);
   assert.equal(camera.transition('manual'),true,day);
   assert.equal(camera.mode,'manual',day);
 }
});

test('programmatic GPS and fit movements preserve mode; actual manual gestures interrupt',()=>{
 const camera=Camera.create();
 let simulatedZoom=0;
 function onZoom(){simulatedZoom++;if(!camera.isProgrammatic())camera.transition('manual');}
 camera.move('gps-follow',()=>{assert.equal(camera.isProgrammatic(),true);onZoom();});
 assert.equal(camera.mode,'gps-follow','GPS setView cannot cancel its own follow mode');
 camera.move('overview',()=>{onZoom();});
 assert.equal(camera.mode,'overview','fitting GPS + goals preserves overview mode');
 camera.move('day-goals',()=>{onZoom();});
 assert.equal(camera.mode,'day-goals');
 onZoom();assert.equal(camera.mode,'manual','user zoom exits day goals mode');
 camera.transition('gps-follow');
 onZoom();assert.equal(camera.mode,'manual','user pinch exits GPS follow mode');
 assert.equal(simulatedZoom,5);
 assert.equal(camera.isProgrammatic(),false);
});

test('nested camera actions unwind correctly even when a map callback fails',()=>{
 const camera=Camera.create();
 assert.throws(()=>camera.move('overview',()=>{
   camera.move('day-goals',()=>{throw new Error('map unavailable');});
 }),/map unavailable/);
 assert.equal(camera.isProgrammatic(),false,'no stale programmatic guard after an exception');
 camera.transition('manual');
 assert.throws(()=>camera.transition('gps-off'),/Unbekannter Kartenmodus/);
 assert.throws(()=>camera.move('silent',()=>{}),/Ungültige Kartenaktion/);
});

test('the shared camera governs view changes across the app, not destination names',()=>{
 const app=read('app.js'),html=read('index.html');
 const workflow=read('.github/workflows/pages.yml'),sw=read('sw.js');
 assert.match(app,/const camera=window\.LivekarteMapCamera\.create\(\)/);
 assert.match(app,/function setCameraMode\(mode\)\{/);
 assert.match(app,/function withCameraView\(mode,action\)\{/);
 assert.match(app,/function fit\(items = mapFocusPlaces\(\)\)\s*\{/);
 assert.match(app,/withCameraView\('day-goals',\(\)=>map\.fitBounds\(/);
 assert.match(app,/withCameraView\('overview',\(\)=>map\.fitBounds\(/);
 assert.match(app,/withCameraView\('gps-follow',\(\)=>map\.setView\(/);
 assert.match(app,/map\.on\('zoomstart', \(\) => \{ if \(!camera\.isProgrammatic\(\)\) pauseGPSFollow\(\); \}\)/);
 assert.match(app,/map\.on\('dragstart', \(\) => \{ if \(!camera\.isProgrammatic\(\)\) pauseGPSFollow\(\); \}\)/);
 assert.doesNotMatch(app,/\blet following\b|\bfollowing\s*=\s*(?:true|false)/,
   'a second mutable GPS-follow boolean would bypass the shared mode');
 assert.match(html,/src="map-camera-core\.js"/);
 assert.ok(html.indexOf('map-camera-core.js')<html.indexOf('app.js'));
 assert.match(sw,/'map-camera-core\.js'/);
 assert.match(workflow,/node --check map-camera-core\.js/);
 assert.match(workflow,/cp map-popup-core\.js map-camera-core\.js public\//);
 const camera=require('../map-camera-core.js');
 assert.deepEqual(camera.MODES,['manual','gps-follow','day-goals','overview']);
});

test('all specialised travel views use the same programmatic camera adapters',()=>{
 const app=read('app.js');
 assert.match(app,/function focusMapPoint\(point,zoom,options=\{\}\)\{/);
 assert.match(app,/function fitMapArea\(bounds,options=\{\}\)\{/);
 assert.match(app,/withCameraView\('manual',\(\)=>map\.setView\(point,zoom,\{\.\.\.options,animate:false\}\)\)/);
 assert.match(app,/withCameraView\('day-goals',\(\)=>map\.fitBounds\(bounds,\{\.\.\.options,animate:false\}\)\)/);
 for(const pattern of [
   /focusMapPoint\(\[savedPoint\.lat,savedPoint\.lng\]/,
   /focusMapPoint\(\[place\.lat,place\.lng\]/,
   /focusMapPoint\(\[item\.lat,item\.lng\],17\)/,
   /focusMapPoint\(nagoya,16\.75\)/,
   /focusMapPoint\(\[stop\.lat,stop\.lng\],18\.25\)/,
   /focusMapPoint\(\[stop\.lat,stop\.lng\],14\)/,
   /fitMapArea\(L\.latLngBounds\(result\.points\),\{padding:\[55,55\],maxZoom:17\}\)/,
   /fitMapArea\(L\.latLngBounds\(result\.points\),\{padding:\[52,52\],maxZoom:16\}\)/,
   /fitMapArea\(coords,\{padding:\[38,38\],maxZoom:13\}\)/
 ])assert.match(app,pattern);
 const direct=app.split('\n').filter(line=>/map\.(?:setView|fitBounds)\(/.test(line));
 assert.equal(direct.length,5,'view changes should only remain in initialization, shared fit actions and adapters');
 assert.ok(direct.every(line=>
   /\.setView\(\[25, 0\], 2\)/.test(line)||
   /withCameraView\(/.test(line)||
   /return withCameraView\(/.test(line)||
   /^\s*visible\.map\(/.test(line)
 ),'no view changes bypass central mode controller');
});
test('station, search, route and tour focus never accidentally enable GPS following',()=>{
 const vm=require('node:vm');
 const app=read('app.js');
 const start=app.indexOf('  function focusMapPoint(point,zoom,options={})');
 const end=app.indexOf('  function refreshGPSFollowControl()',start);
 assert.ok(start>0&&end>start);
 const fragment=app.slice(start,end);
 const Camera=require('../map-camera-core.js');
 const camera=Camera.create('gps-follow'),calls=[];
 const map={
   setView:(...args)=>{calls.push(['point',...args]);return 'point-ok';},
   fitBounds:(...args)=>{calls.push(['bounds',...args]);return 'bounds-ok';}
 };
 const ctx={camera,map,
   withCameraView:(mode,action)=>camera.move(mode,action)};
 vm.runInNewContext(fragment+'\nthis.focusMapPoint=focusMapPoint;this.fitMapArea=fitMapArea;',ctx);
 assert.equal(ctx.focusMapPoint([35,135],16),'point-ok');
 assert.equal(camera.mode,'manual');
 assert.equal(calls[0][3].animate,false);
 camera.transition('gps-follow');
 assert.equal(ctx.fitMapArea([[34.7,135.8],[35.0,135.7]],{maxZoom:16}),'bounds-ok');
 assert.equal(camera.mode,'day-goals');
 assert.equal(calls[1][2].maxZoom,16);
 assert.equal(calls[1][2].animate,false);
 assert.equal(camera.isProgrammatic(),false);
});
